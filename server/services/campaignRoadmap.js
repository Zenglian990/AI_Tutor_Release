const { getSqliteDb } = require('../db/init');
const { KNOWLEDGE_GRAPH } = require('./knowledgeGraph');
const logger = require('./logger');

/**
 * Computes long-term campaign roadmap & mastery simulation for a student.
 */
async function computeCampaignRoadmap(profileId = 'default', grade = '7_up', subject = '数学') {
  const db = getSqliteDb();
  const gradeNum = parseInt(String(grade || '7').replace(/\D/g, ''), 10) || 7;
  const isHighSchool = gradeNum >= 10;
  const isPrimary = gradeNum <= 6;
  const gradePrefix = String(grade || '').split('_')[0];

  // 严格按学科与当前学段筛选知识图谱节点，防止不同学段互相混算
  const subjectNodes = Object.values(KNOWLEDGE_GRAPH).filter(n => {
    if (subject && n.subject !== subject) return false;
    const nodeGradeNum = parseInt(String(n.grade || '').replace(/\D/g, ''), 10);
    if (!nodeGradeNum) return true;
    if (isHighSchool) return nodeGradeNum >= 10;
    if (isPrimary) return nodeGradeNum <= 6;
    return nodeGradeNum >= 7 && nodeGradeNum <= 9;
  });
  const totalNodesCount = Math.max(subjectNodes.length, 6);

  let masteredCount = 0;
  let inProgressCount = 0;
  let totalMistakeCount = 0;

  if (db) {
    try {
      // 1. 仅统计当前学段/年级的章节进度，严禁把初中/小学进度混入高中
      const progressList = gradePrefix
        ? await db.all(
            `SELECT chapter_id, progress_pct, status FROM profile_progress WHERE profile_id = ? AND subject = ? AND (grade = ? OR grade LIKE ?)`,
            [profileId, subject, grade, `${gradePrefix}_%`]
          )
        : await db.all(
            `SELECT chapter_id, progress_pct, status FROM profile_progress WHERE profile_id = ? AND subject = ?`,
            [profileId, subject]
          );
      masteredCount = progressList.filter(p => p.progress_pct >= 100 || p.status === 'completed').length;
      inProgressCount = progressList.filter(p => p.progress_pct > 0 && p.progress_pct < 100).length;

      // 2. 仅统计当前学段/年级的错题数
      const mistakeRow = gradePrefix
        ? await db.get(
            `SELECT COUNT(*) as cnt FROM mistakes WHERE profile_id = ? AND (subject = ? OR subject IS NULL) AND (grade = ? OR grade LIKE ?)`,
            [profileId, subject, grade, `${gradePrefix}_%`]
          )
        : await db.get(
            `SELECT COUNT(*) as cnt FROM mistakes WHERE profile_id = ? AND (subject = ? OR subject IS NULL)`,
            [profileId, subject]
          );
      totalMistakeCount = mistakeRow?.cnt || 0;
    } catch (e) {
      logger.warn('[CampaignRoadmap] DB query error:', e.message);
    }
  }

  // Dynamic exam scale across K12 (1-12 grades): High school main subjects 150 / electives 100; Middle school 120; Primary 100
  const isMainSubject = ['语文', '数学', '英语'].includes(subject);
  const maxScore = isHighSchool ? (isMainSubject ? 150 : 100) : (isPrimary ? 100 : 120);
  const examName = isHighSchool ? '新高考/月考' : (isPrimary ? '单元/期末' : '中考/期末');

  // Calculate mastery index (0 - 100)
  const baseCoveragePct = Math.min(Math.round(((masteredCount * 1.0 + inProgressCount * 0.4) / Math.max(totalNodesCount, 8)) * 100), 100);
  const baseScore = Math.round(maxScore * 0.55);
  const simulatedScore = Math.min(maxScore, Math.round(baseScore + (baseCoveragePct * (maxScore - baseScore) / 100) - (totalMistakeCount > 5 ? 3 : 0)));

  const fmtRange = (lowRatio, highRatio) => `${Math.round(maxScore * lowRatio)}-${Math.round(maxScore * highRatio)}分`;

  // Milestones
  const milestones = [
    { id: 1, title: '阶段一：课本定理与核心概念筑基', targetPct: 30, achieved: baseCoveragePct >= 30, scoreRange: fmtRange(0.62, 0.72) },
    { id: 2, title: '阶段二：高频母题与常规解题模型', targetPct: 65, achieved: baseCoveragePct >= 65, scoreRange: fmtRange(0.74, 0.85) },
    { id: 3, title: '阶段三：易错陷阱穿透与草稿闭环', targetPct: 85, achieved: baseCoveragePct >= 85, scoreRange: fmtRange(0.86, 0.93) },
    { id: 4, title: `阶段四：${examName}压轴突破与拔尖`, targetPct: 100, achieved: baseCoveragePct >= 95, scoreRange: `${fmtRange(0.95, 1.0)}冲刺` }
  ];

  return {
    profileId,
    subject,
    grade,
    maxScore,
    examName,
    totalNodesCount,
    masteredCount,
    inProgressCount,
    coveragePercentage: baseCoveragePct,
    simulatedScore: `${simulatedScore} / ${maxScore}`,
    scoreTier: simulatedScore >= maxScore * 0.9 ? '特优·学霸梯队' : (simulatedScore >= maxScore * 0.75 ? '良好·中坚梯队' : '筑基·潜力梯队'),
    milestones,
    strategicAdvice: baseCoveragePct < 50
      ? `当前阶段首要目标是夯实${isHighSchool ? '高中选修/必修' : '课本'}定理基础，跟紧教材章节闯关，每天拿下 1 个核心概念。`
      : `当前已进入${examName}进阶攻坚期，建议强化靶向错题与母题举一反三，重点突破压轴易错题。`
  };
}

module.exports = { computeCampaignRoadmap };
