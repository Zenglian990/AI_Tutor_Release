const fs = require('fs');
const path = require('path');

const GRADE_ALIASES = {
  '7': ['初一'], '8': ['初二'], '9': ['初三']
};

let templates = {};
try {
  const filePath = path.join(__dirname, 'templates', 'system_guidelines.txt');
  if (fs.existsSync(filePath)) {
    const content = fs.readFileSync(filePath, 'utf8');
    const sections = content.split(/===\s*([A-Z0-9_]+)\s*===/g);
    for (let i = 1; i < sections.length; i += 2) {
      const name = sections[i].trim();
      const body = sections[i + 1] ? sections[i + 1].trim() : '';
      templates[name] = body;
    }
  }
} catch (err) {
  console.error('Failed to load system_guidelines.txt, using in-memory fallbacks', err);
}

const FALLBACK_SYSTEM_GUIDELINES = {
  BASE_GUIDELINE: `1. 优先使用资料库内容：如果参考资料中有相关内容，请严格基于资料回答，并清晰标注引用来源（格式：[来源名] 第 X 页）。
2. LaTeX 公式排版规范：为了保证在客户端美观渲染，所有数学、理化公式必须使用 LaTeX 格式输出。行内公式必须使用 \\(...\\) 括起来，独立行公式（如定理、推导式、复杂方程）必须使用 \\[...\\] 括起来。绝对不能使用单个 $ 或双个 $$ 符号，也绝对不要使用 HTML 或纯文本等式写法。
3. Markdown 表格规范：展示结构化数据、对比参数或矩阵信息时，请务必使用 Markdown 表格形式，并保证对齐美观。`,
  GRADE_1_3: `2. 场景化与比喻：用 7-9 岁儿童能听懂的生活场景和生动的比喻来解释概念（比如把加减法比作分糖果、魔法水晶）。
3. 篇幅极简与视觉化：文字必须非常少，排版高频使用丰富生动的 Emoji 🎈🌟，绝对不要长篇大论。
4. 极度鼓励与陪伴：语气要非常温柔、活泼，把学习包装为“闯关游戏”，高频夸奖孩子，激发并保护他们的学习兴趣。`,
  GRADE_4_6: `2. 启发与探究：减少过度幼稚的比喻，开始像一个聪明的探险向导一样，引导孩子自己发现规律。
3. 循序渐进：不要直接给结论，多问“你觉得为什么会这样呢？”或“如果把这个条件换一下会发生什么？”
4. 习惯养成：在回答后，鼓励孩子自己总结刚学到的知识，培养良好的独立思考和总结习惯。`,
  GRADE_7_9: `2. 极致逻辑与学霸导师：收敛多余情绪，语气严谨专业且极具条理（像一个顶尖的学霸导师）。必须且只能严格按照以下 Markdown 四大模块格式结构输出：
   ### 💡【解题核心思路】
   [用一句话高度概括和提炼该题或该知识点的核心突破口与解题钥匙]
   
   ### 📝【步骤拆解】
   [严密且逻辑完整的推导或解答步骤。涉及所有公式和理化符号时，必须严格使用 LaTeX 格式（行内 \\(...\\) 或行间 \\[...\\]）进行包裹。]
   
   ### 🎯【核心考点】
   [指出本题或本知识点在中考或期末考试中对应的大纲考点和考察方向]
   
   ### ⚠️【易错陷阱】
   [警示学生在该考点下最容易犯的思维盲区、丢分习惯或出题坑点]
3. 思维导图强制渲染：只要提问涉及复杂的概念关系、公式推导关联、实验流程或系统结构，请务必使用 Markdown 的 \`\`\`mermaid 代码块（使用 mindmap 或 graph TD）画出结构清晰的思维脑图，以便学生结构化记忆。
4. 在推导或解答步骤中，请穿插亲切自然的学霸式口语化过渡说明（如“我们通过通分来化简这个常数项”、“注意这里需要提取二次项系数a”等），以便于理解并防止由于公式堆叠触发系统的重复/抄袭内容拦截限制。`,
  GRADE_DEFAULT: `2. 通俗易懂：用大白话解释复杂概念，循序渐进地引导学生思考。
3. 知识延伸：适度扩展相关的考点或易错点，帮助举一反三。
4. 鼓励式教学：语气要温和，多鼓励学生提问。
5. 思维导图可视化：遇到复杂逻辑时，请用 \`\`\`mermaid 画出思维导图。`,
  SOCRATIC_STRICT: `【严格苏格拉底启发模式】：绝对不要直接给出最终答案！请像苏格拉底一样，仅通过连续的反问和启发式提问，引导学生自己发现答案。`,
  SOCRATIC_GUIDED: `【引导式教学模式】：先给出解题思路或第一步提示，如果学生仍困惑，再逐步给出更多提示，最终一起得出结论。`,
  SOCRATIC_DIRECT: `【直接教学模式】：给出清晰完整的解答，但在末尾附加思考题引导探索。`
};

