/**
 * Pure Client-Side Offline Socratic Inference Engine (端侧纯离线四阶苏格拉底推理引擎)
 * 
 * Functions 100% locally in browser without server network or API keys.
 * Matches canonical question knowledge graphs, generates 4-stage heuristic scaffolding,
 * and dynamically adapts to the selected tutor persona (聪聪小狮子 / 智多星博士 / 晓晴学姐).
 */

export const OFFLINE_KNOWLEDGE_GRAPH = {
  dynamic_geometry: {
    name: '几何动点与函数综合探究',
    stage1: '明确动点的起点、终点、运动速度，以及运动区间的临界转折点（如顶点、折点）。',
    formulas: [
      '动点线段长度表达：\\( l(t) = v \\cdot t \\)（注意按线段所在区间分段）',
      '三角形面积：\\( S = \\frac{1}{2} \\cdot \\text{底} \\cdot \\text{高} \\)',
      '临界范围检验：确定 \\( t \\) 的取值范围 \\( 0 \\le t \\le t_{\\max} \\)'
    ],
    scaffoldQuestion: '动点在不同线段上移动时，三角形的底和高是否发生改变？请写出当前阶段动点移动的距离关于时间 t 的代数式。',
    reflection: '动点到达折点或端点时，图形面积是否存在最大值或拐点？记得检验自变量 t 的取值范围！'
  },
  quadratic_function: {
    name: '二次函数图像与性质',
    stage1: '识别二次函数的形式（一般式、顶点式或交点式），提取二次项系数 a、一次项系数 b 和常数项 c。',
    formulas: [
      '顶点式：\\( y = a(x - h)^2 + k \\)，对称轴 \\( x = h \\)，顶点坐标 \\( (h, k) \\)',
      '一般式转顶点式：\\( h = -\\frac{b}{2a} \\)，\\( k = \\frac{4ac - b^2}{4a} \\)',
      '开口方向：\\( a > 0 \\) 开口向上（有最小值），\\( a < 0 \\) 开口向下（有最大值）'
    ],
    scaffoldQuestion: '观察已知条件中的顶点坐标或对称轴，优先代入顶点式还是交点式能让计算最简便？',
    reflection: '二次函数的自变量 x 是否有实际范围限制？极值点是否在定义域范围内？'
  },
  quadratic_equation: {
    name: '一元二次方程求解与根的判别',
    stage1: '将方程化为一般形式 \\( ax^2 + bx + c = 0 \\)，并确认 \\( a \\ne 0 \\)。',
    formulas: [
      '根的判别式：\\( \\Delta = b^2 - 4ac \\)',
      '求根公式：\\( x = \\frac{-b \\pm \\sqrt{\\Delta}}{2a} \\)（当 \\( \\Delta \\ge 0 \\) 时）',
      '韦达定理：\\( x_1 + x_2 = -\\frac{b}{a} \\)，\\( x_1 x_2 = \\frac{c}{a} \\)'
    ],
    scaffoldQuestion: '算一算判别式 \\( \\Delta = b^2 - 4ac \\) 的符号是大于0、等于0还是小于0？这决定了方程有几个实数根。',
    reflection: '在实际应用题中，求出的两根是否都符合实际物理或几何意义（例如长度、时间不能为负）？'
  },
  pythagorean: {
    name: '勾股定理与直角三角形',
    stage1: '在图形中找到或构造直角三角形，准确标出直角边 a, b 与斜边 c。',
    formulas: [
      '勾股定理：\\( a^2 + b^2 = c^2 \\)',
      '逆定理：若三角形三边满足 \\( a^2 + b^2 = c^2 \\)，则该三角形为直角三角形',
      '常见勾股数：(3, 4, 5)、(5, 12, 13)、(8, 15, 17)、(7, 24, 25)'
    ],
    scaffoldQuestion: '题目中有没有可以做垂线构造直角三角形的地方？斜边对应的是哪个直角的对边？',
    reflection: '注意分类讨论：若题目未明确哪条边是斜边，需分已知边是直角边还是斜边两种情况计算！'
  },
  speed_journey: {
    name: '行程与运动问题 (相遇/追及)',
    stage1: '明确两个运动主体的速度、出发时间先后，以及运动方向（相向而行、同向而行还是背向而行）。',
    formulas: [
      '基本关系：\\( s = v \\cdot t \\)，\\( v = \\frac{s}{t} \\)，\\( t = \\frac{s}{v} \\)',
      '相遇问题：\\( (v_1 + v_2) \\cdot t_{\\text{相遇}} = s_{\\text{总}} \\)',
      '追及问题：\\( (v_{\\text{快}} - v_{\\text{慢}}) \\cdot t_{\\text{追及}} = s_{\\text{初始距离}} \\)'
    ],
    scaffoldQuestion: '两车相遇时，它们共同走过的路程与两地总距离有什么关系？试着画一条线段图把已知量标出来。',
    reflection: '注意检查时间单位和速度单位是否统一（例如千米/小时与米/秒的换算：\\( 1\\text{ m/s} = 3.6\\text{ km/h} \\)）。'
  },
  chicken_rabbit: {
    name: '鸡兔同笼与假设法',
    stage1: '找出题干中的总头数（总只数）与总脚数，确定每只鸡有 2 只脚，每只兔有 4 只脚。',
    formulas: [
      '假设全是鸡：\\( \\text{少算的脚数} = \\text{实际总脚数} - \\text{总头数} \\times 2 \\)',
      '每把一只鸡换成一只兔多出 2 只脚：\\( \\text{兔数} = \\frac{\\text{少算的脚数}}{4 - 2} \\)',
      '方程法：设兔有 \\( x \\) 只，则鸡有 \\( (\\text{总头数} - x) \\) 只，列出 \\( 4x + 2(\\text{总头数} - x) = \\text{总脚数} \\)'
    ],
    scaffoldQuestion: '如果笼子里全都是鸡，应该一共有多少只脚？这与题目给出的总脚数相差了多少只？',
    reflection: '求出鸡和兔的只数后，代入算一算：它们的头数相加是否等于总头数？脚数相加是否等于总脚数？'
  },
  physics_mechanics: {
    name: '物理力学与压强浮力',
    stage1: '确定研究对象，进行受力分析（重力、支持力、摩擦力、浮力），明确物体处于静止、匀速直线还是加速状态。',
    formulas: [
      '密度公式：\\( \\rho = \\frac{m}{V} \\)',
      '固体压强：\\( p = \\frac{F}{S} \\)；液体压强：\\( p = \\rho_{\\text{液}} g h \\)',
      '阿基米德浮力：\\( F_{\\text{浮}} = \\rho_{\\text{液}} g V_{\\text{排}} = G_{\\text{排}} \\)',
      '杠杆平衡条件：\\( F_1 L_1 = F_2 L_2 \\)'
    ],
    scaffoldQuestion: '物体此时是浸没在液体中还是漂浮在液面上？此时物体受到的浮力与它的重力大小有什么关系？',
    reflection: '注意受力面积 S 的单位必须化为国际单位 \\( \\text{m}^2 \\)（如 \\( 1\\text{ cm}^2 = 10^{-4}\\text{ m}^2 \\)）！'
  },
  physics_electricity: {
    name: '物理电学与欧姆定律',
    stage1: '识别电路结构（串联还是并联），判断开关断开与闭合时电表（电流表、电压表）分别测量谁的物理量。',
    formulas: [
      '欧姆定律：\\( I = \\frac{U}{R} \\)（\\( U = IR \\), \\( R = \\frac{U}{I} \\)）',
      '电功率：\\( P = UI = I^2 R = \\frac{U^2}{R} \\)',
      '串联特点：\\( I = I_1 = I_2 \\)，\\( U = U_1 + U_2 \\)，\\( R_{\\text{总}} = R_1 + R_2 \\)',
      '并联特点：\\( U = U_1 = U_2 \\)，\\( I = I_1 + I_2 \\)，\\( \\frac{1}{R_{\\text{总}}} = \\frac{1}{R_1} + \\frac{1}{R_2} \\)'
    ],
    scaffoldQuestion: '当滑动变阻器滑片移动时，电路中的总电阻是变大还是变小？根据 \\( I = U / R_{\\text{总}} \\)，干路电流会怎么变？',
    reflection: '滑动变阻器的最大允许电流和电表的量程是否会被超过？这是极值问题的常见陷阱。'
  },
  chemistry_reaction: {
    name: '化学方程式与质量守恒',
    stage1: '准确写出反应物和生成物的化学式，根据质量守恒定律（反应前后原子种类与数目守恒）进行配平。',
    formulas: [
      '质量守恒：参加化学反应的各物质质量总和等于反应后生成的各物质质量总和',
      '物质的量/质量比计算：\\( \\frac{m_A}{M_A \\cdot n_A} = \\frac{m_B}{M_B \\cdot n_B} \\)',
      '溶质质量分数：\\( w = \\frac{m_{\\text{质}}}{m_{\\text{液}}} \\times 100\\% \\)'
    ],
    scaffoldQuestion: '反应产生的气体或沉淀有没有逸出或析出？反应前后天平示数的变化对应哪种物质的质量？',
    reflection: '化学方程式有没有标明反应条件（点燃/加热/催化剂）以及气体（↑）或沉淀（↓）符号？'
  },
  english_grammar: {
    name: '英语时态语态与句式结构',
    stage1: '抓句子中的时间状语（如 yesterday, since 2020, tomorrow, already, right now）和主谓一致关系。',
    formulas: [
      '一般现在时：主语（单三加-s/es）+ 动词原形',
      '现在完成时：\\( \\text{have/has} + \\text{past participle (done)} \\)（强调过去动作对现在产生的影响）',
      '被动语态：\\( \\text{be} + \\text{done} \\)'
    ],
    scaffoldQuestion: '句子中的时间状语是什么？动作是发生在过去、正在进行、还是已经完成并持续到现在？',
    reflection: '主语是单数还是复数？第三人称单数动词变位（如 has/studies/goes）是否已落实？'
  },
  chinese_reading: {
    name: '语文阅读理解与文本鉴赏',
    stage1: '精读题干要求，定位原文对应的自然段和关键语句（画出人物描写、景物描写或论证语句）。',
    formulas: [
      '修辞手法分析公式：修辞方法 + 表现手法 + 描绘了什么内容 + 抒发了作者怎样的思想感情',
      '句子含义理解公式：抓句中关键词的本义 + 结合上下文语境的深层含义 + 表达的情感/主旨'
    ],
    scaffoldQuestion: '划线句子运用了什么修辞手法（比喻、拟人、夸张、排比）？把什么事物比作了什么？',
    reflection: '答题要点是否分条陈述？是否紧扣文章中心主旨而非脱离原文空谈？'
  },
  generic_math: {
    name: '通用数学逻辑推理与建模',
    stage1: '提取题目已知条件（已知数、几何关系、变化量）和待求目标，用字母或图形明确表达。',
    formulas: [
      '等量代换与方程思想：设未知数 \\( x \\)，根据题目中的相等关系列出方程',
      '数形结合：将代数式转化为几何图形，或将几何线段转化为代数长度'
    ],
    scaffoldQuestion: '题目中有哪两个量是恒定不变的？我们能否根据这个守恒量列出一个等式？',
    reflection: '解题步骤是否书写规范？最后结果是否带上正确的单位？'
  }
};

