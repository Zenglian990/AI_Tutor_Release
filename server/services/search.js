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
    let gradeCondition = 'grade LIKE ?';
    let gradeParams = ['%'];
    if (grade) {
      const gStr = String(grade).trim();
      const numMatch = gStr.match(/^(1[0-2]|[1-9])(?:_|$)/);
      const parsedNum = numMatch ? parseInt(numMatch[1], 10) : null;

      if (parsedNum === 10 || gStr.includes('高一') || gStr.includes('10_')) {
        gradeCondition = "(grade LIKE '10%' OR grade LIKE '%高一%' OR grade LIKE '%高中%' OR grade LIKE '%高考%')";
        gradeParams = [];
      } else if (parsedNum === 11 || gStr.includes('高二') || gStr.includes('11_')) {
        gradeCondition = "(grade LIKE '11%' OR grade LIKE '%高二%' OR grade LIKE '%高中%' OR grade LIKE '%高考%')";
        gradeParams = [];
      } else if (parsedNum === 12 || gStr.includes('高三') || gStr.includes('12_') || gStr.includes('senior') || gStr.includes('高考')) {
        gradeCondition = "(grade LIKE '12%' OR grade LIKE '%高三%' OR grade LIKE '%高中%' OR grade LIKE '%高考%')";
        gradeParams = [];
      } else if (parsedNum === 7 || gStr.includes('初一')) {
        gradeCondition = "(grade LIKE '7%' OR grade LIKE '%七年级%' OR grade LIKE '%初一%')";
        gradeParams = [];
      } else if (parsedNum === 8 || gStr.includes('初二')) {
        gradeCondition = "(grade LIKE '8%' OR grade LIKE '%八年级%' OR grade LIKE '%初二%')";
        gradeParams = [];
      } else if (parsedNum === 9 || gStr.includes('初三')) {
        gradeCondition = "(grade LIKE '9%' OR grade LIKE '%九年级%' OR grade LIKE '%初三%')";
        gradeParams = [];
      } else if (parsedNum && parsedNum >= 1 && parsedNum <= 6) {
        // 严格限定开头为 1-6 且排除 10/11/12，绝不串入高中或跨年级题目
        gradeCondition = "(grade = ? OR grade LIKE ? OR grade LIKE ?)";
        gradeParams = [String(parsedNum), `${parsedNum}_%`, `%${parsedNum}年级%`];
      }
    }

    const cleanSubj = subject ? subject.replace(/[\s\-_]/g, '') : '数学';

    // Extract core educational keywords from query
    const keywords = (query || '')
      .replace(/老师|请问|帮我|针对|考考我|分步|启发|出题|一道|经典|最新|关于|我想|挑战|母题|模型|题眼|难题/g, ' ')
      .match(/[\u4e00-\u9fa5]{2,}|[a-zA-Z0-9]+/g) || [];

    let rows = [];
    if (keywords.length > 0) {
      const topKw = keywords.slice(0, 3);
      let sql = `SELECT id, question, analysis, key_insight, chapter, source, standard_answer FROM canonical_questions WHERE ${gradeCondition} AND subject LIKE ?`;
      const params = [...gradeParams, `%${cleanSubj}%`];
      
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
        `SELECT id, question, analysis, key_insight, chapter, source, standard_answer FROM canonical_questions WHERE ${gradeCondition} AND subject LIKE ? ORDER BY id ASC LIMIT ?`,
        [...gradeParams, `%${cleanSubj}%`, limit]
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

const SUBJECT_MATCH_KEYWORDS = {
  '语文': ['语文', 'Chinese'],
  '数学': ['数学', 'Math'],
  '英语': ['英语', 'English'],
  '物理': ['物理', 'Physics'],
  '化学': ['化学', 'Chemistry'],
  '生物': ['生物', 'Biology'],
  '生物学': ['生物', 'Biology'],
  '历史': ['历史', 'History'],
  '地理': ['地理', 'Geography'],
  '政治': ['思想政治', '政治', '道德与法治', '思想品德', 'Politics'],
  '思想政治': ['思想政治', '政治', '道德与法治', 'Politics'],
  '道德与法治': ['道德与法治', '思想政治', '政治', 'Politics'],
  '科学': ['科学', 'Science']
};

function filterResultsBySubjectAndStage(results, subject, grade) {
  if (!Array.isArray(results) || results.length === 0) return [];
  const subjTokens = subject && SUBJECT_MATCH_KEYWORDS[subject] ? SUBJECT_MATCH_KEYWORDS[subject] : null;
  const gradeNum = grade ? parseInt(String(grade).replace(/\D/g, ''), 10) : null;
  return results.filter(r => {
    if (!r || r.source === 'mock.txt') return false;
    const src = String(r.source || '');
    // 1. 严格锁定同科目，绝不允许高三数学串出七年级道法/九年级英语
    if (subjTokens && !subjTokens.some(tok => src.includes(tok))) {
      return false;
    }
    // 2. 严格阻止跨大阶段串台（如高中生不返回小学一~六年级教材，小学生不返回高中选修）
    if (gradeNum >= 10) {
      if (/(一年级|二年级|三年级|四年级|五年级|六年级|七年级|八年级|九年级|初一|初二|初三|小学|初中)/.test(src)) {
        return false;
      }
    } else if (gradeNum >= 1 && gradeNum <= 6) {
      if (/(高一|高二|高三|高中|必修|选择性必修|七年级|八年级|九年级|初一|初二|初三|初中)/.test(src)) {
        return false;
      }
    } else if (gradeNum >= 7 && gradeNum <= 9) {
      if (/(一年级|二年级|三年级|四年级|五年级|六年级|小学|高一|高二|高三|高中|选择性必修)/.test(src)) {
        return false;
      }
    }
    return true;
  });
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
async function performHybridSearch(query, grade, subject, limit = 3, edition, clientHeaders = {}) {
  const table = getTable();
  if (!table) {
    logger.warn('[SearchService] LanceDB table not ready. Falling back to canonical questions.');
    return await searchCanonicalQuestions(query, grade, subject, limit);
  }

  try {
    let queryVector = null;
    let isQuotaExhausted = false;
    try {
      queryVector = await getEmbedding(query, clientHeaders);
    } catch (embedErr) {
      if (embedErr.code === 'EMBED_QUOTA_EXHAUSTED' || embedErr.message === 'EMBED_QUOTA_EXHAUSTED') {
        isQuotaExhausted = true;
        logger.warn('[SearchService] Embedding quota exhausted (429), attempting FTS text fallback.');
      } else {
        logger.warn('[SearchService] Failed to generate query embedding:', embedErr.message);
      }
    }

    const whereClause = buildLanceDBWhereClause(grade, subject, edition);
    // 二级学科锁定子句：当精准年级+版本无命中时，只允许在同科目内放宽，绝不全局跨学科裸搜
    const subjectOnlyWhere = subject ? buildLanceDBWhereClause(null, subject, null) : '';
    const ftsQuery = cleanQueryForFTS(query);

    // Fallback: If no queryVector available (quota exhausted or offline), execute FTS text search only
    if (!queryVector) {
      let ftsResults = [];
      try {
        let builder = table.search(ftsQuery, "fts");
        if (whereClause) builder = builder.where(whereClause);
        ftsResults = await builder.limit(limit * 2).toArray();
        if (ftsResults.length === 0 && subjectOnlyWhere && subjectOnlyWhere !== whereClause) {
          ftsResults = await table.search(ftsQuery, "fts").where(subjectOnlyWhere).limit(limit * 2).toArray();
        }
      } catch (ftsErr) {
        logger.warn('[SearchService] FTS text search failed in fallback:', ftsErr.message);
      }
      ftsResults = filterResultsBySubjectAndStage(ftsResults, subject, grade);

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

    let results = filterResultsBySubjectAndStage(reciprocalRankFusion(vectorRes, ftsRes), subject, grade);

    // Fallback: 精准过滤无命中时，严格锁定同科目放宽版本/具体册别，绝不做无条件全库跨学科裸搜
    if (results.length === 0 && subjectOnlyWhere && subjectOnlyWhere !== whereClause) {
      logger.warn(`[SearchService] No results matched strict filter: "${whereClause}". Retrying within same subject "${subjectOnlyWhere}".`);
      
      const [fallbackVectorRes, fallbackFtsRes] = await Promise.all([
        (async () => {
          try {
            return await table.search(queryVector).where(subjectOnlyWhere).limit(limit * 2).toArray();
          } catch (e) { return []; }
        })(),
        (async () => {
          try {
            return await table.search(ftsQuery, "fts").where(subjectOnlyWhere).limit(limit * 2).toArray();
          } catch (e) { return []; }
        })()
      ]);
      results = filterResultsBySubjectAndStage(reciprocalRankFusion(fallbackVectorRes, fallbackFtsRes), subject, grade);
    }

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