function getTemplateValue(key) {
  return templates[key] || FALLBACK_SYSTEM_GUIDELINES[key] || '';
}

let chapterIntroTemplate = '';
try {
  const filePath = path.join(__dirname, 'templates', 'chapter_intro.txt');
  if (fs.existsSync(filePath)) {
    chapterIntroTemplate = fs.readFileSync(filePath, 'utf8');
  }
} catch (err) {
  console.error('Failed to load chapter_intro.txt, using in-memory fallback', err);
}

const FALLBACK_CHAPTER_INTRO = `你是一位富有智慧的 AI 专属私教导师。学生正在点击学习地图中的关卡，准备主动开始学习：
章节名称：《{{chapterName}}》
当前学生状态：【{{gradeStr}}】【{{subjectStr}}】

这是该关卡的第一阶段【25%：新知导读与热身】。
请你为他/她提供本章节的【主动伴读指引】：
1. 【本章核心奥秘】：用极具吸引力的语言描述本章讲了什么，需要掌握的核心要点。如果参考资料里有内容，请直接利用参考资料讲解！
2. 【关卡里程碑说明】：告诉学生我们会分四步完成本章探索：
   - ⛳ 25%：新知导读与热身（当前）
   - ⚔️ 50%：概念闯关实践（互动练习）
   - 📝 75%：思维脑图与错题闭环（巩固拔高）
   - 🏆 100%：单元终极通关（获得小星星）
3. 【苏格拉底式趣味提问】：为了检测孩子本章节的理解基础，请结合教材知识点，设计【1个极具启发性的探究式提问】，不要给答案，引导他们输入回答来进入下阶段。

【极其重要要求】：
- 语气必须完美贴合年级特点：1-3年级要求温柔童趣、多Emoji；4-6年级要求启发探究；初一到初三要求专业严谨、逻辑感强、亦师亦友。
- 如果需要，请画出思维导图或示意图。
- 篇幅不要太冗长，要循循善诱，给他们极强的探索欲！

参考资料内容：
{{contextString}}`;

function fillTemplate(template, data) {
  let result = template;
  for (const [key, val] of Object.entries(data)) {
    result = result.split(`{{${key}}}`).join(val);
  }
  return result;
}

function formatGradeName(grade) {
  if (!grade) return '未知年级';
  const parts = String(grade).split('_');
  const num = parts[0];
  const vol = parts[1] === 'up' ? '上册' : (parts[1] === 'down' ? '下册' : '');
  const baseGrade = GRADE_ALIASES[num] ? GRADE_ALIASES[num][0] : `${num}年级`;
  return `${baseGrade}${vol}`;
}

function getPromptGuidelines(grade, socratic) {
  let base = getTemplateValue('BASE_GUIDELINE') + '\n';

  const gradeNum = grade ? parseInt(String(grade).split('_')[0]) : 0;

  if (gradeNum >= 1 && gradeNum <= 2) {
    base += getTemplateValue('GRADE_1_3'); // 1-2年级保持温柔童趣伴读模式
  } else if (gradeNum >= 3 && gradeNum <= 9) {
    base += getTemplateValue('GRADE_7_9'); // 3-9年级升级为极致逻辑与中考学霸导师模式
  } else {
    base += getTemplateValue('GRADE_DEFAULT');
  }

  // Three-level Socratic teaching mode
  if (socratic === 'strict') {
    base += `\n\n` + getTemplateValue('SOCRATIC_STRICT');
  } else if (socratic === 'guided' || socratic === true) {
    base += `\n\n` + getTemplateValue('SOCRATIC_GUIDED');
  } else {
    base += `\n\n` + getTemplateValue('SOCRATIC_DIRECT');
  }

  return base;
}