/**
 * Match problem text to the best knowledge node
 */
export function matchKnowledgeNode(query = '') {
  const q = String(query).toLowerCase();

  if (q.includes('动点') || (q.includes('点p') && q.includes('运动')) || q.includes('折点') || q.includes('轨迹')) {
    return OFFLINE_KNOWLEDGE_GRAPH.dynamic_geometry;
  }
  if (q.includes('抛物线') || q.includes('二次函数') || q.includes('ax^2') || q.includes('顶点坐标') || q.includes('开口方向')) {
    return OFFLINE_KNOWLEDGE_GRAPH.quadratic_function;
  }
  if ((q.includes('方程') && (q.includes('根') || q.includes('x^2') || q.includes('判别式'))) || q.includes('韦达定理')) {
    return OFFLINE_KNOWLEDGE_GRAPH.quadratic_equation;
  }
  if (q.includes('勾股') || q.includes('直角三角形') || q.includes('斜边') || q.includes('做高') || q.includes('a^2+b^2')) {
    return OFFLINE_KNOWLEDGE_GRAPH.pythagorean;
  }
  if (q.includes('相遇') || q.includes('追及') || q.includes('速度') || q.includes('路程') || (q.includes('千米') && q.includes('小时'))) {
    return OFFLINE_KNOWLEDGE_GRAPH.speed_journey;
  }
  if (q.includes('鸡兔同笼') || (q.includes('头') && q.includes('脚') && (q.includes('只') || q.includes('笼')))) {
    return OFFLINE_KNOWLEDGE_GRAPH.chicken_rabbit;
  }
  if (q.includes('压强') || q.includes('浮力') || q.includes('密度') || q.includes('受力') || q.includes('阿基米德') || q.includes('杠杆')) {
    return OFFLINE_KNOWLEDGE_GRAPH.physics_mechanics;
  }
  if (q.includes('欧姆') || q.includes('电流') || q.includes('电压') || q.includes('滑动变阻器') || q.includes('电功率') || q.includes('电阻')) {
    return OFFLINE_KNOWLEDGE_GRAPH.physics_electricity;
  }
  if (q.includes('化学') || q.includes('反应') || q.includes('沉淀') || q.includes('质量守恒') || q.includes('化合价') || q.includes('溶质')) {
    return OFFLINE_KNOWLEDGE_GRAPH.chemistry_reaction;
  }
  if (q.includes('时态') || q.includes('语法') || q.includes('tense') || q.includes('passive') || /[a-zA-Z]{4,}\s+[a-zA-Z]{4,}/.test(q)) {
    return OFFLINE_KNOWLEDGE_GRAPH.english_grammar;
  }
  if (q.includes('阅读') || q.includes('修辞') || q.includes('文言文') || q.includes('中心思想') || q.includes('段落') || q.includes('抒发')) {
    return OFFLINE_KNOWLEDGE_GRAPH.chinese_reading;
  }

  return OFFLINE_KNOWLEDGE_GRAPH.generic_math;
}

