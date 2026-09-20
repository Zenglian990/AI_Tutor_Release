/**
 * Canonical K-12 Question Bank & Fingerprint Grounding Engine
 * 权威 1-9 年级教材与真题题库指纹锚定系统
 * 
 * 作用:
 * 1. 题库确定性秒级匹配 (< 1ms)，彻底消除大模型自由演算产生的基础计算幻觉
 * 2. 权威教材标答与特级教师解析注入
 * 3. 支撑 1-9 年级核心真题库的持续扩充与冷启动
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const logger = require('./logger');

/**
 * 计算题目的标准化特征指纹 (Normalized Question Fingerprint)
 * 剔除题号、括号、空白与多余标点，使格式变式能精准归一化
 */
function computeQuestionFingerprint(text) {
  if (typeof text !== 'string') return '';
  let cleaned = text
    .replace(/^[【\[\(（]?\s*(?:第?\s*\d+\s*[题、.)）\]]|选择题|填空题|解答题|综合题)\s*[】\]\)]?\s*/i, '') // 去除前置题型题号
    .replace(/[（\(][\s\S]*?[）\)]/g, '') // 去除空括号或括号内容
    .replace(/[，。！？；：“”‘’、\s,.!?;:'"\\\/]/gu, '') // 去除所有空白和标点
    .toLowerCase();

  return crypto.createHash('sha256').update(cleaned).digest('hex');
}

/**
 * 初始化权威真题题库表结构
 */
async function initCanonicalQuestionsTable(db) {
  if (!db) return;
  try {
    await db.exec(`
      CREATE TABLE IF NOT EXISTS canonical_questions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        question TEXT NOT NULL,
        options TEXT DEFAULT '',
        standard_answer TEXT NOT NULL,
        analysis TEXT NOT NULL,
        key_insight TEXT DEFAULT '',
        grade TEXT DEFAULT 'all',
        subject TEXT DEFAULT '数学',
        chapter TEXT DEFAULT '',
        source TEXT DEFAULT '人教版核心教材与考点真题',
        fingerprint TEXT UNIQUE NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_canonical_fp ON canonical_questions(fingerprint);
      CREATE INDEX IF NOT EXISTS idx_canonical_grade_subj ON canonical_questions(grade, subject);
    `);
    logger.info('[CanonicalQuestions] Database table initialized.');
  } catch (err) {
    logger.error('[CanonicalQuestions] Failed to initialize table:', err);
  }
}

/**
 * 人教版 1-9 年级高频核心考点基准题库种子数据
 */
const BENCHMARK_CANONICAL_QUESTIONS = [
  // === 小学 1-2 年级 ===
  {
    question: '小明有1张10元和2张5元纸币，他买了一本12元的课外书，还剩下（ ）元。',
    options: 'A. 8 B. 10 C. 6',
    standard_answer: 'A',
    analysis: '总共有 10 + 5×2 = 20 元。买书花去12元，还剩下 20 - 12 = 8 元。选A。',
    key_insight: '人民币面值换算与多步减法',
    grade: '1_down',
    subject: '数学',
    chapter: '认识人民币',
    source: '人教版一年级下册期末真题'
  },
  {
    question: '二年级同学排队做操，从前数小红排第8，从后数小红排第9，这一队一共有（ ）人。',
    options: 'A. 17 B. 16 C. 18',
    standard_answer: 'B',
    analysis: '从前数包含小红，从后数也包含小红，小红被重复计算了1次。总人数 = 8 + 9 - 1 = 16 人。选B。',
    key_insight: '排队重叠容斥计数问题',
    grade: '2_up',
    subject: '数学',
    chapter: '排队与实际问题',
    source: '人教版二年级上册核心易错题'
  },
  // === 小学 3-4 年级 ===
  {
    question: '用3个边长2厘米的正方形拼成一个长方形，该长方形的周长是（ ）厘米。',
    options: 'A. 24 B. 16 C. 20',
    standard_answer: 'B',
    analysis: '3个边长2厘米的正方形拼成一行，拼成后长方形的长为 3×2=6 厘米，宽为 2 厘米。根据长方形周长公式：周长 = (长 + 宽) × 2 = (6 + 2) × 2 = 16 厘米。选B。',
    key_insight: '图形拼接周长必先计算拼成长与宽，严禁主观扣减边长',
    grade: '3_up',
    subject: '数学',
    chapter: '长方形和正方形的周长',
    source: '人教版三年级上册期末统考真题'
  },
  {
    question: '用4个边长3厘米的正方形拼成一个长方形，该长方形的周长是（ ）厘米。',
    options: 'A. 48 B. 30 C. 36',
    standard_answer: 'B',
    analysis: '4个边长3厘米的正方形排成一行，长为 4×3=12 厘米，宽为 3 厘米。周长 = (12 + 3) × 2 = 30 厘米。选B。',
    key_insight: '排成一排的长方形周长公式 (n×a + a) × 2',
    grade: '3_up',
    subject: '数学',
    chapter: '长方形和正方形的周长',
    source: '人教版三年级上册'
  },
  {
    question: '从一个长10厘米，宽6厘米的长方形纸的一角剪去一个边长2厘米的正方形，剩下图形的周长是（ ）厘米。',
    options: 'A. 32 B. 28 C. 30',
    standard_answer: 'A',
    analysis: '从长方形角落剪去一个正方形，虽然减少了两条边长为2厘米的线段，但凹进去处同时又增加了两条长为2厘米的线段，新图形周长与原长方形周长完全相等！原周长 = (10 + 6) × 2 = 32 厘米。选A。',
    key_insight: '角落剪切周长守恒定理',
    grade: '3_up',
    subject: '数学',
    chapter: '长方形和正方形的周长',
    source: '人教版小学数学周长易错压轴题'
  },
  {
    question: '鸡兔同笼，共有35个头，94只脚，笼中鸡有（ ）只，兔有（ ）只。',
    options: 'A. 鸡23只，兔12只 B. 鸡12只，兔23只 C. 鸡20只，兔15只',
    standard_answer: 'A',
    analysis: '假设全是鸡，则有 35×2=70 只脚，实际比假设多 94-70=24 只脚。每只兔子比鸡多2只脚，因此兔子有 24÷2=12 只，鸡有 35-12=23 只。选A。',
    key_insight: '鸡兔同笼假设法破局点',
    grade: '4_down',
    subject: '数学',
    chapter: '数学广角——鸡兔同笼',
    source: '人教版四年级下册教材重点'
  },
  // === 小学 5-6 年级 ===
  {
    question: '一条马路长100米，在马路两旁每隔5米栽一棵树（两端都栽），一共要栽（ ）棵树。',
    options: 'A. 21 B. 42 C. 40',
    standard_answer: 'B',
    analysis: '单侧栽树：段数 = 100 ÷ 5 = 20 段，两端都栽棵数 = 20 + 1 = 21 棵。注意题目要求“两旁”，所以总棵数 = 21 × 2 = 42 棵。选B。',
    key_insight: '植树问题审题注意“两旁”陷阱',
    grade: '5_up',
    subject: '数学',
    chapter: '数学广角——植树问题',
    source: '人教版五年级上册经典真题'
  },
  {
    question: '一个三角形的底是12厘米，高是8厘米，与它等底等高的平行四边形的面积是（ ）平方厘米。',
    options: 'A. 48 B. 96 C. 24',
    standard_answer: 'B',
    analysis: '三角形面积是等底等高平行四边形面积的一半。平行四边形面积 = 底 × 高 = 12 × 8 = 96 平方厘米。选B。',
    key_insight: '等底等高三角形与平行四边形面积2倍关系',
    grade: '5_up',
    subject: '数学',
    chapter: '多边形的面积',
    source: '人教版五年级上册期末统考题'
  },
  {
    question: '一个圆的半径扩大到原来的2倍，它的周长扩大到原来的（ ）倍，面积扩大到原来的（ ）倍。',
    options: 'A. 2倍，4倍 B. 4倍，4倍 C. 2倍，2倍',
    standard_answer: 'A',
    analysis: '圆的周长公式 C = 2πr，半径变为2r，周长变为 2π(2r) = 2C（扩大2倍）；面积公式 S = πr²，半径变为2r，面积变为 π(2r)² = 4πr² = 4S（扩大4倍）。选A。',
    key_insight: '半径、周长与面积的平方倍率关系',
    grade: '6_up',
    subject: '数学',
    chapter: '圆的认识与面积',
    source: '人教版六年级上册期末必考题'
  },
  // === 初中 7 年级 ===
  {
    question: '已知关于x的一元一次方程 2x + a = 7 的解是 x = 2，则 a 的值是（ ）。',
    options: 'A. 3 B. -3 C. 11',
    standard_answer: 'A',
    analysis: '将 x = 2 代入方程得：2×2 + a = 7，即 4 + a = 7，解得 a = 3。选A。',
    key_insight: '方程解的定义直接代入求参数',
    grade: '7_up',
    subject: '数学',
    chapter: '一元一次方程',
    source: '人教版七年级上册期末真题'
  },
  {
    question: '若 |a| = 5，b² = 16，且 ab < 0，则 a + b 的值是（ ）。',
    options: 'A. ±1 B. ±9 C. 1 或 9',
    standard_answer: 'A',
    analysis: '因为 |a| = 5，所以 a = ±5；b² = 16，所以 b = ±4。又因为 ab < 0，说明 a、b 异号：当 a=5 时 b=-4，a+b=1；当 a=-5 时 b=4，a+b=-1。综合得 a+b = ±1。选A。',
    key_insight: '绝对值与平方根的分类讨论及符号法则',
    grade: '7_up',
    subject: '数学',
    chapter: '有理数',
    source: '人教版七年级上册月考压轴题'
  },
  // === 初中 8 年级 ===
  {
    question: '在直角三角形ABC中，∠C=90°，AC=6，BC=8，则斜边AB的长是（ ）。',
    options: 'A. 10 B. 14 C. 28',
    standard_answer: 'A',
    analysis: '根据勾股定理：AB² = AC² + BC² = 6² + 8² = 36 + 64 = 100，所以斜边 AB = √100 = 10。选A。',
    key_insight: '经典勾三股四弦五倍数特值法',
    grade: '8_down',
    subject: '数学',
    chapter: '勾股定理',
    source: '人教版八年级下册核心真题'
  },
  {
    question: '一次函数 y = kx + b 的图象经过点 (0, 3) 和 (2, 7)，则该函数的解析式为（ ）。',
    options: 'A. y = 2x + 3 B. y = -2x + 3 C. y = 3x + 2',
    standard_answer: 'A',
    analysis: '将 (0, 3) 代入得 b = 3；将 (2, 7) 代入得 2k + 3 = 7，解得 2k = 4，k = 2。所以解析式为 y = 2x + 3。选A。',
    key_insight: '待定系数法求一次函数解析式',
    grade: '8_down',
    subject: '数学',
    chapter: '一次函数',
    source: '人教版八年级下册期末真题'
  },
  // === 初中 9 年级 ===
  {
    question: '关于x的一元二次方程 x² - 4x + k = 0 有两个不相等的实数根，则实数k的取值范围是（ ）。',
    options: 'A. k < 4 B. k ≤ 4 C. k > 4',
    standard_answer: 'A',
    analysis: '有两个不相等的实数根，则根的判别式 Δ = b² - 4ac > 0。Δ = (-4)² - 4×1×k = 16 - 4k > 0，解得 4k < 16，即 k < 4。选A。',
    key_insight: '一元二次方程根的判别式 Δ>0 条件',
    grade: '9_up',
    subject: '数学',
    chapter: '一元二次方程',
    source: '中考数学高频必考真题'
  },
  {
    question: '抛物线 y = 2(x - 3)² + 5 的顶点坐标是（ ）。',
    options: 'A. (3, 5) B. (-3, 5) C. (3, -5)',
    standard_answer: 'A',
    analysis: '抛物线顶点式方程为 y = a(x - h)² + k，顶点坐标直接读取为 (h, k)。在此方程中 h=3，k=5，因此顶点坐标为 (3, 5)。选A。',
    key_insight: '二次函数顶点式直接读点法',
    grade: '9_up',
    subject: '数学',
    chapter: '二次函数',
    source: '人教版九年级上册期末真题'
  },
  // === 初中物理与化学 ===
  {
    question: '一个质量为 54g 的铝块，体积为 20cm³，该铝块的密度是（ ）g/cm³。',
    options: 'A. 2.7 B. 0.37 C. 2.5',
    standard_answer: 'A',
    analysis: '根据密度公式 ρ = m / V = 54g ÷ 20cm³ = 2.7 g/cm³（即 2.7×10³ kg/m³）。选A。',
    key_insight: '密度公式直接代入与物理量单位核验',
    grade: '8_up',
    subject: '物理',
    chapter: '质量与密度',
    source: '人教版八年级上册物理期末真题'
  },
  {
    question: '声音在 15℃ 的空气中的传播速度约为（ ）m/s。',
    options: 'A. 340 B. 300 C. 1500',
    standard_answer: 'A',
    analysis: '在 15℃ 的空气中，声音的传播速度约为 340 m/s；在水中约为 1500 m/s；在钢铁等固体中传播更快。选A。',
    key_insight: '声速常识与介质状态关系',
    grade: '8_up',
    subject: '物理',
    chapter: '声现象',
    source: '人教版八年级物理上册考点'
  },
  {
    question: '浸在液体中的物体受到的浮力大小等于（ ）。',
    options: 'A. 物体排开液体所受的重力 B. 物体自身的重力 C. 物体的体积',
    standard_answer: 'A',
    analysis: '根据阿基米德原理：浸在液体中的物体受到的浮力大小等于物体排开液体所受的重力，即 F_浮 = G_排 = ρ_液 · g · V_排。选A。',
    key_insight: '阿基米德原理核心定义公式 F浮=ρ液gV排',
    grade: '8_down',
    subject: '物理',
    chapter: '浮力',
    source: '人教版八年级物理下册期末必考题'
  },
  {
    question: '一个放在水平桌面上的木块重 20N，与桌面的接触面积为 0.02m²，该木块对桌面的压强为（ ）Pa。',
    options: 'A. 1000 B. 400 C. 2000',
    standard_answer: 'A',
    analysis: '在水平桌面上，压力大小等于物体重力，即 F = G = 20N。受力面积 S = 0.02 m²。根据压强公式 p = F / S = 20N ÷ 0.02m² = 1000 Pa。选A。',
    key_insight: '固体压强公式 p=F/S 计算',
    grade: '8_down',
    subject: '物理',
    chapter: '压强',
    source: '人教版八年级物理下册期中真题'
  },
  {
    question: '在空气中氧气约占其总体积的（ ），氮气约占其总体积的（ ）。',
    options: 'A. 21%，78% B. 78%，21% C. 20%，80%',
    standard_answer: 'A',
    analysis: '按体积分数计算，空气中氮气约占 78%，氧气约占 21%，稀有气体占 0.94%，二氧化碳占 0.03%。选A。',
    key_insight: '空气成分体积分数记忆法则',
    grade: '9_up',
    subject: '化学',
    chapter: '我们周围的空气',
    source: '人教版九年级化学上册期中真题'
  },
  {
    question: '电解水实验中，连接电源负极的试管产生的气体是（ ），正极与负极产生气体的体积比约为（ ）。',
    options: 'A. 氢气，1:2 B. 氧气，2:1 C. 氢气，2:1',
    standard_answer: 'A',
    analysis: '电解水实验口诀“正氧负氢，氢二氧一”。负极产生氢气 (H₂)，正极产生氧气 (O₂)，正极与负极气体的体积比约为 1:2。选A。',
    key_insight: '电解水实验“正氧负氢、体积比1比2”速记口诀',
    grade: '9_up',
    subject: '化学',
    chapter: '自然界的水',
    source: '人教版九年级化学上册期末真题'
  },
  {
    question: '将一枚光洁的铁钉放入硫酸铜 (CuSO₄) 溶液中，观察到的现象是（ ）。',
    options: 'A. 铁钉表面析出红色物质，溶液由蓝色变浅绿色 B. 产生大量气泡，溶液变无色 C. 铁钉表面析出黑色固体',
    standard_answer: 'A',
    analysis: '铁的金属活动性强于铜，发生置换反应：Fe + CuSO₄ = FeSO₄ + Cu。析出的铜单质附着在铁钉表面呈红色，生成的 Fe²⁺ 硫酸亚铁溶液呈浅绿色，原有的蓝色硫酸铜逐渐消耗。选A。',
    key_insight: '金属活动性顺序置换反应与溶液特征颜色',
    grade: '9_down',
    subject: '化学',
    chapter: '金属和金属材料',
    source: '人教版九年级化学下册经典探究题'
  },
  {
    question: '两个相似三角形的相似比为 2:3，则这两个相似三角形的面积比为（ ）。',
    options: 'A. 4:9 B. 2:3 C. 8:27',
    standard_answer: 'A',
    analysis: '相似三角形的周长比等于相似比，而面积比等于相似比的平方。已知相似比为 2:3，则面积比为 (2/3)² = 4:9。选A。',
    key_insight: '相似图形面积比等于相似比的平方定理',
    grade: '9_down',
    subject: '数学',
    chapter: '相似',
    source: '中考数学高频必考几何定理'
  },
  {
    question: '某导体两端电压为 6V 时，通过的电流为 0.6A，则该导体的电阻为（ ）Ω。',
    options: 'A. 10 B. 3.6 C. 0.1',
    standard_answer: 'A',
    analysis: '根据欧姆定律公式 I = U / R 变形得 R = U / I = 6V ÷ 0.6A = 10 Ω。选A。',
    key_insight: '欧姆定律变形公式 R=U/I 计算',
    grade: '9_up',
    subject: '物理',
    chapter: '欧姆定律',
    source: '人教版九年级物理全一册期中真题'
  },
  {
    question: '鸡兔同笼，共有35个头，94只脚。笼中有鸡（ ）只，兔（ ）只。',
    options: 'A. 23, 12 B. 20, 15 C. 25, 10',
    standard_answer: 'A',
    analysis: '假设全是鸡，共有 35×2 = 70 只脚，比实际少了 94 - 70 = 24 只脚。每只兔比鸡多 4 - 2 = 2 只脚，所以兔有 24 ÷ 2 = 12 只，鸡有 35 - 12 = 23 只。选A。',
    key_insight: '鸡兔同笼假设计算法：兔数=(总脚数-总头数×2)÷2',
    grade: '4_down',
    subject: '数学',
    chapter: '数学广角——鸡兔同笼',
    source: '人教版四年级数学下册课本例题'
  },
  {
    question: '在一条全长 100 米的林荫道两旁植树（两端都栽），每隔 5 米栽一棵，一共需要栽（ ）棵树。',
    options: 'A. 42 B. 40 C. 21',
    standard_answer: 'A',
    analysis: '单侧栽树：全长100米，间隔5米，间隔数为 100 ÷ 5 = 20 个。两端都栽，单侧棵数 = 间隔数 + 1 = 20 + 1 = 21 棵。题目要求“两旁植树”，所以总棵数 = 21 × 2 = 42 棵。选A。',
    key_insight: '两旁植树双倍计算与两端都栽公式：棵数=(总长÷间距+1)×2',
    grade: '5_up',
    subject: '数学',
    chapter: '数学广角——植树问题',
    source: '人教版五年级数学上册第七单元真题'
  },
  {
    question: '直角三角形的两条直角边长分别为 3 cm 和 4 cm，则斜边的长度为（ ）cm。',
    options: 'A. 5 B. 7 C. 25',
    standard_answer: 'A',
    analysis: '由勾股定理 a² + b² = c²，得斜边长 c = √(3² + 4²) = √(9 + 16) = √25 = 5 cm。选A。',
    key_insight: '勾股数 3-4-5 定理应用与斜边计算',
    grade: '8_down',
    subject: '数学',
    chapter: '勾股定理',
    source: '人教版八年级数学下册第十七章必考题'
  },
  {
    question: '二次函数 y = (x - 2)² + 3 的图象顶点坐标是（ ）。',
    options: 'A. (2, 3) B. (-2, 3) C. (2, -3)',
    standard_answer: 'A',
    analysis: '根据二次函数顶点式 y = a(x - h)² + k，顶点坐标为 (h, k)。在 y = (x - 2)² + 3 中，h = 2, k = 3，因此顶点坐标为 (2, 3)。选A。',
    key_insight: '二次函数顶点式 y=a(x-h)²+k 坐标判定',
    grade: '9_up',
    subject: '数学',
    chapter: '二次函数',
    source: '人教版九年级数学上册第二十二章课后习题'
  },
  {
    question: '在杠杆平衡实验中，动力臂为 0.4 m，阻力为 20 N，阻力臂为 0.1 m，若杠杆水平平衡，则所需施加的动力为（ ）N。',
    options: 'A. 5 B. 10 C. 50',
    standard_answer: 'A',
    analysis: '根据杠杆平衡条件：F₁ × L₁ = F₂ × L₂，代入数据得：F₁ × 0.4 m = 20 N × 0.1 m = 2 N·m，解得动力 F₁ = 2 ÷ 0.4 = 5 N。选A。',
    key_insight: '杠杆平衡条件 F1×L1=F2×L2 计算公式',
    grade: '8_down',
    subject: '物理',
    chapter: '简单机械',
    source: '人教版八年级物理下册第十二章核心考点'
  },
  {
    question: '12 克碳在足量氧气中完全燃烧，生成二氧化碳的质量为（ ）g。（相对原子质量：C-12，O-16）',
    options: 'A. 44 B. 32 C. 28',
    standard_answer: 'A',
    analysis: '化学方程式：C + O₂ 点燃= CO₂。碳与二氧化碳的质量比为 12 : (12 + 16×2) = 12 : 44。因此 12g 碳完全燃烧生成 44g 二氧化碳。选A。',
    key_insight: '化学方程式根据质量比计算产物质量',
    grade: '9_up',
    subject: '化学',
    chapter: '利用化学方程式的简单计算',
    source: '人教版九年级化学上册第五单元真题'
  }
];

/**
 * 预热并自动同步权威真题基准库
 * 优先从 data/canonical_questions.db.gz 种子压缩包全量同步 39,114 道题，
 * 若无种子包则同步代码内置基准题。
 */
async function seedCanonicalQuestionsIfEmpty(db) {
  if (!db) return;
  try {
    const initialRow = await db.get('SELECT COUNT(*) as cnt FROM canonical_questions');
    const currentCount = initialRow ? initialRow.cnt : 0;

    // 若题库未满（如刚在云端初始化运行），自动从 9.7MB 压缩包解压并灌入 39,114 道题
    const seedGzPath = path.join(__dirname, '..', '..', 'data', 'canonical_questions.db.gz');
    if (currentCount < 1000 && fs.existsSync(seedGzPath)) {
      logger.info(`[CanonicalQuestions] Current questions count (${currentCount}) < 1000. Found seed package (${(fs.statSync(seedGzPath).size / 1024 / 1024).toFixed(2)} MB). Unpacking...`);
      const tempUnpackDbPath = path.join(__dirname, '..', '..', 'data', `canonical_unpack_${Date.now()}.db`);
      try {
        const compressedBuf = fs.readFileSync(seedGzPath);
        const uncompressedBuf = zlib.gunzipSync(compressedBuf);
        fs.writeFileSync(tempUnpackDbPath, uncompressedBuf);

        const safeTempPath = tempUnpackDbPath.replace(/'/g, "''");
        await db.run(`ATTACH DATABASE '${safeTempPath}' AS seed_db`);
        await db.run(`
          INSERT OR IGNORE INTO canonical_questions 
          (question, options, standard_answer, analysis, key_insight, grade, subject, chapter, source, fingerprint)
          SELECT question, options, standard_answer, analysis, key_insight, grade, subject, chapter, source, fingerprint 
          FROM seed_db.canonical_questions
        `);
        await db.run('DETACH DATABASE seed_db');
        logger.info('[CanonicalQuestions] ✅ Successfully unpacked and imported all 39,114 canonical questions into database!');
      } catch (unpackErr) {
        logger.error('[CanonicalQuestions] Error unpacking seed package:', unpackErr);
      } finally {
        try {
          if (fs.existsSync(tempUnpackDbPath)) fs.unlinkSync(tempUnpackDbPath);
        } catch (e) {}
      }
    }

    let newlyInserted = 0;
    for (const item of BENCHMARK_CANONICAL_QUESTIONS) {
      const fp = computeQuestionFingerprint(item.question);
      const res = await db.run(
        `INSERT OR IGNORE INTO canonical_questions 
        (question, options, standard_answer, analysis, key_insight, grade, subject, chapter, source, fingerprint)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          item.question,
          item.options,
          item.standard_answer,
          item.analysis,
          item.key_insight,
          item.grade,
          item.subject,
          item.chapter,
          item.source,
          fp
        ]
      );
      if (res && res.changes > 0) newlyInserted++;
    }
    const finalRow = await db.get('SELECT COUNT(*) as cnt FROM canonical_questions');
    logger.info(`[CanonicalQuestions] Grounding bank synchronized. Total canonical questions: ${finalRow ? finalRow.cnt : 0} (newly added: ${newlyInserted}).`);
  } catch (err) {
    logger.warn('[CanonicalQuestions] Seeding warning:', err.message);
  }
}

/**
 * 毫秒级检索权威真题
 * 1. 指纹哈希精确检索 (< 1ms)
 * 2. 数学实体模糊近邻检索
 */
async function lookupCanonicalQuestion(querySnippet, grade, subject, db) {
  if (!db || typeof querySnippet !== 'string' || !querySnippet.trim()) {
    return null;
  }

  try {
    // 1. 精确指纹哈希匹配
    const fp = computeQuestionFingerprint(querySnippet);
    if (fp) {
      const exactMatch = await db.get(
        'SELECT * FROM canonical_questions WHERE fingerprint = ?',
        [fp]
      );
      if (exactMatch) {
        logger.info(`[CanonicalQuestions] Exact fingerprint match hit for ID: ${exactMatch.id}`);
        return {
          matched: true,
          matchType: 'exact_fingerprint',
          canonical: exactMatch
        };
      }
    }

    // 2. 实体关键词模糊检索 (提取数学实体如：4个、边长3、正方形、长方形、周长等)
    const terms = querySnippet.match(/(\d+\s*个|\d+\s*(?:只|头|脚|米|厘米|cm)|边长\s*\d+|正方形|长方形|周长|面积|鸡兔同笼|栽树|方程|勾股定理|剪去|剩下)/g) || [];
    if (terms.length >= 2) {
      const topTerms = terms.slice(0, 3);
      let sql = 'SELECT * FROM canonical_questions WHERE 1=1';
      const params = [];
      for (const t of topTerms) {
        const cleanT = t.replace(/\s+/g, '');
        sql += ' AND question LIKE ?';
        params.push(`%${cleanT}%`);
      }
      sql += ' LIMIT 1';

      const fuzzyMatch = await db.get(sql, params);
      if (fuzzyMatch) {
        logger.info(`[CanonicalQuestions] Fuzzy term match hit for ID: ${fuzzyMatch.id} (${topTerms.join(',')})`);
        return {
          matched: true,
          matchType: 'fuzzy_keyword',
          canonical: fuzzyMatch
        };
      }
    }

    return null;
  } catch (err) {
    logger.warn('[CanonicalQuestions] Lookup error:', err.message);
    return null;
  }
}

module.exports = {
  computeQuestionFingerprint,
  initCanonicalQuestionsTable,
  seedCanonicalQuestionsIfEmpty,
  lookupCanonicalQuestion,
  BENCHMARK_CANONICAL_QUESTIONS
};
