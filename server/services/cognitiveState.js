/**
 * cognitiveState.js
 * 
 * L1-L3 Three-Layer Cognitive Evolution Memory Engine
 * Inspired by HKUDS/DeepTutor auditable persistent memory architecture.
 * 
 * - L1: Interaction traces (raw dialog turns in chat_history)
 * - L2: Cognitive Events & session takeaways (cognitive_events)
 * - L3: Persistent Learner Mastery DAG & Memory Graph (cognitive_knowledge_state)
 */

const { KNOWLEDGE_GRAPH, getPrerequisites } = require('./knowledgeGraph');
const logger = require('./logger');

/**
 * Normalizes status badge based on mastery score
 * @param {number} score 0.0 - 1.0
 * @returns {'mastered'|'unstable'|'gapped'}
 */
function getMasteryStatus(score) {
  if (score >= 0.8) return 'mastered';
  if (score >= 0.4) return 'unstable';
  return 'gapped';
}

/**
 * Initializes default cognitive state for a profile from KNOWLEDGE_GRAPH if missing.
 */
async function ensureCognitiveProfile(db, profileId = 'default', subject = '') {
  if (!db) return;
  try {
    const nodes = Object.values(KNOWLEDGE_GRAPH).filter(n => !subject || n.subject === subject);
    for (const node of nodes) {
      await db.run(`
        INSERT OR IGNORE INTO cognitive_knowledge_state (
          profile_id, concept_id, subject, mastery_score, confidence, success_count, failure_count
        ) VALUES (?, ?, ?, 0.5, 0.5, 0, 0)
      `, [profileId, node.id, node.subject]);
    }
  } catch (err) {
    logger.warn('[CognitiveState] Failed to ensure profile knowledge state:', err.message);
  }
}

/**
 * L2: Records an auditable cognitive event and updates L3 mastery state.
 */
