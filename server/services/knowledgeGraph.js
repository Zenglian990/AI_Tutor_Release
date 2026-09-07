/**
 * knowledgeGraph.js
 * 
 * K-9 Cross-Grade Knowledge Dependency Graph & GraphRAG Root-Cause Diagnosis
 * Provides prerequisite tracing for mathematics, physics, chemistry, and language arts.
 */

const KNOWLEDGE_GRAPH = {
  // === 数学学科 (小学到初中核心知识链) ===
  'math_fraction_add_sub': {
    id: 'math_fraction_add_sub',
    name: '分数的加法和减法',
    subject: '数学',
    grade: '5_down',
    keywords: ['异分母分数', '同分母分数', '分数加减', '通分加减'],
    prerequisites: ['math_lcm_gcd', 'math_fraction_basic'],
    coreRule: '同分母分数相加减，分母不变，分子相加减；异分母分数相加减，必须先通分化为同分母分数后再计算。',
    commonMistake: '容易直接把分子加分子、分母加分母（如 1/2 + 1/3 误算为 2/5）。'
  },
  'math_lcm_gcd': {
    id: 'math_lcm_gcd',
    name: '最大公因数与最小公倍数',
    subject: '数学',
    grade: '5_down',
    keywords: ['公因数', '公倍数', '最小公倍数', '短除法'],
    prerequisites: ['math_multiplication_division'],
    coreRule: '求几个数的最小公倍数，通常用短除法或分解质因数法，包含所有公有质因数和独有质因数的乘积。',
    commonMistake: '找最小公倍数时与最大公因数混淆，或者漏乘各自独有的因数。'
  },
  'math_fraction_basic': {
    id: 'math_fraction_basic',
    name: '分数的意义和基本性质',
    subject: '数学',
    grade: '5_down',
    keywords: ['分数的意义', '分数的基本性质', '约分', '通分'],
    prerequisites: ['math_division_basic'],
    coreRule: '分数的分子和分母同时乘或除以相同的数（0除外），分数的大小不变。',
    commonMistake: '分子乘了一个数，分母忘记乘；或者分母加上一个数，以为分数大小不变。'
  },
  'math_division_basic': {
    id: 'math_division_basic',
    name: '除法的初步认识与表内除法',
    subject: '数学',
    grade: '2_down',
    keywords: ['平均分', '表内除法', '有余数的除法', '乘法口诀求商'],
    prerequisites: ['math_multiplication_division'],
    coreRule: '把一些物品平均分成几份，求每份是多少用除法计算。余数必须严格小于除数！',
    commonMistake: '计算有余数除法时，余数等于或大于除数（如 14 ÷ 3 商 3 余 5，没有除尽）。'
  },
  'math_rational_operations': {
    id: 'math_rational_operations',
    name: '有理数四则运算与去括号',
    subject: '数学',
    grade: '7_up',
    keywords: ['有理数加减', '负数运算', '乘方', '去括号法则', '符号法则'],
    prerequisites: ['math_negative_numbers'],
    coreRule: '同号相加取相同符号并绝对值相加；异号相加取绝对值较大者的符号并大减小。括号前是负号，去括号后括号内各项必须全变号！',
    commonMistake: '去括号时漏变某一项的符号（如 -(a - b) 误写成 -a - b），或者乘法负负得正搞混。'
  },
  'math_negative_numbers': {
    id: 'math_negative_numbers',
    name: '正数和负数及数轴概念',
    subject: '数学',
    grade: '7_up',
    keywords: ['正数', '负数', '绝对值', '相反数', '数轴'],
    prerequisites: ['math_multiplication_division'],
    coreRule: '0既不是正数也不是负数。数轴上左边的数总比右边的数小。负数的绝对值是它的相反数。',
    commonMistake: '误认为带负号的字母一定是负数（例如认为 -a 一定小于 0）。'
  },
  'math_linear_equation_one': {
    id: 'math_linear_equation_one',
    name: '一元一次方程',
    subject: '数学',
    grade: '7_up',
    keywords: ['一元一次方程', '解方程', '移项', '去分母'],
    prerequisites: ['math_rational_operations', 'math_algebraic_expression'],
    coreRule: '解方程五部曲：去分母、去括号、移项、合并同类项、系数化为1。移项必须变号！',
    commonMistake: '移项忘记变号，或者去分母时没有分母的整数项漏乘公分母。'
  },
  'math_algebraic_expression': {
    id: 'math_algebraic_expression',
    name: '整式的加减与合并同类项',
    subject: '数学',
    grade: '7_up',
    keywords: ['同类项', '合并同类项', '整式加减', '多项式'],
    prerequisites: ['math_rational_operations'],
    coreRule: '所含字母相同，并且相同字母的指数也分别相同的项叫做同类项。合并同类项只把系数相加减，字母和指数不变。',
    commonMistake: '合并同类项时把字母的指数也加在一起（如 2x + 3x 误写成 5x²）。'
  },
  'math_polynomial_multiplication': {
    id: 'math_polynomial_multiplication',
    name: '整式的乘法与乘法公式',
    subject: '数学',
    grade: '7_down',
    keywords: ['整式乘法', '平方差公式', '完全平方公式', '单项式乘多项式'],
    prerequisites: ['math_algebraic_expression'],
    coreRule: '平方差公式：(a+b)(a-b) = a² - b²；完全平方公式：(a±b)² = a² ± 2ab + b²（注意中间有双倍乘积项！）。',
    commonMistake: '完全平方公式漏掉中间项 2ab（误写成 (a+b)² = a² + b²）。'
  },
  'math_factorization': {
    id: 'math_factorization',
    name: '因式分解',
    subject: '数学',
    grade: '8_up',
    keywords: ['因式分解', '提公因式法', '公式法', '十字相乘'],
    prerequisites: ['math_polynomial_multiplication'],
    coreRule: '因式分解必须进行到每一个因式都不能再分解为止。提公因式要提彻底，提负号后各项全变号。',
    commonMistake: '分解不彻底（如将 x⁴ - 16 仅分解为 (x²+4)(x²-4)，漏分第二项），或公因式包含负号时符号混淆。'
  },
  'math_square_root': {
    id: 'math_square_root',
    name: '平方根与二次根式',
    subject: '数学',
    grade: '8_up',
    keywords: ['平方根', '算术平方根', '立方根', '二次根式', '根号'],
    prerequisites: ['math_rational_operations'],
    coreRule: '正数有两个互为相反数的平方根；0的平方根是0；负数在实数范围内没有平方根。算术平方根具有双重非负性：√a ≥ 0 (a ≥ 0)。',
    commonMistake: '混淆“平方根”（两个值 ±√a）与“算术平方根”（非负值 √a）。'
  },
  'math_pythagorean': {
    id: 'math_pythagorean',
    name: '勾股定理及其逆定理',
    subject: '数学',
    grade: '8_down',
    keywords: ['勾股定理', '勾股数', '直角三角形', '斜边'],
    prerequisites: ['math_square_root', 'math_congruent_triangles'],
    coreRule: '直角三角形两直角边的平方和等于斜边的平方：a² + b² = c²。已知两边求第三边必须分清哪个是斜边，防止漏解分类讨论！',
    commonMistake: '没有明确指明直角边和斜边就直接套用公式（若题中未说c是斜边，漏掉c是直角边的情况）。'
  },
  'math_quadratic_equation': {
    id: 'math_quadratic_equation',
    name: '一元二次方程及其解法',
    subject: '数学',
    grade: '9_up',
    keywords: ['一元二次方程', '求根公式', '配方法', '判别式', '韦达定理'],
    prerequisites: ['math_factorization', 'math_square_root', 'math_linear_equation_one'],
    coreRule: '标准形式 ax² + bx + c = 0 (a≠0)。判别式 Δ = b² - 4ac。求根公式 x = [-b ± √(b²-4ac)] / (2a)。优先考虑因式分解法！',
    commonMistake: '方程两边同除以含有未知数的式子导致失根（如 x² = 2x 误直接除以 x 得到 x=2，丢失了 x=0 的解）。'
  },
  'math_quadratic_function': {
    id: 'math_quadratic_function',
    name: '二次函数及其图像与性质',
    subject: '数学',
    grade: '9_down',
    keywords: ['二次函数', '抛物线', '顶点坐标', '对称轴', '最大值最小值', '压轴题'],
    prerequisites: ['math_quadratic_equation', 'math_linear_function'],
    coreRule: '顶点式 y = a(x-h)² + k，顶点坐标 (h, k)，对称轴 x = h。开口方向由 a 决定。与x轴交点由判别式 Δ 决定。',
    commonMistake: '配方求顶点时提取 a 后，一次项未除以 a；对称轴公式 x = -b/(2a) 符号记错。'
  },
  'math_linear_function': {
    id: 'math_linear_function',
    name: '一次函数与平面直角坐标系',
    subject: '数学',
    grade: '8_down',
    keywords: ['一次函数', '正比例函数', '斜率k', '截距b', '坐标系'],
    prerequisites: ['math_linear_equation_one'],
    coreRule: 'y = kx + b (k≠0)。k决定函数图像的增减性和倾斜方向，b决定与y轴交点坐标(0, b)。',
    commonMistake: '混淆k与b的几何意义；待定系数法求解析式时两点坐标代入计算错误。'
  },
  'math_congruent_triangles': {
    id: 'math_congruent_triangles',
    name: '全等三角形判定与性质',
    subject: '数学',
    grade: '8_up',
    keywords: ['全等三角形', 'SSS', 'SAS', 'ASA', 'AAS', 'HL'],
    prerequisites: ['math_angle_parallel'],
    coreRule: '判定定理：SSS、SAS、ASA、AAS；直角三角形特有 HL。注意：SSA（两边及一边的对角）不能证明全等！',
    commonMistake: '误用 SSA 判定全等，或找角平分线、高线对应关系时推导断链。'
  },
  'math_angle_parallel': {
    id: 'math_angle_parallel',
    name: '相交线、平行线与角',
    subject: '数学',
    grade: '7_down',
    keywords: ['平行线性质', '同位角', '内错角', '同旁内角', '对顶角'],
    prerequisites: [],
    coreRule: '两直线平行，同位角相等，内错角相等，同旁内角互补。',
    commonMistake: '不能在复杂图形中准确找出同位角或内错角的“截线”与“被截线”。'
  },
  'math_multiplication_division': {
    id: 'math_multiplication_division',
    name: '多位数乘除法与运算法则',
    subject: '数学',
    grade: '4_up',
    keywords: ['乘法口诀', '多位数乘法', '除数是两位数的除法', '商不变性质'],
    prerequisites: [],
    coreRule: '乘除法必须严格对齐数位，不够商1要用0占位。商不变性质：被除数和除数同时乘或除以同一个非0数，商不变。',
    commonMistake: '除法竖式中中间有0的商漏写0（如 816 ÷ 4 误写成 24）。'
  },

  // === 物理学科核心知识链 ===
  'phys_buoyancy': {
    id: 'phys_buoyancy',
    name: '浮力与阿基米德原理',
    subject: '物理',
    grade: '8_down',
    keywords: ['浮力', '阿基米德原理', '排水量', '沉浮条件', '漂浮悬浮'],
    prerequisites: ['phys_liquid_pressure', 'phys_density'],
    coreRule: 'F_浮 = G_排 = ρ_液 · g · V_排。物体漂浮或悬浮时 F_浮 = G_物；下沉时 F_浮 < G_物。V_排 是浸入液体部分的体积！',
    commonMistake: '误以为密度越大的物体浮力一定大；或者漂浮时没有认清 V_排 < V_物。'
  },
  'phys_liquid_pressure': {
    id: 'phys_liquid_pressure',
    name: '液体压强与大气压强',
    subject: '物理',
    grade: '8_down',
    keywords: ['液体压强', 'p=ρgh', '大气压', '托里拆利实验', '连通器'],
    prerequisites: ['phys_density', 'phys_gravity'],
    coreRule: '液体内部压强公式 p = ρgh，其中 h 是指深度（从液面到所求点的垂直距离，而不是离容器底的高度！）。',
    commonMistake: '深度 h 误看成高度（从底部往上量），导致计算压强数值错误。'
  },
  'phys_density': {
    id: 'phys_density',
    name: '密度及其测量与计算',
    subject: '物理',
    grade: '8_up',
    keywords: ['密度', 'ρ=m/V', '天平量筒', '物质的特性'],
    prerequisites: ['math_linear_equation_one'],
    coreRule: '密度是物质本身的一种特性，与物体的质量、体积大小无关。计算公式 ρ = m / V。',
    commonMistake: '误认为由公式 ρ = m/V 可知密度与质量成正比，忽视了密度是物质固有属性。'
  },
  'phys_gravity': {
    id: 'phys_gravity',
    name: '重力与弹力及二力平衡',
    subject: '物理',
    grade: '8_down',
    keywords: ['重力', 'G=mg', '二力平衡', '牛顿第一定律', '惯性'],
    prerequisites: [],
    coreRule: 'G = mg，重力方向竖直向下。二力平衡四条件：同体、等大、反向、共线。',
    commonMistake: '将重力方向说成“垂直向下”（正确是“竖直向下”），或平衡力与相互作用力混淆。'
  },
  'phys_ohm_law': {
    id: 'phys_ohm_law',
    name: '欧姆定律与动态电路分析',
    subject: '物理',
    grade: '9_up',
    keywords: ['欧姆定律', 'I=U/R', '串联并联', '滑动变阻器', '电功率'],
    prerequisites: ['math_linear_equation_one', 'math_fraction_basic'],
    coreRule: 'I = U / R。串联电路中电流处处相等，电压按电阻正比例分配；并联电路中各支路电压相等，总电流等于各支路电流之和。',
    commonMistake: '分析滑动变阻器滑片移动时，没先画出等效电路图，电表所测对象搞错。'
  }
};

