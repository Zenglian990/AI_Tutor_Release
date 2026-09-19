const { getEmbedding } = require('./embedding');
const { getTable, getSqliteDb } = require('../db/init');
const { buildLanceDBWhereClause } = require('../prompts/guidelines');
const logger = require('./logger');

/**
 * Reciprocal Rank Fusion (RRF) to merge and rank vector and FTS results.
 * 
 * @param {Array} vectorResults 
 * @param {Array} ftsResults 
 * @param {number} k - Constant to tune the importance of ranks (default 60)
 * @returns {Array}
 */
function reciprocalRankFusion(vectorResults, ftsResults, k = 60) {
  const scoreMap = new Map();
  const docMap = new Map();

  const applyRRF = (results) => {
    results.forEach((doc, rank) => {
      // Use first 50 chars of text to avoid huge Map keys while still preventing false collisions
      const key = `${doc.source}_${doc.page}_${(doc.text || '').substring(0, 50)}`;
      docMap.set(key, doc);
      const score = scoreMap.get(key) || 0;
      scoreMap.set(key, score + (1 / (k + rank + 1)));
    });
  };

  applyRRF(vectorResults);
  applyRRF(ftsResults);

  // Sort by combined score descending
  const sortedKeys = [...scoreMap.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(entry => entry[0]);

  return sortedKeys.map(key => docMap.get(key));
}
/**
 * Basic Chinese/English query preprocessor for FTS.
 * Strips punctuation and common stop words to prevent low-recall FTS matches.
 */
function cleanQueryForFTS(query) {
  if (!query) return '';
  let cleaned = String(query).trim();
  
  // Remove punctuation (keeping alphanumeric, Chinese characters, and basic spaces)
  cleaned = cleaned.replace(/[\p{P}\p{S}]/gu, ' ');

  // Remove common stop words that interfere with character-level matching
  const stopWords = [
    '的', '了', '在', '是', '我', '你', '他', '它', '们', '这', '那',
    '之', '与', '和', '个', '并且', '可以', '如何', '怎么', '请问',
    '什么', '为什么', '怎么做', '解释下', '请问一下', '是什么', '解释一下'
  ];
  
  for (const word of stopWords) {
    const isEnglish = /^[a-zA-Z0-9_-]+$/.test(word);
    // Use word-boundary regex for both English and Chinese to avoid substring mis-match
    // e.g. "可以" should not remove characters from within "不可思议"
    const regex = isEnglish ? new RegExp(`\\b${word}\\b`, 'gi') : new RegExp(`(?:^|\\s)${word}(?:\\s|$)`, 'g');
    cleaned = cleaned.replace(regex, ' ');
  }

  // Flatten spaces
  cleaned = cleaned.replace(/\s+/g, ' ').trim();

  // LanceDB FTS (Tantivy) has a built-in CJK tokenizer \u2014 no need to manually space out characters
  return cleaned || query;
}

/**
 * Query Canonical Questions (39,114 verified benchmark questions) from SQLite
 */
async function searchCanonicalQuestions(query, grade, subject, limit = 2) {
  const db = getSqliteDb();
  if (!db) return [];
  try {
    let gradePattern = '%';
    if (grade) {
      if (grade.includes('7') || grade.includes('初一')) gradePattern = '%7%';
      else if (grade.includes('8') || grade.includes('初二')) gradePattern = '%8%';
      else if (grade.includes('9') || grade.includes('初三')) gradePattern = '%9%';
      else if (/^[1-6]/.test(grade)) gradePattern = `%${grade.charAt(0)}%`;
    }

    const cleanSubj = subject ? subject.replace(/[\s\-_]/g, '') : '数学';

    // Extract core educational keywords from query
    const keywords = (query || '')
      .replace(/老师|请问|帮我|针对|考考我|分步|启发|出题|一道|经典|最新|关于|我想|挑战|母题|模型|题眼|难题/g, ' ')
      .match(/[\u4e00-\u9fa5]{2,}|[a-zA-Z0-9]+/g) || [];

    let rows = [];
    if (keywords.length > 0) {
      const topKw = keywords.slice(0, 3);
      let sql = 'SELECT id, question, analysis, key_insight, chapter, source, standard_answer FROM canonical_questions WHERE grade LIKE ? AND subject LIKE ?';
      const params = [gradePattern, `%${cleanSubj}%`];
      
      const likeClauses = topKw.map(() => '(question LIKE ? OR chapter LIKE ? OR key_insight LIKE ?)').join(' OR ');
      if (likeClauses) {
        sql += ` AND (${likeClauses})`;
        topKw.forEach(k => params.push(`%${k}%`, `%${k}%`, `%${k}%`));
      }
      sql += ' ORDER BY id ASC LIMIT ?';
      params.push(limit);
      rows = await db.all(sql, params);
    }

    if (rows.length === 0) {
      // Return curated benchmark questions for this grade and subject
      rows = await db.all(
        'SELECT id, question, analysis, key_insight, chapter, source, standard_answer FROM canonical_questions WHERE grade LIKE ? AND subject LIKE ? ORDER BY id ASC LIMIT ?',
        [gradePattern, `%${cleanSubj}%`, limit]
      );
    }

    return rows.map(r => ({
      source: r.source || `人教版_${cleanSubj}_${grade || '全册'}_真题母题库`,
      page: r.chapter || '典型母题考点',
      text: `【考点归属】${r.chapter || '经典母题模型'}\n【典例原题】${r.question}\n【解题关键与题眼突破】${r.key_insight || r.analysis || ''}\n【标准答案】${r.standard_answer || ''}`,
      score: 0.95
    }));
  } catch (err) {
    logger.warn('[SearchService] Canonical questions lookup error:', err.message);
    return [];
  }
}

/**
 * Execute Hybrid Search (Dense Vector Search + Sparse Text Search) with automatic fallback.
 * 
 * @param {string} query - Raw query text
 * @param {string} grade - Student grade identifier
 * @param {string} subject - Subject name
 * @param {number} limit - Max number of RAG chunks to return
 * @returns {Promise<Array>}
 */
async function performHybridSearch(query, grade, subject, limit = 3, edition) {
  const table = getTable();
  if (!table) {
    logger.warn('[SearchService] LanceDB table not ready. Falling back to canonical questions.');
    return await searchCanonicalQuestions(query, grade, subject, limit);
  }

  try {
    let queryVector = null;
    let isQuotaExhausted = false;
    try {
      queryVector = await getEmbedding(query);
    } catch (embedErr) {
      if (embedErr.code === 'EMBED_QUOTA_EXHAUSTED' || embedErr.message === 'EMBED_QUOTA_EXHAUSTED') {
        isQuotaExhausted = true;
        logger.warn('[SearchService] Embedding quota exhausted (429), attempting FTS text fallback.');
      } else {
        logger.warn('[SearchService] Failed to generate query embedding:', embedErr.message);
      }
    }

    const whereClause = buildLanceDBWhereClause(grade, subject, edition);
    const ftsQuery = cleanQueryForFTS(query);

    // Fallback: If no queryVector available (quota exhausted or offline), execute FTS text search only
    if (!queryVector) {
      let ftsResults = [];
      try {
        let builder = table.search(ftsQuery, "fts");
        if (whereClause) builder = builder.where(whereClause);
        ftsResults = await builder.limit(limit).toArray();
        if (ftsResults.length === 0 && whereClause) {
          ftsResults = await table.search(ftsQuery, "fts").limit(limit).toArray();
        }
      } catch (ftsErr) {
        logger.warn('[SearchService] FTS text search failed in fallback:', ftsErr.message);
      }
      ftsResults = ftsResults.filter(r => r.source !== 'mock.txt');

      if (ftsResults.length < limit) {
        const canonicalMatches = await searchCanonicalQuestions(query, grade, subject, limit - ftsResults.length);
        ftsResults = [...ftsResults, ...canonicalMatches];
      }

      if (isQuotaExhausted) {
        const quotaExhaustedErr = new Error('EMBED_QUOTA_EXHAUSTED');
        quotaExhaustedErr.partialResults = ftsResults.slice(0, limit);
        throw quotaExhaustedErr;
      }
      return ftsResults.slice(0, limit);
    }
    
    // Execute searches in parallel
    const [vectorRes, ftsRes] = await Promise.all([
      // 1. Dense Vector Search
      (async () => {
        try {
          let builder = table.search(queryVector);
          if (whereClause) builder = builder.where(whereClause);
          return await builder.limit(limit * 2).toArray();
        } catch (e) {
          logger.error('[SearchService] Vector search error:', e);
          return [];
        }
      })(),
      // 2. Sparse Text Search (FTS) — pass "fts" as second arg to avoid auto-vector path
      (async () => {
        try {
          const builder = table.search(ftsQuery, "fts");
          return await (whereClause ? builder.where(whereClause) : builder).limit(limit * 2).toArray();
        } catch (e) {
          logger.warn('[SearchService] FTS text search warning (FTS index might not be created):', e.message);
          return [];
        }
      })()
    ]);

    let results = reciprocalRankFusion(vectorRes, ftsRes);

    // Fallback: If no results found with filter, search globally
    if (results.length === 0 && whereClause) {
      logger.warn(`[SearchService] No results matched with filter: "${whereClause}". Retrying search globally.`);
      
      const [fallbackVectorRes, fallbackFtsRes] = await Promise.all([
        (async () => {
          try {
            return await table.search(queryVector).limit(limit * 2).toArray();
          } catch (e) { return []; }
        })(),
        (async () => {
          try {
            return await table.search(ftsQuery, "fts").limit(limit * 2).toArray();
          } catch (e) { return []; }
        })()
      ]);
      results = reciprocalRankFusion(fallbackVectorRes, fallbackFtsRes);
    }

    // Filter out mock placeholder data
    results = results.filter(r => r.source !== 'mock.txt');

    // Ground with verified Canonical Questions from SQLite if needed
    if (results.length < limit) {
      const canonicalMatches = await searchCanonicalQuestions(query, grade, subject, limit - results.length);
      results = [...results, ...canonicalMatches];
    }

    return results.slice(0, limit);
  } catch (err) {
    if (err.message === 'EMBED_QUOTA_EXHAUSTED') throw err;
    logger.error('[SearchService] Hybrid search failed, attempting canonical questions:', err);
    try {
      return await searchCanonicalQuestions(query, grade, subject, limit);
    } catch (e) {
      return [];
    }
  }
}

module.exports = { performHybridSearch, reciprocalRankFusion, searchCanonicalQuestions };
