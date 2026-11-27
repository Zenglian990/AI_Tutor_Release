const express = require('express');
const router = express.Router();
const { fetchWithKeyRotation, buildChatURL } = require('../services/embedding');
const { extractClientAiHeaders } = require('../utils/aiHeaders');

function getClientAiHeaders(req) {
  return {
    'Content-Type': 'application/json',
    ...extractClientAiHeaders(req)
  };
}
const { getSqliteDb } = require('../db/init');
const logger = require('../services/logger');
const { NODE_ENV } = require('../config');
const fs = require('fs');
const path = require('path');
const { getChapters } = require('../utils/dataLoader');
const { GRADE_ALIASES } = require('../prompts/guidelines');
const { decryptField } = require('../utils/crypto');
const { diagnosePrerequisiteKnowledge, formatGraphRAGPromptSection } = require('../services/knowledgeGraph');
const { lookupCanonicalQuestion } = require('../services/canonicalQuestions');
const { extractAndParseJson, extractLlmText } = require('../utils/jsonParser');
const { sendToNetworkPrinter, formatExamForPrinter } = require('../services/printerService');
const { isVerifiedAdminRequest } = require('../utils/adminAuth');
const { resolveAuthorizedProfileId } = require('../middleware/auth');
const { parseGradeNumber } = require('../utils/gradeParser');



/**
 * 拼装出题的 System Prompt (三段式 150分制)
 */
function getGeneratePrompt(grade, subject, type, chapterName, chapterDesc, syllabusStr, knowledgePoints, region, examYear) {
  const gradeNames = {
    '1_up': '一年级上册', '1_down': '一年级下册',
    '2_up': '二年级上册', '2_down': '二年级下册',
    '3_up': '三年级上册', '3_down': '三年级下册',
    '4_up': '四年级上册', '4_down': '四年级下册',
    '5_up': '五年级上册', '5_down': '五年级下册',
    '6_up': '六年级上册', '6_down': '六年级下册',
    '7_up': '七年级上册', '7_down': '七年级下册',
    '8_up': '八年级上册', '8_down': '八年级下册',
    '9_up': '九年级上册', '9_down': '九年级下册',
    '10_up': '高一上册', '10_down': '高一下册',
    '11_up': '高二上册', '11_down': '高二下册',
    '12_up': '高三上册', '12_down': '高三下册',
  };
  const friendlyGrade = gradeNames[grade] || grade;
  const rawGrade = grade ? String(grade).split('_')[0] : '';
  const isLowerGrade = ['1', '2', '3'].includes(rawGrade); // 1-3年级为低年级
  const isHighSchool = ['10', '11', '12'].includes(rawGrade); // 10-12年级为高中阶段

  let scopeStr = '';
  if (type === 'custom' && knowledgePoints) {
    // Sanitize knowledge points to prevent prompt injection
    const sanitizedPoints = String(knowledgePoints)
      .slice(0, 100) // limit length
      .replace(/[^\w\u4e00-\u9fa5\s,，.。;；、-]/gi, '') // only allow alphanumeric, CJK, and basic punctuation
      .replace(/(ignore|prompt|system|instruction|bypass|forget)/gi, ''); // remove injection keywords

    scopeStr = `当前测试范围为用户主动要求的知识点：【${sanitizedPoints}】。请紧扣这些自定义知识点出题，确保全面覆盖用户的学习需求。`;
  } else if (type === 'gaokao_hit') {
    const reg = region || '新高考全国卷 (I卷/II卷/新课标)';
    const yr = examYear || '近十年高考真题与最新命题趋势';
    scopeStr = `当前测试范围为【🎯 高考高频押题与必考母题密卷（${reg}·${yr}）】。
【高考命题核心指导思想】
1. 聚焦历年全国高考卷高频命题模型与常考经典母题：
   - 数学：导数极值点偏移/双变量/构造函数不等式、圆锥曲线定点定值/斜率和积、立体几何空间向量建系、阿波罗尼斯圆、数列放缩与错位相减等。
   - 物理：双导轨电磁感应微元法/安培力做功、带电粒子在复合场/交变场偏转、天体运动变轨追及、动量与能量综合碰撞模型等。
   - 化学：工业工艺流程题（沉淀转化/离子除杂）、化学反应速率与Kp/Kc平衡图象分析、电化学双极反应式书写与膜反应、有机合成路线设计（官能团保护/碳链增长）。
   - 生物：遗传致死比例分析与系谱图推导、光合呼吸呼吸熵动态分析、PCR与基因工程载体构建、生态系统能量流动与平衡模型。
   - 语文：论述类文本论证逻辑剖析、文言文断句与官职实词、古诗词情景交融与手法辨析、高考任务驱动型大作文（思辨性与家国情怀）。
   - 英语：七选五篇章逻辑衔接、完形填空语境语义辨析、语法填空词性派生与非谓语、读后续写/应用文高分句型表达。
   - 历史/政治/地理：新情境材料解析、历史唯物主义与时空观念、哲学唯物辩证与时代热点分析、等高线/锋面气旋地理图表判读。
2. 试题严格对标全国高考卷的信度、效度、区分度与真实命题风格，坚决剔除陈旧偏怪题，突出考查思维进阶与模型提炼。`;
  } else if (type === 'real_exam') {
    const reg = region || (isHighSchool ? '新高考名校示范大卷' : '全国百强重点名校');
    const yr = examYear || '2025-2026';
    scopeStr = `当前测试范围为【${reg}·${yr}学年${isHighSchool ? '高考' : '中考'}/期末全真模拟示范大卷】。请严格对标${isHighSchool ? '新高考' : '中考'}与各省名校统考试卷的命题结构与难度阶梯，既包含基础巩固考点，又包含综合创新与压轴思维题。`;
  } else if (type === 'unit' && chapterName) {
    scopeStr = `当前测试范围为特定单元章节：《${chapterName}》（章节描述：${chapterDesc}）。
【重中之重】虽然这是单元测试，但你必须**严格保持下方规定的大考题量和总分（绝不允许删减题数！）**。如果本单元缺少某种题型的素材（例如本单元没有古诗文或文言文），请你引入相关的课外拓展素材，或者将其他考点的题量翻倍填补，务必凑齐规定的总题目数和总分值，保证试卷的体量足够庞大和严肃！`;
  } else if (type === 'midterm') {
    scopeStr = '当前测试范围为期中（半期）综合测试。请综合考查该学期前半段的核心考点。';
  } else {
    scopeStr = '当前测试范围为期末综合测试。请进行全册综合大考查，题目要有层次和综合性。';
  }

  let syllabusGuideline = '';
  if (syllabusStr) {
    let targetSyllabus = syllabusStr;
    if (type === 'midterm') {
      const lines = syllabusStr.split('\n');
      const halfLength = Math.ceil(lines.length / 2);
      targetSyllabus = lines.slice(0, halfLength).join('\n');
    }
    
    syllabusGuideline = `
【极重要：官方教学大纲与知识范围限制（严禁超纲出题）】
以下是该学期对应的课程单元目录：
${targetSyllabus}

【出题约束】
1. 所有题目考查的知识点，必须严格限制在上述列出的单元目录范围内，绝不能超出该范围。
2. 严禁出任何大纲之外的超前/超纲概念！例如，如果当前是三年级（3_up 或 3_down），绝对不能在题目中出现四年级或以上才学的内容（如“三角形内角和等于180度”、“平移与平行线交线角”、“二元一次方程组”等高年级考点）。
3. 题目设计需分布合理，重点突出。
`;
  }

  let cognitiveGuidelines = '';
  if (isLowerGrade) {
    cognitiveGuidelines = `学生处于低年级（${friendlyGrade}）阶段。
出题要求：
1. 语言表达要生动具体，多使用贴近学生生活或学习的具体场景（例如：“小明带了10元钱去文具店买铅笔...”、“池塘里有5只青蛙...”）。
2. 客观选择题选项干扰项描述不要过于晦涩或复杂，选项要直观。
3. 解答题主要考查基础的综合应用，要求步骤简单明了，配有亲切的指引语。`;
  } else if (isHighSchool) {
    cognitiveGuidelines = `学生处于高中/高考冲刺（${friendlyGrade}）阶段，试卷必须严格遵循教育部考试中心命题规范与新高考评价体系（一核四层四翼）。
出题要求：
1. 试题紧密围绕学科核心素养，注重创设真实情境（学术探索情境、生产生活情境），设问有层层递进的梯度。
2. 考查高频经典模型与变式推导，绝不出偏怪假题，严谨规范。
3. 客观题具有良好的区分度，多选题必须明确标注漏选得分规则；解答题设问清晰，步骤分明。`;
  } else {
    cognitiveGuidelines = `学生处于中高年级（${friendlyGrade}）阶段，题目必须科学、严密、严谨，符合正式考试的表达风格。
出题要求：
1. 概念表述必须绝对准确，题意清晰无歧义，符合人教版教学大纲要求。
2. 试卷设计必须严谨、细致。`;
  }

  let examStructure = '';
  if (isHighSchool) {
    if (subject === '数学') {
      examStructure = `【极其重要】整套试卷满分 150 分，时间 120 分钟。必须包含 19 道题，严格按照新高考数学真实结构：
一、单项选择题（共 8 道题，第 1-8 题，每小题 5 分，共 40 分，考查集合复数、平面向量、函数性质、圆锥曲线基础等）
二、多项选择题（共 3 道题，第 9-11 题，每小题 6 分，共 18 分。在每题给出的四个选项中，有多项符合题目要求，全部选对得 6 分，部分选对得部分分，有选错的得 0 分）
三、填空题（共 3 道题，第 12-14 题，每小题 5 分，共 15 分）
四、解答题（共 5 道题，第 15-19 题，共 77 分。包含：第15题解三角形/数列 13分；第16题立体几何空间向量建系 15分；第17题概率与统计分布列 15分；第18题解析几何圆锥曲线综合 17分；第19题导数极值点与不等式综合压轴 17分）。`;
    } else if (subject === '物理') {
      examStructure = `【极其重要】整套试卷满分 100 分，时间 75 分钟。必须包含 15 道题，严格按照新高考物理结构：
一、单项选择题（共 7 道题，第 1-7 题，每小题 4 分，共 28 分）
二、多项选择题（共 3 道题，第 8-10 题，每小题 5 分，共 15 分。每小题有多个选项符合要求，全部选对得 5 分，选对但不全的得 3 分，有选错的得 0 分）
三、非选择题（共 5 道大题，第 11-15 题，共 57 分。第 11 题力学实验 6 分；第 12 题电学实验 10 分；第 13 题力学/热学计算 10 分；第 14 题带电粒子在复合场运动 14 分；第 15 题电磁感应双导轨微元综合压轴 17 分）。`;
    } else if (subject === '化学') {
      examStructure = `【极其重要】整套试卷满分 100 分，时间 75 分钟。必须包含 18 道题，严格按照新高考化学结构：
一、单项选择题（共 14 道题，第 1-14 题，每小题 3 分，共 42 分）
二、非选择题大题（共 4 道大题，第 15-18 题，共 58 分。第 15 题工业化工流程与分离提纯 14 分；第 16 题化学反应原理与平衡常数Kp综合 15 分；第 17 题综合实验探究与滴定定量分析 14 分；第 18 题有机化学推断与路线合成设计 15 分）。`;
    } else if (subject === '生物') {
      examStructure = `【极其重要】整套试卷满分 100 分，时间 75 分钟。必须包含 20 道题，严格按照新高考生物结构：
一、单项选择题（共 15 道题，第 1-15 题，每小题 2 分，共 30 分）
二、非选择题大题（共 5 道大题，第 16-20 题，共 70 分。第 16 题光合作用与细胞代谢 12 分；第 17 题动物生命活动调节与内环境稳态 14 分；第 18 题经典遗传规律系谱与致死率分析 16 分；第 19 题群落演替与生态系统碳循环 12 分；第 20 题基因工程与PCR载体构建 16 分）。`;
    } else if (subject === '语文') {
      examStructure = `【极其重要】整套试卷满分 150 分，时间 120 分钟。必须包含 22 道题，严格按照新高考语文结构：
一、现代文阅读I（信息类/论述类文本，第 1-5 题，共 19 分）
二、现代文阅读II（文学类文本，第 6-9 题，共 16 分）
三、古代诗文阅读（文言文阅读第 10-14 题 20 分；古代诗歌阅读第 15-16 题 9 分；名篇名句默写第 17 题 6 分，共 35 分）
四、语言文字运用（成语修辞与病句修改，第 18-21 题，共 20 分）
五、写作（第 22 题高考材料思辨大作文，60 分）。`;
    } else if (subject === '英语') {
      examStructure = `【极其重要】整套试卷满分 150 分，时间 120 分钟。必须包含 35 道题，严格按照新高考英语结构：
一、阅读理解（共 15 题，第 1-15 题，包含 3 篇长文阅读与 1 篇七选五阅读，共 50 分）
二、完形填空（共 15 题，第 16-30 题，每题 1 分，共 15 分）
三、语法填空（共 10 空，第 31-33 题内设填空，共 15 分）
四、应用文写作与读后续写（共 2 题，第 34 题应用文 15 分，第 35 题读后续写 25 分，共 40 分）。`;
    } else if (['历史', '思想政治', '政治', '地理'].includes(subject)) {
      examStructure = `【极其重要】整套试卷满分 100 分，时间 75 分钟。必须严格按照新高考结构出题：
一、单项选择题（共 16 小题，第 1-16 题，每小题 3 分，共 48 分）
二、非选择大题（共 3-4 道综合大题，第 17-20 题，共 52 分。必须紧扣学术背景与核心素养情境展开设问）。`;
    } else {
      examStructure = `【极其重要】整套试卷满分 100 分。请提供至少 20 道题，包含选择、填空与解答大题。`;
    }
  } else {
    if (subject === '数学') {
      examStructure = `【极其重要】整套试卷满分 150 分，时间 120 分钟。必须包含 25 道题，严格按照如下真实期中期末考试结构：
一、选择题（共 10 道题，第 1-10 题，每小题 4 分，共 40 分）
  - 考查代数、几何、图形等基础知识，标准答案必须是 A、B、C、D。
二、填空题（共 6 道题，第 11-16 题，每小题 4 分，共 24 分）
  - 标准答案应该是一个确定的数值或数学表达式。
三、解答题（共 9 道题，第 17-25 题，共 86 分）
  - 必须包含基础计算/化简、解方程/不等式、几何推导与证明、综合应用大题，最后一道为压轴大题。要求提供完整的推导与计算步骤，如果是几何证明题，请设置横线让学生填写推理定理或角（如：因为 ______，所以 ∠A = ∠B ）。`;
    } else if (subject === '语文') {
      examStructure = `【极其重要】整套试卷满分 150 分，时间 120 分钟。必须包含约 22 道题，严格按照如下真实期中期末考试结构：
一、积累与运用（共 5 道选择题，第 1-5 题，包含字音字形、成语、病句、标点符号、文学常识等，共 20 分）
二、古诗文默写（共 3 道填空题，第 6-8 题，每题写出上下句，共 10 分）
三、文言文阅读（共 4 题，第 9-12 题，包含实词解释、句子翻译、文意理解，共 20 分，请在第9题题干中提供完整的文言文选段）
四、现代文阅读（两篇长文，共 9 题，第 13-21 题，包含说明文/议论文及记叙文/散文，请在第13题及相关题干中提供完整的长篇阅读文章，并针对文章设计选择和简答题，共 50 分）
五、作文（最后1道解答题，第 22 题，提供命题或半命题材料，要求写一篇600-800字文章，分值 50 分）。`;
    } else if (subject === '英语') {
      examStructure = `【极其重要】整套试卷满分 150 分，时间 120 分钟。必须包含约 35 道题，严格按照如下真实英语考试结构：
一、单项选择（语法和词汇，共 10 题，第 1-10 题，每题 1.5 分，共 15 分）
二、完形填空（提供一篇约200字的短文，挖空 10 处，共 10 题，第 11-20 题，每题 1.5 分，共 15 分。请在第11题的question中给出完整短文）
三、阅读理解（提供 3 篇不同体裁的英文短文，每篇配 3-4 道选择题，共 10 题，第 21-30 题，每题 3 分，共 30 分。请在每篇的首题中给出完整短文内容）
四、词汇运用与句子翻译（填空与解答形式，共 4 题，第 31-34 题，共 40 分）
五、书面表达（最后1题，第 35 题，提供具体的情景要求写一篇80-100词的英语作文，分值 50 分）。`;
    } else if (subject === '物理' || subject === '化学') {
      examStructure = `【极其重要】整套试卷满分 100 分，时间 90 分钟。必须包含约 25 道题，严格按照如下真实期中期末考试结构：
一、单项选择题（共 12 题，每题 3 分，共 36 分）
二、填空题（共 6 题，每空 1 分，约 14 分，结合生活实际场景）
三、实验探究题（共 4 大题，围绕核心实验展开，约 24 分。需要在题目中详细描述实验步骤或现象）
四、计算与综合应用题（共 3 大题，约 26 分。要求写出公式和详细计算步骤）。`;
    } else if (subject === '历史') {
      examStructure = `【极其重要】整套试卷满分 50 分（与道法共用90分钟）。必须严格按照您提供的【真实期末考试结构】出题：
一、单项选择题（本大题共 15 小题，第 1-15 题，每小题 1 分，共 15 分）
二、非选择题（本大题共 3 小题，第 16 题 14 分，第 17 题 14 分，第 18 题 7 分，共 35 分。必须给出丰富详实的阅读材料，重点考查归纳分析能力。）`;
    } else if (subject === '道德与法治' || subject === '政治') {
      examStructure = `【极其重要】整套试卷满分 50 分（与历史共用90分钟）。必须严格按照您提供的【真实期末考试结构】出题：
一、选择题（本大题共 10 小题，第 1-10 题，每小题 2 分，共 20 分）
二、非选择题（本大题共 3 小题，第 11 题 6 分，第 12 题 10 分，第 13 题 14 分，共 30 分。必须包含情境分析或图表材料，结合材料回答。）`;
    } else if (subject === '生物') {
      examStructure = `【极其重要】整套试卷满分 100 分，考试时间 60 分钟。必须严格按照您提供的【真实期末考试结构】出题：
一、单选题（每小题只有一个最佳答案，第 1-20 题，每小题 2 分，共 40 分）
二、非选择题（每空 2 分，共 60 分。包含第 21 题 10 分，第 22 题 12 分，第 23 题 10 分，第 24 题 14 分，第 25 题 14 分。请强烈结合 Mermaid 画出细胞/人体系统/实验等结构示意图，设置填空或简答。）`;
    } else if (subject === '地理') {
      examStructure = `【极其重要】整套试卷满分 100 分，时间 60 分钟。必须包含 25 道题，结构类似生物：
一、单项选择题（20题，每题2分，共40分）
二、综合识图与分析题（5大题，第21-25题，共60分。需结合 Mermaid 绘制等高线、大洲分布图等）`;
    } else {
      examStructure = `【极其重要】整套试卷满分 100 分。请提供至少 25 道题，包含选择题、填空题和解答题（材料分析或计算），涵盖基础与综合应用。`;
    }
  }
  return `你是一位专业且严密的中小学教研员。现在，你需要为一位学习【${subject}】的【${friendlyGrade}】学生出一套高水平的知识测试卷。
${scopeStr}
${syllabusGuideline}

${cognitiveGuidelines}

${examStructure}

【排版与 JSON 致命规定】
1. 你的 JSON 数组长度必须完全等同于我在上文 \`examStructure\` 中为你规定的“总题数”（例如语文必须是精确的 22 个 JSON 对象，数学必须是 25 个，历史必须是 18 个，生物必须是 25 个）。
2. 关于阅读大题/材料大题的拆分与合并：
   - 像**语文、英语**这种，大纲明确规定了“阅读理解占第13-21题”的，说明**每一个小问都有自己独立的题号**（13, 14...），所以**绝对不允许把它们合并**！必须为 13、14、15 各自生成独立的 JSON 对象！第一道小题放阅读材料，后面的小题直接写具体问题。
   - 像**历史、生物、物理**这种，大纲规定“第16题（14分）包含连环小问”的，说明这道大题只有一个总题号（16）。这种情况下，你**必须把所有小问 (1)xxx (2)xxx 合并在这一个 JSON 对象里**。但是在 \`question\` 文本里，**千万千万不要挤成一团**，必须使用 Markdown 的优美换行符（\\n\\n），把材料和下面的各个小问分段排版得清清楚楚！

【Mermaid 几何图形支持】
对于需要图形辅助理解的题目（如：平行线、相交线、三角形、坐标系平移、或者条形/扇形统计图），你必须在 question 文本中内嵌标准的 \`\`\`mermaid 代码块，这样前端能自动渲染出高水准的几何线段图或图表。
- 例如：绘制三角形 ABC，可以使用 \`\`\`mermaid\\ngraph TD; A((A))---B((B)); B((B))---C((C)); C((C))---A((A));\`\`\`
- 绘制相交线、平行线与截线类似，用节点及连线来表达几何拓扑关系。

请严格以以下标准的 JSON 格式返回试卷。不要返回任何其他内容（如 markdown 标记之外的废话）：
{
  "title": "试卷标题（例如：七年级数学下册期末检测题）",
  "questions": [
    {
      "id": 1,
      "type": "choice",
      "question": "题目描述（如需画图可在此处内嵌 \`\`\`mermaid 块）",
      "options": ["A. 选项A内容", "B. 选项B内容", "C. 选项C内容", "D. 选项D内容"],
      "score": 8,
      "answer": "A",
      "explanation": "本题的详细解析"
    },
    ...
    {
      "id": 6,
      "type": "blank",
      "question": "题目描述（如需画图可内嵌 \`\`\`mermaid 块）",
      "score": 8,
      "answer": "标准答案",
      "explanation": "本题的详细解析"
    },
    ...
    {
      "id": 9,
      "type": "essay",
      "question": "第 9 题描述（计算题）",
      "score": 20,
      "answer": "步骤和答案",
      "explanation": "详细步骤解析"
    },
    {
      "id": 10,
      "type": "essay",
      "question": "第 10 题描述（证明填空题，必须包含数个“______”供填空）",
      "score": 26,
      "answer": "填空位置的正确答案",
      "explanation": "完整的证明过程及理由"
    },
    {
      "id": 11,
      "type": "essay",
      "question": "第 11 题描述（实际统计或综合应用题）",
      "score": 40,
      "answer": "解答要点与最终答案",
      "explanation": "详细的公式及运算解析"
    }
  ]
}
`;
}