async function recordCognitiveEvent(db, {
  profileId = 'default',
  conceptId,
  sessionId = '',
  eventType = 'attempt', // 'attempt', 'socratic_hint', 'mastery_pass', 'fall_back'
  scaffoldStage = 'DISCOVERY', // 'DISCOVERY', 'SCAFFOLDING', 'CONSOLIDATION'
  isSuccess = false,
  errorType = '', // 'concept_gap', 'calculation_slip', 'condition_missed'
  notes = ''
}) {
  if (!db || !conceptId) return null;

  try {
    // 1. Record L2 event
    const res = await db.run(`
      INSERT INTO cognitive_events (
        profile_id, concept_id, session_id, event_type, scaffold_stage, is_success, error_type, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      profileId,
      conceptId,
      sessionId,
      eventType,
      scaffoldStage,
      isSuccess ? 1 : 0,
      errorType,
      notes
    ]);

    // 2. Update L3 persistent mastery
    const targetNode = KNOWLEDGE_GRAPH[conceptId];
    const subject = targetNode ? targetNode.subject : '通用';

    const current = await db.get(`
      SELECT mastery_score, confidence, success_count, failure_count
      FROM cognitive_knowledge_state
      WHERE profile_id = ? AND concept_id = ?
    `, [profileId, conceptId]);

    let mastery = current ? current.mastery_score : 0.5;
    let confidence = current ? current.confidence : 0.5;
    let successes = current ? current.success_count : 0;
    let failures = current ? current.failure_count : 0;

    if (isSuccess) {
      mastery = Math.min(1.0, Math.round((mastery + 0.15) * 100) / 100);
      successes += 1;
    } else {
      mastery = Math.max(0.1, Math.round((mastery - 0.20) * 100) / 100);
      failures += 1;
    }
    confidence = Math.min(0.99, confidence + 0.05);

    await db.run(`
      INSERT INTO cognitive_knowledge_state (
        profile_id, concept_id, subject, mastery_score, confidence, success_count, failure_count, last_assessed_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT(profile_id, concept_id) DO UPDATE SET
        mastery_score = excluded.mastery_score,
        confidence = excluded.confidence,
        success_count = excluded.success_count,
        failure_count = excluded.failure_count,
        last_assessed_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
    `, [profileId, conceptId, subject, mastery, confidence, successes, failures]);

    return {
      eventId: res.lastID,
      profileId,
      conceptId,
      newMastery: mastery,
      status: getMasteryStatus(mastery)
    };
  } catch (err) {
    logger.error('[CognitiveState] Error recording cognitive event:', err.message);
    return null;
  }
}

/**
 * L3: Fetches student's overall cognitive mastery state mapped to the knowledge graph.
 */
async function getCognitiveState(db, profileId = 'default', subject = '') {
  if (!db) return [];
  try {
    let query = `
      SELECT concept_id, subject, mastery_score, confidence, success_count, failure_count, last_assessed_at
      FROM cognitive_knowledge_state
      WHERE profile_id = ?
    `;
    const params = [profileId];
    if (subject) {
      query += ` AND subject = ?`;
      params.push(subject);
    }

    const rows = await db.all(query, params);
    const rowMap = new Map();
    rows.forEach(r => rowMap.set(r.concept_id, r));

    // Project over KNOWLEDGE_GRAPH nodes
    const graphNodes = Object.values(KNOWLEDGE_GRAPH).filter(n => !subject || n.subject === subject);
    return graphNodes.map(node => {
      const dbRow = rowMap.get(node.id);
      const score = dbRow ? dbRow.mastery_score : 0.5;
      return {
        id: node.id,
        name: node.name,
        subject: node.subject,
        grade: node.grade,
        prerequisites: node.prerequisites || [],
        visualAnchor: node.visualAnchor || null,
        masteryScore: score,
        status: getMasteryStatus(score),
        confidence: dbRow ? dbRow.confidence : 0.5,
        successCount: dbRow ? dbRow.success_count : 0,
        failureCount: dbRow ? dbRow.failure_count : 0,
        lastAssessedAt: dbRow ? dbRow.last_assessed_at : null
      };
    });
  } catch (err) {
    logger.error('[CognitiveState] Failed to query cognitive state:', err.message);
    return [];
  }
}

/**
 * Summarizes student's cognitive health (mastered, unstable, gapped)
 */
async function getCognitiveSummary(db, profileId = 'default', subject = '') {
  const states = await getCognitiveState(db, profileId, subject);
  if (!states.length) {
    return {
      totalConcepts: 0,
      masteredCount: 0,
      unstableCount: 0,
      gappedCount: 0,
      weakPoints: []
    };
  }

  const mastered = states.filter(s => s.status === 'mastered');
  const unstable = states.filter(s => s.status === 'unstable');
  const gapped = states.filter(s => s.status === 'gapped');

  // Sort weaknesses by lowest score
  const weakPoints = [...gapped, ...unstable]
    .sort((a, b) => a.masteryScore - b.masteryScore)
    .slice(0, 5)
    .map(w => ({
      id: w.id,
      name: w.name,
      grade: w.grade,
      score: w.masteryScore,
      status: w.status
    }));

  return {
    totalConcepts: states.length,
    masteredCount: mastered.length,
    unstableCount: unstable.length,
    gappedCount: gapped.length,
    weakPoints
  };
}

/**
 * Injects historical cognitive evolution memory into AI Tutor system prompt.
 */
async function formatCognitivePromptSection(db, profileId = 'default', subject = '', matchedConceptId = '') {
  if (!db) return '';
  try {
    const summary = await getCognitiveSummary(db, profileId, subject);
    if (!summary || summary.totalConcepts === 0) return '';

    let section = '\n【🧠 学生 L3 认知演进长期记忆图谱 (Auditable Memory)】\n';
    section += `- 全科知识点掌握概况：已精通 ${summary.masteredCount} 项，不稳定待巩固 ${summary.unstableCount} 项，存在薄弱断层 ${summary.gappedCount} 项。\n`;

    if (matchedConceptId && KNOWLEDGE_GRAPH[matchedConceptId]) {
      const targetNode = KNOWLEDGE_GRAPH[matchedConceptId];
      const prereqs = getPrerequisites(matchedConceptId, 2);
      
      const states = await getCognitiveState(db, profileId, subject);
      const stateMap = new Map(states.map(s => [s.id, s]));

      const targetState = stateMap.get(matchedConceptId);
      if (targetState) {
        section += `- 当前考点【${targetNode.name}】历史掌握度：${Math.round(targetState.masteryScore * 100)}% (${targetState.status === 'mastered' ? '已掌握' : targetState.status === 'unstable' ? '欠稳定' : '薄弱断层'})\n`;
      }

      const weakPrereqs = prereqs
        .map(p => stateMap.get(p.id))
        .filter(Boolean)
        .filter(p => p.status !== 'mastered');

      if (weakPrereqs.length > 0) {
        section += `- ⚠️ 关联前置薄弱警示：当前考点的前置依赖知识点中，【${weakPrereqs.map(w => w.name + `(${Math.round(w.masteryScore * 100)}%)`).join('、')}】历史表现偏弱！请在苏格拉底教学中优先检验上述前置概念！\n`;
      }
    } else if (summary.weakPoints.length > 0) {
      section += `- 近期需重点修补的认知盲区：${summary.weakPoints.map(w => `【${w.name}】(${w.status})`).join('、')}\n`;
    }

    return section;
  } catch (err) {
    logger.warn('[CognitiveState] Failed to format cognitive prompt section:', err.message);
    return '';
  }
}

module.exports = {
  getMasteryStatus,
  ensureCognitiveProfile,
  recordCognitiveEvent,
  getCognitiveState,
  getCognitiveSummary,
  formatCognitivePromptSection
};
