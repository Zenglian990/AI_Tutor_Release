const express = require('express');
const router = express.Router();
const {
  KNOWLEDGE_GRAPH,
  findTopicByKeyword,
  findTopicsByKeyword,
  tracePrerequisiteChain,
  getKnowledgeGraphStats
} = require('../services/knowledgeGraph');
const logger = require('../services/logger');

/**
 * GET /api/knowledge-graph/trace
 * Trace recursive ancestral prerequisite chain upstream across grades
 * Query:
 *  - topic_id: topic ID (optional if keyword is given)
 *  - keyword: fuzzy match keyword or name (optional if topic_id is given)
 *  - grade: optional grade filter (e.g. 9 or "9")
 *  - subject: optional subject filter (e.g. "数学" or "math")
 *  - max_depth: optional traversal depth, default 5
 */
router.get('/knowledge-graph/trace', (req, res) => {
  try {
    const { topic_id, keyword, grade, subject, max_depth } = req.query;

    if (!topic_id && !keyword) {
      return res.status(400).json({
        success: false,
        error: '参数错误: 请提供 topic_id 或 keyword 考点名称进行断层溯源'
      });
    }

    const depth = parseInt(max_depth, 10) || 5;

    // Locate target topic
    let targetTopic = null;
    if (topic_id && KNOWLEDGE_GRAPH[topic_id]) {
      targetTopic = KNOWLEDGE_GRAPH[topic_id];
    } else {
      targetTopic = findTopicByKeyword(keyword || topic_id, grade, subject);
    }

    if (!targetTopic) {
      return res.status(404).json({
        success: false,
        error: `未找到相关考点: ${topic_id || keyword}`
      });
    }

    const chain = tracePrerequisiteChain(targetTopic.id, depth);

    return res.json({
      success: true,
      target_topic: chain.length > 0 ? chain[0] : targetTopic,
      chain,
      total_nodes: chain.length
    });
  } catch (err) {
    logger.error('[KnowledgeGraph Route] Error tracing prerequisite chain:', err);
    return res.status(500).json({
      success: false,
      error: '内部服务错误，无法完成考点溯源: ' + err.message
    });
  }
});

/**
 * GET /api/knowledge-graph/search
 * Search topics across grades and subjects
 */
router.get('/knowledge-graph/search', (req, res) => {
  try {
    const { keyword, grade, subject, limit } = req.query;
    const maxResults = parseInt(limit, 10) || 15;
    const results = findTopicsByKeyword(keyword || '', {
      grade,
      subject,
      limit: maxResults
    });

    return res.json({
      success: true,
      count: results.length,
      topics: results
    });
  } catch (err) {
    logger.error('[KnowledgeGraph Route] Search error:', err);
    return res.status(500).json({
      success: false,
      error: '考点检索失败: ' + err.message
    });
  }
});

/**
 * GET /api/knowledge-graph/stats
 * Return overall taxonomy statistics
 */
router.get('/knowledge-graph/stats', (req, res) => {
  try {
    const stats = getKnowledgeGraphStats();
    return res.json({
      success: true,
      ...stats
    });
  } catch (err) {
    logger.error('[KnowledgeGraph Route] Stats error:', err);
    return res.status(500).json({
      success: false,
      error: '获取知识图谱统计失败'
    });
  }
});

/**
 * GET /api/knowledge-graph/topic/:id
 * Retrieve single topic details with direct prerequisites
 */
router.get('/knowledge-graph/topic/:id', (req, res) => {
  try {
    const { id } = req.params;
    const topic = KNOWLEDGE_GRAPH[id];
    if (!topic) {
      return res.status(404).json({
        success: false,
        error: `未找到考点: ${id}`
      });
    }

    const directPrereqs = (topic.prerequisites || [])
      .map(pId => KNOWLEDGE_GRAPH[pId])
      .filter(Boolean);

    return res.json({
      success: true,
      topic,
      directPrerequisites: directPrereqs
    });
  } catch (err) {
    logger.error('[KnowledgeGraph Route] Get topic error:', err);
    return res.status(500).json({
      success: false,
      error: '获取考点失败'
    });
  }
});

module.exports = router;