/**
 * 拼装 AI 单题批改 Prompt
 */
function getGradePrompt(question, studentAnswer, standardAnswer, score, explanation, grade) {
  const rawGrade = grade ? String(grade).split('_')[0] : '';
  const gradeNames = {
    '1_up': '一年级上册', '1_down': '一年级下册',
    '2_up': '二年级上册', '2_down': '二年级下册',
    '3_up': '三年级上册', '3_down': '三年级下册',
    '4_up': '四年级上册', '4_down': '四年级下册',
    '5_up': '五年级上册', '5_down': '五年级下册',
    '6_up': '六年级上册', '6_down': '六年级下册',
    '7_up': '七年级上册', '7_down': '七年级下册',
    '8_up': '八年级上册', '8_down': '八年级下册',
    '9_up': '九年级上册', '9_down': '九年级下册',
    '10_up': '高一上册', '10_down': '高一下册',
    '11_up': '高二上册', '11_down': '高二下册',
    '12_up': '高三上册', '12_down': '高三下册',
  };
  const friendlyGrade = gradeNames[grade] || (rawGrade ? `${rawGrade}年级` : '中小学');
  const isLowerGrade = ['1', '2', '3'].includes(rawGrade); // 1-3年级为低年级
  const isHighSchool = ['10', '11', '12'].includes(rawGrade); // 10-12年级为高中阶段
  
  let gradingPhilosophy = '';
  if (isLowerGrade) {
    gradingPhilosophy = `
【低年级（1-3年级）温和鼓励阅卷原则】
学生处于低年级阶段（当前为：${friendlyGrade}）。
1. 侧重考查学生的数学逻辑和解题思路，而不是死板的书写格式或写法。
2. 若学生最终计算出的结果数值是完全正确的，且解题大体思路清晰，即使在算式书写中出现了个别书写笔误（例如把除号“/”或“÷”误写为乘号“*”、或者中间步骤有不影响最终结果的冗余描述），**严禁扣除大量分数**。最多扣除 1-2 分作为规范性提醒。
3. 阅卷评语必须语气温和、充满鼓励，像大姐姐或大哥哥一样亲切，多使用积极词汇，避免冷冰冰的教训语气。
`;
  } else if (isHighSchool) {
    gradingPhilosophy = `
【高中阶段（10-12年级）高考阅卷标准与步骤采分原则】
学生处于高中/高考阶段（当前为：${friendlyGrade}）。
1. 【严格按高考步骤采分点赋分（按步给分，分步得分）】：
   - 必须细分“核心定理/原始物理公式/反应方程式（不写或写错则后续连带不得分）”、“关键推导过程与代入”、“最终数值与量纲单位”。
   - 若学生过程严密但最终答案算错，必须保留过程的绝大部分采分点分数，只扣最终答案分（通常扣1-2分）。
   - 若学生最终答案正确但跳步严重、缺乏关键物理规律或数学定理原始表达式，严禁给满分，必须扣除未写出的关键步骤分。
2. 【一题多解等价认可】：
   - 充分认可解析几何的“设线法”与“设点法”、立体几何的“传统几何法”与“空间向量法”、导数大题的“直接求导”与“同构法/参数分离法”。只要逻辑严谨且推导正确，一律同等给满分。
3. 【失分陷阱深度剖析】：
   - 重点指出高中生常见失分陷阱：如定义域遗漏、分类讨论不全（如考虑公比 q=1 或斜率不存在）、量纲单位缺失、有效数字位数错误、化学方程式未配平或漏写气体符号/沉淀符号等。
4. 【阅卷评语专业度】：
   - 评语需具备高三重点名校教研组风格，指出“题眼所在”、“逻辑卡点”以及“高考规范书写建议”。
`;
  } else {
    gradingPhilosophy = `
【中高年级（4-9年级）严谨规范阅卷原则】
学生处于中高年级阶段（当前为：${friendlyGrade}）。
1. 阅卷要标准、规范、客观。
2. 除了考查结果正确性，还需严格对照解题步骤。对于推导逻辑有偏差或有明显算式错误的步骤，应酌情扣除对应步骤分。
3. 阅卷评语要客观、清晰地指出扣分点 and 改进建议，语气要求亲切但专业。
`;
  }

  return `你是一位专业的 ${friendlyGrade} 阅卷老师。你需要批改一道满分为 ${score} 分的测试题。

【本题信息】
题目：${question}
标准答案/得分要点：${standardAnswer}
详细解析：${explanation}

【学生答卷】
学生给出的答案：${studentAnswer}

${gradingPhilosophy}

请根据上述阅卷原则，给出该题的最终得分、中考步骤采分点拆解和精炼评语。
请严格以下列 JSON 格式返回，不要包含任何其他文字：
{
  "score": 给出得分（必须是 0 到 ${score} 之间的整数）,
  "comment": "阅卷评语",
  "step_breakdown": {
    "concept": "审题与概念列式得分说明 (如: 审题准确、已知未知分析到位 3/3分)",
    "deduction": "过程推导与公式代入得分说明 (如: 推导逻辑严密、计算无误 4/4分)",
    "conclusion": "结果与量纲单位说明 (如: 结论正确 3/3分)"
  }
}
`;
}

/**
 * 拼装整卷学情报告 Prompt
 */
function getOverallReportPrompt(studentName, score, questionsReport, maxTotalScore = 150) {
  return `你是一位亲切的 AI 私教。学生【${studentName}】刚刚完成了一套测试卷，总分为 ${score} 分（满分 ${maxTotalScore} 分）。
以下是各题的批改情况：
${questionsReport}

请为这位学生写一段 100-150 字的学情诊断与鼓励性评语。
要求：
1. 语气亲切，富有启发性。
2. 结合他做错的题目指出他的薄弱点和需要加强的地方（如果有错题的话）。
3. 给出切实的学习建议。`;
}

/**
 * Robust JSON extraction and auto-healing parser for LLM-generated test papers.
 * Handles clean JSON, markdown code blocks, and gracefully recovers truncated JSON.
 */