function getPrerequisites(nodeId, depth = 2, visited = new Set()) {
  const node = KNOWLEDGE_GRAPH[nodeId];
  if (!node || depth <= 0 || visited.has(nodeId)) return [];
  visited.add(nodeId);

  let result = [];
  for (const preId of node.prerequisites) {
    const preNode = KNOWLEDGE_GRAPH[preId];
    if (preNode) {
      result.push(preNode);
      if (depth > 1) {
        const subPrereqs = getPrerequisites(preId, depth - 1, visited);
        result = result.concat(subPrereqs);
      }
    }
  }
  return result;
}

function matchKnowledgeNodes(text, subject = '') {
  if (!text) return [];
  const cleanText = String(text).toLowerCase();
  const matched = [];

  for (const node of Object.values(KNOWLEDGE_GRAPH)) {
    if (subject && node.subject && !subject.includes(node.subject) && !node.subject.includes(subject)) {
      continue;
    }

    const nameMatch = cleanText.includes(node.name.toLowerCase());
    const keywordMatch = node.keywords.some(kw => cleanText.includes(kw.toLowerCase()));

    if (nameMatch || keywordMatch) {
      matched.push(node);
    }
  }

  return matched;
}

function diagnosePrerequisiteKnowledge(query, subject = '', recentWeakPoints = []) {
  let matchedNodes = matchKnowledgeNodes(query, subject);

  if (matchedNodes.length === 0 && Array.isArray(recentWeakPoints)) {
    for (const wp of recentWeakPoints) {
      const nodes = matchKnowledgeNodes(wp, subject);
      if (nodes.length > 0) {
        matchedNodes = nodes;
        break;
      }
    }
  }

  if (matchedNodes.length === 0) return null;

  const primaryNode = matchedNodes[0];
  const prereqs = getPrerequisites(primaryNode.id, 2);

  if (prereqs.length === 0) {
    return {
      currentTopic: primaryNode,
      prerequisites: [],
      hasPrerequisites: false
    };
  }

  return {
    currentTopic: primaryNode,
    prerequisites: prereqs,
    hasPrerequisites: true,
    rootCauseNode: prereqs[0]
  };
}

function formatGraphRAGPromptSection(diagnosis) {
  if (!diagnosis || !diagnosis.hasPrerequisites) return '';

  const { currentTopic, rootCauseNode } = diagnosis;
  let section = '\n【🔗 知识图谱跨学期根因穿透（GraphRAG）】\n';
  section += '- 当前涉及核心考点：【' + currentTopic.name + '】(' + currentTopic.grade + ')\n';
  section += '- 潜在前置概念断层：【' + rootCauseNode.name + '】(' + rootCauseNode.grade + ')\n';
  section += '- 根因核心法则与口诀：' + rootCauseNode.coreRule + '\n';
  section += '- 典型易错盲区警示：' + rootCauseNode.commonMistake + '\n';
  section += '- 教学引导指引：若学生在解题或推导中卡壳，请不要只在当前考点原地打转！请一语道破其底层的【' + rootCauseNode.name + '】概念断层，给出前置小锦囊或草稿纸自测，帮助学生打通因果链条！\n';

  return section;
}

module.exports = {
  KNOWLEDGE_GRAPH,
  getPrerequisites,
  matchKnowledgeNodes,
  diagnosePrerequisiteKnowledge,
  formatGraphRAGPromptSection
};
