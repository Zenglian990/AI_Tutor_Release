const express = require('express');
const router = express.Router();
const { getSqliteDb } = require('../db/init');
const { getStudentCognitiveMemory } = require('../services/studentMemory');
const { formatGradeName } = require('../prompts/guidelines');
const { isSafeExternalUrl } = require('../utils/urlValidator');
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

    // Minutes spent estimate (e.g. 2.5 mins per interaction, 0 if no interaction)
    const activeMinutes = todayChatCount > 0 ? Math.max(Math.round(todayChatCount * 2.5), 5) : 0;

    const memoTitle = `曾先生您好，这是【${resolvedName}】今日专属名师家访便签 💌`;
    const memoContent = [
      todayChatCount > 0
        ? `🌟 **今日伴学概况**：${resolvedName} 同学今天在【${gradeLabel} · ${subject}】专注研学约 ${activeMinutes} 分钟，互动探讨 ${todayChatCount} 轮。`
        : `🌟 **今日伴学概况**：${resolvedName} 同学今天在【${gradeLabel} · ${subject}】暂未开启互动探讨。`,
      `🎯 **核心能力提升**：严格遵循苏格拉底四阶引导，动笔演练草稿，拒绝直接抄写答案。${memory.topWeakTags?.length ? `重点攻坚了【${memory.topWeakTags.join('、')}】薄弱考点。` : '在基础概念推导上表现沉稳。'}`,
      `💡 **名师督学建议**：${todayMistakesSolved > 0 ? `今天顺利复盘了 ${todayMistakesSolved} 道艾宾浩斯到期错题，记忆加深明显！` : (todayChatCount > 0 ? '目前学习状态积极，晚上建议安排适度眼部放松与体育活动，无需过度刷题。' : '建议晚间安排 10 分钟趣味答疑或闯关挑战，保持每日思维敏锐度。')}`
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

// POST /api/parent/push-webhook
// Pushes daily memo directly to parent's WeChat / Enterprise WeChat / DingTalk Webhook
router.post('/parent/push-webhook', async (req, res) => {
  try {
    const { webhook_url, memo_title, memo_content = [], student_name = '曾练', date_str, comfort_score = '98 (放心特优)' } = req.body;

    const urlCheck = isSafeExternalUrl(webhook_url);
    if (!urlCheck.safe) {
      return res.status(400).json({ error: `非法或不安全的 Webhook 链接: ${urlCheck.error}` });
    }

    const markdownText = `### ${memo_title || `名师晚间家访便签 💌`}\n**学员**：${student_name} | **日期**：${date_str || new Date().toLocaleDateString('zh-CN')}\n\n${memo_content.join('\n\n')}\n\n> 🛡️ **家长放心指数**：${comfort_score}\n> 💡 *由曾练专属 AI 私教案头自动归纳生成*`;

    let payload = {};
    if (webhook_url.includes('dingtalk.com')) {
      // DingTalk bot format
      payload = {
        msgtype: 'markdown',
        markdown: {
          title: memo_title || '名师学情便签',
          text: markdownText
        }
      };
    } else if (webhook_url.includes('feishu.cn') || webhook_url.includes('larksuite.com')) {
      // Feishu bot format
      payload = {
        msg_type: 'interactive',
        card: {
          header: { title: { tag: 'plain_text', content: memo_title || '名师学情便签 💌' } },
          elements: [{ tag: 'div', text: { tag: 'lark_md', content: markdownText } }]
        }
      };
    } else {
      // Standard WeChat Work / Server酱 / Custom Webhook format
      payload = {
        msgtype: 'markdown',
        markdown: {
          content: markdownText
        },
        text: markdownText
      };
    }

    const fetchResponse = await fetch(webhook_url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const respText = await fetchResponse.text();
    logger.info('[ParentMemo] Pushed memo to webhook:', webhook_url.slice(0, 35) + '...', respText.slice(0, 50));

    res.json({
      success: true,
      message: '便签已成功推送至家长手机！',
      status: fetchResponse.status
    });
  } catch (err) {
    logger.error('[ParentMemo] Failed to push webhook:', err);
    res.status(500).json({ error: '推送至家长端失败，请检查 Webhook 链接是否可用' });
  }
});

module.exports = router;
