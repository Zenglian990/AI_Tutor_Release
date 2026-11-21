const express = require('express');
const router = express.Router();
const { computeCampaignRoadmap } = require('../services/campaignRoadmap');
const logger = require('../services/logger');

// GET /api/campaign/roadmap
router.get('/campaign/roadmap', async (req, res) => {
  try {
    const { profile_id = 'default', grade = '7_up', subject = '数学' } = req.query;
    const roadmap = await computeCampaignRoadmap(profile_id, grade, subject);
    res.json({ success: true, ...roadmap });
  } catch (err) {
    logger.error('[CampaignRoute] Failed to get roadmap:', err);
    res.status(500).json({ error: '获取宏观战役沙盘数据失败', details: err.message });
  }
});

module.exports = router;
