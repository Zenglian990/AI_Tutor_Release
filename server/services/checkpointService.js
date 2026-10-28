/**
 * checkpointService.js
 * 
 * Persistent Study Checkpoint & Seamless Resume Engine (断点续学锚点引擎)
 * Ensures intermittent learners never have to start from scratch or re-explain where they left off.
 */

const logger = require('./logger');

/**
 * Saves or updates the student's current study checkpoint.
 * 
 * @param {Object} db - SQLite instance
 * @param {Object} data
 * @param {string} data.profileId - Student profile ID
 * @param {string} data.subject - Subject (e.g. '数学')
 * @param {string} [data.chapterId] - Active chapter identifier
 * @param {string} [data.chapterName] - Human-readable chapter name
 * @param {string} [data.conceptId] - Specific concept ID from knowledgeGraph
 * @param {string} [data.conceptName] - Specific concept name
 * @param {string} [data.lastQuerySnippet] - Truncated snippet of the last question worked on
 * @param {string} [data.unresolvedQuestion] - Unfinished question or problem left off
 * @param {number} [data.progressPct] - Progress percentage in current topic (0-100)
 */
async function saveStudyCheckpoint(db, {
  profileId = 'default',
  subject = '数学',
  chapterId = '',
  chapterName = '',
  conceptId = '',
  conceptName = '',
  lastQuerySnippet = '',
  unresolvedQuestion = '',
  progressPct = 0
}) {
  if (!db) return null;

  try {
    const cleanSnippet = (lastQuerySnippet || '').slice(0, 100);
    const cleanUnresolved = (unresolvedQuestion || '').slice(0, 150);

    await db.run(`
      INSERT INTO study_checkpoints (
        profile_id, subject, chapter_id, chapter_name, concept_id, concept_name,
        last_query_snippet, unresolved_question, progress_pct, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(profile_id, subject) DO UPDATE SET
        chapter_id = CASE WHEN excluded.chapter_id != '' THEN excluded.chapter_id ELSE chapter_id END,
        chapter_name = CASE WHEN excluded.chapter_name != '' THEN excluded.chapter_name ELSE chapter_name END,
        concept_id = CASE WHEN excluded.concept_id != '' THEN excluded.concept_id ELSE concept_id END,
        concept_name = CASE WHEN excluded.concept_name != '' THEN excluded.concept_name ELSE concept_name END,
        last_query_snippet = CASE WHEN excluded.last_query_snippet != '' THEN excluded.last_query_snippet ELSE last_query_snippet END,
        unresolved_question = CASE WHEN excluded.unresolved_question != '' THEN excluded.unresolved_question ELSE unresolved_question END,
        progress_pct = CASE WHEN excluded.progress_pct > 0 THEN excluded.progress_pct ELSE progress_pct END,
        updated_at = CURRENT_TIMESTAMP
    `, [
      profileId,
      subject,
      chapterId,
      chapterName,
      conceptId,
      conceptName,
      cleanSnippet,
      cleanUnresolved,
      progressPct
    ]);

    return {
      profileId,
      subject,
      chapterName,
      conceptName,
      progressPct
    };
  } catch (err) {
    logger.warn('[CheckpointService] Failed to save study checkpoint:', err.message);
    return null;
  }
}

/**
 * Retrieves the latest study checkpoint for a student.
 */
async function getStudyCheckpoint(db, profileId = 'default', subject = '') {
  if (!db) return null;

  try {
    let query = `
      SELECT profile_id, subject, chapter_id, chapter_name, concept_id, concept_name,
             last_query_snippet, unresolved_question, progress_pct, updated_at
      FROM study_checkpoints
      WHERE profile_id = ?
    `;
    const params = [profileId];

    if (subject) {
      query += ` AND subject = ?`;
      params.push(subject);
    }

    query += ` ORDER BY updated_at DESC LIMIT 1`;
    return await db.get(query, params) || null;
  } catch (err) {
    logger.warn('[CheckpointService] Failed to get study checkpoint:', err.message);
    return null;
  }
}

/**
 * Formats natural reconnect greeting when student logs in or sends initial greeting.
 */
function formatResumeGreeting(checkpoint, studentName = '曾练') {
  if (!checkpoint) {
    return `${studentName}同学，欢迎来到课堂！今天咱们从哪个考点开始攻克？随时把题目发给我！`;
  }

  const topic = checkpoint.concept_name || checkpoint.chapter_name || `${checkpoint.subject}核心模块`;
  const pctStr = checkpoint.progress_pct > 0 ? `（当前攻关进度约 ${checkpoint.progress_pct}%）` : '';
  
  if (checkpoint.unresolved_question || checkpoint.last_query_snippet) {
    const hint = checkpoint.unresolved_question || checkpoint.last_query_snippet;
    return `${studentName}同学，欢迎回来！咱们上次在【${topic}】${pctStr}探讨到题目“${hint}”。今天咱们不用从头复述，直接接上这里的思维断点继续攻破，准备好动笔了吗？`;
  }

  return `${studentName}同学，欢迎回来！咱们上次学到了【${topic}】${pctStr}。今天直接从这里往下推进，准备好草稿纸了吗？`;
}

/**
 * Formats prompt injection so the AI tutor actively resumes where the student left off.
 */
function formatCheckpointPromptSection(checkpoint, studentName = '曾练', isGreetingOrStart = false) {
  if (!checkpoint) return '';

  const topic = checkpoint.concept_name || checkpoint.chapter_name || `${checkpoint.subject}模块`;
  const pct = checkpoint.progress_pct || 0;

  let section = `\n【📍 学习断点记录（续学锚点 · 绝不从头讲起）】：\n`;
  section += `- 学生上次学到位置：【${topic}】（进度约 ${pct}%，科目：${checkpoint.subject}）\n`;
  if (checkpoint.last_query_snippet) {
    section += `- 上次攻坚题目摘要：${checkpoint.last_query_snippet}\n`;
  }
  if (checkpoint.unresolved_question) {
    section += `- 上次遗留未结疑问：${checkpoint.unresolved_question}\n`;
  }
  section += `- 最近学习时间：${checkpoint.updated_at || '近期'}\n`;

  if (isGreetingOrStart) {
    section += `\n【🚨 核心指令：断点续接唤醒】：\n`;
    section += `检测到学生正在重新进入课堂或打招呼！严禁机械问“你想学什么”，绝对严禁从章节第一章重新讲！\n`;
    section += `你必须像真人私教一样一语道破断点，亲切且自信地带领学生从【${topic}】的断点处直接继续推进！\n`;
  } else {
    section += `教学指导：学生当前是断断续续学习，请时刻以【${topic}】为上下文基准，自然承接上次逻辑，切勿重头啰嗦基础定义！\n`;
  }

  return section;
}

module.exports = {
  saveStudyCheckpoint,
  getStudyCheckpoint,
  formatResumeGreeting,
  formatCheckpointPromptSection
};
