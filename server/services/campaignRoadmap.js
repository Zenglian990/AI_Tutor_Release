const { getSqliteDb } = require('../db/init');
const { KNOWLEDGE_GRAPH } = require('./knowledgeGraph');
const logger = require('./logger');

/**
 * Computes long-term campaign roadmap & mastery simulation for a student.
 */
async function computeCampaignRoadmap(profileId = 'default', grade = '7_up', subject = '数学') {
  const db = getSqliteDb();
  const subjectGraph = KNOWLEDGE_GRAPH[subject] || {};
  const allNodes = Object.keys(subjectGraph);
  const totalNodesCount = Math.max(allNodes.length, 1);

  let masteredCount = 0;
  let inProgressCount = 0;
  let totalMistakeCount = 0;

  if (db) {
    try {
      // 1. Progress count from profile_progress
      const progressList = await db.all(
        `SELECT chapter_id, progress_pct, status FROM profile_progress WHERE profile_id = ? AND subject = ?`,
        [profileId, subject]
      );
      masteredCount = progressList.filter(p => p.progress_pct >= 100 || p.status === 'completed').length;
      inProgressCount = progressList.filter(p => p.progress_pct > 0 && p.progress_pct < 100).length;

      // 2. Mistakes count
      const mistakeRow = await db.get(
        `SELECT COUNT(*) as cnt FROM mistakes WHERE profile_id = ? AND (subject = ? OR subject IS NULL)`,
        [profileId, subject]
      );
      totalMistakeCount = mistakeRow?.cnt || 0;
    } catch (e) {
      logger.warn('[CampaignRoadmap] DB query error:', e.message);
    }
  }

  // Calculate mastery index (0 - 100)
  const baseCoveragePct = Math.min(Math.round(((masteredCount * 1.0 + inProgressCount * 0.4) / Math.max(totalNodesCount, 8)) * 100), 100);
  // Score projection for Middle School Entrance / Midterm (out of 120 standard points in Chinese Exams)
  const baseScore = 65;
  const simulatedScore = Math.min(120, Math.round(baseScore + (baseCoveragePct * 0.55) - (totalMistakeCount > 5 ? 3 : 0)));

  // Milestones
  const milestones = [
    { id: 1, title: '阶段一：课本定理与核心概念筑基', targetPct: 30, achieved: baseCoveragePct >= 30, scoreRange: '75-85分' },
    { id: 2, title: '阶段二：高频母题与常规解题模型', targetPct: 65, achieved: baseCoveragePct >= 65, scoreRange: '88-102分' },
    { id: 3, title: '阶段三：易错陷阱穿透与草稿闭环', targetPct: 85, achieved: baseCoveragePct >= 85, scoreRange: '105-112分' },
    { id: 4, title: '阶段四：中考/期末压轴突破与拔尖', targetPct: 100, achieved: baseCoveragePct >= 95, scoreRange: '115-120分冲刺' }
  ];

  return {
    profileId,
    subject,
    grade,
    totalNodesCount,
    masteredCount,
    inProgressCount,
    coveragePercentage: baseCoveragePct,
    simulatedScore: `${simulatedScore} / 120`,
    scoreTier: simulatedScore >= 108 ? '特优·学霸梯队' : (simulatedScore >= 90 ? '良好·中坚梯队' : '筑基·潜力梯队'),
    milestones,
    strategicAdvice: baseCoveragePct < 50
      ? '当前阶段首要目标是夯实课本定理基础，跟紧教材章节闯关，每天拿下 1 个核心概念。'
      : '当前已进入进阶攻坚期，建议强化靶向错题与母题举一反三，重点突破易错题。'
  };
}

module.exports = { computeCampaignRoadmap };