function parseOrRepairPaperJson(text) {
  if (!text || typeof text !== 'string') return null;

  // 1. Direct match & parse
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0].trim());
      if (parsed && Array.isArray(parsed.questions) && parsed.questions.length > 0) {
        return parsed;
      }
    } catch (e) {
      // JSON was malformed or truncated near end
    }
  }

  // 2. Extract title if possible
  let title = '知识能力测试卷';
  const titleMatch = text.match(/"title"\s*:\s*"([^"]+)"/);
  if (titleMatch) title = titleMatch[1];

  // 3. Fallback: Robust regex extraction for individual question objects
  const questions = [];
  const qRegex = /\{\s*"id"\s*:\s*(\d+)[\s\S]*?"type"\s*:\s*"([^"]+)"[\s\S]*?"question"\s*:\s*"((?:\\.|[^"\\])*)"[\s\S]*?"answer"\s*:\s*"((?:\\.|[^"\\])*)"[\s\S]*?(?:"explanation"\s*:\s*"((?:\\.|[^"\\])*)"[\s\S]*?)?\}/g;
  let match;
  while ((match = qRegex.exec(text)) !== null) {
    try {
      const qJson = JSON.parse(match[0]);
      if (qJson.id && qJson.question) questions.push(qJson);
    } catch (e) {
      try {
        questions.push({
          id: parseInt(match[1], 10),
          type: match[2],
          question: match[3].replace(/\\"/g, '"').replace(/\\n/g, '\n'),
          answer: match[4].replace(/\\"/g, '"'),
          explanation: match[5] ? match[5].replace(/\\"/g, '"').replace(/\\n/g, '\n') : '详见解题分析。'
        });
      } catch (err) {}
    }
  }

  if (questions.length > 0) {
    return { title, questions };
  }
  return null;
}

/**
 * 从权威真题题库与分学段/分学科母题池装配可靠、无重复、总分严格校准的模拟试卷
 */
async function assembleReliableExamPaper(grade, subject = '数学', type = 'real_exam', region = '全国百强重点名校') {
  const gradeNames = {
    '1_up': '一年级上册', '1_down': '一年级下册',
    '2_up': '二年级上册', '2_down': '二年级下册',
    '3_up': '三年级上册', '3_down': '三年级下册',
    '4_up': '四年级上册', '4_down': '四年级下册',
    '5_up': '五年级上册', '5_down': '五年级下册',
    '6_up': '六年级上册', '6_down': '六年级下册',
    '7_up': '七年级上册', '7_down': '七年级下册',
    '8_up': '八年级上册', '8_down': '八年级下册',
    '9_up': '九年级上册', '9_down': '九年级下册',
    '10_up': '高一上册', '10_down': '高一下册',
    '11_up': '高二上册', '11_down': '高二下册',
    '12_up': '高三上册', '12_down': '高三下册',
  };
  const friendlyGrade = gradeNames[grade] || grade || '七年级上册';
  const rawGrade = grade ? String(grade).split('_')[0] : '';
  const isHighSchool = ['10', '11', '12'].includes(rawGrade);
  const isPrimarySchool = ['1', '2', '3', '4', '5', '6'].includes(rawGrade);
  const targetMaxScore = isPrimarySchool ? 100 : (['语文', '数学', '英语'].includes(subject) ? 150 : 100);
  const totalScoreDesc = `${targetMaxScore}分`;
  const paperTitle = type === 'gaokao_hit'
    ? `${region || '新高考全国卷'}·${friendlyGrade}${subject}高考高频母题与押题密卷 (满分${totalScoreDesc})`
    : `${region || (isHighSchool ? '新高考重点名校示范' : '全国百强重点名校')}·${friendlyGrade}${subject}${isHighSchool ? '全真模拟示范卷' : '全真模拟标准卷'} (满分${totalScoreDesc})`;

  const sanitizeBrokenLatex = (raw) => String(raw || '')
    .replace(/\x08(?=[a-zA-Z])/g, '\\b')
    .replace(/\x0c(?=[a-zA-Z])/g, '\\f')
    .replace(/\x09(?=(?:text|tan|times|theta|triangle|to|tau|top)\b)/g, '\\t')
    .replace(/\r(?=(?:right|rho|rightarrow|rangle|rfloor|rceil)\b)/g, '\\r');

  const questions = [];
  const seenStems = new Set();
  const pushUnique = (q) => {
    const cleanQuestion = sanitizeBrokenLatex(q.question);
    const key = cleanQuestion.replace(/\s+/g, '').slice(0, 40);
    if (!key || seenStems.has(key)) return false;
    seenStems.add(key);
    questions.push({
      ...q,
      question: cleanQuestion,
      options: Array.isArray(q.options) ? q.options.map(sanitizeBrokenLatex) : q.options,
      answer: sanitizeBrokenLatex(q.answer),
      explanation: sanitizeBrokenLatex(q.explanation),
      id: questions.length + 1
    });
    return true;
  };

  // 非数学学科的真实学科兜底题库（按学段分流，绝不把数学题塞进语英理化生史地政）
  const buildNonMathPaper = () => {
    const subjBank = {
      '语文': isHighSchool ? [
        { type: 'choice', score: 10, question: '下列关于《乡土中国》核心概念“差序格局”的表述，正确的一项是（　　）', options: ['A. 西方社会如同捆柴，中国乡土社会如同石子投入水中泛起的同心圆波纹', 'B. 差序格局强调绝对平等的团体边界', 'C. 差序格局与血缘、地缘关系无关', 'D. 现代契约精神完全等同于差序格局'], answer: 'A', explanation: '费孝通指出乡土社会是以“己”为中心、按亲疏远近向外推展的差序格局。' },
        { type: 'choice', score: 10, question: '下列文言句子中，加点虚词“之”的用法与其他三项不同的是（　　）', options: ['A. 师道之不传也久矣', 'B. 句读之不知，惑之不解', 'C. 蚓无爪牙之利，筋骨之强', 'D. 均之二策，宁许以负秦曲'], answer: 'D', explanation: 'D 项“之”为指示代词“这”，其余为助词。' },
        { type: 'choice', score: 10, question: '对杜甫《登高》“无边落木萧萧下，不尽长江滚滚来”的赏析，不正确的一项是（　　）', options: ['A. 对仗工整，音韵铿锵', 'B. 以落叶与江水勾勒出宏阔苍凉的秋景', 'C. 暗含韶光易逝、壮志难酬的深沉感慨', 'D. 表达了诗人隐居山水、悠然自得的闲适之情'], answer: 'D', explanation: '本联抒发的是身世漂泊、老病孤愁的沉郁顿挫，非闲适之情。' },
        { type: 'blank', score: 10, question: '补写出荀子《劝学》中的名句：故不积跬步，______；不积小流，无以成江海。', answer: '无以至千里', explanation: '出自《荀子·劝学》，强调积累的重要性。' },
        { type: 'blank', score: 10, question: '补写出苏轼《赤壁赋》中的名句：寄蜉蝣于天地，______。', answer: '渺沧海之一粟', explanation: '出自苏轼《赤壁赋》，以比喻写人生短暂渺小。' },
        { type: 'essay', score: 40, question: '【现代文思辨简答】结合当今人工智能与人类创造力的关系，谈谈你对“工具理性与人文温度并重”的理解（200字以上）。', answer: '围绕技术效率与人类主体价值、批判性思维与共情能力辩证展开即可。', explanation: '新高考思辨题重在“破立结合”，既肯定技术赋能，又强调人文底线。' },
        { type: 'essay', score: 60, question: '【新高考大作文】阅读材料：“行稳致远，既需仰望星空之志，亦赖脚踏实地之功。”请自拟题目，写一篇不少于 800 字的议论文。', answer: '立意明确、结构严谨、论据充实、思辨深刻。', explanation: '紧扣“理想与实干”的辩证关系展开论证。' }
      ] : [
        { type: 'choice', score: 15, question: '下列词语中，书写完全正确的一项是（　　）', options: ['A. 精益求精  名副其实', 'B. 迫不急待  再接再厉', 'C. 走头无路  川流不息', 'D. 谈笑风声  刻舟求剑'], answer: 'A', explanation: 'B 应为“迫不及待”，C 应为“走投无路”，D 应为“谈笑风生”。' },
        { type: 'choice', score: 15, question: '下列句子没有语病的一项是（　　）', options: ['A. 通过这次活动，使我明白了团结的重要性。', 'B. 我们要养成认真审题、独立思考的好习惯。', 'C. 能否坚持阅读，是提高写作水平的关键。', 'D. 教室里安静得几乎完全听不到一点声音。'], answer: 'B', explanation: 'A 缺主语；C 两面对一面；D 语意重复。' },
        { type: 'blank', score: 15, question: '默写：海内存知己，______。（王勃《送杜少府之任蜀州》）', answer: '天涯若比邻', explanation: '名句默写注意“涯”“邻”字形。' },
        { type: 'essay', score: 25, question: '【阅读赏析】请从修辞手法的角度，赏析句子：“春风像母亲温暖的手，轻轻抚过沉睡的大地。”', answer: '运用比喻和拟人修辞，生动写出春风的柔和温暖与生机勃勃。', explanation: '按“手法 + 效果 + 情感”三步答题。' },
        { type: 'essay', score: isPrimarySchool ? 30 : 80, question: '【写作实践】以《那一次，我真正长大了》为题，写一篇内容具体、情感真挚的记叙文。', answer: '叙事完整，细节生动，凸显成长感悟。', explanation: '注意通过动作、神态、环境描写突出转折瞬间。' }
      ],
      '英语': isHighSchool ? [
        { type: 'choice', score: 15, question: '— Would you mind if I open the window? — ______. It is a bit stuffy in here.', options: ['A. Not at all', 'B. Yes, please', 'C. Never mind', 'D. You are welcome'], answer: 'A', explanation: 'Not at all 表示“完全不介意”，符合语境。' },
        { type: 'choice', score: 15, question: '______ in the research for over a decade, the scientist finally achieved a major breakthrough.', options: ['A. Engaging', 'B. Engaged', 'C. Having engaged', 'D. To engage'], answer: 'B', explanation: 'be engaged in 表示“致力于”，此处作状语用过去分词 Engaged。' },
        { type: 'choice', score: 15, question: 'The museum ______ we visited last weekend houses thousands of ancient bronze artifacts.', options: ['A. where', 'B. which', 'C. what', 'D. whose'], answer: 'B', explanation: '定语从句中 visited 缺宾语，故用关系代词 which/that。' },
        { type: 'choice', score: 15, question: 'Not until the final bell rang ______ that she had forgotten to write her name.', options: ['A. she realized', 'B. did she realize', 'C. realized she', 'D. had she realized'], answer: 'B', explanation: 'Not until 置于句首，主句需部分倒装，故选 did she realize。' },
        { type: 'blank', score: 15, question: '语法填空：With the rapid development of AI, learning how to think ______ (critical) has become essential.', answer: 'critically', explanation: '修饰动词 think 需用副词 critically。' },
        { type: 'blank', score: 15, question: '语法填空：It is high time that we ______ (take) effective measures to protect biodiversity.', answer: 'took', explanation: 'It is high time that 从句用一般过去时（或 should + 动词原形）虚拟语气。' },
        { type: 'essay', score: 30, question: '【应用文写作】假设你是李华，学校将举办“科技与未来”英语演讲比赛，请写一封 80 词左右的邮件邀请外教 Mr. Smith 担任评委。', answer: '格式规范、要点齐全（时间/地点/邀请目的/期待回复）、语法准确。', explanation: '新高考应用文讲究交际得体与高级句式衔接。' },
        { type: 'essay', score: 30, question: '【读后续写微练】续写一段 100 词左右的英文，描写主人公在暴雨夜帮助迷路老人找到家人后的心理变化。', answer: '紧扣前文情节，情感升华自然，动作心理描写丰富。', explanation: '善用非谓语、with 复合结构与情绪描写词。' }
      ] : [
        { type: 'choice', score: 20, question: '— What ______ your sister usually do after school? — She practices the piano.', options: ['A. do', 'B. does', 'C. is', 'D. did'], answer: 'B', explanation: '主语 your sister 为第三人称单数，一般现在时疑问句助动词用 does。' },
        { type: 'choice', score: 20, question: 'There ______ a library and two playgrounds in our new school.', options: ['A. is', 'B. are', 'C. have', 'D. has'], answer: 'A', explanation: 'There be 句型遵循就近原则，a library 为单数，故用 is。' },
        { type: 'blank', score: 20, question: '用所给词的适当形式填空：Look! The students ______ (read) English aloud in the classroom.', answer: 'are reading', explanation: 'Look 提示现在进行时，主语复数用 are reading。' },
        { type: 'essay', score: isPrimarySchool ? 40 : 90, question: '【书面表达】请用英语写一篇短文介绍你最喜欢的学科及原因（My Favorite Subject）。', answer: '要点完整，时态一致，句型正确。', explanation: '注意主谓一致与连词 because / so 的正确使用。' }
      ],
      '物理': [
        { type: 'choice', score: 15, question: isHighSchool ? '一质量为 $m$、电荷量为 $q$ 的带电粒子以速度 $v$ 垂直射入磁感应强度为 $B$ 的匀强磁场中，其做匀速圆周运动的半径 $R$ 为（　　）' : '一个实心铜球质量为 $890\\text{g}$，铜的密度为 $8.9\\text{g/cm}^3$，则其体积为（　　）', options: isHighSchool ? ['A. $\\frac{mv}{qB}$', 'B. $\\frac{qB}{mv}$', 'C. $\\frac{mv^2}{qB}$', 'D. $\\frac{2\\pi m}{qB}$'] : ['A. $10\\text{cm}^3$', 'B. $100\\text{cm}^3$', 'C. $1000\\text{cm}^3$', 'D. $89\\text{cm}^3$'], answer: isHighSchool ? 'A' : 'B', explanation: isHighSchool ? '由 $qvB = m\\frac{v^2}{R}$ 解得 $R = \\frac{mv}{qB}$。' : '由 $V = \\frac{m}{\\rho} = \\frac{890}{8.9} = 100\\text{cm}^3$。' },
        { type: 'choice', score: 15, question: isHighSchool ? '关于牛顿运动定律，下列说法正确的是（　　）' : '在串联电路中，若电源电压不变，滑动变阻器阻值增大，则电路总电流（　　）', options: isHighSchool ? ['A. 物体的速度越大，惯性越大', 'B. 合外力为零时，物体一定处于静止状态', 'C. 作用力与反作用力总是大小相等、方向相反且作用在不同物体上', 'D. 力是维持物体运动的原因'] : ['A. 变大', 'B. 变小', 'C. 不变', 'D. 先变大后变小'], answer: isHighSchool ? 'C' : 'B', explanation: isHighSchool ? '惯性只与质量有关；合外力为零可静止或匀速直线运动；C 为牛顿第三定律。' : '由欧姆定律 $I = U/R$，总电阻增大则电流变小。' },
        { type: 'blank', score: 15, question: isHighSchool ? '质量为 $2\\text{kg}$ 的物体在 $10\\text{N}$ 的恒定合外力作用下由静止开始运动，$3\\text{s}$ 末的速度大小为 ______ $\\text{m/s}$。' : '一个电阻为 $10\\Omega$ 的定值电阻两端电压为 $6\\text{V}$，通过它的电流为 ______ $\\text{A}$。', answer: isHighSchool ? '15' : '0.6', explanation: isHighSchool ? '$a = F/m = 5\\text{m/s}^2$，$v = at = 15\\text{m/s}$。' : '$I = U/R = 6/10 = 0.6\\text{A}$。' },
        { type: 'blank', score: 15, question: isHighSchool ? '一质点做自由落体运动（$g=10\\text{m/s}^2$），第 $2\\text{s}$ 末下落的高度为 ______ $\\text{m}$。' : '标准大气压下，纯水的沸点为 ______ $^{\\circ}\\text{C}$。', answer: isHighSchool ? '20' : '100', explanation: isHighSchool ? '$h = \\frac{1}{2}gt^2 = 0.5 \\times 10 \\times 4 = 20\\text{m}$。' : '标准大气压下水的沸点是 $100^\\circ\\text{C}$。' },
        { type: 'essay', score: 40, question: isHighSchool ? '【动力学综合计算】质量 $m = 2\\text{kg}$ 的滑块在倾角 $\\theta = 30^\\circ$ 的光滑斜面上由静止释放（$g = 10\\text{m/s}^2$）。求：(1) 滑块的加速度大小；(2) 下滑 $2\\text{s}$ 内的位移大小。' : '【电学综合计算】电源电压恒为 $12\\text{V}$，定值电阻 $R_1 = 4\\Omega$ 与 $R_2 = 8\\Omega$ 串联。求：(1) 电路总电流；(2) $R_2$ 两端的电压及电功率。', answer: isHighSchool ? '(1) $a = 5\\text{m/s}^2$；(2) $x = 10\\text{m}$。' : '(1) $I = 1\\text{A}$；(2) $U_2 = 8\\text{V}$，$P_2 = 8\\text{W}$。', explanation: isHighSchool ? '$a = g\\sin 30^\\circ = 5\\text{m/s}^2$，$x = \\frac{1}{2}at^2 = 10\\text{m}$。' : '$R_{总}=12\\Omega$，$I=1\\text{A}$，$U_2=IR_2=8\\text{V}$，$P_2=U_2I=8\\text{W}$。' }
      ],
      '化学': [
        { type: 'choice', score: 15, question: isHighSchool ? '在铜锌双液盐桥原电池（$\\text{Zn}|\\text{ZnSO}_4\\|\\text{CuSO}_4|\\text{Cu}$）工作时，下列说法正确的是（　　）' : '下列变化中，属于化学变化的是（　　）', options: isHighSchool ? ['A. 锌电极作负极，发生氧化反应', 'B. 电子经盐桥从铜片流向锌片', 'C. 铜电极质量逐渐减小', 'D. 盐桥中阳离子向负极室迁移'] : ['A. 冰雪融化', 'B. 铁钉生锈', 'C. 酒精挥发', 'D. 玻璃破碎'], answer: isHighSchool ? 'A' : 'B', explanation: isHighSchool ? '锌失电子作负极发生氧化反应，外电路电子由负极流向正极，盐桥阳离子移向正极室。' : '铁钉生锈生成氧化铁新物质，属于化学变化。' },
        { type: 'choice', score: 15, question: isHighSchool ? '在密闭容器中进行反应 $\\text{N}_2 + 3\\text{H}_2 \\rightleftharpoons 2\\text{NH}_3$（$\\Delta H < 0$），升高温度时化学平衡将（　　）' : '实验室制取二氧化碳常选用的药品是（　　）', options: isHighSchool ? ['A. 向正反应方向移动', 'B. 向逆反应方向移动', 'C. 不发生移动', 'D. 无法判断'] : ['A. 大理石与稀盐酸', 'B. 大理石与稀硫酸', 'C. 碳酸钠与浓硫酸', 'D. 木炭在空气中燃烧'], answer: isHighSchool ? 'B' : 'A', explanation: isHighSchool ? '正反应放热，升高温度平衡向吸热方向（逆反应）移动。' : '实验室用大理石/石灰石与稀盐酸常温反应制取 $\\text{CO}_2$。' },
        { type: 'blank', score: 15, question: isHighSchool ? '标准状况下，$0.5\\text{mol}$ 氧气（$\\text{O}_2$）的体积为 ______ $\\text{L}$。' : '地壳中含量最高的金属元素符号是 ______。', answer: isHighSchool ? '11.2' : 'Al', explanation: isHighSchool ? '$V = n \\cdot V_m = 0.5 \\times 22.4 = 11.2\\text{L}$。' : '地壳中元素含量前四位为 O、Si、Al、Fe，金属元素最高为 Al。' },
        { type: 'blank', score: 15, question: isHighSchool ? '配平离子方程式：$\\text{Cu} + \\text{NO}_3^- + \\text{H}^+ \\rightarrow \\text{Cu}^{2+} + \\text{NO}\\uparrow + \\text{H}_2\\text{O}$ 中，$\\text{Cu}$ 的化学计量数为 ______。' : '写出高锰酸钾受热分解产生氧气的气体化学式：______。', answer: isHighSchool ? '3' : 'O2', explanation: isHighSchool ? '$3\\text{Cu} + 2\\text{NO}_3^- + 8\\text{H}^+ = 3\\text{Cu}^{2+} + 2\\text{NO}\\uparrow + 4\\text{H}_2\\text{O}$。' : '高锰酸钾加热分解生成锰酸钾、二氧化锰和氧气 $\\text{O}_2$。' },
        { type: 'essay', score: 40, question: isHighSchool ? '【电化学与工艺流程】写出铜锌原电池的正负极电极反应式与总离子方程式，并说明盐桥中 $\\text{K}^+$ 和 $\\text{Cl}^-$ 的迁移方向。' : '【化学方程式计算】取 $10\\text{g}$ 大理石与足量稀盐酸充分反应，收集到 $2.2\\text{g}$ 二氧化碳，求该大理石中碳酸钙的质量分数。', answer: isHighSchool ? '负极：$\\text{Zn}-2e^-=\\text{Zn}^{2+}$；正极：$\\text{Cu}^{2+}+2e^-=\\text{Cu}$；总反应：$\\text{Zn}+\\text{Cu}^{2+}=\\text{Zn}^{2+}+\\text{Cu}$；$\\text{K}^+$ 向正极，$\\text{Cl}^-$ 向负极。' : '$50\\%$（生成 $2.2\\text{g}$ $\\text{CO}_2$ 需 $5\\text{g}$ $\\text{CaCO}_3$）。', explanation: '按电荷守恒、原子守恒及质量守恒分步书写。' }
      ],
      '生物': [
        { type: 'choice', score: 15, question: isHighSchool ? '下列关于绿色植物光合作用光反应与暗反应的叙述，正确的是（　　）' : '在显微镜下观察洋葱鳞片叶内表皮细胞时，植物细胞特有的结构是（　　）', options: isHighSchool ? ['A. 光反应在叶绿体类囊体薄膜上进行，产生 ATP、NADPH 和 O₂', 'B. 暗反应不需要酶的催化', 'C. 光反应直接消耗 CO₂', 'D. 停止光照后 C₃ 化合物含量瞬时减少'] : ['A. 细胞膜与细胞质', 'B. 细胞壁与大液泡', 'C. 细胞核与线粒体', 'D. 核糖体与中心体'], answer: isHighSchool ? 'A' : 'B', explanation: isHighSchool ? '光反应在类囊体薄膜上进行，水光解产 O₂ 与 NADPH 并合成 ATP。' : '植物细胞区别于动物细胞的典型结构是细胞壁、液泡（绿色部位含叶绿体）。' },
        { type: 'choice', score: 15, question: isHighSchool ? '减数分裂过程中，同源染色体分离发生在（　　）' : '人体消化和吸收营养物质的主要场所是（　　）', options: isHighSchool ? ['A. 减数第一次分裂后期', 'B. 减数第二次分裂后期', 'C. 有丝分裂中期', 'D. 间期 DNA 复制时'] : ['A. 口腔', 'B. 胃', 'C. 小肠', 'D. 大肠'], answer: isHighSchool ? 'A' : 'C', explanation: isHighSchool ? '减Ⅰ后期同源染色体分离、非同源染色体自由组合。' : '小肠很长且具有皱襞、绒毛和丰富消化液，是消化吸收主要场所。' },
        { type: 'blank', score: 15, question: isHighSchool ? '有氧呼吸三个阶段中，产生 ATP 最多的是第 ______ 阶段（填数字）。' : '生态系统由生物部分和 ______ 部分组成。', answer: isHighSchool ? '三' : '非生物', explanation: isHighSchool ? '第三阶段在线粒体内膜上进行，[H] 与 O₂ 结合生成水并释放大量能量。' : '生态系统包括生产者、消费者、分解者及非生物的物质和能量。' },
        { type: 'blank', score: 15, question: isHighSchool ? '基因型为 AaBb（两对基因独立遗传）的个体自交，后代纯合子所占比例为 ______。' : '人体血液循环中，体循环的起点是心脏的 ______。', answer: isHighSchool ? '1/4' : '左心室', explanation: isHighSchool ? 'Aa 自交纯合子占 1/2，Bb 自交纯合子占 1/2，乘积为 1/4。' : '体循环从左心室出发经主动脉流向全身。' },
        { type: 'essay', score: 40, question: isHighSchool ? '【遗传与代谢综合】请简述孟德尔自由组合定律的实质，并说明为何在测交实验中后代性状分离比为 1:1:1:1。' : '【光合与呼吸实验】为什么大棚种植蔬菜在夜间需要适当降低温度？请结合呼吸作用原理解释。', answer: isHighSchool ? '位于非同源染色体上的非等位基因在减Ⅰ后期自由组合；双杂合子产生 4 种比例相等配子，与隐性纯合子测交得 1:1:1:1。' : '夜间无光不进行光合作用，适当降温可减弱呼吸作用酶活性，减少有机物消耗，利于增产。', explanation: '紧扣细胞学基础与生理过程因果链作答。' }
      ],
      '历史': [
        { type: 'choice', score: 15, question: isHighSchool ? '汉武帝推行“推恩令”的主要历史作用是（　　）' : '中国历史上第一个统一的中央集权封建王朝是（　　）', options: isHighSchool ? ['A. 削弱诸侯王国势力，加强中央集权', 'B. 废除郡县制度', 'C. 实行科举选官', 'D. 开辟海上丝绸之路'] : ['A. 夏朝', 'B. 商朝', 'C. 秦朝', 'D. 汉朝'], answer: isHighSchool ? 'A' : 'C', explanation: isHighSchool ? '推恩令使诸侯王国越分越小，和平削弱地方割据、强化中央集权。' : '公元前 221 年秦王嬴政统一六国建立秦朝。' },
        { type: 'choice', score: 15, question: isHighSchool ? '第一次工业革命最核心的技术标志是（　　）' : '标志中国近代史开端的历史事件是（　　）', options: isHighSchool ? ['A. 瓦特改良蒸汽机的广泛应用', 'B. 内燃机与电力普及', 'C. 电子计算机发明', 'D. 铁犁牛耕推广'] : ['A. 鸦片战争', 'B. 洋务运动', 'C. 辛亥革命', 'D. 五四运动'], answer: 'A', explanation: isHighSchool ? '改良蒸汽机打破自然动力限制，推动人类进入“蒸汽时代”。' : '1840 年鸦片战争后中国开始沦为半殖民地半封建社会。' },
        { type: 'blank', score: 15, question: isHighSchool ? '1978 年底召开的中共 ______ 全会开启了改革开放和社会主义现代化建设新时期。' : '西汉时期出使西域、为丝绸之路开辟奠定基础的历史人物是 ______。', answer: isHighSchool ? '十一届三中' : '张骞', explanation: isHighSchool ? '十一届三中全会作出把党和国家工作中心转移到经济建设上来、实行改革开放的历史性决策。' : '张骞两次出使西域打通中原与西域通道。' },
        { type: 'blank', score: 15, question: isHighSchool ? '唐代三省六部制中，负责草拟政令的机构是 ______ 省。' : '我国古代四大发明包括造纸术、印刷术、火药和 ______。', answer: isHighSchool ? '中书' : '指南针', explanation: isHighSchool ? '中书草拟、门下审核、尚书执行。' : '四大发明是中华文明对世界文明的杰出贡献。' },
        { type: 'essay', score: 40, question: isHighSchool ? '【史料实证与历史解释】概括从秦朝三公九卿制到唐代三省六部制、宋代二府三司制演变的基本趋势，并分析其对古代国家治理的双重影响。' : '【历史综合问答】简述辛亥革命的历史意义及其历史局限性。', answer: isHighSchool ? '基本趋势：相权不断分散削弱，皇权不断加强；影响：有利于强化行政分工与中央集权稳定，但也易导致官僚机构臃肿与专制僵化。' : '意义：推翻清王朝统治，结束两千多年君主专制制度，建立中华民国，民主共和观念深入人心；局限：未彻底完成反帝反封建任务。', explanation: '坚持唯物史观，辩证分析积极与局限两方面。' }
      ],
      '地理': [
        { type: 'choice', score: 15, question: isHighSchool ? '地中海气候最显著的降水与气温组合特征是（　　）' : '地球自转产生的主要地理现象是（　　）', options: isHighSchool ? ['A. 夏季炎热干燥，冬季温和多雨', 'B. 全年高温多雨', 'C. 夏季高温多雨，冬季寒冷干燥', 'D. 全年温和湿润'] : ['A. 昼夜交替与地方时差', 'B. 四季更替', 'C. 五带划分', 'D. 昼夜长短季节变化'], answer: 'A', explanation: isHighSchool ? '夏季受副热带高气压带控制炎热干燥，冬季受盛行西风影响温和多雨。' : '地球自转产生昼夜交替与时差，公转产生四季与昼夜长短变化。' },
        { type: 'choice', score: 15, question: isHighSchool ? '下列洋流对沿岸气候起到“增温增湿”作用的是（　　）' : '我国地势的总体特征是（　　）', options: isHighSchool ? ['A. 北大西洋暖流', 'B. 秘鲁寒流', 'C. 加利福尼亚寒流', 'D. 本格拉寒流'] : ['A. 西高东低，呈三级阶梯状分布', 'B. 东高西低，起伏平缓', 'C. 南高北低', 'D. 四周高、中间低'], answer: 'A', explanation: isHighSchool ? '暖流增温增湿，寒流降温减湿。' : '我国地势西高东低、呈三级阶梯状分布，利于海洋湿润气流深入内陆。' },
        { type: 'blank', score: 15, question: isHighSchool ? '地质构造中，岩层中间老、两翼新的褶皱构造称为 ______。' : '亚洲与非洲的分界线是 ______ 运河。', answer: isHighSchool ? '背斜' : '苏伊士', explanation: isHighSchool ? '判断背斜向斜看岩层新老关系：中老翼新为背斜，中新翼老为向斜。' : '苏伊士运河沟通地中海与红海。' },
        { type: 'blank', score: 15, question: isHighSchool ? '冷锋过境后，当地的气温会明显下降，气压会明显 ______。' : '我国秦岭—淮河一线大致与 1 月 ______ ℃等温线重合。', answer: isHighSchool ? '升高' : '0', explanation: isHighSchool ? '冷气团取代暖气团控制当地，气温降、气压升、天气转晴。' : '秦岭—淮河一线是 0℃等温线与 800mm 等降水量线重要地理界线。' },
        { type: 'essay', score: 40, question: isHighSchool ? '【区域综合与人地协调】分析我国长三角地区发展高新技术产业的有利区位条件（至少答出 4 点）。' : '【中国地理综合】说明我国季风气候显著对农业生产的有利影响与不利影响。', answer: isHighSchool ? '高校科研院所密集人才充足；水陆空立体交通发达；产业基础雄厚市场广阔；政策支持与营商环境优越。' : '有利：雨热同期利于农作物生长；不利：降水年际季节变率大，易发生旱涝灾害。', explanation: '从自然条件（气候/地形/水源）与社会经济条件（交通/科技/市场/政策）分条组织答案。' }
      ],
      '政治': [
        { type: 'choice', score: 15, question: isHighSchool ? '“具体问题具体分析”体现的唯物辩证法原理是（　　）' : '在我国，国家的根本法、具有最高法律效力的是（　　）', options: isHighSchool ? ['A. 矛盾的特殊性原理', 'B. 意识决定物质', 'C. 静止是绝对的', 'D. 规律可以任意创造'] : ['A. 宪法', 'B. 民法典', 'C. 刑法', 'D. 义务教育法'], answer: 'A', explanation: isHighSchool ? '不同事物及同一事物不同阶段各有特点，要求具体问题具体分析。' : '宪法是国家根本大法，是其他法律的立法基础和立法依据。' },
        { type: 'choice', score: 15, question: isHighSchool ? '社会主义市场经济体制中，对资源配置起决定性作用的是（　　）' : '公民参与民主生活、行使民主权利的根本前提是（　　）', options: isHighSchool ? ['A. 市场', 'B. 行政命令', 'C. 平均分配', 'D. 计划指标'] : ['A. 遵守宪法和法律', 'B. 随意发表言论', 'C. 只享权利不尽义务', 'D. 逃避监督'], answer: 'A', explanation: isHighSchool ? '使市场在资源配置中起决定性作用，更好发挥政府作用。' : '公民权利与义务相统一，行使权利必须在宪法和法律范围内进行。' },
        { type: 'blank', score: 15, question: isHighSchool ? '辩证唯物主义认为，______ 是检验认识的真理性的唯一标准。' : '我国的根本政治制度是 ______ 制度。', answer: isHighSchool ? '实践' : '人民代表大会', explanation: isHighSchool ? '实践是主观见之于客观的物质性活动，是检验真理的唯一标准。' : '人民代表大会制度是我国的根本政治制度。' },
        { type: 'blank', score: 15, question: isHighSchool ? '发展的实质是事物的前进和上升，是新事物的产生和 ______ 的灭亡。' : '社会主义核心价值观个人层面的要求是：爱国、敬业、诚信、______。', answer: isHighSchool ? '旧事物' : '友善', explanation: isHighSchool ? '把握唯物辩证法发展观核心定义。' : '牢记社会主义核心价值观三个层面 24 字。' },
        { type: 'essay', score: 40, question: isHighSchool ? '【材料辨析与政治认同】结合“有效市场与有为政府相结合”的经济学道理，说明国家为何既要鼓励人工智能等新质生产力市场创新，又要加强数据安全与伦理监管。' : '【法治与责任】谈谈中学生在网络生活中应当如何正确行使言论自由权利并履行相应义务。', answer: isHighSchool ? '市场通过价格竞争激发创新活力，但存在自发性盲目性滞后性；政府科学宏观调控与市场监管可弥补市场失灵，保障高质量发展。' : '公民在行使自由和权利时不得损害国家社会集体利益和他人合法权益，坚持权利义务相统一，做到文明上网、不信谣不传谣。', explanation: '按“理论观点 + 结合材料 + 现实落脚点”作答。' }
      ]
    };
    subjBank['生物学'] = subjBank['生物'];
    subjBank['思想政治'] = subjBank['政治'];
    subjBank['道德与法治'] = subjBank['政治'];

    const genericSubjectQuestions = [
      { type: 'choice', score: 20, question: `【${friendlyGrade}·${subject}】关于本学期【${subject}】核心知识体系的掌握方法，最科学的是（　　）`, options: ['A. 建构因果思维导图并结合典型材料/例题辨析', 'B. 只背结论不看前提条件', 'C. 脱离课本盲目刷偏题怪题', 'D. 错题从不复盘'], answer: 'A', explanation: '学科核心素养强调概念建构、情境迁移与错题复盘。' },
      { type: 'choice', score: 20, question: `【${friendlyGrade}·${subject}】在解答【${subject}】综合材料分析题时，第一步应当（　　）`, options: ['A. 圈画设问限定词与材料关键时空/变量信息', 'B. 不看设问直接照抄大段教材', 'C. 凭直觉猜测结论', 'D. 略过图表直接作答'], answer: 'A', explanation: '精准审题是拿高分的第一前提。' },
      { type: 'blank', score: 20, question: `【${friendlyGrade}·${subject}】请写出本学期【${subject}】中你认为最核心的一个基本概念或规律名称：______。`, answer: '核心概念', explanation: '结合教材单元目录提炼主干概念。' },
      { type: 'essay', score: 40, question: `【${friendlyGrade}·${subject}综合论述】请结合本学期【${subject}】教材的重点章节，选择一个核心原理，阐述其形成条件、核心内容及在现实生活中的应用价值。`, answer: '概念准确、逻辑清晰、能结合现实案例展开论述即可得分。', explanation: '按“原理阐释 + 条件分析 + 现实迁移”三段式作答。' }
    ];

    const list = (subjBank[subject] || genericSubjectQuestions).map((item, i) => ({ ...item, id: i + 1 }));
    const actualSum = list.reduce((acc, q) => acc + (q.score || 0), 0);
    return {
      title: paperTitle.replace(/\(满分\d+分\)/, `(满分${actualSum}分)`),
      duration: getExamDuration(grade),
      grade,
      totalScore: actualSum,
      isFallback: true,
      questions: list
    };
  };

  if (subject !== '数学') {
    return buildNonMathPaper();
  }

  // ===== 数学学科：严格学段隔离 + 无重复真题库 + 精确总分校准 =====
  const choiceScore = isHighSchool ? 5 : (isPrimarySchool ? 3 : 4);
  const blankScore = isHighSchool ? 5 : (isPrimarySchool ? 3 : 4);
  const targetChoices = isHighSchool ? 8 : (isPrimarySchool ? 10 : 8);
  const targetBlanks = isHighSchool ? 3 : (isPrimarySchool ? 6 : 4);

  try {
    const db = getSqliteDb();
    if (db) {
      let gradeSql = "grade = ? OR grade LIKE ?";
      let gradeParams = [grade || 'all', rawGrade ? `${rawGrade}_%` : '%'];
      if (isHighSchool) {
        gradeSql = "(grade LIKE '10%' OR grade LIKE '11%' OR grade LIKE '12%' OR grade LIKE '%高%' OR grade LIKE '%高考%')";
        gradeParams = [];
      } else if (isPrimarySchool) {
        gradeSql = "(grade = ? OR grade LIKE ?)";
        gradeParams = [rawGrade, `${rawGrade}_%`];
      } else if (rawGrade) {
        gradeSql = "(grade = ? OR grade LIKE ?)";
        gradeParams = [rawGrade, `${rawGrade}_%`];
      }

      const choiceRows = await db.all(
        `SELECT * FROM canonical_questions WHERE subject = ? AND ${gradeSql} AND options IS NOT NULL AND length(trim(options)) > 3 ORDER BY id ASC LIMIT ?`,
        [subject, ...gradeParams, targetChoices * 2]
      );
      for (const r of choiceRows) {
        if (questions.filter(q => q.type === 'choice').length >= targetChoices) break;
        let opts = [];
        try {
          if (r.options.startsWith('[')) {
            opts = JSON.parse(r.options);
          } else {
            const parts = r.options.split(/(?=[A-D]\.)/g).map(s => s.trim()).filter(Boolean);
            opts = parts.length >= 2 ? parts : ['A. 选项A', 'B. 选项B', 'C. 选项C', 'D. 选项D'];
          }
        } catch {
          opts = ['A. 选项A', 'B. 选项B', 'C. 选项C', 'D. 选项D'];
        }
        pushUnique({
          type: 'choice',
          question: r.question,
          options: opts,
          score: choiceScore,
          answer: r.standard_answer || 'A',
          explanation: r.analysis || r.key_insight || '详见教材权威解析与解题思路。'
        });
      }

      const blankRows = await db.all(
        `SELECT * FROM canonical_questions WHERE subject = ? AND ${gradeSql} AND (options IS NULL OR length(trim(options)) <= 3) ORDER BY id ASC LIMIT ?`,
        [subject, ...gradeParams, targetBlanks * 2]
      );
      for (const r of blankRows) {
        if (questions.filter(q => q.type === 'blank').length >= targetBlanks) break;
        pushUnique({
          type: 'blank',
          question: r.question.includes('____') ? r.question : `${r.question} ______。`,
          score: blankScore,
          answer: r.standard_answer || '见解析',
          explanation: r.analysis || r.key_insight || '详见公式代入与变形步骤。'
        });
      }
    }
  } catch (err) {
    logger.warn('[TestPaperFallback] Canonical query error:', err.message);
  }

  // 1. 补齐选择题（无重复独立题库）
  const highSchoolChoices = [
    { question: '已知集合 $A = \\{x \\mid x^2 - 3x + 2 \\le 0\\}$，$B = \\{x \\in \\mathbb{Z} \\mid 0 < x < 4\\}$，则 $A \\cap B =$（　　）', options: ['A. $\\{1\\}$', 'B. $\\{1, 2\\}$', 'C. $\\{2, 3\\}$', 'D. $\\{1, 2, 3\\}$'], answer: 'B', explanation: '解不等式得 $A = [1, 2]$，$B = \\{1, 2, 3\\}$，故 $A \\cap B = \\{1, 2\\}$。选B。' },
    { question: '已知复数 $z = \\frac{2i}{1+i}$，则 $|z| =$（　　）', options: ['A. $1$', 'B. $\\sqrt{2}$', 'C. $2$', 'D. $2\\sqrt{2}$'], answer: 'B', explanation: '$z = \\frac{2i(1-i)}{(1+i)(1-i)} = 1 + i$，故 $|z| = \\sqrt{2}$。选B。' },
    { question: '函数 $f(x) = x^3 - 3x + 1$ 的单调递减区间为（　　）', options: ['A. $(-\\infty, -1)$', 'B. $(-1, 1)$', 'C. $(1, +\\infty)$', 'D. $(-\\infty, 0)$'], answer: 'B', explanation: "求导得 $f'(x) = 3x^2 - 3 < 0 \\Rightarrow -1 < x < 1$。选B。" },
    { question: '已知向量 $\\vec{a} = (2, -1)$，$\\vec{b} = (1, m)$，若 $\\vec{a} \\perp \\vec{b}$，则实数 $m =$（　　）', options: ['A. $-2$', 'B. $2$', 'C. $-\\frac{1}{2}$', 'D. $\\frac{1}{2}$'], answer: 'B', explanation: '$\\vec{a} \\cdot \\vec{b} = 2 - m = 0 \\Rightarrow m = 2$。选B。' },
    { question: '椭圆 $\\frac{x^2}{25} + \\frac{y^2}{16} = 1$ 的离心率 $e$ 为（　　）', options: ['A. $\\frac{3}{5}$', 'B. $\\frac{4}{5}$', 'C. $\\frac{3}{4}$', 'D. $\\frac{5}{4}$'], answer: 'A', explanation: '$a=5, b=4, c=\\sqrt{25-16}=3$，故 $e = c/a = 3/5$。选A。' },
    { question: '等差数列 $\\{a_n\\}$ 中，$a_2 = 5$，$a_5 = 14$，则公差 $d =$（　　）', options: ['A. $2$', 'B. $3$', 'C. $4$', 'D. $5$'], answer: 'B', explanation: '$3d = a_5 - a_2 = 9 \\Rightarrow d = 3$。选B。' },
    { question: '若 $\\sin\\alpha = \\frac{3}{5}$ 且 $\\alpha \\in (\\frac{\\pi}{2}, \\pi)$，则 $\\cos\\alpha =$（　　）', options: ['A. $\\frac{4}{5}$', 'B. $-\\frac{4}{5}$', 'C. $\\frac{3}{4}$', 'D. $-\\frac{3}{4}$'], answer: 'B', explanation: '第二象限余弦为负，$\\cos\\alpha = -\\sqrt{1 - (3/5)^2} = -4/5$。选B。' },
    { question: '函数 $y = \\log_2(x - 1)$ 的定义域是（　　）', options: ['A. $(0, +\\infty)$', 'B. $(1, +\\infty)$', 'C. $[1, +\\infty)$', 'D. $(-\\infty, 1)$'], answer: 'B', explanation: '真数 $x - 1 > 0 \\Rightarrow x > 1$。选B。' }
  ];
  const middleSchoolChoices = [
    { question: '下列计算完全正确的是（　　）', options: ['A. $(-2)^3 = -8$', 'B. $-2^2 = 4$', 'C. $(-1)^{2026} = -1$', 'D. $-(-3) = -3$'], answer: 'A', explanation: '$(-2)^3 = -8$ 正确。' },
    { question: '一元二次方程 $x^2 - 4x + 3 = 0$ 的两根之和为（　　）', options: ['A. $-4$', 'B. $4$', 'C. $3$', 'D. $-3$'], answer: 'B', explanation: '由韦达定理 $x_1 + x_2 = -b/a = 4$。' },
    { question: '直角三角形两直角边长分别为 $6$ 和 $8$，则斜边长为（　　）', options: ['A. $7$', 'B. $10$', 'C. $12$', 'D. $14$'], answer: 'B', explanation: '由勾股定理 $\\sqrt{6^2+8^2}=10$。' },
    { question: '一次函数 $y = -2x + 4$ 的图像不经过的象限是（　　）', options: ['A. 第一象限', 'B. 第二象限', 'C. 第三象限', 'D. 第四象限'], answer: 'C', explanation: '$k<0, b>0$，图像经过一、二、四象限，不经第三象限。' },
    { question: '将多项式 $x^2 - 9$ 因式分解，结果是（　　）', options: ['A. $(x-3)^2$', 'B. $(x+3)^2$', 'C. $(x+3)(x-3)$', 'D. $x(x-9)$'], answer: 'C', explanation: '利用平方差公式分解。' },
    { question: '若 $\\triangle ABC \\sim \\triangle DEF$ 且相似比为 $1:3$，则它们的面积比为（　　）', options: ['A. $1:3$', 'B. $1:6$', 'C. $1:9$', 'D. $3:1$'], answer: 'C', explanation: '相似三角形面积比等于相似比的平方。' },
    { question: '不等式 $2x - 6 > 0$ 的解集在数轴上表示为（　　）', options: ['A. $x > 3$', 'B. $x < 3$', 'C. $x \\ge 3$', 'D. $x > -3$'], answer: 'A', explanation: '移项除以正数 2 得 $x > 3$。' },
    { question: '抛物线 $y = (x - 2)^2 + 3$ 的顶点坐标是（　　）', options: ['A. $(-2, 3)$', 'B. $(2, 3)$', 'C. $(2, -3)$', 'D. $(-2, -3)$'], answer: 'B', explanation: '顶点式 $y = a(x-h)^2 + k$ 顶点为 $(h, k) = (2, 3)$。' }
  ];
  const primaryChoices = [
    { question: '下列计算完全正确的是（　　）', options: ['A. $25 + 18 = 43$', 'B. $36 - 19 = 15$', 'C. $6 \\times 7 = 48$', 'D. $54 \\div 6 = 8$'], answer: 'A', explanation: '25 + 18 = 43 正确。' },
    { question: '一个长方形长 $8$ 厘米，宽 $5$ 厘米，它的周长是（　　）', options: ['A. $13$ 厘米', 'B. $26$ 厘米', 'C. $40$ 厘米', 'D. $20$ 厘米'], answer: 'B', explanation: '$(8+5)\\times 2 = 26$ 厘米。' },
    { question: '把 $1$ 米平均分成 $10$ 份，其中的 $3$ 份用小数表示是（　　）', options: ['A. $0.03$ 米', 'B. $0.3$ 米', 'C. $3.0$ 米', 'D. $0.33$ 米'], answer: 'B', explanation: '十分之三米即 $0.3$ 米。' },
    { question: '与 $25 \\times 16$ 结果相等的算式是（　　）', options: ['A. $25 \\times 4 \\times 4$', 'B. $25 \\times 4 + 4$', 'C. $25 \\times 10 + 6$', 'D. $25 \\times 8 \\times 8$'], answer: 'A', explanation: '把 $16$ 拆成 $4 \\times 4$ 利用乘法结合律。' },
    { question: '直角三角形中两个锐角的和一定是（　　）', options: ['A. $60^\\circ$', 'B. $90^\\circ$', 'C. $120^\\circ$', 'D. $180^\\circ$'], answer: 'B', explanation: '三角形内角和 $180^\\circ$ 减去直角 $90^\\circ$ 得 $90^\\circ$。' },
    { question: '下列各数中，既是 $2$ 的倍数又是 $5$ 的倍数的是（　　）', options: ['A. $15$', 'B. $24$', 'C. $30$', 'D. $45$'], answer: 'C', explanation: '个位是 $0$ 的数同时是 $2$ 和 $5$ 的倍数。' },
    { question: '分针从数字 $12$ 走到数字 $4$，经过的时间是（　　）', options: ['A. $4$ 分钟', 'B. $20$ 分钟', 'C. $40$ 分钟', 'D. $15$ 分钟'], answer: 'B', explanation: '钟面每大格为 $5$ 分钟，$4 \\times 5 = 20$ 分钟。' },
    { question: '三位数除以一位数，商的位数可能是（　　）', options: ['A. 一定是三位数', 'B. 一定是两位数', 'C. 两位数或三位数', 'D. 一位数'], answer: 'C', explanation: '当被除数百位大于等于除数时商是三位数，否则是两位数。' },
    { question: '一袋食盐重 $500$ 克，两袋这样的食盐重（　　）', options: ['A. $1000$ 千克', 'B. $1$ 千克', 'C. $100$ 克', 'D. $2$ 千克'], answer: 'B', explanation: '$500 + 500 = 1000$ 克 $= 1$ 千克。' },
    { question: '下列图形中，对称轴条数最多的是（　　）', options: ['A. 长方形', 'B. 正方形', 'C. 等边三角形', 'D. 圆'], answer: 'D', explanation: '圆有无数条对称轴。' }
  ];

  const choicePool = isHighSchool ? highSchoolChoices : (isPrimarySchool ? primaryChoices : middleSchoolChoices);
  for (const tpl of choicePool) {
    if (questions.filter(q => q.type === 'choice').length >= targetChoices) break;
    pushUnique({ type: 'choice', score: choiceScore, ...tpl });
  }

  // 1.5 高中新高考数学必须包含 3 道多项选择题（每题 6 分共 18 分，与全国新高考 I 卷 8单选+3多选+3填空+5解答=150分 结构严格对齐）
  if (isHighSchool) {
    const highSchoolMultiChoices = [
      {
        type: 'multi_choice',
        score: 6,
        question: '【多选题】已知函数 $f(x) = x^3 - 3x$，下列说法正确的有（　　）',
        options: ['A. $f(x)$ 是奇函数', 'B. $f(x)$ 在 $(-1, 1)$ 上单调递减', 'C. $x = -1$ 是 $f(x)$ 的极大值点', 'D. $f(x)$ 在 $\\mathbb{R}$ 上有 2 个零点'],
        answer: 'ABC',
        explanation: "$f(-x)=-f(x)$ 为奇函数；$f'(x)=3(x^2-1)$，在 $(-1,1)$ 递减，$x=-1$ 处取极大值 $2$；零点为 $0, \\pm\\sqrt{3}$ 共 3 个，故 D 错，选 ABC。"
      },
      {
        type: 'multi_choice',
        score: 6,
        question: '【多选题】关于双曲线 $C: \\frac{x^2}{9} - \\frac{y^2}{16} = 1$，下列结论正确的有（　　）',
        options: ['A. 实轴长为 $6$', 'B. 焦距为 $10$', 'C. 渐近线方程为 $y = \\pm \\frac{4}{3}x$', 'D. 离心率 $e = \\frac{4}{3}$'],
        answer: 'ABC',
        explanation: '$a=3, b=4, c=5$，实轴长 $2a=6$，焦距 $2c=10$，渐近线 $y=\\pm\\frac{b}{a}x=\\pm\\frac{4}{3}x$，离心率 $e=\\frac{5}{3}$，故 D 错，选 ABC。'
      },
      {
        type: 'multi_choice',
        score: 6,
        question: '【多选题】已知向量 $\\vec{a} = (1, 2)$，$\\vec{b} = (-2, 1)$，下列说法正确的有（　　）',
        options: ['A. $|\\vec{a}| = |\\vec{b}| = \\sqrt{5}$', 'B. $\\vec{a} \\perp \\vec{b}$', 'C. $\\vec{a} + \\vec{b} = (-1, 3)$', 'D. $\\vec{a} \\parallel \\vec{b}$'],
        answer: 'ABC',
        explanation: '$|\\vec{a}|=|\\vec{b}|=\\sqrt{5}$，$\\vec{a}\\cdot\\vec{b}=-2+2=0$ 故垂直不平行，$\\vec{a}+\\vec{b}=(-1,3)$，选 ABC。'
      }
    ];
    for (const mq of highSchoolMultiChoices) {
      pushUnique(mq);
    }
  }

  // 2. 补齐填空题（完全去重，绝不重复 6 道同一题）
  const highSchoolBlanks = [
    { question: '曲线 $y = e^x + 2x$ 在点 $(0, 1)$ 处的切线斜率为 ______。', answer: '3', explanation: "求导 $y' = e^x + 2$，代入 $x = 0$ 得 $k = 3$。" },
    { question: '二项式 $(x + 1)^5$ 展开式中含 $x^2$ 项的系数为 ______。', answer: '10', explanation: '由二项式定理 $C_5^2 = 10$。' },
    { question: '抛物线 $y^2 = 8x$ 的焦点坐标为 ______。', answer: '(2,0)', explanation: '$2p = 8 \\Rightarrow p/2 = 2$，焦点在 $x$ 轴正半轴 $(2, 0)$。' },
    { question: '已知正实数 $x, y$ 满足 $x + y = 6$，则 $xy$ 的最大值为 ______。', answer: '9', explanation: '由基本不等式 $xy \\le (\\frac{x+y}{2})^2 = 9$，当 $x=y=3$ 取等。' }
  ];
  const middleSchoolBlanks = [
    { question: '若 $|x - 3| + (y + 1)^2 = 0$，则代数式 $x + y$ 的值为 ______。', answer: '2', explanation: '非负数和为 0，故 $x=3, y=-1$，$x+y=2$。' },
    { question: '反比例函数 $y = \\frac{k}{x}$ 的图像经过点 $(2, -3)$，则 $k =$ ______。', answer: '-6', explanation: '$k = xy = 2 \\times (-3) = -6$。' },
    { question: '正六边形的每一个内角等于 ______ 度。', answer: '120', explanation: '$(6-2)\\times 180^\\circ / 6 = 120^\\circ$。' },
    { question: '一组数据 $3, 5, 7, 5, 10$ 的众数是 ______。', answer: '5', explanation: '数字 $5$ 出现两次最多。' }
  ];
  const primaryBlanks = [
    { question: '计算：$48 \\div 6 + 15 =$ ______。', answer: '23', explanation: '先乘除后加减：$8 + 15 = 23$。' },
    { question: '一个正方形边长是 $9$ 厘米，它的面积是 ______ 平方厘米。', answer: '81', explanation: '$9 \\times 9 = 81$ 平方厘米。' },
    { question: '$3$ 小时 $20$ 分 $=$ ______ 分钟。', answer: '200', explanation: '$3 \\times 60 + 20 = 200$ 分钟。' },
    { question: '一块蛋糕平均切成 $8$ 块，小明吃了 $3$ 块，还剩下这块蛋糕的 ______（填分数）。', answer: '5/8', explanation: '$1 - 3/8 = 5/8$。' },
    { question: '一个数除以 $7$，商是 $12$，余数是 $4$，这个数是 ______。', answer: '88', explanation: '被除数 $=$ 商 $\\times$ 除数 $+$ 余数 $= 12 \\times 7 + 4 = 88$。' },
    { question: '$5$ 千米 $- 1200$ 米 $=$ ______ 米。', answer: '3800', explanation: '$5000 - 1200 = 3800$ 米。' }
  ];

  const blankPool = isHighSchool ? highSchoolBlanks : (isPrimarySchool ? primaryBlanks : middleSchoolBlanks);
  for (const tpl of blankPool) {
    if (questions.filter(q => q.type === 'blank').length >= targetBlanks) break;
    pushUnique({ type: 'blank', score: blankScore, ...tpl });
  }

  // 3. 补齐解答题（严格学段隔离：高中独立新高考解答题，绝不塞七年级研学题！且精确凑齐目标满分）
  const highSchoolEssayTemplates = [
    {
      type: 'essay',
      score: 13,
      question: '【解三角形综合】在 $\\triangle ABC$ 中，内角 $A, B, C$ 所对的边分别为 $a, b, c$，已知 $a\\cos C + c\\cos A = 2b\\cos B$。\n(1) 求角 $B$ 的大小；\n(2) 若 $b = \\sqrt{7}$，$a + c = 4$，求 $\\triangle ABC$ 的面积。',
      answer: '(1) $B = \\frac{\\pi}{3}$；(2) $S = \\frac{3\\sqrt{3}}{4}$。',
      explanation: '(1) 由正弦定理得 $\\sin(A+C) = 2\\sin B\\cos B \\Rightarrow \\cos B = \\frac{1}{2} \\Rightarrow B = \\frac{\\pi}{3}$；(2) 由余弦定理 $7 = (a+c)^2 - 3ac = 16 - 3ac \\Rightarrow ac = 3$，面积 $S = \\frac{1}{2}ac\\sin B = \\frac{3\\sqrt{3}}{4}$。'
    },
    {
      type: 'essay',
      score: 15,
      question: '【数列与求和】已知公差不为零的等差数列 $\\{a_n\\}$ 满足 $a_1 = 2$，且 $a_1, a_2, a_5$ 成等比数列。\n(1) 求数列 $\\{a_n\\}$ 的通项公式；\n(2) 设 $b_n = \\frac{1}{a_n a_{n+1}}$，求数列 $\\{b_n\\}$ 的前 $n$ 项和 $T_n$。',
      answer: '(1) $a_n = 4n - 2$；(2) $T_n = \\frac{n}{4(2n+1)}$。',
      explanation: '(1) $(2+d)^2 = 2(2+4d) \\Rightarrow d = 4$，故 $a_n = 4n - 2$；(2) 裂项相消：$b_n = \\frac{1}{4}(\\frac{1}{4n-2} - \\frac{1}{4n+2})$，累加得 $T_n = \\frac{1}{4}(\\frac{1}{2} - \\frac{1}{4n+2}) = \\frac{n}{4(2n+1)}$。'
    },
    {
      type: 'essay',
      score: 15,
      question: '【立体几何与空间向量】在直三棱柱 $ABC-A_1B_1C_1$ 中，$AC \\perp BC$，$AC = BC = 2$，$AA_1 = 2$，点 $D$ 为 $AB$ 中点。\n(1) 求证：$CD \\perp$ 平面 $ABB_1A_1$；\n(2) 求直线 $A_1C$ 与平面 $ABB_1A_1$ 所成角的正弦值。',
      answer: '(1) 见解析；(2) $\\frac{1}{2}$。',
      explanation: '(1) 等腰直角三角形中 $CD \\perp AB$，且直棱柱中 $AA_1 \\perp CD$，故 $CD \\perp$ 平面 $ABB_1A_1$；(2) 线面角即 $\\angle CA_1D$，$CD=\\sqrt{2}$，$A_1C=2\\sqrt{2}$，故 $\\sin\\theta = \\frac{CD}{A_1C} = \\frac{1}{2}$。'
    },
    {
      type: 'essay',
      score: 17,
      question: '【圆锥曲线压轴】已知椭圆 $C: \\frac{x^2}{a^2} + \\frac{y^2}{b^2} = 1 (a > b > 0)$ 的右焦点为 $F(1, 0)$，离心率为 $\\frac{1}{2}$。\n(1) 求椭圆 $C$ 的标准方程；\n(2) 过点 $F$ 作斜率为 $1$ 的直线 $l$ 交椭圆于 $A, B$ 两点，求弦长 $|AB|$。',
      answer: '(1) $\\frac{x^2}{4} + \\frac{y^2}{3} = 1$；(2) $|AB| = \\frac{24}{7}$。',
      explanation: '(1) $c=1, e=1/2 \\Rightarrow a=2, b^2=3$；(2) 联立 $y=x-1$ 与 $3x^2+4y^2=12$ 得 $7x^2-8x-8=0$，由弦长公式 $|AB| = \\sqrt{1+1^2} \\cdot \\frac{\\sqrt{64+224}}{7} = \\frac{24}{7}$。'
    },
    {
      type: 'essay',
      score: 17,
      question: '【函数与导数压轴】已知函数 $f(x) = a\\ln x - x + 1$（$a \\in \\mathbb{R}$）。\n(1) 当 $a = 1$ 时，求曲线 $y = f(x)$ 在 $x = 1$ 处的切线方程，并证明 $f(x) \\le 0$ 恒成立；\n(2) 讨论函数 $f(x)$ 在定义域 $(0, +\\infty)$ 上的单调性。',
      answer: '(1) 切线 $y = 0$，极大值 $f(1) = 0$；(2) $a \\le 0$ 时单调递减；$a > 0$ 时在 $(0, a)$ 递增，在 $(a, +\\infty)$ 递减。',
      explanation: "定义域 $(0, +\\infty)$，$f'(x) = \\frac{a - x}{x}$。分类讨论 $a \\le 0$ 与 $a > 0$ 的导数符号即可完整得解。"
    }
  ];

  const primaryEssayTemplates = [
    { type: 'essay', score: 6, question: '【脱式计算与简便运算】\n(1) 计算：$125 \\times 32 \\times 25$；\n(2) 计算：$480 \\div [(15 + 25) \\times 2]$。', answer: '(1) 100000；(2) 6。', explanation: '(1) $(125\\times 8)\\times(4\\times 25)=100000$；(2) $480\\div 80=6$。' },
    { type: 'essay', score: 6, question: '【周长与面积应用】一块长方形菜地长 $24$ 米、宽 $16$ 米。\n(1) 求周长和面积；\n(2) 若一面靠墙（墙长 $24$ 米）围篱笆，至少需要多少米？', answer: '(1) 周长 80 米，面积 384 平方米；(2) 56 米。', explanation: '长边靠墙最省：$24 + 16\\times 2 = 56$ 米。' },
    { type: 'essay', score: 6, question: '【行程问题】甲、乙两车同时从相距 $480$ 千米的两地相对开出，$3$ 小时相遇。甲车速度 $75$ 千米/时，求乙车速度。', answer: '85 千米/时。', explanation: '速度和 $480\\div 3=160$，乙速 $160-75=85$。' },
    { type: 'essay', score: 6, question: '【鸡兔同笼】笼子里共有 $35$ 个头、$94$ 只脚，求鸡和兔各有多少只？', answer: '鸡 23 只，兔 12 只。', explanation: '兔：$(94-35\\times 2)\\div 2 = 12$ 只，鸡 $23$ 只。' },
    { type: 'essay', score: 6, question: '【购物预算】每本故事书 $18$ 元，每支钢笔 $12$ 元。班级买了 $15$ 本故事书和 $20$ 支钢笔，一共花了多少钱？', answer: '510 元。', explanation: '$18 \\times 15 + 12 \\times 20 = 270 + 240 = 510$ 元。' },
    { type: 'essay', score: 5, question: '【归一问题】一辆货车 $4$ 小时行驶 $260$ 千米，照这样的速度，$7$ 小时可以行驶多少千米？', answer: '455 千米。', explanation: '速度 $260 \\div 4 = 65$ 千米/时，$65 \\times 7 = 455$ 千米。' },
    { type: 'essay', score: 5, question: '【倍数应用】果园里有苹果树 $120$ 棵，梨树的棵数是苹果树的 $3$ 倍少 $25$ 棵，两种果树一共有多少棵？', answer: '455 棵。', explanation: '梨树 $120 \\times 3 - 25 = 335$ 棵，共 $120 + 335 = 455$ 棵。' },
    { type: 'essay', score: 6, question: '【植树问题】在一条长 $120$ 米的小路一侧每隔 $6$ 米栽一棵树（两端都栽），一共需要栽多少棵树？', answer: '21 棵。', explanation: '间隔数 $120 \\div 6 = 20$，两端都栽为 $20 + 1 = 21$ 棵。' },
    { type: 'essay', score: 6, question: '【平均数问题】小明前三次数学测验成绩分别是 $92$ 分、$88$ 分、$96$ 分，他第四次至少考多少分才能使四次平均分达到 $93$ 分？', answer: '96 分。', explanation: '四次总分需 $93 \\times 4 = 372$ 分，$372 - (92+88+96) = 96$ 分。' }
  ];

  const secondaryEssayTemplates = [
    { type: 'essay', score: 16, question: '【代数化简与方程】\n(1) 解方程 $\\frac{2x - 1}{3} - \\frac{x + 2}{4} = 1$；\n(2) 化简求值：$2(x^2y + xy^2) - 3(x^2y - 1) - 2xy^2 - 2$，其中 $x = -2, y = \\frac{1}{2}$。', answer: '(1) $x = \\frac{22}{5}$；(2) $-1$。', explanation: '(1) 去分母同乘 12 得 $5x=22$；(2) 化简得 $-x^2y+1=-1$。' },
    { type: 'essay', score: 18, question: '【几何推理与角平分线】已知点 $O$ 在直线 $AB$ 上，$\\angle AOC = 60^\\circ$，$OD$ 平分 $\\angle AOC$，$OE$ 平分 $\\angle BOC$。\n(1) 求 $\\angle DOE$ 的度数；\n(2) 若射线 $OC$ 绕点 $O$ 在上半平面旋转，$\\angle DOE$ 是否改变？说明理由。', answer: '(1) $90^\\circ$；(2) 不改变，恒为 $90^\\circ$。', explanation: '$\\angle DOE = \\frac{1}{2}(\\angle AOC + \\angle BOC) = 90^\\circ$。' },
    { type: 'essay', score: 20, question: '【实际应用建模】某校组织初中学生研学，若单独租用 $45$ 座客车刚好坐满；若单独租用 $60$ 座客车，可少租 $1$ 辆且空出 $15$ 个座位。求参加研学的学生总人数。', answer: '225 人。', explanation: '设 $45$ 座车 $x$ 辆，$45x = 60(x-1)-15 \\Rightarrow x=5$，共 $225$ 人。' },
    { type: 'essay', score: 22, question: '【数轴动点综合】数轴上点 $A$ 表示 $-10$，点 $B$ 表示 $6$。点 $P$ 从 $A$ 以 $3$ 单位/秒向右运动，点 $Q$ 从 $B$ 以 $2$ 单位/秒向左运动，时间为 $t$ 秒。\n(1) 求相遇时的 $t$ 值；\n(2) 当 $t$ 为何值时 $P, Q$ 相距 $2$？', answer: '(1) $t = \\frac{16}{5}$ 秒；(2) $t = \\frac{14}{5}$ 秒或 $\\frac{18}{5}$ 秒。', explanation: '(1) $5t=16$；(2) $|5t-16|=2$。' },
    { type: 'essay', score: 26, question: '【函数与方案优化】文具店优惠：方案一全场打八折；方案二满 $200$ 元减 $50$ 元。计划购买单价 $25$ 元的钢笔 $x$ 支（$x \\ge 8$）。\n(1) 写出两种方案花费的代数式；\n(2) 讨论不同购买数量下哪种方案更划算。', answer: '(1) 方案一 $20x$，方案二 $25x - 50$；(2) $x=10$ 相同，$x>10$ 方案一划算，$8\\le x<10$ 方案二划算。', explanation: '比较 $20x$ 与 $25x-50$ 的大小关系即可。' }
  ];

  const essayTemplates = isHighSchool ? highSchoolEssayTemplates : (isPrimarySchool ? primaryEssayTemplates : secondaryEssayTemplates);
  for (const eq of essayTemplates) {
    pushUnique(eq);
  }

  // 严格算术校准：确保最后一道题分值微调使总分与 targetMaxScore 100% 一致
  const currentSum = questions.reduce((acc, q) => acc + (Number(q.score) || 0), 0);
  if (questions.length > 0 && currentSum !== targetMaxScore) {
    const diff = targetMaxScore - currentSum;
    const lastQ = questions[questions.length - 1];
    if ((lastQ.score || 0) + diff >= 4) {
      lastQ.score = (lastQ.score || 0) + diff;
    }
  }
  const finalTotalScore = questions.reduce((acc, q) => acc + (Number(q.score) || 0), 0);

  return {
    title: paperTitle.replace(/\(满分\d+分\)/, `(满分${finalTotalScore}分)`),
    duration: getExamDuration(grade),
    grade: grade,
    totalScore: finalTotalScore,
    isFallback: true,
    questions: questions.map((q, i) => ({ ...q, id: i + 1 }))
  };
}

function getExamDuration(grade) {
  const rawGrade = parseGradeNumber(grade);
  if (rawGrade >= 1 && rawGrade <= 3) return 40;
  if (rawGrade >= 4 && rawGrade <= 6) return 60;
  if (rawGrade >= 7 && rawGrade <= 9) return 90;
  if (rawGrade >= 10 && rawGrade <= 12) return 120;
  return 90;
}

/**
 * API 1: 生成试卷
 */
const { requireQuotaOrVip } = require('../middleware/quota');
router.post('/test-paper/generate', requireQuotaOrVip('test_paper_generate'), async (req, res) => {
  try {
    const { grade, subject, type, chapter_id, edition, knowledge_points, region, exam_year } = req.body;
    if (!grade || !subject || !type) {
      return res.status(400).json({ error: '缺少必需的年级、科目或测试类型' });
    }

    let chapterName = '';
    let chapterDesc = '';
    let syllabusStr = '';

    // 从 prompts/chapters.json 配置文件中查询章节大纲信息
    try {
      const key = edition ? `${grade}_${edition}` : grade;
      const chaptersData = await getChapters();
      const gradeChapters = chaptersData[key] || chaptersData[grade] || {};
      const list = gradeChapters[subject] || [];
      
      if (list.length > 0) {
        syllabusStr = list.map((c, i) => `${i + 1}. ${c.name} (${c.description})`).join('\n');
      }

      if (type === 'unit' && chapter_id) {
        const chapter = list.find(c => String(c.id) === String(chapter_id));
        if (chapter) {
          chapterName = chapter.name;
          chapterDesc = chapter.description;
        } else {
          logger.warn(`Chapter not found in JSON config for id: ${chapter_id}, grade: ${grade}, subject: ${subject}`);
        }
      }
    } catch (err) {
      logger.error('Failed to parse chapter info from JSON config:', err);
    }

    const prompt = getGeneratePrompt(grade, subject, type, chapterName, chapterDesc, syllabusStr, knowledge_points, region, exam_year);

    let paperObj = null;
    try {
      const response = await fetchWithKeyRotation(buildChatURL, {
        method: 'POST',
        profileId: req.auth?.activeProfileId || 'default',
        headers: getClientAiHeaders(req),
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.3,
            maxOutputTokens: 8192,
            thinkingConfig: { thinkingBudget: 0 }
          }
        })
      }, 3, 28000);

      const data = await response.json();
      const text = extractLlmText(data);
      paperObj = parseOrRepairPaperJson(text);
    } catch (llmErr) {
      logger.warn('[TestPaper] LLM generation timed out or failed, falling back to authentic canonical bank:', llmErr.message);
    }

    if (!paperObj || !Array.isArray(paperObj.questions) || paperObj.questions.length === 0) {
      logger.info('[TestPaper] Assembling authentic canonical exam paper fallback...');
      paperObj = await assembleReliableExamPaper(grade, subject, type, region);
    } else {
      paperObj.duration = paperObj.duration || getExamDuration(grade);
      paperObj.grade = grade;
    }

    res.json({ paper: paperObj });
  } catch (e) {
    logger.error('Generate Test Paper Error:', e);
    try {
      const fallbackPaper = await assembleReliableExamPaper(req.body?.grade, req.body?.subject, req.body?.type, req.body?.region);
      if (fallbackPaper && fallbackPaper.questions.length > 0) {
        return res.json({ paper: fallbackPaper });
      }
    } catch (fbErr) {
      logger.error('Fallback assembly error:', fbErr);
    }
    res.status(500).json({ error: '生成试卷失败', details: NODE_ENV === 'development' ? e.message : undefined });
  }
});