/**
 * Validate that a value is a known safe grade/subject identifier.
 * Returns null if the value doesn't match expected patterns.
 */
function validateGradeIdentifier(raw) {
  if (!raw) return null;
  const str = String(raw).trim();
  // Only allow known patterns: e.g. "3_up", "7_down", "5"
  if (/^[1-9](?:_(?:up|down))?$/.test(str)) {
    return str;
  }
  return null;
}

function buildLanceDBWhereClause(grade, subject, edition) {
  const conditions = [];

  // Strict whitelist for subject filtering to completely block SQL injection
  const SUBJECT_MAP = {
    '语文': ['语文', 'Chinese'],
    '数学': ['数学', 'Math'],
    '英语': ['英语', 'English'],
    '物理': ['物理', 'Physics'],
    '化学': ['化学', 'Chemistry'],
    // '生物学' is a subset of '生物' — '%生物%' already matches '生物学' filenames
    '生物': ['生物学', '生物', 'Biology'],
    '生物学': ['生物学', '生物', 'Biology'],
    '历史': ['历史', 'History'],
    '地理': ['地理', 'Geography'],
    '政治': ['政治', '思想品德', '道德与法治', 'Politics'],
    '道德与法治': ['道德与法治', '政治', 'Politics'],
    '科学': ['科学', 'Science'],
    // '体育与健康' contains '体育' — '%体育%' already matches both
    '体育': ['体育与健康', '体育', 'Physical Education', 'PE'],
    '体育与健康': ['体育与健康', '体育', 'Physical Education', 'PE']
  };

  if (subject && SUBJECT_MAP[subject]) {
    const aliases = SUBJECT_MAP[subject];
    const subjectConditions = aliases.map(alias => `source LIKE '%${alias}%'`);
    conditions.push(`(${subjectConditions.join(' OR ')})`);
  }

  // Grade filter — derive from strictly validated grade identifier
  if (grade) {
    const validGrade = validateGradeIdentifier(grade);
    let gradeNum = null;
    let volume = null;

    if (validGrade) {
      if (validGrade.includes('_')) {
        const parts = validGrade.split('_');
        gradeNum = parseInt(parts[0]);
        volume = parts[1];
      } else {
        gradeNum = parseInt(validGrade);
      }
    } else {
      // Fallback: try to parse numeric prefix only if it is a single digit (1-9)
      const match = String(grade).match(/^([1-9])/);
      if (match) gradeNum = parseInt(match[1]);
    }

    if (gradeNum && gradeNum >= 1 && gradeNum <= 9) {
      const gradeConditions = [];
      const numToWords = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九'];
      const word = numToWords[gradeNum];

      // Exact match for the grade in the filename to avoid over-broad matching (e.g. '%初中%')
      gradeConditions.push(`source LIKE '%${word}年级%'`);
      gradeConditions.push(`source LIKE '%${gradeNum}年级%'`);

      if (gradeNum === 7) {
        gradeConditions.push(`source LIKE '%初一%'`, `source LIKE '%初中一年级%'`);
        // Exception for Human Geography (人文地理) which has no grade in filename
        gradeConditions.push(`source LIKE '%人文地理上册%'`);
      } else if (gradeNum === 8) {
        gradeConditions.push(`source LIKE '%初二%'`, `source LIKE '%初中二年级%'`);
        // Exception for Human Geography (人文地理)
        gradeConditions.push(`source LIKE '%人文地理下册%'`);
      } else if (gradeNum === 9) {
        gradeConditions.push(`source LIKE '%初三%'`, `source LIKE '%初中三年级%'`);
      }

      let gradeClause = `(${gradeConditions.join(' OR ')})`;

      // Precise volume matching (with support for full-year volumes)
      const volChar = volume === 'up' ? '上' : (volume === 'down' ? '下' : '');
      if (volChar) {
        conditions.push(`(${gradeClause} AND (source LIKE '%${volChar}册%' OR source LIKE '%全一册%'))`);
      } else {
        conditions.push(gradeClause);
      }
    }
  }

  // Edition filter — isolate different textbook publishers
  if (edition) {
    if (edition === '西南大学版') {
      conditions.push(`source LIKE '%西南大学版%'`);
      if (grade) {
        const validGrade = validateGradeIdentifier(grade);
        if (validGrade === '3_down') {
          conditions.push(`source LIKE '%2024新版%'`);
        } else {
          conditions.push(`source NOT LIKE '%2024新版%'`);
        }
      }
    } else if (edition === '西师大版' || edition === '西南师大版') {
      conditions.push(`source LIKE '%西南师大版%'`);
    } else if (edition === '人教版' || edition === 'PEP') {
      conditions.push(`(source NOT LIKE '%西南%' AND source NOT LIKE '%西师%')`);
    }
  }

  return conditions.length > 0 ? conditions.join(' AND ') : '';
}

