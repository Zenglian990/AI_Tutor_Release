/**
 * triEngineCoordinator.js
 * 
 * Tri-Engine Pedagogical Coordinator (三位一体认知协同中枢)
 * Unifies:
 *  1. Cognitive Evolution Memory Engine (L1-L3 Memory Graph)
 *  2. Socratic Scaffolding State Machine (Gatekeeper)
 *  3. Knowledge Prerequisite Graph & Multimodal Anchors (Grounding)
 */

const {
  KNOWLEDGE_GRAPH,
  diagnosePrerequisiteKnowledge,
  formatGraphRAGPromptSection,
  linkQueryToMultimodalConcepts
} = require('./knowledgeGraph');

const {
  SOCRATIC_STAGES,
  determineSocraticStage,
  formatSocraticSystemPrompt
} = require('./socraticScaffolding');

const {
  recordCognitiveEvent,
  getCognitiveState,
  getCognitiveSummary,
  formatCognitivePromptSection
} = require('./cognitiveState');

const {
  generatePeerStudentPersonaPrompt,
  evaluateFeynmanExplanation
} = require('./feynmanRoleplayService');

const logger = require('./logger');

/**
 * Executes full Tri-Engine analysis on student question and returns enriched pedagogical context.
 * 
 * @param {Object} params
 * @param {Object} params.db - SQLite database instance
 * @param {string} params.query - Current student question or response
 * @param {string} params.profileId - Student profile ID
 * @param {string} params.subject - Subject (e.g. '数学', '物理')
 * @param {number} params.turnCount - Conversation turns for current question
 * @param {string} params.teachingMode - 'standard' | 'socratic' | 'feynman_roleplay'
 * @param {string} params.studentName - Student's name
 * @returns {Promise<Object>} Tri-engine coordination payload
 */
async function coordinateTriEngine({
  db,
  query = '',
  profileId = 'default',
  subject = '数学',
  turnCount = 1,
  teachingMode = 'standard',
  studentName = '曾练同学'
}) {
  try {
    // 1. [Item 3: Multimodal Knowledge DAG Grounding]
    const diagnosis = diagnosePrerequisiteKnowledge(query, subject);
    const matchedNode = diagnosis ? diagnosis.currentTopic : null;
    const matchedConceptId = matchedNode ? matchedNode.id : '';
    const multimodalMatches = linkQueryToMultimodalConcepts(query, subject);

    // 2. [Item 2: Socratic Scaffolding State Machine / Feynman Roleplay]
    let socraticStage = determineSocraticStage({ turnCount, userMessage: query });
    let socraticPrompt = '';
    let feynmanEvaluation = null;

    if (teachingMode === 'feynman_roleplay') {
      const conceptName = matchedNode ? matchedNode.name : (subject + '核心考点');
      socraticPrompt = generatePeerStudentPersonaPrompt(conceptName, studentName, subject);
      if (turnCount > 1 || query.length > 10) {
        feynmanEvaluation = evaluateFeynmanExplanation(query, matchedConceptId);
      }
    } else {
      socraticPrompt = formatSocraticSystemPrompt(socraticStage, diagnosis, { subject });
    }

    // 3. [Item 1: L1-L3 Cognitive Evolution Memory]
    let cognitivePrompt = '';
    let cognitiveSummary = null;
    if (db) {
      cognitivePrompt = await formatCognitivePromptSection(db, profileId, subject, matchedConceptId);
      cognitiveSummary = await getCognitiveSummary(db, profileId, subject);
    }

    const graphRAGPrompt = diagnosis ? formatGraphRAGPromptSection(diagnosis) : '';

    // Synthesize full integrated system prompt injection
    const compositeSystemPrompt = [
      socraticPrompt,
      graphRAGPrompt,
      cognitivePrompt
    ].filter(Boolean).join('\n');

    return {
      success: true,
      matchedConcept: matchedNode,
      matchedConceptId,
      diagnosis,
      multimodalMatches,
      socraticStage,
      teachingMode,
      feynmanEvaluation,
      cognitiveSummary,
      prompts: {
        socraticPrompt,
        graphRAGPrompt,
        cognitivePrompt,
        compositeSystemPrompt
      },
      // Callback to record learning outcome after turn completion
      recordOutcome: async ({ isSuccess = false, errorType = '', notes = '' } = {}) => {
        if (!db || !matchedConceptId) return null;
        return await recordCognitiveEvent(db, {
          profileId,
          conceptId: matchedConceptId,
          scaffoldStage: socraticStage,
          isSuccess,
          errorType,
          notes
        });
      }
    };
  } catch (err) {
    logger.error('[TriEngineCoordinator] Coordination error:', err.message);
    return {
      success: false,
      error: err.message,
      prompts: { compositeSystemPrompt: '' }
    };
  }
}

module.exports = {
  coordinateTriEngine,
  SOCRATIC_STAGES
};