/**
 * API 2: 批改试卷
 */
router.post('/test-paper/grade', requireQuotaOrVip('test_paper_grade'), async (req, res) => {
  try {
    const { student_name, answers, questions, grade } = req.body;
    if (!answers || !questions || !Array.isArray(questions)) {
      return res.status(400).json({ error: '缺少提交的答案或题目数据' });
    }

    const profileId = req.auth?.activeProfileId || 'default';
    const normalizeChoiceLetters = (str) => {
      const letters = Array.from(new Set(String(str || '').toUpperCase().match(/[A-D]/g) || []));
      return letters.sort().join('');
    };

    const buildStructuredBreakdown = (rawBreakdown, earned, maxScore) => {
      const m = Number(maxScore) || 10;
      const cMax = Math.max(1, Math.round(m * 0.3));
      const dMax = Math.max(1, Math.round(m * 0.4));
      const fMax = Math.max(1, m - cMax - dMax);
      const ratio = m > 0 ? Math.max(0, Math.min(1, earned / m)) : 0;
      const isFull = earned >= m;
      const defaultObj = {
        concept: {
          score: Math.round(cMax * ratio),
          maxScore: cMax,
          comment: isFull ? '审题严谨，已知与未知条件把握精准' : (earned > 0 ? '审题基本到位，提取了部分关键条件' : '未作答或核心概念存在偏差')
        },
        deduction: {
          score: Math.round(dMax * ratio),
          maxScore: dMax,
          comment: isFull ? '逻辑严密，公式与定理代入规范无误' : (earned > 0 ? '步骤基本正确，中间计算有小瑕疵' : '推导逻辑中断或关键公式未列出')
        },
        conclusion: {
          score: Math.max(0, earned - Math.round(cMax * ratio) - Math.round(dMax * ratio)),
          maxScore: fMax,
          comment: isFull ? '结论计算完全正确，量纲与单位标准' : (earned > 0 ? '结论部分吻合，需注意末尾结果核验' : '最终结论错误或未作答')
        }
      };
      if (!rawBreakdown || typeof rawBreakdown !== 'object') return defaultObj;
      const normalizePart = (part, fallback) => {
        if (part && typeof part === 'object') {
          return {
            score: typeof part.score === 'number' ? part.score : fallback.score,
            maxScore: typeof part.maxScore === 'number' ? part.maxScore : fallback.maxScore,
            comment: String(part.comment || fallback.comment)
          };
        }
        if (typeof part === 'string' && part.trim()) {
          return { ...fallback, comment: part.trim() };
        }
        return fallback;
      };
      return {
        concept: normalizePart(rawBreakdown.concept, defaultObj.concept),
        deduction: normalizePart(rawBreakdown.deduction, defaultObj.deduction),
        conclusion: normalizePart(rawBreakdown.conclusion, defaultObj.conclusion)
      };
    };

    const gradeSingleQuestion = async (q) => {
      const studentAns = String(answers[q.id] || '').trim();
      const standardAns = String(q.answer || '').trim();
      const maxQScore = Number(q.score) || 8;

      let score = 0;
      let comment = '';
      let gradedByAI = false;
      let parsedStep = null;
      let needsManualReview = false;

      const normalizeJudgment = (val) => {
        const s = String(val || '').trim().toLowerCase();
        if (/^(对|正确|true|t|√|✓|yes|y|1)$/.test(s)) return 'true';
        if (/^(错|错误|false|f|×|✗|x|no|n|0)$/.test(s)) return 'false';
        return '';
      };

      // 空答案直接短路判 0 分，绝不为空白题调 LLM 烧钱或拖慢超时
      if (!studentAns) {
        score = 0;
        comment = '本题未作答。请先尝试独立思考并参考标准解析。';
      } else if (q.type === 'choice' || q.type === 'multi_choice') {
        const cleanStudent = normalizeChoiceLetters(studentAns);
        const cleanStandard = normalizeChoiceLetters(standardAns);
        if (cleanStudent && cleanStudent === cleanStandard) {
          score = maxQScore;
          comment = cleanStandard.length > 1 ? '多选题全部选对，满分！' : '选择题答案正确！';
        } else if (
          cleanStandard.length > 1 &&
          cleanStudent.length > 0 &&
          cleanStudent.split('').every(ch => cleanStandard.includes(ch))
        ) {
          // 新高考多选题：漏选得一半分数，错选 0 分
          score = Math.floor(maxQScore / 2);
          comment = `多选题部分选对（漏选得 ${score} 分）。标准答案是：${cleanStandard}。`;
        } else {
          score = 0;
          comment = `选择题答案错误。标准答案是：${cleanStandard || standardAns}。`;
        }
      } else if (q.type === 'judgment') {
        const normS = normalizeJudgment(studentAns);
        const normStd = normalizeJudgment(standardAns);
        if (normS && normStd && normS === normStd) {
          score = maxQScore;
          comment = '判断题答案正确！';
        } else if (normS && normStd) {
          score = 0;
          comment = `判断题答案有误。标准判断为：${normStd === 'true' ? '正确 (√)' : '错误 (×)'}。`;
        } else {
          gradedByAI = true;
        }
      } else if (q.type === 'blank') {
        const cleanStudent = studentAns.replace(/\s+/g, '').toLowerCase();
        const cleanStandard = standardAns.replace(/\s+/g, '').toLowerCase();
        if (cleanStudent === cleanStandard && cleanStandard !== '') {
          score = maxQScore;
          comment = '填空题答案正确！';
        } else {
          gradedByAI = true;
        }
      } else {
        gradedByAI = true;
      }

      if (gradedByAI) {
        try {
          const prompt = getGradePrompt(q.question, studentAns, standardAns, maxQScore, q.explanation, grade);
          const response = await fetchWithKeyRotation(buildChatURL, {
            method: 'POST',
            profileId,
            headers: getClientAiHeaders(req),
            body: JSON.stringify({
              contents: [{ parts: [{ text: prompt }] }],
              generationConfig: {
                temperature: 0.1,
                maxOutputTokens: 1024,
                responseMimeType: 'application/json',
                thinkingConfig: { thinkingBudget: 0 }
              }
            })
          }, 3, 25000);

          const data = await response.json();
          const text = extractLlmText(data);
          const parsed = extractAndParseJson(text);
          if (parsed && typeof parsed.score === 'number') {
            score = Math.max(0, Math.min(maxQScore, Math.round(parsed.score)));
            comment = parsed.comment || '已完成智能步步批改。';
            parsedStep = parsed.step_breakdown || null;
          } else {
            throw new Error('No valid JSON found in grade response');
          }
        } catch (err) {
          const errMsg = String(err?.message || '');
          logger.warn(`Failed to grade question ${q.id} with AI, marking as pending manual review:`, errMsg);
          needsManualReview = true;
          score = 0;
          if (/NO_API_KEY|API Key|missing key|未配置/i.test(errMsg)) {
            comment = '【待复核】未检测到可用 AI 批改密钥，本题暂未计分，请配置密钥后重批或对照下方标准解析自评。';
          } else if (/429|QUOTA_EXHAUSTED|rate limit/i.test(errMsg)) {
            comment = '【待复核】云端批改引擎当前限流繁忙，本题暂未计分（非作答错误），请对照下方标准解析核对步骤或稍后重试。';
          } else {
            comment = '【待复核】云端批改响应超时或解析波动，本题暂未计分（非作答错误），请对照下方标准解析自查订正。';
          }
        }
      }

      return {
        id: q.id,
        type: q.type,
        question: q.question,
        score,
        maxScore: maxQScore,
        needsManualReview,
        studentAnswer: studentAns,
        standardAnswer: standardAns,
        explanation: q.explanation,
        comment,
        step_breakdown: buildStructuredBreakdown(parsedStep, score, maxQScore)
      };
    };

    // 受控并发批卷（并发度 4），大幅压缩多主观题批改耗时防 120s 超时
    const results = [];
    const CONCURRENCY = 4;
    for (let i = 0; i < questions.length; i += CONCURRENCY) {
      const batch = questions.slice(i, i + CONCURRENCY);
      const batchResults = await Promise.all(batch.map(gradeSingleQuestion));
      results.push(...batchResults);
    }

    const totalScore = results.reduce((sum, r) => sum + (Number(r.score) || 0), 0);
    const maxTotalScore = results.reduce((sum, r) => sum + (Number(r.maxScore) || 0), 0) || 150;

    // 生成整卷评语
    const studentName = (student_name && String(student_name).trim()) || '同学';
    const questionsReport = results.map(r => `题号${r.id} (${r.type === 'choice' ? '选择' : r.type === 'blank' ? '填空' : '简答'}): 满分${r.maxScore}分，学生得${r.score}分。评语：${r.comment}`).join('\n');
    const reportPrompt = getOverallReportPrompt(studentName, totalScore, questionsReport, maxTotalScore);
    
    const pendingReviewCount = results.filter(r => r.needsManualReview).length;
    let overallComment = pendingReviewCount > 0
      ? `${studentName}同学，本次已批改得分 ${totalScore} / ${maxTotalScore} 分（另有 ${pendingReviewCount} 道主观题因云端批改繁忙暂标为【待复核】，请对照标准解析自查加分）。`
      : `${studentName}同学，你本次获得了 ${totalScore} / ${maxTotalScore} 分。请对照错题解析查漏补缺，继续加油！`;
    try {
      const reportResponse = await fetchWithKeyRotation(buildChatURL, {
        method: 'POST',
        profileId,
        headers: getClientAiHeaders(req),
        body: JSON.stringify({
          contents: [{ parts: [{ text: reportPrompt }] }],
          generationConfig: {
            temperature: 0.5,
            maxOutputTokens: 1024,
            thinkingConfig: { thinkingBudget: 0 }
          }
        })
      }, 2, 20000);
      const reportData = await reportResponse.json();
      overallComment = extractLlmText(reportData) || overallComment;
    } catch (err) {
      logger.warn('Failed to generate overall report with AI:', err.message);
    }

    res.json({
      score: totalScore,
      totalMaxScore: maxTotalScore,
      pendingReviewCount,
      overallComment,
      results
    });
  } catch (e) {
    logger.error('Grade Test Paper Error:', e);
    if (e.message === 'QUOTA_EXHAUSTED') {
      return res.status(429).json({ error: '今日额度已用完' });
    }
    res.status(500).json({ error: '批改试卷失败', details: NODE_ENV === 'development' ? e.message : undefined });
  }
});

