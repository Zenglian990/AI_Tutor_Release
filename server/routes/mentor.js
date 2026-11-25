const express = require('express');
const router = express.Router();
const { getSqliteDb } = require('../db/init');
const { decryptField } = require('../utils/crypto');
const { getStudentCognitiveMemory } = require('../services/studentMemory');
const { diagnosePrerequisiteKnowledge } = require('../services/knowledgeGraph');
const { formatGradeName } = require('../prompts/guidelines');
const { resolveAuthorizedProfileId } = require('../middleware/auth');
const { NODE_ENV } = require('../config');
const logger = require('../services/logger');

/**
 * GET /api/mentor/daily-briefing
 * Computes an active daily briefing for the student (strictly scoped by grade + subject to prevent cross-grade pollution)
 */
router.get('/mentor/daily-briefing', async (req, res) => {
  try {
    const { profile_id = 'default', grade = '7_up', subject = '数学', student_name = '' } = req.query;
    const authCheck = resolveAuthorizedProfileId(req, profile_id);
    if (!authCheck.ok) return res.status(authCheck.status || 403).json({ error: authCheck.error });
    const targetPid = authCheck.profileId;
    const db = getSqliteDb();

    const memory = await getStudentCognitiveMemory(targetPid, grade, subject, student_name || '同学');
    const resolvedName = (student_name && student_name.trim()) || memory.studentName || '同学';

    let dueMistakes = [];
    let totalMistakeCount = 0;

    if (db) {
      try {
        let dueSql = `
          SELECT id, query, reason, tags, grade, easiness_factor, review_count, next_review_date
          FROM mistakes
          WHERE profile_id = ?
        `;
        const params = [targetPid];
        if (subject) {
          dueSql += ` AND (subject = ? OR subject IS NULL)`;
          params.push(subject);
        }
        // 修复跨年级错题污染：严格按当前年级过滤待复盘任务，杜绝把初一几何题推送给一年级小学生或高一高中生
        if (grade && grade !== 'unknown') {
          const gradePrefix = String(grade).split('_')[0];
          dueSql += ` AND (grade = ? OR grade LIKE ?)`;
          params.push(grade, `${gradePrefix}_%`);
        }
        dueSql += ` ORDER BY 
          CASE WHEN next_review_date <= datetime('now') THEN 0 ELSE 1 END,
          review_count ASC,
          timestamp DESC
          LIMIT 3`;
        
        const rawDueMistakes = await db.all(dueSql, params);
        dueMistakes = rawDueMistakes.map(m => ({
          ...m,
          query: decryptField(m.query),
          reason: decryptField(m.reason),
          tags: decryptField(m.tags || '')
        }));

        let countSql = `SELECT COUNT(*) as count FROM mistakes WHERE profile_id = ?`;
        const countParams = [targetPid];
        if (subject) {
          countSql += ` AND (subject = ? OR subject IS NULL)`;
          countParams.push(subject);
        }
        if (grade && grade !== 'unknown') {
          const gradePrefix = String(grade).split('_')[0];
          countSql += ` AND (grade = ? OR grade LIKE ?)`;
          countParams.push(grade, `${gradePrefix}_%`);
        }
        const countRow = await db.get(countSql, countParams);
        totalMistakeCount = countRow ? countRow.count : 0;
      } catch (dbErr) {
        logger.warn('[MentorBriefing] Failed querying due mistakes:', dbErr.message);
      }
    }

    const gradeLabel = formatGradeName(grade);
    let greetingHeadline = `${resolvedName}同学，名师今日备课便签已就绪！`;
    let suggestedMission = null;

    if (dueMistakes.length > 0) {
      const topMistake = dueMistakes[0];
      const decTags = decryptField(topMistake.tags);
      const decReason = decryptField(topMistake.reason);
      const decQuery = decryptField(topMistake.query);
      suggestedMission = {
        type: 'mistake_sniper',
        title: `今日靶向狙击：${decTags || decReason || '巩固易错题'}`,
        query: decQuery,
        reason: decReason || '曾在该题型存在思维卡点，今天花 3 分钟彻底攻克它！',
        mistakeId: topMistake.id,
        actionLabel: '立即开启靶向微测'
      };
      greetingHeadline = `${resolvedName}同学，昨日有 ${dueMistakes.length} 道错题已进入艾宾浩斯复习窗口！`;
    } else {
      suggestedMission = {
        type: 'concept_breakthrough',
        title: `突破新高地：${gradeLabel}【${subject}】核心母题演练`,
        query: `老师，请针对【${gradeLabel} · ${subject}】中最常考的母题模型，为我出一道经典挑战题，用苏格拉底分步启发考考我！`,
        reason: '当前复习库已全部清零，状态极佳！建议进入新知识点探究。',
        actionLabel: '挑战今日新母题'
      };
    }

    let graphDiagnosis = null;
    if (memory.recentWeakPoints && memory.recentWeakPoints.length > 0) {
      graphDiagnosis = diagnosePrerequisiteKnowledge(memory.recentWeakPoints[0], subject);
    }

    res.json({
      success: true,
      studentName: resolvedName,
      gradeLabel,
      subject,
      greetingHeadline,
      totalMistakeCount,
      dueMistakeCount: dueMistakes.length,
      dueMistakes,
      topWeakTags: memory.topWeakTags || [],
      recentWeakPoints: memory.recentWeakPoints || [],
      suggestedMission,
      graphDiagnosis
    });
  } catch (err) {
    logger.error('[MentorBriefing] Error generating briefing:', err);
    res.status(500).json({ error: '无法生成今日名师备课简报', details: NODE_ENV === 'development' ? err.message : undefined });
  }
});

/**
 * POST /api/mentor/hint
 * Proactively generate a tiny, non-spoiling cognitive hint when student is stuck
 */
router.post('/mentor/hint', async (req, res) => {
  try {
    const { problemText, currentStepText = '', subject = '数学', student_name = '同学' } = req.body;
    if (!problemText) {
      return res.status(400).json({ error: 'problemText is required' });
    }

    const hintMessages = [
      `💡 【微提示】：先把已知条件在草稿纸上用铅笔圈出来，看看哪个条件能作为第一步的等量关系？`,
      `✏️ 【破题支架】：尝试从结论倒推一步：要求出最终目标，前一步必须先知道什么？`,
      `🔍 【审题陷阱】：留意题干中的隐含条件（如平行线、中点、角平分线），看看是否构成了特殊图形？`
    ];

    const randomHint = hintMessages[Math.floor(Math.random() * hintMessages.length)];

    res.json({
      success: true,
      hint: `${student_name}同学别着急，老师给你一个破题支架：\n${randomHint}\n拿起笔在草稿纸上画出第一笔试一试！`
    });
  } catch (err) {
    logger.error('[MentorHint] Error providing hint:', err);
    res.status(500).json({ error: '无法生成提示', details: NODE_ENV === 'development' ? err.message : undefined });
  }
});

module.exports = router;
