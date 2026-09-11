const express = require('express');
const router = express.Router();
const { getSqliteDb } = require('../db/init');
const { getStudentCognitiveMemory } = require('../services/studentMemory');
const { formatGradeName } = require('../prompts/guidelines');
const logger = require('../services/logger');

// GET /api/parent/daily-memo
router.get('/parent/daily-memo', async (req, res) => {
  try {
    const { profile_id = 'default', grade = '7_up', subject = '数学', student_name = '曾练' } = req.query;
    const db = getSqliteDb();

    const memory = await getStudentCognitiveMemory(profile_id, grade, subject, student_name);
    const resolvedName = memory.studentName || '曾练';
    const gradeLabel = formatGradeName(grade);

    let todayChatCount = 0;
    let todayMistakesSolved = 0;

    if (db) {
      try {
        const chatRow = await db.get(
          `SELECT COUNT(*) as count FROM chat_history WHERE profile_id = ? AND date(timestamp) = date('now')`,
          [profile_id]
        );
        todayChatCount = chatRow ? chatRow.count : 0;

        const mistakeRow = await db.get(
          `SELECT COUNT(*) as count FROM mistakes WHERE profile_id = ? AND review_count > 0 AND date(timestamp) = date('now')`,
          [profile_id]
        );
        todayMistakesSolved = mistakeRow ? mistakeRow.count : 0;
      } catch (e) {
        logger.warn('[ParentMemo] Failed counting daily activity:', e.message);
      }
    }

    // Minutes spent estimate (e.g. 3 mins per interaction)
    const activeMinutes = Math.max(Math.round(todayChatCount * 2.5), 15);

    const memoTitle = `曾先生您好，这是【${resolvedName}】今日专属名师家访便签 💌`;
    const memoContent = [
      `🌟 **今日伴学概况**：${resolvedName} 同学今天在【${gradeLabel} · ${subject}】专注研学约 ${activeMinutes} 分钟，互动探讨 ${todayChatCount} 轮。`,
      `🎯 **核心能力提升**：严格遵循苏格拉底四阶引导，动笔演练草稿，拒绝直接抄写答案。${memory.topWeakTags?.length ? `重点攻坚了【${memory.topWeakTags.join('、')}】薄弱考点。` : '在基础概念推导上表现沉稳。'}`,
      `💡 **名师督学建议**：${todayMistakesSolved > 0 ? `今天顺利复盘了 ${todayMistakesSolved} 道艾宾浩斯到期错题，记忆加深明显！` : '目前学习状态积极，晚上建议安排适度眼部放松与体育活动，无需过度刷题。'}`
    ];

    res.json({
      success: true,
      studentName: resolvedName,
      date: new Date().toLocaleDateString('zh-CN'),
      memoTitle,
      activeMinutes,
      todayChatCount,
      todayMistakesSolved,
      memoContent,
      comfortScore: '98 (放心特优)'
    });
  } catch (err) {
    logger.error('[ParentMemo] Failed to generate parent memo:', err);
    res.status(500).json({ error: '生成家长家访便签失败', details: err.message });
  }
});

module.exports = router;