/**
 * POST /api/test-paper/generate-from-mistakes
 * 错题驱动的靶向变式巩固试卷全自动生成引擎
 */
router.post('/test-paper/generate-from-mistakes', requireQuotaOrVip('test_paper_mistakes'), async (req, res) => {
  try {
    const {
      profile_id = 'default',
      subject = '数学',
      grade = '7_up',
      student_name = '同学',
      mistake_ids = null,
      limit = 4
    } = req.body;

    const authCheck = resolveAuthorizedProfileId(req, profile_id);
    if (!authCheck.ok) return res.status(authCheck.status || 403).json({ error: authCheck.error });
    const targetPid = authCheck.profileId;

    const sqliteDb = getSqliteDb();
    if (!sqliteDb) {
      return res.status(503).json({ error: '数据库未就绪' });
    }

    let mistakes = [];
    if (Array.isArray(mistake_ids) && mistake_ids.length > 0) {
      const placeholders = mistake_ids.map(() => '?').join(',');
      mistakes = await sqliteDb.all(
        `SELECT * FROM mistakes WHERE profile_id = ? AND id IN (${placeholders})`,
        [targetPid, ...mistake_ids]
      );
    } else {
      mistakes = await sqliteDb.all(
        'SELECT * FROM mistakes WHERE profile_id = ? AND (subject = ? OR ? = "") ORDER BY timestamp DESC LIMIT ?',
        [targetPid, subject, subject, Math.min(Math.max(1, parseInt(limit, 10) || 4), 10)]
      );
    }

    if (!mistakes || mistakes.length === 0) {
      return res.status(400).json({
        error: '当前暂无待订正错题，无法生成靶向变式卷。请先在作业批改中拍照批改或在错题本中添加错题！'
      });
    }

    const decryptedMistakes = mistakes.map(m => ({
      id: m.id,
      query: decryptField(m.query),
      answer: decryptField(m.answer),
      reason: decryptField(m.reason),
      grade: m.grade || grade,
      subject: m.subject || subject
    }));

    // 1. GraphRAG 知识图谱根因诊断
    const diagnoses = [];
    for (const m of decryptedMistakes) {
      const diagText = `${m.query} ${m.reason || ''}`;
      const diag = diagnosePrerequisiteKnowledge(diagText, m.subject || subject);
      if (diag) {
        diagnoses.push(diag);
      }
    }

    const primaryDiagnosis = diagnoses[0] || null;
    const graphSection = primaryDiagnosis ? formatGraphRAGPromptSection(primaryDiagnosis) : '';

    // 2. 匹配 481 道权威真题母题库
    const canonicalHints = [];
    for (const m of decryptedMistakes.slice(0, 3)) {
      try {
        const match = await lookupCanonicalQuestion(m.query, grade, subject, sqliteDb);
        if (match && match.matched && match.canonical) {
          canonicalHints.push(match.canonical);
        }
      } catch (err) {
        // ignore lookup warning
      }
    }

    // 3. 构建大模型提示词
    const mistakesSummary = decryptedMistakes.map((m, idx) => 
      `错题${idx + 1}：${m.query} (学生原错因：${m.reason || '未标注'})`
    ).join('\n');

    const canonicalSummary = canonicalHints.length > 0
      ? `\n【参考权威教材母题标准题型】：\n` + canonicalHints.map((c, i) => `母题${i+1} [${c.chapter || '经典考点'}]: ${c.question}\n标答: ${c.standard_answer}`).join('\n')
      : '';

    const prompt = `你是一位精通中小学教学与学情溯源的特级教研员。
请根据学生【${student_name}】近期在【${subject}】(${grade})中出现的真实错题，以及系统知识图谱的底层根因诊断，为该生定制一份满分 100 分、建议用时 45 分钟的【靶向溯源变式巩固试卷】。

【真实错题集】：
${mistakesSummary}
${graphSection}
${canonicalSummary}

【试卷结构与出题准则】（必须严格遵守 100 分制结构）：
1. 试卷题目总共 6 道题，分为三大部分：
   - 第一部分：前置概念基础保底题（1道题，15分，题号1）：
     * 必须专门考查导致学生出错的【底层前驱根因概念】（让学生在最底层概念上建立信心）。
   - 第二部分：同构变式强化题（3道题，题号2、3、4，每题15分，共45分）：
     * 题号2为选择题（A/B/C/D，15分）
     * 题号3为填空题（15分）
     * 题号4为计算/分析题（15分）
     * 必须与学生的错题考点高度同构，更换数字、背景或未知数，考查举一反三能力。
   - 第三部分：中考/期末综合压轴拓展题（2道题，题号5、6，每题20分，共40分）：
     * 题号5为综合解答题（20分）
     * 题号6为拓展探究题（20分）
     * 考查知识点的综合迁移与逆向思维。
2. 所有选择题必须提供 4 个选项（包含在 options 数组中，如 ["A. ...", "B. ...", "C. ...", "D. ..."]），answer 只能是 "A"、"B"、"C" 或 "D"。
3. 填空题 answer 必须是精准数值或简洁表达式。
4. 每道题都必须提供详尽的名师解析 explanation，指出解题突破口。

请严格返回如下 JSON 结构（严禁包含额外文字）：
{
  "title": "【${student_name}】专属靶向溯源巩固卷",
  "subtitle": "针对薄弱知识点靶向查漏补缺",
  "subject": "${subject}",
  "grade": "${grade}",
  "duration": 45,
  "totalScore": 100,
  "rootCauseTopic": "${primaryDiagnosis?.rootCauseNode?.name || '基础综合概念'}",
  "teacherAdvice": "先完成第1题概念自测，遇到变式题注意类比错题的解题规律。",
  "questions": [
    {
      "id": 1,
      "type": "blank",
      "category": "prerequisite_grounding",
      "question": "题目具体内容",
      "score": 15,
      "answer": "标准答案",
      "explanation": "名师解析"
    },
    {
      "id": 2,
      "type": "choice",
      "category": "isomorphic_variant",
      "question": "题目具体内容",
      "options": ["A. 选项1", "B. 选项2", "C. 选项3", "D. 选项4"],
      "score": 15,
      "answer": "A",
      "explanation": "名师解析"
    },
    {
      "id": 3,
      "type": "blank",
      "category": "isomorphic_variant",
      "question": "题目具体内容",
      "score": 15,
      "answer": "标准答案",
      "explanation": "名师解析"
    },
    {
      "id": 4,
      "type": "essay",
      "category": "isomorphic_variant",
      "question": "题目具体内容",
      "score": 15,
      "answer": "标准步骤与结果",
      "explanation": "名师解析"
    },
    {
      "id": 5,
      "type": "essay",
      "category": "advanced_extension",
      "question": "题目具体内容",
      "score": 20,
      "answer": "标准推导与答案",
      "explanation": "名师解析"
    },
    {
      "id": 6,
      "type": "essay",
      "category": "advanced_extension",
      "question": "题目具体内容",
      "score": 20,
      "answer": "标准推导与答案",
      "explanation": "名师解析"
    }
  ]
}`;

    const response = await fetchWithKeyRotation(buildChatURL, {
      method: 'POST',
      profileId: targetPid,
      headers: getClientAiHeaders(req),
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: 'application/json',
          temperature: 0.4,
          maxOutputTokens: 4096,
          thinkingConfig: { thinkingBudget: 0 }
        }
      })
    }, 4, 45000);

    const data = await response.json();
    const rawText = extractLlmText(data);
    if (!rawText) {
      throw new Error('LLM 未返回有效试卷数据');
    }

    const testPaper = extractAndParseJson(rawText);
    if (!testPaper || !Array.isArray(testPaper.questions)) {
      throw new Error('生成的试卷格式不完整');
    }

    res.json({
      success: true,
      testPaper,
      diagnoses,
      mistakesCount: decryptedMistakes.length
    });
  } catch (e) {
    logger.error('Generate Test Paper From Mistakes Error:', e);
    if (e.message === 'QUOTA_EXHAUSTED') {
      return res.status(429).json({ error: '今日额度已用完' });
    }
    res.status(500).json({ error: '生成靶向变式试卷失败', details: NODE_ENV === 'development' ? e.message : undefined });
  }
});

