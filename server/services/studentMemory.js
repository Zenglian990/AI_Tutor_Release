/**
 * studentMemory.js
 * 
 * Student Cognitive Memory & Persona Hub
 * Connects SQLite learning histories (mistakes, chapters, chats) with LLM prompts
 * to turn the AI from a generic chatbot into a living, personalized mentor.
 */
const { getSqliteDb } = require('../db/init');
const logger = require('./logger');

/**
 * Retrieves the comprehensive cognitive memory of a student.
 * 
 * @param {string} profileId - Student profile ID
 * @param {string} grade - Current grade (e.g. '7_up')
 * @param {string} subject - Current subject (e.g. '数学')
 * @returns {Promise<Object>} Memory data object
 */
async function getStudentCognitiveMemory(profileId = 'default', grade = '', subject = '') {
  const db = getSqliteDb();
  if (!db) {
    return {
      profileId,
      studentName: profileId === 'default' ? '曾练' : profileId,
      hasHistory: false,
      summary: ''
    };
  }

  try {
    // 1. Fetch recent mistake patterns
    let mistakesQuery = `
      SELECT query, reason, tags, timestamp, easiness_factor, review_count
      FROM mistakes
      WHERE profile_id = ?
    `;
    const params = [profileId];

    if (subject) {
      mistakesQuery += ` AND (subject = ? OR subject IS NULL)`;
      params.push(subject);
    }

    mistakesQuery += ` ORDER BY timestamp DESC LIMIT 6`;
    const recentMistakes = await db.all(mistakesQuery, params);

    // 2. Aggregate mistake tags
    const tagCountMap = {};
    const weakPoints = [];

    recentMistakes.forEach(m => {
      if (m.tags) {
        m.tags.split(',').forEach(t => {
          const cleanTag = t.trim();
          if (cleanTag) {
            tagCountMap[cleanTag] = (tagCountMap[cleanTag] || 0) + 1;
          }
        });
      }
      if (m.reason && m.reason.length < 50 && !weakPoints.includes(m.reason)) {
        weakPoints.push(m.reason);
      }
    });

    const topTags = Object.entries(tagCountMap)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(entry => entry[0]);

    // 3. Fetch learning progress
    let progressQuery = `
      SELECT chapter_id, progress_pct, status
      FROM profile_progress
      WHERE profile_id = ?
    `;
    const progressParams = [profileId];
    if (grade) {
      progressQuery += ` AND grade = ?`;
      progressParams.push(grade);
    }
    if (subject) {
      progressQuery += ` AND subject = ?`;
      progressParams.push(subject);
    }

    const progressList = await db.all(progressQuery, progressParams);
    const completedChapters = progressList.filter(p => p.progress_pct >= 100 || p.status === 'completed').length;
    const inProgressChapters = progressList.filter(p => p.progress_pct > 0 && p.progress_pct < 100).length;

    // 4. Derive student name
    let studentName = '曾练';
    if (profileId && profileId !== 'default') {
      studentName = profileId;
    }

    const hasHistory = recentMistakes.length > 0 || progressList.length > 0;

    return {
      profileId,
      studentName,
      hasHistory,
      totalMistakes: recentMistakes.length,
      topWeakTags: topTags,
      recentWeakPoints: weakPoints.slice(0, 3),
      completedChapters,
      inProgressChapters,
      rawMistakesSnippet: recentMistakes.map(m => m.query.slice(0, 40)).join('; ')
    };
  } catch (err) {
    logger.warn('[StudentMemory] Failed to read cognitive profile:', err.message);
    return {
      profileId,
      studentName: profileId === 'default' ? '曾练' : profileId,
      hasHistory: false,
      summary: ''
    };
  }
}

/**
 * Formats student cognitive memory into a prompt section for LLM guidelines.
 * 
 * @param {Object} mem - Memory data returned by getStudentCognitiveMemory
 * @returns {string} Formatted prompt section
 */
function formatStudentMemoryForPrompt(mem) {
  if (!mem || !mem.hasHistory) {
    const sName = mem?.studentName || '曾练';
    return `【学生专属心智画像】：当前学生为【${sName}】。处于初次学习或基础起步阶段。请直接称呼学生为“${sName}”，以极大热情与鼓励建立师生信任，仔细观察其审题与草稿演算习惯。`;
  }

  let prompt = `【学生专属心智画像与连续记忆】：\n`;
  prompt += `- 学生称谓：${mem.studentName}\n`;
  
  if (mem.topWeakTags && mem.topWeakTags.length > 0) {
    prompt += `- 近期高频薄弱知识点：【${mem.topWeakTags.join('】、【')}】\n`;
  }

  if (mem.recentWeakPoints && mem.recentWeakPoints.length > 0) {
    prompt += `- 易错思维倾向：${mem.recentWeakPoints.join('；')}\n`;
  }

  if (mem.completedChapters > 0 || mem.inProgressChapters > 0) {
    prompt += `- 当前章节攻坚状况：已通关 ${mem.completedChapters} 个章节，${mem.inProgressChapters} 个章节攻关中\n`;
  }

  prompt += `- 专属私教点拨要求：\n`;
  prompt += `  1. 请自然体现对该学生既往学情的熟稔，适时给予针对性鼓励（例如“这道题又是涉及你上次碰到的同类易错点，看看这次能不能一眼识破”）。\n`;
  prompt += `  2. 针对其薄弱点，提供精准的思维脚手架，不要让学生陷入重复的思维陷阱。\n`;

  return prompt;
}

module.exports = {
  getStudentCognitiveMemory,
  formatStudentMemoryForPrompt
};
