const express = require('express');
const router = express.Router();
const { computeCampaignRoadmap } = require('../services/campaignRoadmap');
const { resolveAuthorizedProfileId } = require('../middleware/auth');
const { NODE_ENV } = require('../config');
const logger = require('../services/logger');

// GET /api/campaign/roadmap
router.get('/campaign/roadmap', async (req, res) => {
  try {
    const { profile_id = 'default', grade = '7_up', subject = '数学' } = req.query;
    const authCheck = resolveAuthorizedProfileId(req, profile_id);
    if (!authCheck.ok) return res.status(authCheck.status || 403).json({ error: authCheck.error });
    const roadmap = await computeCampaignRoadmap(authCheck.profileId, grade, subject);
    res.json({ success: true, ...roadmap });
  } catch (err) {
    logger.error('[CampaignRoute] Failed to get roadmap:', err);
    res.status(500).json({ error: '获取宏观战役沙盘数据失败', details: NODE_ENV === 'development' ? err.message : undefined });
  }
});

module.exports = router;