function getChatPrompt(query, contextData, history = [], grade, subject, socratic) {
  let contextString = contextData.map((c, i) =>
    `参考资料 ${i + 1}: [${c.source}] 第 ${c.page} 页\n${c.text ? c.text.substring(0, 800) : ''}`
  ).join('\n\n');

  const contextSection = contextData.length > 0
    ? `参考资料内容：\n${contextString}`
    : `【注意：课本资料库中暂未搜索到强相关内容。请基于你的专业通识知识库，给出一个通俗易懂的解答，绝不能直接拒绝回答。】`;

  const slicedHistory = Array.isArray(history) ? history.slice(-10) : [];
  const historySection = slicedHistory.length > 0
    ? "\n对话历史:\n" + slicedHistory.map(h => `${h.role === 'user' ? '学生' : '老师'}: ${h.text}`).join('\n') + "\n"
    : "";

  const guidelines = getPromptGuidelines(grade, socratic);
  const gradeStr = formatGradeName(grade);
  const subjectStr = subject || '未知学科';

  return `你是一位耐心且专业的 AI 助教。
当前学生的学习状态：【${gradeStr}】【${subjectStr}】。请直接针对该年级和学科进行专属解答，绝不要再说"没有具体说明年级或学科"。

回复准则：
${guidelines}

${historySection}
${contextSection}

学生提问：
${query}
`;
}

function getChapterStartPrompt(chapterName, results, grade, subject) {
  let contextString = results.map((c, i) =>
    `参考资料 ${i + 1}: [${c.source}] 第 ${c.page} 页\n${c.text ? c.text.substring(0, 800) : ''}`
  ).join('\n\n');

  let gradeStr = '未知年级';
  if (grade) {
    const rawGrade = String(grade).split('_')[0];
    gradeStr = GRADE_ALIASES[rawGrade] ? GRADE_ALIASES[rawGrade][0] : `${rawGrade}年级`;
  }
  const subjectStr = subject || '未知学科';

  const template = chapterIntroTemplate || FALLBACK_CHAPTER_INTRO;

  return fillTemplate(template, {
    chapterName,
    gradeStr,
    subjectStr,
    contextString
  });
}

/**
 * 物理印刷页脚折算与名称净化工具
 * @param {string} sourceName 
 * @param {number|bigint} pageNum 
 */
function correctPageOffset(sourceName, pageNum) {
  if (!pageNum) return { source: sourceName, page: pageNum };
  const page = typeof pageNum === 'bigint' ? Number(pageNum) : Number(pageNum);
  if (isNaN(page)) return { source: sourceName, page: pageNum };

  // 判断是否为初中教材（初一/初二/初三/七年级/八年级/九年级/g7/g8/g9）
  const sourceLower = String(sourceName).toLowerCase();
  const isJuniorHigh = sourceLower.includes('初') || 
                       sourceLower.includes('七年级') || 
                       sourceLower.includes('八年级') || 
                       sourceLower.includes('九年级') ||
                       sourceLower.includes('g7') ||
                       sourceLower.includes('g8') ||
                       sourceLower.includes('g9');

  const offset = isJuniorHigh ? 6 : 5;
  const physicalPage = page > offset ? page - offset : page;
  
  // 去除 .pdf 后缀名
  const cleanSource = sourceName.replace(/\.pdf$/i, '');

  return {
    source: cleanSource,
    page: physicalPage
  };
}

module.exports = {
  getPromptGuidelines,
  buildLanceDBWhereClause,
  getChatPrompt,
  getChapterStartPrompt,
  formatGradeName,
  GRADE_ALIASES,
  correctPageOffset,
};