/**
 * Generate 4-Stage Socratic Guidance text adapted to tutor persona
 */
export function generateOfflineSocraticResponse({
  query = '',
  grade = '7',
  subject = '数学',
  persona = 'owl',
  studentName = '同学'
}) {
  const node = matchKnowledgeNode(query);

  let headerPrefix = '';
  let encouragement = '';
  let closingPraise = '';

  if (persona === 'lion') {
    headerPrefix = `🦁 **聪聪小狮子说：** 吼吼！${studentName}，看到你在探索这道【${node.name}】问题，真棒！遇到卡点别慌，离线模式下小狮子依然全程陪你闯关！🌟\n\n`;
    encouragement = `🐾 **闯关第一步**：跟着小狮子先理清楚已知条件，我们不直接抄答案，用自己的智慧解开它！`;
    closingPraise = `\n\n💪 **加油呀！** 在草稿纸上画一画或写下你的第一步，小狮子随时在这里陪你验证！`;
  } else if (persona === 'sister') {
    headerPrefix = `🌸 **晓晴学姐悄悄话：** ${studentName}，这道关于【${node.name}】的题目，学姐以前也做错过呢。别着急，我们静下心来按步骤拆解，其实破题点很明显哦～ ☕\n\n`;
    encouragement = `💡 **学姐支招**：解这类题的关键在于抓住题眼，我们先看第一步：`;
    closingPraise = `\n\n✨ **学姐小提示**：做完记得把草稿留存，等有网了一键同步到错题本，你一定会越来越有把握的！`;
  } else {
    // Default: owl (智多星博士)
    headerPrefix = `🦉 **智多星导师·四阶苏格拉底离线导学系统**\n\n*检测到离线/端侧推理状态，已为您激活基于教材知识图谱的【${node.name}】启发式导学链：*\n\n`;
    encouragement = `🔬 **认知引导**：不直接提供终极答案，引导自主建模与推导：`;
    closingPraise = `\n\n🎯 **名师结语**：学而不思则罔，思而不学则殆。在草稿纸上完成第一步推导后，可继续在对话框输入你的进展！`;
  }

  const formulasMarkdown = node.formulas.map(f => `- ${f}`).join('\n');

  const content = `${headerPrefix}> ⚡ **[端侧离线纯本地推理引擎 · 4阶苏格拉底支架]**

### 🔍 第 1 阶：审题显微镜与条件拆解
${node.stage1}
${encouragement}

### 📐 第 2 阶：核心知识点与定理检索
本题的核心抓手属于 **${node.name}** 范畴，需要调用的核心定理与公式如下：
${formulasMarkdown}

### 💡 第 3 阶：微步破题启发引导
**${node.scaffoldQuestion}**
*(提示：先不要急着算最后一步，试着在草稿纸上写出这个式子，或者回复我你的思考！)*

### 🛡️ 第 4 阶：自检防错与思维反思
${node.reflection}${closingPraise}`;

  return content;
}
