const { getEmbedding } = require('./embedding');
const { getTable } = require('../db/init');
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
    logger.warn('[SearchService] LanceDB table not ready. Skipping retrieval.');
    return [];
  }

  try {
    const queryVector = await getEmbedding(query);
    if (!queryVector) {
      logger.warn('[SearchService] Failed to generate query embedding. Skipping vector search.');
      return [];
    }

    const whereClause = buildLanceDBWhereClause(grade, subject, edition);
    const ftsQuery = cleanQueryForFTS(query);
    
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

    return results.slice(0, limit);
  } catch (err) {
    logger.error('[SearchService] Hybrid search failed:', err);
    // Propagate quota exhaustion so routes can return a user-friendly message
    if (err.message === 'EMBED_QUOTA_EXHAUSTED') throw err;
    return [];
  }
}

module.exports = { performHybridSearch, reciprocalRankFusion };