// POST /api/printer/print-ipp
// LAN network printer direct raw/IPP socket dispatch
router.post('/printer/print-ipp', async (req, res) => {
  try {
    const isAdmin = await isVerifiedAdminRequest(req);
    const hasFamilyAuth = Boolean(req.auth?.activeProfileId && req.auth.activeProfileId !== 'default');
    const isCloudHosted = Boolean(process.env.K_SERVICE || process.env.CLOUD_RUN_JOB);

    if (isCloudHosted && !req.body?.mock) {
      return res.status(400).json({
        error: '云端托管服务无法直连您家中的内网打印机，请点击「浏览器打印 / 存 PDF」直接调用本机或无线打印机。',
        code: 'ERR_CLOUD_LAN_PRINTER_UNREACHABLE'
      });
    }

    if (!isAdmin && !hasFamilyAuth) {
      return res.status(403).json({ error: '出于网络安全防护，局域网直连打印仅限已登录家庭用户或管理员在内网部署环境调用' });
    }

    const {
      host = '192.168.1.200',
      port = 9100,
      title = '名师专属微测试卷',
      studentName = '同学',
      grade = '7_up',
      subject = '数学',
      questions = [],
      printMode = 'blank_student',
      mock = false
    } = req.body;

    if (!questions || !Array.isArray(questions) || questions.length === 0) {
      return res.status(400).json({ error: '试卷题目列表不能为空' });
    }

    const printableText = formatExamForPrinter({
      title,
      studentName,
      grade,
      subject,
      questions,
      printMode
    });

    const printResult = await sendToNetworkPrinter({
      host,
      port: parseInt(port, 10) || 9100,
      data: printableText,
      mock: !!mock
    });

    res.json({
      success: true,
      message: printResult.message,
      simulated: !!printResult.simulated,
      bytesSent: printResult.bytesSent
    });
  } catch (err) {
    logger.error('[PrinterRoute] Direct print error:', err);
    res.status(500).json({ error: NODE_ENV === 'development' ? err.message : '网络打印调度失败，请检查打印机状态' });
  }
});

router.assembleReliableExamPaper = assembleReliableExamPaper;
router.getExamDuration = getExamDuration;

module.exports = router;
