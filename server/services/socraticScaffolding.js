/**
 * socraticScaffolding.js
 * 
 * Socratic Scaffolding State Machine & Direct-Answer Gate
 * Inspired by HKUDS/DeepTutor agentic formative pacing and pedagogical scaffolding.
 * 
 * Prevents the AI from dumping instant solutions; orchestrates a 3-stage progressive
 * discovery dialogue (Discovery -> Scaffolding -> Consolidation).
 */

const SOCRATIC_STAGES = {
  DISCOVERY: 'DISCOVERY',         // 阶段一 · 审题探针 (已知量与目标锚定)
  SCAFFOLDING: 'SCAFFOLDING',     // 阶段二 · 阶梯破局 (前置定理与辅助线脚手架)
  CONSOLIDATION: 'CONSOLIDATION'  // 阶段三 · 采分点通关与同构变式检验
};

/**
 * Determines current Socratic stage based on dialogue context and student input.
 * 
 * @param {Object} params
 * @param {number} params.turnCount - Dialog turns for this problem (1, 2, 3...)
 * @param {string} params.userMessage - Current student message
 * @param {boolean} params.isDirectAnswerRequest - Whether student demands direct answer
 * @returns {string} One of SOCRATIC_STAGES
 */
function determineSocraticStage({ turnCount = 1, userMessage = '', isDirectAnswerRequest = false }) {
  const msg = (userMessage || '').toLowerCase();

  // If student asks for check/verification of their answer
  const hasAnswerAttempt = /我算出来|答案是|是不是等于|x\s*=|得数是|对不对|检验一下/i.test(msg);
  if (hasAnswerAttempt) {
    return SOCRATIC_STAGES.CONSOLIDATION;
  }

  // Turn count based progression
  if (turnCount <= 1) {
    return SOCRATIC_STAGES.DISCOVERY;
  }

  if (turnCount === 2) {
    return SOCRATIC_STAGES.SCAFFOLDING;
  }

  // Turn 3+ moves to consolidation unless student is still probing initial terms
  return SOCRATIC_STAGES.CONSOLIDATION;
}

/**
 * Formats strict Socratic instructions injected into the LLM system prompt.
 * 
 * @param {string} stage - SOCRATIC_STAGES
 * @param {Object} diagnosis - From knowledgeGraph.diagnosePrerequisiteKnowledge
 * @param {Object} options - Custom options (e.g. grade level, subject)
 * @returns {string} Formatted prompt instruction block
 */
function formatSocraticSystemPrompt(stage, diagnosis = null, options = {}) {
  let prompt = '\n【⚖️ 苏格拉底阶梯阻断器 (Socratic Scaffolding Gate) 强制指令】\n';
  prompt += '【核心准则】：你是一位激发思考的顶尖启蒙名师，绝非冰冷的答题搜题机器！严禁在单次回复中一股脑倾倒整道题目的最终计算结果与全量代数推导！\n';

  const rootCauseNode = diagnosis && diagnosis.rootCauseNode ? diagnosis.rootCauseNode : null;
  const currentTopic = diagnosis && diagnosis.currentTopic ? diagnosis.currentTopic : null;

  switch (stage) {
    case SOCRATIC_STAGES.DISCOVERY:
      prompt += `【当前阶段】：阶段一 · 审题破雾与已知量探针 (Level 1 / 3)\n`;
      prompt += `- 教学动作：\n`;
      prompt += `  1. 用亲切鼓励的语气肯定题目价值，先帮学生锚定题目核心目标；\n`;
      prompt += `  2. 向学生提出 1~2 个启发性微小反问（例如：“题干中给出了哪几个关键已知量？隐含了什么关键约束？”）；\n`;
      prompt += `  3. 严禁直接给出任何列式或最终答案！把第一步思考权留给学生！\n`;
      break;

    case SOCRATIC_STAGES.SCAFFOLDING:
      prompt += `【当前阶段】：阶段二 · 前置卡点脚手架与破局灵感 (Level 2 / 3)\n`;
      prompt += `- 教学动作：\n`;
      if (rootCauseNode) {
        prompt += `  1. 结合知识图谱，点破底层前置概念：【${rootCauseNode.name}】；\n`;
        prompt += `  2. 提供前置定理/辅助线关键灵感：“回忆一下${rootCauseNode.name}的核心：${rootCauseNode.coreRule.slice(0, 40)}...”；\n`;
        if (rootCauseNode.visualAnchor) {
          prompt += `  3. 结合视觉表征引导草稿：“试着在草稿纸上画出：${rootCauseNode.visualAnchor}”；\n`;
        }
      } else {
        prompt += `  1. 提示破局的关键步骤（如代数变形法则、几何第一条辅助线作法），引导学生完成第一阶段转化；\n`;
      }
      prompt += `  2. 仍保留最终计算与解题终局，引导学生：“你试着用这个思路推演下一步，结果会变成什么？”\n`;
      break;

    case SOCRATIC_STAGES.CONSOLIDATION:
    default:
      prompt += `【当前阶段】：阶段三 · 规范采分点通关与同构变式闭环 (Level 3 / 3)\n`;
      prompt += `- 教学动作：\n`;
      prompt += `  1. 赞赏学生的推导成果，给出中高考标准“采分点步骤（分步给分量规）”；\n`;
      prompt += `  2. 明确指出本题最容易失分的“致命陷阱”与检查口诀；\n`;
      if (currentTopic) {
        prompt += `  3. 闭环挑战：为学生出 1 道同考点的【${currentTopic.name}同构变式题】，检验是否真正触类旁通！\n`;
      }
      break;
  }

  return prompt;
}

module.exports = {
  SOCRATIC_STAGES,
  determineSocraticStage,
  formatSocraticSystemPrompt
};
