/**
 * knowledgeGraph.js
 * 
 * K-9 Cross-Grade Knowledge Dependency Graph & GraphRAG Root-Cause Diagnosis
 * Provides prerequisite tracing for mathematics, physics, chemistry, and language arts.
 */

const fs = require('fs');
const path = require('path');

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
    commonMistake: '去括号时漏变某一项的符号（如 -(a - b) 误写成 -a - b），或者乘法负负得正搞混。',
    lifeAnalogy: '把括号前负号想象成“把整件衣服翻了个面”，里面的每一个扣子（项）正反面全部都要跟着翻转！负负得正就像“抵消一个惩罚，等于一次奖励”。',
    feynmanChallenge: '如果让你给五年级的小朋友讲清楚为什么 -(-3) = +3，你能不能用数轴掉头走或者欠债借钱的例子一次性讲明白？'
  },
  'math_negative_numbers': {
    id: 'math_negative_numbers',
    name: '正数和负数及数轴概念',
    subject: '数学',
    grade: '7_up',
    keywords: ['正数', '负数', '绝对值', '相反数', '数轴'],
    prerequisites: ['math_multiplication_division'],
    coreRule: '0既不是正数也不是负数。数轴上左边的数总比右边的数小。负数的绝对值是它的相反数。',
    commonMistake: '误认为带负号的字母一定是负数（例如认为 -a 一定小于 0）。',
    lifeAnalogy: '数轴就像是一根笔直的温度计或海拔标尺：0度是冰点，零下是负，零上是正；海平面是0，深海是负，高山是正。绝对值就是离0点的纯物理距离。',
    feynmanChallenge: '若一个字母 a 本身就是 -5，那 -a 到底是正数还是负数？试着在草稿纸上画一条数轴把 a 和 -a 标出来！'
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
    commonMistake: '完全平方公式漏掉中间项 2ab（误写成 (a+b)² = a² + b²）。',
    teacherMnemonic: '首平方，尾平方，首尾二倍在中央；符号看前方，同号加异号减！',
    lifeAnalogy: '就像盖房子：左边一个大房间(a²)，右边一个大房间(b²)，中间连接两个房间的双向走廊(2ab)千万不能忘！',
    feynmanChallenge: '如果让你在草稿纸上画一个边长为 (a+b) 的大正方形，切成4块，你能把 2ab 对应的两个长方形指给我看吗？'
  },
  'math_factorization': {
    id: 'math_factorization',
    name: '因式分解',
    subject: '数学',
    grade: '8_up',
    keywords: ['因式分解', '提公因式法', '公式法', '十字相乘'],
    prerequisites: ['math_polynomial_multiplication'],
    coreRule: '因式分解必须进行到每一个因式都不能再分解为止。提公因式要提彻底，提负号后各项全变号。',
    commonMistake: '分解不彻底（如将 x⁴ - 16 仅分解为 (x²+4)(x²-4)，漏分第二项），或公因式包含负号时符号混淆。',
    teacherMnemonic: '一提（提公因式）二套（套公式）三分组（分组分解）四十字；查到底，绝不留尾巴！',
    lifeAnalogy: '因式分解就像“把一辆组装好的乐高车拆成最小的标准零件块”，只要其中一个零件块还能再拆，工序就没做完。',
    feynmanChallenge: '为什么 x² - 4 可以分解，但 x² + 4 在实数范围内就不能分解了？用图形或根的意义给我上一课！',
    foundationQuestion: '将多项式 x^2 - 9 因式分解的结果是什么？',
    foundationAnswer: '(x-3)(x+3)',
    foundationHint: '利用平方差公式 a^2 - b^2 = (a-b)(a+b)。',
    foundationAnalysis: 'x^2 - 3^2 = (x-3)(x+3)。'
  },
  'math_square_root': {
    id: 'math_square_root',
    name: '平方根与二次根式',
    subject: '数学',
    grade: '8_up',
    keywords: ['平方根', '算术平方根', '立方根', '二次根式', '根号'],
    prerequisites: ['math_rational_operations'],
    coreRule: '正数有两个互为相反数的平方根；0的平方根是0；负数在实数范围内没有平方根。算术平方根具有双重非负性：√a ≥ 0 (a ≥ 0)。',
    commonMistake: '混淆“平方根”（两个值 ±√a）与“算术平方根”（非负值 √a）。',
    teacherMnemonic: '平方根找双胞胎（正负俩兄弟），算术根只要大哥（非负正能量）！',
    lifeAnalogy: '求算术平方根就像已知正方形地砖的面积，量它单边边长是多少。边长绝不可能是负数。',
    feynmanChallenge: '如果题目问你“4的平方根是谁”和“根号4等于多少”，这两个问题的答案一样吗？为什么？',
    foundationQuestion: '计算：\\sqrt{36} 的值是多少？',
    foundationAnswer: '6',
    foundationHint: '算术平方根表示一个非负数，6的平方是36。',
    foundationAnalysis: '\\sqrt{36} = 6（注意：算术平方根必须为非负数）。'
  },
  'math_pythagorean': {
    id: 'math_pythagorean',
    name: '勾股定理及其逆定理',
    subject: '数学',
    grade: '8_down',
    keywords: ['勾股定理', '勾股数', '直角三角形', '斜边'],
    prerequisites: ['math_square_root', 'math_congruent_triangles'],
    coreRule: '直角三角形两直角边的平方和等于斜边的平方：a² + b² = c²。已知两边求第三边必须分清哪个是斜边，防止漏解分类讨论！',
    commonMistake: '没有明确指明直角边和斜边就直接套用公式（若题中未说c是斜边，漏掉c是直角边的情况）。',
    teacherMnemonic: '勾三股四弦五，求第三边先看斜；题干未点谁是斜，必分两种分类答！',
    lifeAnalogy: '就像两个人从同一个路口一个向东走3米、一个向北走4米，他们之间的直线空中距离就是那条斜边（5米）。',
    feynmanChallenge: '直角三角形两边长是 3 和 4，第三边是 5 对不对？错在哪里？',
    visualAnchor: '经典赵爽弦图：大正方形内嵌4个全等直角三角形与中心小正方形，几何拼图验证 a² + b² = c²。',
    foundationQuestion: '直角三角形的两条直角边分别为 3 和 4，求斜边 c 的长度是多少？',
    foundationAnswer: '5',
    foundationHint: '利用勾股定理：a^2 + b^2 = c^2，即 3^2 + 4^2 = c^2。',
    foundationAnalysis: 'c = \\sqrt{3^2 + 4^2} = \\sqrt{9 + 16} = \\sqrt{25} = 5。'
  },
  'math_quadratic_equation': {
    id: 'math_quadratic_equation',
    name: '一元二次方程及其解法',
    subject: '数学',
    grade: '9_up',
    keywords: ['一元二次方程', '求根公式', '配方法', '判别式', '韦达定理'],
    prerequisites: ['math_factorization', 'math_square_root', 'math_linear_equation_one'],
    coreRule: '标准形式 ax² + bx + c = 0 (a≠0)。判别式 Δ = b² - 4ac。求根公式 x = [-b ± √(b²-4ac)] / (2a)。优先考虑因式分解法！',
    commonMistake: '方程两边同除以含有未知数的式子导致失根（如 x² = 2x 误直接除以 x 得到 x=2，丢失了 x=0 的解）。',
    teacherMnemonic: '判别式大于零两根分，等于零两根同，小于零无实根；等式两边绝不除未知数防失根！',
    lifeAnalogy: '方程就像一家人：一元一次方程是小弟，一元二次方程是大哥，二元一次方程组是双胞胎。解方程本质就是把不认识的复杂关系拆解降维到我们熟悉的一元一次！',
    feynmanChallenge: '解方程 x(x-3) = 2(x-3)，有同学直接两边约去 (x-3) 得到 x=2，你觉得这位同学犯了什么致命错误？怎么反驳他？',
    foundationQuestion: '解一元二次方程：x^2 - 4 = 0，求方程的所有实数解？',
    foundationAnswer: 'x=2或x=-2',
    foundationHint: '因式分解为 (x-2)(x+2) = 0，或者移项直接开平方。',
    foundationAnalysis: 'x^2 = 4，开方得 x = ±2。'
  },
  'math_quadratic_function': {
    id: 'math_quadratic_function',
    name: '二次函数及其图像与性质',
    subject: '数学',
    grade: '9_down',
    keywords: ['二次函数', '抛物线', '顶点坐标', '对称轴', '最大值最小值', '压轴题'],
    prerequisites: ['math_quadratic_equation', 'math_linear_function'],
    coreRule: '顶点式 y = a(x-h)² + k，顶点坐标 (h, k)，对称轴 x = h。开口方向由 a 决定。与x轴交点由判别式 Δ 决定。',
    commonMistake: '配方求顶点时提取 a 后，一次项未除以 a；对称轴公式 x = -b/(2a) 符号记错。',
    teacherMnemonic: '左加右减括号内（自变量移动反直觉），上加下减常数后；a定胖瘦与朝向，对称轴看-b/2a！',
    lifeAnalogy: '二次函数图像就像向空中投掷一枚篮球或喷泉水柱：到达最高点（顶点）前向上冲，过了对称轴就匀速下落，左右完全对称。',
    feynmanChallenge: '为什么 y = (x-2)² 的图像不是往左移2个单位，而是往右移2个单位？请用表格带入几个数值解释为什么会“反直觉”！',
    visualAnchor: '抛物线标准草图：顶点 (h,k)、对称轴 x=h，开口朝上(a>0)或朝下(a<0)，与x轴交点看 Δ=b²-4ac。'
  },
  'math_linear_function': {
    id: 'math_linear_function',
    name: '一次函数与平面直角坐标系',
    subject: '数学',
    grade: '8_down',
    keywords: ['一次函数', '正比例函数', '斜率k', '截距b', '坐标系'],
    prerequisites: ['math_linear_equation_one', 'math_linear_system_two'],
    coreRule: 'y = kx + b (k≠0)。k决定函数图像的增减性和倾斜方向，b决定与y轴交点坐标(0, b)。',
    commonMistake: '混淆k与b的几何意义；待定系数法求解析式时两点坐标代入计算错误。',
    teacherMnemonic: 'k正往上爬，k负往下滑；b就是你站在y轴上的起跑点！',
    lifeAnalogy: '一次函数是懒人走路——永远朝一个方向匀速前进，绝不拐弯。出租车起步价就是b，每公里加价就是斜率k。',
    feynmanChallenge: '如果两条直线的k相同但b不同，这两条直线在坐标系里的位置关系是什么？为什么？',
    visualAnchor: '直角坐标系四象限走向：k>0从左下到右上，k<0从左上到右下；b>0交y轴正半轴，b<0交y轴负半轴。'
  },
  'math_congruent_triangles': {
    id: 'math_congruent_triangles',
    name: '全等三角形判定与性质',
    subject: '数学',
    grade: '8_up',
    keywords: ['全等三角形', 'SSS', 'SAS', 'ASA', 'AAS', 'HL'],
    prerequisites: ['math_angle_parallel', 'math_elementary_area'],
    coreRule: '判定定理：SSS、SAS、ASA、AAS；直角三角形特有 HL。注意：SSA（两边及一边的对角）不能证明全等！',
    commonMistake: '误用 SSA 判定全等，或找角平分线、高线对应关系时推导断链。',
    teacherMnemonic: '先找两个已知量，第三个量自然现；两边夹角才叫角(SAS)，边边对角(SSA)不能算！',
    lifeAnalogy: '全等就是影分身（克隆体，完全重合）；相似就是放大缩小。先在图中用红笔把已经相等的边和角打勾标记，就像拼图找匹配凹凸口。',
    feynmanChallenge: '为什么两边以及其中一边的对角相等(SSA)不能保证两个三角形全等？试着用圆规在纸上画一画为什么会出现两种不同形状！',
    visualAnchor: '全等辅助线三大模型：①倍长中线法构造全等；②截长补短法构造线段和差；③角平分线向两边引垂线（垂线段相等）。'
  },
  'math_angle_parallel': {
    id: 'math_angle_parallel',
    name: '相交线、平行线与角',
    subject: '数学',
    grade: '7_down',
    keywords: ['平行线性质', '同位角', '内错角', '同旁内角', '对顶角'],
    prerequisites: [],
    coreRule: '两直线平行，同位角相等，内错角相等，同旁内角互补。',
    commonMistake: '不能在复杂图形中准确找出同位角或内错角的“截线”与“被截线”。',
    teacherMnemonic: '找F看同位，找Z看内错，找U同旁内角凑一百八！',
    lifeAnalogy: '铁轨两条平行线被一条马路斜穿切过，路口左右两边对应的视角就是同位角。',
    feynmanChallenge: '在黑板上画一个字母Z，你能指出哪两个角是内错角吗？如果把Z的两横拉得不平行，这两个角还相等吗？'
  },
  'math_multiplication_division': {
    id: 'math_multiplication_division',
    name: '多位数乘除法与运算法则',
    subject: '数学',
    grade: '4_up',
    keywords: ['乘法口诀', '多位数乘法', '除数是两位数的除法', '商不变性质'],
    prerequisites: [],
    coreRule: '乘除法必须严格对齐数位，不够商1要用0占位。商不变性质：被除数和除数同时乘或除以同一个非0数，商不变。',
    commonMistake: '除法竖式中中间有0的商漏写0（如 816 ÷ 4 误写成 24）。',
    foundationQuestion: '计算：408 ÷ 4 的商是多少？',
    foundationAnswer: '102',
    foundationHint: '十位上的0不够商1，要在十位上商0占位。',
    foundationAnalysis: '百位 4÷4=1，十位 0÷4=0 占位，个位 8÷4=2，商为 102。'
  },
  'math_elementary_area': {
    id: 'math_elementary_area',
    name: '小学平面图形面积与割补法',
    subject: '数学',
    grade: '5_up',
    keywords: ['平面图形面积', '三角形面积', '梯形面积', '平行四边形面积', '割补法', '阴影部分面积'],
    prerequisites: ['math_multiplication_division'],
    coreRule: '不规则多边形或阴影部分面积求法：优先利用“割补法”转化为规则图形的和或差（总面积减空白面积）。直角三角形面积等于两直角边乘积除以2！',
    commonMistake: '三角形或梯形求面积时忘记除以2；割补组合时重叠部分重复计算。',
    teacherMnemonic: '规则套公式，不规则用割补；三角形梯形别忘除以二！',
    lifeAnalogy: '就像切生日蛋糕或拼图：缺了一块的怪异形状，不如先切成几个方方正正的小长方形，算完再拼起来。',
    feynmanChallenge: '你能向三年级的小朋友解释为什么平行四边形的面积等于底乘高，而三角形的面积必须要除以2吗？',
    visualAnchor: '矩形、直角三角形、梯形网格面积拆拼示意图。',
    foundationQuestion: '一个直角三角形的两条直角边分别为 6cm 和 8cm，求它的面积是多少平方厘米？',
    foundationAnswer: '24',
    foundationHint: '直角三角形两条直角边即为底和高，公式为 底×高÷2。',
    foundationAnalysis: '面积 S = 6 × 8 ÷ 2 = 24 cm²。切记不可漏掉除以2！'
  },
  'math_linear_system_two': {
    id: 'math_linear_system_two',
    name: '二元一次方程组与消元法',
    subject: '数学',
    grade: '7_down',
    keywords: ['二元一次方程组', '代入消元法', '加减消元法', '消元思想'],
    prerequisites: ['math_linear_equation_one'],
    coreRule: '解二元一次方程组的核心灵魂是“消元”，通过代入法或加减法将二元问题降维转化为一元一次方程。',
    commonMistake: '用加减消元法两式相减时，被减式某一项有负号忘记变号（负负得正搞错）。',
    teacherMnemonic: '系数相同用减法，符号相反用加法；消去一个变一元，回代求出另一半！',
    lifeAnalogy: '解二元一次方程就像侦探排查两名嫌疑人：先通过确凿证据把其中一人彻底排除（消元），剩下的那个人自然就真相大白了。',
    feynmanChallenge: '为什么要费尽心思消去一个未知数？数学上这种思维叫什么思想？',
    foundationQuestion: '解方程组：x + y = 5 且 x - y = 1，求未知数 x 的值是多少？',
    foundationAnswer: '3',
    foundationHint: '将两个方程直接相加，即可消去 y。',
    foundationAnalysis: '两式相加得到 2x = 6，解得 x = 3。'
  },
  'math_similar_triangles': {
    id: 'math_similar_triangles',
    name: '相似三角形的判定与基本模型',
    subject: '数学',
    grade: '9_up',
    keywords: ['相似三角形', '相似比', 'A字型模型', '8字型模型', '射影定理'],
    prerequisites: ['math_congruent_triangles', 'math_fraction_basic'],
    coreRule: '对应角相等且对应边成比例的两个三角形相似。判定：两角分别相等、两边成比例且夹角相等、三边成比例。面积比等于相似比的平方！',
    commonMistake: '误将“相似比”当作“面积比”（面积比必须平方！）；寻找对应边比例时顶点顺序对应错乱。',
    teacherMnemonic: '平行必出A或8，两角相等最常用；边长比看相似比，面积比要平方记！',
    lifeAnalogy: '就像手机上的照片放大缩放：照片里人的眼睛和鼻子角度没变，但长宽按相同比例放大，整个脸占屏幕的面积则变成了放大比例的平方。',
    feynmanChallenge: '如果两个相似三角形对应边之比是 1:2，那么小三角形的面积是大三角形的几分之几？',
    foundationQuestion: '已知两个相似三角形的相似比为 1:3，若小三角形面积为 4，则大三角形面积是多少？',
    foundationAnswer: '36',
    foundationHint: '相似三角形的面积比等于相似比的平方。',
    foundationAnalysis: '相似比为 1:3，因此面积比为 1²:3² = 1:9。大三角形面积 = 4 × 9 = 36。'
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
    prerequisites: ['math_linear_equation_one', 'math_linear_system_two'],
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
  },

  // === 高中数学 (10-12年级新高考核心知识链) ===
  'hs_math_conic_sections': {
    id: 'hs_math_conic_sections',
    name: '圆锥曲线与方程（椭圆、双曲线、抛物线）',
    subject: '数学',
    grade: '11_up',
    chapter: '选择性必修第一册 · 第三章 圆锥曲线的方程',
    domain: '解析几何',
    keywords: ['圆锥曲线', '椭圆', '双曲线', '抛物线', '离心率', '焦点弦', '韦达定理', '弦长公式'],
    prerequisites: ['math_quadratic_function', 'math_quadratic_equation', 'math_pythagorean'],
    coreRule: '椭圆满足 |PF₁|+|PF₂|=2a (2a>|F₁F₂|)，a²=b²+c²，离心率 e=c/a∈(0,1)；双曲线 ||PF₁|-|PF₂||=2a，c²=a²+b²，e>1；抛物线 y²=2px 焦半径 |PF|=x₀+p/2。直线与圆锥曲线联立必先验 Δ>0 与斜率是否存在！',
    commonMistake: '混淆椭圆 a²=b²+c² 与双曲线 c²=a²+b²；设直线方程 y=kx+m 时漏讨论斜率不存在情况；焦点坐标位置(x轴/y轴)判断颠倒。',
    teacherMnemonic: '椭圆a老大，双曲c称王；联立先看Δ，设线防漏竖直斜率！'
  },
  'hs_math_derivative_app': {
    id: 'hs_math_derivative_app',
    name: '导数的概念与函数单调性、极值',
    subject: '数学',
    grade: '11_down',
    chapter: '选择性必修第二册 · 第五章 一元函数的导数及其应用',
    domain: '函数与微积分',
    keywords: ['导数', '导数的概念', '求导', '切线方程', '单调区间', '极值', '最值', '恒成立'],
    prerequisites: ['math_quadratic_function', 'math_linear_function'],
    coreRule: '函数在某点的导数 f\'(x₀) 是曲线在该点处的切线斜率。在区间内 f\'(x)>0 则单调递增，f\'(x)<0 则单调递减；求极值必须检验导数在零点两侧是否变号，且定义域优先！',
    commonMistake: '忽略函数定义域（如 ln x 要求 x>0）；混淆“在某点处的切线”与“过某点的切线”；误以为 f\'(x₀)=0 就一定是极值点。',
    teacherMnemonic: '求导先看定义域，切线分清“在”与“过”；导零未必是极值，左右变号才算数！'
  },
  'hs_math_sequence': {
    id: 'hs_math_sequence',
    name: '等差数列、等比数列与数列求和',
    subject: '数学',
    grade: '11_down',
    chapter: '选择性必修第二册 · 第四章 数列',
    domain: '数列与归纳',
    keywords: ['数列', '等差数列', '等比数列', '错位相减', '裂项相消', '递推公式'],
    prerequisites: ['math_linear_function', 'math_algebraic_expression'],
    coreRule: '等差通项 aₙ=a₁+(n-1)d；等比求和必须讨论公比 q=1 与 q≠1。由 Sₙ 求 aₙ 必分 n=1 和 n≥2 并检验首项是否合并！',
    commonMistake: '等比数列求和直接套 a₁(1-qⁿ)/(1-q) 忘记讨论 q=1；由 Sₙ-Sₙ₋₁ 求通项忘记验证 n=1。'
  },
  'hs_math_solid_vectors': {
    id: 'hs_math_solid_vectors',
    name: '空间向量与立体几何建系',
    subject: '数学',
    grade: '11_up',
    chapter: '选择性必修第一册 · 第一章 空间向量与立体几何',
    domain: '立体几何',
    keywords: ['空间向量', '立体几何', '法向量', '二面角', '线面角', '点到平面距离'],
    prerequisites: ['math_pythagorean', 'math_similar_triangles'],
    coreRule: '建系前必须证明三条坐标轴两两垂直；线面角正弦 sinθ=|cos<a,n>|；二面角余弦需结合图形观察判断锐角还是钝角。',
    commonMistake: '建系未证明垂直关系直接写坐标；法向量求解算错负号；线面角误用 cos 代替 sin。'
  },

  // === 高中物理 / 化学 / 生物 / 历史 / 地理 (10-12年级) ===
  'hs_phys_lorentz_force': {
    id: 'hs_phys_lorentz_force',
    name: '洛伦兹力与带电粒子在匀强磁场中的运动',
    subject: '物理',
    grade: '11_up',
    chapter: '选择性必修第二册 · 第一章 安培力与洛伦兹力',
    domain: '电磁学',
    keywords: ['洛伦兹力', '左手定则', '磁场圆周运动', '回旋加速器', '质谱仪'],
    prerequisites: ['phys_ohm_law', 'math_pythagorean'],
    coreRule: '洛伦兹力 f=qvB 始终与速度垂直不做功，充当向心力：qvB=mv²/R ⇒ R=mv/(qB)，周期 T=2πm/(qB) 与速度无关。',
    commonMistake: '负电荷应用左手定则时四指忘记指向运动反方向；几何找圆心与圆心角 θ 算错导致运动时间 t=θT/(2π) 出错。'
  },
  'hs_chem_galvanic_cell': {
    id: 'hs_chem_galvanic_cell',
    name: '原电池工作原理与双液盐桥',
    subject: '化学',
    grade: '11_up',
    chapter: '选择性必修一 · 第四章 化学反应与电能',
    domain: '电化学',
    keywords: ['原电池', '双液盐桥', '负极氧化', '正极还原', '电极反应式', '电解池'],
    prerequisites: ['phys_ohm_law'],
    coreRule: '负极失电子发生氧化反应，正极得电子发生还原反应；外电路电子从负极流向正极，内电路阳离子移向正极、阴离子移向负极。',
    commonMistake: '误以为电子可以通过电解质溶液或盐桥；书写电极反应式漏配电荷守恒与介质（酸性/碱性）。'
  },
  'hs_bio_genetics': {
    id: 'hs_bio_genetics',
    name: '减数分裂与孟德尔遗传定律',
    subject: '生物',
    grade: '10_down',
    chapter: '必修二 · 遗传与进化',
    domain: '遗传学',
    keywords: ['减数分裂', '基因分离定律', '自由组合定律', '伴性遗传', '遗传系谱图', '遗传概率'],
    prerequisites: ['math_fraction_add_sub'],
    coreRule: '减数第一次分裂后期同源染色体分离、非同源染色体自由组合是两大遗传定律的细胞学基础；多对性状拆分为单对分离比再相乘。',
    commonMistake: '混淆减数分裂与有丝分裂中期/后期图像；伴X隐性遗传系谱图漏判携带者概率。'
  },
  'hs_bio_photosynthesis': {
    id: 'hs_bio_photosynthesis',
    name: '光合作用与细胞呼吸综合分析',
    subject: '生物',
    grade: '10_up',
    chapter: '必修一 · 分子与细胞',
    domain: '细胞代谢',
    keywords: ['光合作用', '细胞呼吸', '光反应', '暗反应', '净光合速率', '呼吸熵'],
    prerequisites: ['math_linear_function'],
    coreRule: '真光合速率 = 净光合速率 + 呼吸速率；光反应在类囊体薄膜产生 ATP 与 NADPH，暗反应在叶绿体基质固定并还原 CO₂。',
    commonMistake: '混淆“CO₂吸收量（净光合）”与“CO₂固定量（总光合）”；光照骤降时误判 C₃ 与 C₅ 的瞬时变化趋势。'
  },
  'hs_bio_neuro_humoral': {
    id: 'hs_bio_neuro_humoral',
    name: '神经调节、体液调节与内环境稳态',
    subject: '生物',
    grade: '11_up',
    chapter: '选择性必修一 · 稳态与调节',
    domain: '生命活动调节',
    keywords: ['神经调节', '反射弧', '动作电位', '突触传递', '激素分级调节', '反馈调节', '稳态'],
    prerequisites: ['hs_bio_photosynthesis'],
    coreRule: '神经纤维上双向传导（Na⁺内流形成动作电位），突触处单向传递（电信号→化学信号→电信号）；下丘脑-垂体-靶腺构成激素分级与负反馈调节。',
    commonMistake: '混淆静息电位（K⁺外流）与动作电位（Na⁺内流）离子通道机制；误以为刺激传出神经引起肌肉收缩属于反射（缺少完整反射弧）。'
  },
  'hs_hist_modern_china': {
    id: 'hs_hist_modern_china',
    name: '鸦片战争与近代中国的救亡图存探索',
    subject: '历史',
    grade: '10_up',
    chapter: '中外历史纲要（上）· 晚清时期的内忧外患与救亡图存',
    domain: '中国近代史',
    keywords: ['鸦片战争', '洋务运动', '戊戌变法', '辛亥革命', '新文化运动', '半殖民地半封建'],
    prerequisites: [],
    coreRule: '近代中国探索呈现出由“器物（洋务运动）”到“制度（戊戌变法、辛亥革命）”再到“思想文化（新文化运动）”层层递进的历史脉络。',
    commonMistake: '混淆《南京条约》《马关条约》《辛丑条约》对中国社会性质演变的不同阶段影响。'
  },
  'hs_hist_industrial_rev': {
    id: 'hs_hist_industrial_rev',
    name: '两次工业革命与资本主义世界市场形成',
    subject: '历史',
    grade: '10_down',
    chapter: '中外历史纲要（下）· 工业革命与马克思主义的诞生',
    domain: '世界近代史',
    keywords: ['工业革命', '蒸汽时代', '电气时代', '垄断组织', '世界市场', '马克思主义'],
    prerequisites: ['hs_hist_modern_china'],
    coreRule: '第一次工业革命以英国为中心、蒸汽机为标志、促使世界市场初步形成；第二次工业革命美德领先、科学与技术紧密结合、垄断组织出现、世界市场最终确立。',
    commonMistake: '混淆两次工业革命的新兴工业部门（纺织/煤炭/铁路 vs 电力/内燃机/化工）与生产组织形式（工厂制 vs 垄断组织）。'
  },
  'hs_geo_atmospheric_circ': {
    id: 'hs_geo_atmospheric_circ',
    name: '大气热力环流、气压带风带与气候成因',
    subject: '地理',
    grade: '10_up',
    chapter: '必修第一册 / 选择性必修一 · 大气运动与气候',
    domain: '自然地理',
    keywords: ['大气环流', '热力环流', '三圈环流', '气压带风带', '季风气候', '地中海气候', '锋面气旋'],
    prerequisites: [],
    coreRule: '近地面冷热不均引起空气垂直运动→同一水平面气压差→空气水平流动；气压带风带随太阳直射点季节移动（北半球夏偏北、冬偏南）塑造地中海与热带草原气候。',
    commonMistake: '画热力环流时混淆高空与近地面等压面凹凸方向（“高高低低”规律）；将冷锋过境前后的气温气压变化颠倒。'
  },
  'hs_geo_lithosphere': {
    id: 'hs_geo_lithosphere',
    name: '岩石圈物质循环与内外力地貌演化',
    subject: '地理',
    grade: '11_up',
    chapter: '选择性必修一 · 地表形态的塑造',
    domain: '自然地理',
    keywords: ['地壳物质循环', '板块构造', '背斜向斜', '断层', '流水地貌', '风成地貌', '区位因素'],
    prerequisites: ['hs_geo_atmospheric_circ'],
    coreRule: '内力作用奠定地表起伏格局（背斜成山/谷、向斜成谷/山，背斜储油气、向斜储水），外力作用（风化、侵蚀、搬运、堆积）削高填低。',
    commonMistake: '仅凭地形高低判断背斜向斜（正确判据是岩层新老关系：中老翼新为背斜，中新翼老为向斜）。'
  },
  // === 高中全学科主干知识图谱扩充（彻底消除语文/政治 0 节点与化/生/史/地偏科）===
  'hs_chinese_classical_particles': {
    id: 'hs_chinese_classical_particles',
    name: '高中文言文实词推断与 18 个高频虚词',
    subject: '语文',
    grade: '10_up',
    chapter: '必修上册 · 文言文思辨阅读',
    domain: '古代诗文阅读',
    keywords: ['文言文', '文言虚词', '文言实词', '之乎者也', '古今异义', '词类活用', '特殊句式', '劝学', '师说'],
    prerequisites: [],
    coreRule: '文言实词可借助语境代入法、字形偏旁法、对称结构法与成语迁移法推断；高频虚词“之、其、而、以、于、为”须结合在句中的语法成分精准判别。',
    commonMistake: '以现代汉语词义望文生义，或忽略“使动用法”“意动用法”与宾语前置倒装结构导致翻译失分。'
  },
  'hs_chinese_poetry_imagery': {
    id: 'hs_chinese_poetry_imagery',
    name: '高中古代诗歌意象意境与炼字赏析',
    subject: '语文',
    grade: '11_up',
    chapter: '选择性必修中册 · 古诗词鉴赏',
    domain: '古代诗文阅读',
    keywords: ['古诗词鉴赏', '意象', '意境', '炼字', '借景抒情', '用典', '托物言志', '杜甫', '苏轼'],
    prerequisites: ['hs_chinese_classical_particles'],
    coreRule: '鉴赏遵循“意象特征→表达技巧→营造意境→深层情感”四步答题链，注意知人论世与时代背景。',
    commonMistake: '只贴“借景抒情”等术语标签，不结合诗句具体景物词句分析情感递进与转折。'
  },
  'hs_chinese_argumentative_thinking': {
    id: 'hs_chinese_argumentative_thinking',
    name: '新高考现代文信息整合与思辨议论文写作',
    subject: '语文',
    grade: '12_up',
    chapter: '高考二轮专题 · 思辨阅读与写作',
    domain: '现代文阅读与表达',
    keywords: ['高考作文', '议论文', '思辨', '破立结合', '信息类文本', '乡土中国', '差序格局', '论证结构'],
    prerequisites: ['hs_chinese_poetry_imagery'],
    coreRule: '高分思辨写作重在“界定核心概念→辩证剖析对立统一关系→由表及里追问根因→落脚时代青年担当”，做到破立结合。',
    commonMistake: '只谈一面走向绝对化，或堆砌老套事例却缺乏“观点—材料—析理”的逻辑桥梁。'
  },
  'hs_politics_dialectics': {
    id: 'hs_politics_dialectics',
    name: '唯物辩证法与矛盾观（对立统一规律）',
    subject: '政治',
    grade: '11_up',
    chapter: '必修四 · 哲学与文化',
    domain: '马克思主义哲学',
    keywords: ['唯物辩证法', '矛盾观', '对立统一', '具体问题具体分析', '主要矛盾', '量变质变', '实践与认识'],
    prerequisites: [],
    coreRule: '矛盾具有普遍性与特殊性，坚持两点论与重点论相统一；具体问题具体分析是正确认识事物的基础和解决矛盾的关键。',
    commonMistake: '混淆“主要矛盾（办事情抓重点）”与“矛盾的主要方面（看问题分主流与支流）”。'
  },
  'hs_politics_market_economy': {
    id: 'hs_politics_market_economy',
    name: '社会主义市场经济体制与宏观调控',
    subject: '政治',
    grade: '10_up',
    chapter: '必修二 · 经济与社会',
    domain: '中国特色社会主义经济',
    keywords: ['市场经济', '宏观调控', '有效市场', '有为政府', '财政政策', '货币政策', '高质量发展', '新质生产力'],
    prerequisites: [],
    coreRule: '充分发挥市场在资源配置中的决定性作用，更好发挥政府作用，通过财政政策与货币政策弥补市场自发性、盲目性、滞后性缺陷。',
    commonMistake: '混淆财政政策（税收、国债、财政支出）与货币政策（利率、存款准备金率、公开市场操作）。'
  },
  'hs_politics_democracy_law': {
    id: 'hs_politics_democracy_law',
    name: '全过程人民民主与全面依法治国',
    subject: '政治',
    grade: '10_down',
    chapter: '必修三 · 政治与法治',
    domain: '政治认同与法治意识',
    keywords: ['全过程人民民主', '人民代表大会制度', '依法治国', '党的领导', '基层群众自治', '政协'],
    prerequisites: [],
    coreRule: '坚持党的领导、人民当家作主、依法治国有机统一，明确人大（权力机关）、政府（行政机关）、政协（爱国统一战线组织）各自职能边界。',
    commonMistake: '将人民政协误判为国家机关，或混淆人大的立法权、决定权、任免权与监督权。'
  },
  'hs_chem_mole_stoichiometry': {
    id: 'hs_chem_mole_stoichiometry',
    name: '物质的量与阿伏伽德罗常数综合计算',
    subject: '化学',
    grade: '10_up',
    chapter: '必修第一册 · 物质的量',
    domain: '化学计量',
    keywords: ['物质的量', '摩尔质量', '气体摩尔体积', '阿伏伽德罗常数', '物质的量浓度', '22.4'],
    prerequisites: [],
    coreRule: '以物质的量 n 为核心枢纽：n = m/M = N/NA = V/Vm(标况气体) = c·V(溶液)，务必审清标况条件与物质状态。',
    commonMistake: '在标准状况下将水、酒精、SO₃、CCl₄ 等非气体误代入 22.4 L/mol 计算。'
  },
  'hs_chem_equilibrium': {
    id: 'hs_chem_equilibrium',
    name: '化学反应速率、平衡常数与勒夏特列原理',
    subject: '化学',
    grade: '11_up',
    chapter: '选择性必修一 · 化学反应速率与化学平衡',
    domain: '化学反应原理',
    keywords: ['化学平衡', '平衡常数', '勒夏特列', '转化率', 'Kp', '反应速率', '焓变'],
    prerequisites: ['hs_chem_mole_stoichiometry'],
    coreRule: '平衡常数 K 与 Kp 仅受温度影响；改变浓度、压强、温度时平衡向减弱该改变的方向移动，但只能“减弱”不能“抵消”。',
    commonMistake: '误以为增大压强或加入催化剂会改变平衡常数 K，或恒容充入惰性气体误判压强增大使平衡移动。'
  },
  'hs_chem_electrolyte_conservation': {
    id: 'hs_chem_electrolyte_conservation',
    name: '水溶液离子平衡、三大守恒与溶度积 Ksp',
    subject: '化学',
    grade: '11_up',
    chapter: '选择性必修一 · 水溶液中的离子反应与平衡',
    domain: '化学反应原理',
    keywords: ['三大守恒', '电荷守恒', '物料守恒', '质子守恒', '水解平衡', 'Ksp', '离子浓度'],
    prerequisites: ['hs_chem_equilibrium'],
    coreRule: '电荷守恒看离子电荷代数和相等（高价离子前乘电荷数），物料守恒看元素原子总数守恒，质子守恒由前两式消去非水解核心离子推导。',
    commonMistake: '写电荷守恒时漏乘 CO₃²⁻、SO₄²⁻ 等多价离子的电荷系数 2。'
  },
  'hs_chem_electrochemistry': {
    id: 'hs_chem_electrochemistry',
    name: '原电池、电解池与离子交换膜综合',
    subject: '化学',
    grade: '11_down',
    chapter: '选择性必修一 · 化学反应与电能',
    domain: '电化学',
    keywords: ['原电池', '电解池', '离子交换膜', '盐桥', '电极反应式', '金属腐蚀'],
    prerequisites: ['hs_chem_electrolyte_conservation'],
    coreRule: '原电池负极失电子氧化、正极得电子还原，阳离子移向正极；电解池阳极连电源正极发生氧化、阴极还原，电子不进入电解质溶液。',
    commonMistake: '书写电极反应式时忽略电解质溶液酸碱性（酸性用 H⁺ 配平，碱性用 OH⁻ 配平）或认为电子流经盐桥。'
  },
  'hs_bio_photosynthesis_respiration': {
    id: 'hs_bio_photosynthesis_respiration',
    name: '光合作用与细胞呼吸综合曲线分析',
    subject: '生物',
    grade: '10_up',
    chapter: '必修一 · 细胞的能量供应和利用',
    domain: '分子与细胞',
    keywords: ['光合作用', '细胞呼吸', '光反应', '暗反应', '光补偿点', '光饱和点', '净光合速率'],
    prerequisites: [],
    coreRule: '总光合速率 = 净光合速率 + 呼吸速率；分析光强/CO₂ 突变对 C₃、C₅、ATP、NADPH 瞬时影响须从生成与消耗两条路径切入。',
    commonMistake: '将表观测量到的 O₂ 释放量或 CO₂ 吸收量误当作总光合速率（实为净光合速率）。'
  },
  'hs_bio_meiosis_genetics': {
    id: 'hs_bio_meiosis_genetics',
    name: '减数分裂与伴性遗传、自由组合规律',
    subject: '生物',
    grade: '10_down',
    chapter: '必修二 · 遗传与进化',
    domain: '遗传与变异',
    keywords: ['减数分裂', '伴性遗传', '孟德尔', '自由组合', '基因分离', '系谱图', '致死基因'],
    prerequisites: ['hs_bio_photosynthesis_respiration'],
    coreRule: '系谱图先判显隐性（无中生有为隐性、有中生无为显性），再判常/伴性遗传（隐性看女病父子必病，显性看男病母女必病）。',
    commonMistake: '9:3:3:1 变式题（如 9:6:1、15:1、9:7）未按独立遗传拆分为两对基因乘积直接硬套。'
  },
  'hs_bio_homeostasis': {
    id: 'hs_bio_homeostasis',
    name: '神经—体液—免疫调节与稳态维持',
    subject: '生物',
    grade: '11_up',
    chapter: '选择性必修一 · 稳态与调节',
    domain: '稳态与调节',
    keywords: ['神经调节', '静息电位', '动作电位', '激素分级调节', '负反馈', '体液免疫', '细胞免疫'],
    prerequisites: ['hs_bio_meiosis_genetics'],
    coreRule: '兴奋在神经纤维上双向电信号传导，在突触间单向化学信号传递；下丘脑—垂体—靶腺轴体现分级调节与负反馈调节。',
    commonMistake: '混淆静息电位（K⁺ 外流，外正内负）与动作电位（Na⁺ 内流，外负内正）的离子流向及方式（均为协助扩散）。'
  },
  'hs_hist_centralization': {
    id: 'hs_hist_centralization',
    name: '中国古代专制主义中央集权制度演变',
    subject: '历史',
    grade: '10_up',
    chapter: '中外历史纲要上 · 古代政治制度',
    domain: '中国古代史',
    keywords: ['中央集权', '三公九卿', '推恩令', '三省六部', '二府三司', '行省制', '内阁', '军机处'],
    prerequisites: [],
    coreRule: '紧扣“皇权与相权（相权削弱、皇权加强）”和“中央与地方（地方分权、中央集权）”两条主线把握制度演进。',
    commonMistake: '将明朝内阁误判为法定一级中央行政机构，或把唐代三省六部制与西方三权分立简单等同。'
  },
  'hs_hist_modern_china': {
    id: 'hs_hist_modern_china',
    name: '中国近代民族危机与救亡图存道路探索',
    subject: '历史',
    grade: '10_up',
    chapter: '中外历史纲要上 · 晚清至新民主主义革命',
    domain: '中国近代史',
    keywords: ['鸦片战争', '洋务运动', '戊戌变法', '辛亥革命', '新文化运动', '五四运动', '井冈山道路'],
    prerequisites: ['hs_hist_centralization'],
    coreRule: '把握从器物（洋务）→制度（维新/辛亥）→思想文化（新文化）→马克思主义中国化的递进逻辑与阶级局限性。',
    commonMistake: '割裂世界资本主义扩张背景孤立分析中国近代化进程。'
  },
  'hs_hist_industrial_world': {
    id: 'hs_hist_industrial_world',
    name: '新航路开辟、工业革命与资本主义世界体系',
    subject: '历史',
    grade: '10_down',
    chapter: '中外历史纲要下 · 世界近代史',
    domain: '世界史',
    keywords: ['新航路开辟', '工业革命', '启蒙运动', '资产阶级革命', '冷战', '多极化', '经济全球化'],
    prerequisites: ['hs_hist_modern_china'],
    coreRule: '以生产力跃迁驱动生产关系、阶级结构、殖民格局与国际秩序重构的唯物史观链条贯通全模块。',
    commonMistake: '混淆第一次工业革命（英国率先、蒸汽机、轻工业）与第二次工业革命（多国并进、电力内燃机、重工业与垄断组织）。'
  },
  'hs_geo_ocean_interaction': {
    id: 'hs_geo_ocean_interaction',
    name: '洋流分布规律、海气相互作用与厄尔尼诺',
    subject: '地理',
    grade: '11_up',
    chapter: '选择性必修一 · 水的运动',
    domain: '自然地理',
    keywords: ['洋流', '暖流', '寒流', '渔场成因', '厄尔尼诺', '拉尼娜', '海气相互作用', '水循环'],
    prerequisites: ['hs_geo_atmospheric_circ'],
    coreRule: '中低纬大洋环流北顺南逆（东寒西暖），暖流增温增湿、寒流降温减湿；寒暖流交汇或上升补偿流形成大渔场。',
    commonMistake: '混淆厄尔尼诺（赤道中东太平洋异常增温，秘鲁多雨、澳洲干旱）与拉尼娜的气候异常方向。'
  },
  'hs_geo_location_factors': {
    id: 'hs_geo_location_factors',
    name: '农业、工业与服务业区位因素及区域可持续发展',
    subject: '地理',
    grade: '10_down',
    chapter: '必修第二册 · 产业区位选择',
    domain: '人文地理',
    keywords: ['区位因素', '农业区位', '工业区位', '产业转移', '资源跨区域调配', '可持续发展', '碳中和'],
    prerequisites: ['hs_geo_lithosphere'],
    coreRule: '区位分析须从自然（气候、地形、水源、土壤/资源）与社会经济（市场、交通、劳动力、科技、政策、地价）双维度动态拆解并识别主导因素。',
    commonMistake: '答题只背模板不结合题干区域图文材料提取限定性信息。'
  }
};

const SUBJECT_MAP = {
  'math': '数学',
  'mathematics': '数学',
  '数学': '数学',
  'english': '英语',
  '英语': '英语',
  'physics': '物理',
  '物理': '物理',
  'chinese': '语文',
  '语文': '语文',
  'science': '科学',
  '科学': '科学',
  'morality': '道德与法治',
  '道德与法治': '道德与法治',
  '道法': '道德与法治',
  'politics': '政治',
  '思想政治': '政治',
  '政治': '政治',
  'chemistry': '化学',
  '化学': '化学',
  'biology': '生物',
  '生物': '生物',
  '生物学': '生物',
  'history': '历史',
  '历史': '历史',
  'geography': '地理',
  '地理': '地理'
};

function normalizeSubject(subj) {
  if (!subj) return '';
  const clean = String(subj).trim().toLowerCase();
  if (clean === '全部学科' || clean === '全部' || clean === 'all' || clean === '*') return '';
  return SUBJECT_MAP[clean] || subj;
}

const dependencyInfoMap = {};

// 自动融合外部权威 PEP 及 K-12 全学段知识拓扑（2804+核心节点 + 4200+条拓扑依赖链）
try {
  const topicsFile = path.join(__dirname, '..', '..', 'data', 'pep_topics.json');
  const depsFile = path.join(__dirname, '..', '..', 'data', 'pep_dependencies.json');
  if (fs.existsSync(topicsFile) && fs.existsSync(depsFile)) {
    const rawTopics = JSON.parse(fs.readFileSync(topicsFile, 'utf-8')).topics || [];
    const rawDeps = JSON.parse(fs.readFileSync(depsFile, 'utf-8')).dependencies || [];

    const depMap = {};
    for (const d of rawDeps) {
      if (!depMap[d.topicId]) depMap[d.topicId] = [];
      depMap[d.topicId].push(d.prerequisiteId);
      const depKey = `${d.topicId}->${d.prerequisiteId}`;
      dependencyInfoMap[depKey] = {
        strength: d.strength || 'hard',
        reason: d.reason || ''
      };
    }

    for (const t of rawTopics) {
      const mappedSubject = normalizeSubject(t.subject) || '数学';
      const nodeGrade = t.grade !== undefined ? t.grade : (t.ageRangeStart >= 12 ? '7_up' : 7);

      if (!KNOWLEDGE_GRAPH[t.id]) {
        KNOWLEDGE_GRAPH[t.id] = {
          id: t.id,
          name: t.name,
          subject: mappedSubject,
          grade: nodeGrade,
          semester: t.semester || '',
          chapter: t.chapter || '',
          domain: t.domain || '',
          type: t.type || 'conceptual',
          description: t.description || t.name,
          keywords: [t.name, t.domain || '']
            .concat(Array.isArray(t.evidence) ? t.evidence : [])
            .concat(Array.isArray(t.mastery_criteria) ? t.mastery_criteria : [])
            .concat(t.chapter ? [t.chapter] : [])
            .filter(Boolean),
          prerequisites: depMap[t.id] || [],
          coreRule: t.description || t.name,
          commonMistake: t.assessmentPrompt || (t.mastery_criteria && t.mastery_criteria.length > 0 ? `重点掌握：${t.mastery_criteria.join('；')}` : '在基本概念与运算步骤的严谨性上容易出现遗漏或符号错误。'),
          mastery_criteria: t.mastery_criteria || (Array.isArray(t.evidence) ? t.evidence : []),
          diagnostic_question: t.diagnostic_question || null,
          root_reason: t.root_reason || null,
          standards: t.standards || [],
          teacherMnemonic: `牢牢掌握【${t.domain || t.name}】核心定义与标准解题步骤！`,
          lifeAnalogy: `就像学习语言必须先背基础词汇一样，掌握${t.name}是解综合大题的敲门砖。`,
          feynmanChallenge: `能否用自己的话，向没有学过的人讲清楚${t.name}的核心内涵？`,
          foundationQuestion: t.diagnostic_question?.question || null,
          foundationAnswer: t.diagnostic_question?.answer || null,
          foundationHint: t.description || null,
          foundationAnalysis: t.root_reason || t.description || null
        };
      } else {
        const existingNode = KNOWLEDGE_GRAPH[t.id];
        if (depMap[t.id] && depMap[t.id].length > 0) {
          const mergedPrereqs = Array.from(new Set([...(existingNode.prerequisites || []), ...depMap[t.id]]));
          existingNode.prerequisites = mergedPrereqs;
        }
        if (t.diagnostic_question && !existingNode.diagnostic_question) {
          existingNode.diagnostic_question = t.diagnostic_question;
        }
        if (t.chapter && !existingNode.chapter) {
          existingNode.chapter = t.chapter;
        }
        if (t.domain && !existingNode.domain) {
          existingNode.domain = t.domain;
        }
      }
    }
  }
} catch (err) {
  // 优雅降级，保留内置图谱
}

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
  const normTarget = normalizeSubject(subject);

  for (const node of Object.values(KNOWLEDGE_GRAPH)) {
    if (normTarget) {
      const normNode = normalizeSubject(node.subject);
      if (normNode && normNode !== normTarget && !normNode.includes(normTarget) && !normTarget.includes(normNode)) {
        continue;
      }
    }

    const nameMatch = cleanText.includes(node.name.toLowerCase());
    const keywordMatch = node.keywords && node.keywords.some(kw => cleanText.includes(kw.toLowerCase()));

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
  if (rootCauseNode.teacherMnemonic) {
    section += '- 📜 真实名师独门口诀：' + rootCauseNode.teacherMnemonic + '\n';
  }
  if (rootCauseNode.lifeAnalogy) {
    section += '- 🍎 生活具象隐喻启发：' + rootCauseNode.lifeAnalogy + '\n';
  }
  if (rootCauseNode.feynmanChallenge) {
    section += '- 🔄 费曼反向挑战探针：' + rootCauseNode.feynmanChallenge + '\n';
  }
  if (rootCauseNode.visualAnchor) {
    section += '- 📐 几何/物理关键视觉表征：' + rootCauseNode.visualAnchor + '\n';
  }
  section += '- 教学引导指引：若学生在解题或推导中卡壳，请不要只在当前考点原地打转！请一语道破其底层的【' + rootCauseNode.name + '】概念断层，给出前置小锦囊或草稿纸自测，帮助学生打通因果链条！\n';

  return section;
}

function getKnowledgeNodeWithVisuals(nodeId) {
  const node = KNOWLEDGE_GRAPH[nodeId];
  if (!node) return null;
  const prereqs = getPrerequisites(nodeId, 2);
  const visuals = [];
  if (node.visualAnchor) visuals.push({ nodeId: node.id, name: node.name, visualAnchor: node.visualAnchor });
  prereqs.forEach(p => {
    if (p.visualAnchor) visuals.push({ nodeId: p.id, name: p.name, visualAnchor: p.visualAnchor });
  });
  return {
    ...node,
    visuals,
    prerequisites: prereqs
  };
}

function linkQueryToMultimodalConcepts(query, subject = '') {
  const matched = matchKnowledgeNodes(query, subject);
  if (!matched || matched.length === 0) return [];
  return matched.map(m => getKnowledgeNodeWithVisuals(m.id)).filter(Boolean);
}

function getGradeRank(gradeStr) {
  if (gradeStr === undefined || gradeStr === null || gradeStr === '') return 70;
  if (typeof gradeStr === 'number') {
    if (gradeStr >= 1 && gradeStr <= 6) return gradeStr * 10;
    if (gradeStr >= 7 && gradeStr <= 9) return 70 + (gradeStr - 7) * 10;
    if (gradeStr >= 10 && gradeStr <= 12) return 100 + (gradeStr - 10) * 10;
    // 兼容 pep_topics.json 中高中选必册次编码 grade=13/14，映射到高二/高三段位，绝不跌回初一
    if (gradeStr === 13) return 115;
    if (gradeStr >= 14) return 125;
    return 70;
  }
  const str = String(gradeStr).trim().toLowerCase();
  // 先匹配两位数（10-14），避免 '10_up'/'11_up'/'12_up' 误命中 '1_'/'2_'
  if (str === '14' || str.startsWith('14_') || str.includes('14年级')) return 125;
  if (str === '13' || str.startsWith('13_') || str.includes('13年级')) return 115;
  if (str.includes('12_up') || str.includes('12上') || str.includes('高三上')) return 121;
  if (str.includes('12_down') || str.includes('12下') || str.includes('高三下')) return 122;
  if (str === '12' || str.startsWith('12') || str.includes('高三') || str.includes('十二年级')) return 120;
  if (str.includes('11_up') || str.includes('11上') || str.includes('高二上')) return 111;
  if (str.includes('11_down') || str.includes('11下') || str.includes('高二下')) return 112;
  if (str === '11' || str.startsWith('11') || str.includes('高二') || str.includes('十一年级')) return 110;
  if (str.includes('10_up') || str.includes('10上') || str.includes('高一上')) return 101;
  if (str.includes('10_down') || str.includes('10下') || str.includes('高一下')) return 102;
  if (str === '10' || str.startsWith('10') || str.includes('高一') || str.includes('十年级')) return 100;
  if (str.includes('9_up') || str.includes('9上') || str.includes('九年级上')) return 91;
  if (str.includes('9_down') || str.includes('9下') || str.includes('九年级下')) return 92;
  if (str === '9' || str.startsWith('9') || str.includes('初三') || str.includes('九年级')) return 90;
  if (str.includes('8_up') || str.includes('8上') || str.includes('八年级上')) return 81;
  if (str.includes('8_down') || str.includes('8下') || str.includes('八年级下')) return 82;
  if (str === '8' || str.startsWith('8') || str.includes('初二') || str.includes('八年级')) return 80;
  if (str.includes('7_up') || str.includes('7上') || str.includes('七年级上')) return 71;
  if (str.includes('7_down') || str.includes('7下') || str.includes('七年级下')) return 72;
  if (str === '7' || str.startsWith('7') || str.includes('初一') || str.includes('七年级')) return 70;
  if (str === '1' || str.startsWith('1_') || str.includes('1年级') || str.includes('一年级')) return 10;
  if (str === '2' || str.startsWith('2_') || str.includes('2年级') || str.includes('二年级')) return 20;
  if (str === '3' || str.startsWith('3_') || str.includes('3年级') || str.includes('三年级')) return 30;
  if (str === '4' || str.startsWith('4_') || str.includes('4年级') || str.includes('四年级')) return 40;
  if (str === '5' || str.startsWith('5_') || str.includes('5年级') || str.includes('五年级')) return 50;
  if (str === '6' || str.startsWith('6_') || str.includes('6年级') || str.includes('六年级')) return 60;
  return 70;
}

function formatGradeLabel(grade, semester) {
  const semStr = semester ? (semester === '上' || semester === 'up' ? '上学期' : '下学期') : '';
  if (typeof grade === 'number' || /^\d+$/.test(String(grade))) {
    const g = Number(grade);
    if (g >= 1 && g <= 6) return `小学${g}年级${semStr}`;
    if (g >= 7 && g <= 9) return `初中${g - 6}年级(${g}年级)${semStr}`;
    if (g >= 10 && g <= 12) return `高中${g - 9}年级(${g}年级)${semStr}`;
    if (g === 13) return `高中2年级(11年级)选择性必修${semStr}`;
    if (g >= 14) return `高中3年级(12年级)选择性必修${semStr}`;
    return `综合学段${semStr}`;
  }
  const str = String(grade || '').trim();
  const map = {
    '1_up': '小学1年级上学期', '1_down': '小学1年级下学期',
    '2_up': '小学2年级上学期', '2_down': '小学2年级下学期',
    '3_up': '小学3年级上学期', '3_down': '小学3年级下学期',
    '4_up': '小学4年级上学期', '4_down': '小学4年级下学期',
    '5_up': '小学5年级上学期', '5_down': '小学5年级下学期',
    '6_up': '小学6年级上学期', '6_down': '小学6年级下学期',
    '7_up': '初一(7年级)上学期', '7_down': '初一(7年级)下学期',
    '8_up': '初二(8年级)上学期', '8_down': '初二(8年级)下学期',
    '9_up': '初三(9年级)上学期', '9_down': '初三(9年级)下学期',
    '10_up': '高一(10年级)上学期', '10_down': '高一(10年级)下学期',
    '11_up': '高二(11年级)上学期', '11_down': '高二(11年级)下学期',
    '12_up': '高三(12年级)上学期', '12_down': '高三(12年级)下学期'
  };
  return map[str] || str || '综合学段';
}

function findTopicsByKeyword(keyword, options = {}) {
  const { grade, subject, limit = 10, strictGrade = false } = options;
  const kw = keyword ? String(keyword).trim().toLowerCase() : '';
  const normSubj = subject ? normalizeSubject(subject) : '';
  const gradeRank = (grade !== undefined && grade !== null && grade !== '') ? getGradeRank(grade) : null;

  // Direct ID exact match
  if (kw && KNOWLEDGE_GRAPH[kw]) {
    return [KNOWLEDGE_GRAPH[kw]];
  }

  function scoreTopics(queryKw, subjFilter) {
    const scored = [];
    const cleanKw = queryKw ? queryKw.replace(/^(已知|若|求|请问|老师[，,]?|帮我看看|计算|求解|如何理解|怎么做|关于|什么是)+/, '').trim() : '';

    for (const node of Object.values(KNOWLEDGE_GRAPH)) {
      if (subjFilter) {
        const nodeSubj = normalizeSubject(node.subject);
        if (nodeSubj && nodeSubj !== subjFilter && !nodeSubj.includes(subjFilter) && !subjFilter.includes(nodeSubj)) {
          continue;
        }
      }

      const nodeRank = getGradeRank(node.grade);

      if (!queryKw) {
        if (gradeRank !== null && Math.abs(nodeRank - gradeRank) > 5) {
          continue;
        }
        scored.push({ node, score: 1 });
        continue;
      }

      if (strictGrade && gradeRank !== null && Math.abs(nodeRank - gradeRank) > 5) {
        continue;
      }

      const nodeId = String(node.id).toLowerCase();
      const nodeName = String(node.name).toLowerCase();
      const baseNodeName = nodeName.replace(/(的概念|及其逆定理|及其图像与性质|的意义和基本性质|的认识|初步认识|及其应用|与性质|的基本性质)$/, '');

      let score = 0;

      if (nodeId === queryKw) {
        score = 1000;
      } else if (nodeName === queryKw) {
        score = 600;
      } else if (nodeName.startsWith(queryKw)) {
        score = 350 + Math.max(0, 50 - nodeName.length);
      } else if (nodeName.includes(queryKw)) {
        score = 250 - Math.min(50, nodeName.length - queryKw.length);
      } else if (queryKw.includes(nodeName) && nodeName.length >= 2) {
        score = 260 + nodeName.length * 10;
      } else if (baseNodeName.length >= 2 && queryKw.includes(baseNodeName)) {
        score = 240 + baseNodeName.length * 10;
      } else if (cleanKw && cleanKw.length >= 2 && (nodeName.includes(cleanKw) || (baseNodeName.length >= 2 && cleanKw.includes(baseNodeName)))) {
        score = 200;
      } else if (node.keywords && node.keywords.some(k => String(k).toLowerCase() === queryKw)) {
        score = 180;
      } else if (node.keywords && node.keywords.some(k => String(k).toLowerCase().includes(queryKw))) {
        score = 150;
      }

      // Keyword token accumulator: rewarding multi-term matches
      if (node.keywords && node.keywords.length > 0) {
        let kwMatches = 0;
        for (const k of node.keywords) {
          const kStr = String(k).toLowerCase();
          if (kStr.length >= 2 && queryKw.includes(kStr)) {
            kwMatches++;
          }
        }
        if (kwMatches > 0) {
          score = Math.max(score, 120 + kwMatches * 60);
        }
      }

      if (score === 0) {
        if (node.chapter && String(node.chapter).toLowerCase().includes(queryKw)) {
          score = 90;
        } else if (node.chapter && queryKw.includes(String(node.chapter).toLowerCase())) {
          score = 95;
        } else if (node.domain && String(node.domain).toLowerCase().includes(queryKw)) {
          score = 70;
        } else if (node.description && String(node.description).toLowerCase().includes(queryKw)) {
          score = 50;
        }
      }

      if (score > 0) {
        // 强化同学段亲和与跨学段防误匹配（例如高中生搜“圆锥曲线”优先匹配高中圆锥曲线，避免误配小学六年级“圆锥的认识”）
        if (gradeRank !== null) {
          const getStage = (r) => (r >= 100 ? 3 : r >= 70 ? 2 : 1);
          const reqStage = getStage(gradeRank);
          const nodeStage = getStage(nodeRank);
          if (Math.abs(nodeRank - gradeRank) <= 5) {
            score += 120;
          } else if (reqStage === nodeStage) {
            score += 65;
          } else if (reqStage === 3 && nodeStage === 1) {
            score -= 180;
          } else if (reqStage === 1 && nodeStage === 3) {
            score -= 180;
          } else {
            score -= 40;
          }
        }
        scored.push({ node, score });
      }
    }
    return scored;
  }

  let candidates = scoreTopics(kw, normSubj);

  // Fallback 1: if subject filter yielded 0 results, search across all subjects
  if (candidates.length === 0 && normSubj && kw) {
    candidates = scoreTopics(kw, '');
  }

  // Fallback 2: matchKnowledgeNodes integration
  if (candidates.length === 0 && kw) {
    const fallbackNodes = matchKnowledgeNodes(kw, normSubj);
    for (const f of fallbackNodes) {
      candidates.push({ node: f, score: 100 });
    }
  }

  candidates.sort((a, b) => b.score - a.score);
  return candidates.slice(0, limit).map(s => s.node);
}

function findTopicByKeyword(keyword, grade, subject) {
  const topics = findTopicsByKeyword(keyword, { grade, subject, limit: 1 });
  return topics.length > 0 ? topics[0] : null;
}

function tracePrerequisiteChain(topicIdOrName, maxDepth = 5) {
  if (!topicIdOrName) return [];

  let startNode = KNOWLEDGE_GRAPH[topicIdOrName];
  if (!startNode) {
    startNode = findTopicByKeyword(topicIdOrName);
  }
  if (!startNode) return [];

  const chain = [];
  const visited = new Set();
  let curr = startNode;

  function formatChainNode(node, stepIndex, isTarget = false, isRoot = false, reason = '') {
    const directPrereqIds = (node.prerequisites || []).filter(pId => KNOWLEDGE_GRAPH[pId]);
    const directPrereqNodes = directPrereqIds.map(pId => KNOWLEDGE_GRAPH[pId]);

    return {
      step: stepIndex,
      id: node.id,
      name: node.name,
      subject: node.subject,
      grade: node.grade,
      gradeLabel: formatGradeLabel(node.grade, node.semester),
      semester: node.semester || '',
      chapter: node.chapter || '',
      domain: node.domain || '',
      type: node.type || 'conceptual',
      description: node.description || node.coreRule || node.name,
      coreRule: node.coreRule || node.description || node.name,
      commonMistake: node.commonMistake || '',
      mastery_criteria: node.mastery_criteria || [],
      diagnostic_question: node.diagnostic_question || (node.foundationQuestion ? {
        question: node.foundationQuestion,
        answer: node.foundationAnswer || '遵循基本定理推导',
        hint: node.foundationHint || node.coreRule,
        analysis: node.foundationAnalysis || node.coreRule
      } : (node.coreRule ? {
        question: `【${node.name}基石自测】请简要写出其核心定理或解题法则：`,
        answer: node.coreRule,
        hint: node.description || node.name,
        analysis: `掌握【${node.name}】是顺利攻克后续综合考点的根基。`
      } : null)),
      root_reason: node.root_reason || '',
      prerequisites: directPrereqIds,
      prerequisiteCount: directPrereqIds.length,
      allPrerequisites: directPrereqNodes.map(p => ({
        id: p.id,
        name: p.name,
        grade: p.grade,
        gradeLabel: formatGradeLabel(p.grade, p.semester),
        chapter: p.chapter || '',
        subject: p.subject || ''
      })),
      reason: reason || '',
      isTarget,
      isRoot
    };
  }

  function getMinGradeRankReachable(nodeId, memo = {}, callStack = new Set()) {
    if (memo[nodeId] !== undefined) return memo[nodeId];
    if (callStack.has(nodeId)) return 999;
    callStack.add(nodeId);

    const n = KNOWLEDGE_GRAPH[nodeId];
    if (!n) return 999;
    let minRank = getGradeRank(n.grade);

    for (const pId of n.prerequisites || []) {
      const childMin = getMinGradeRankReachable(pId, memo, callStack);
      if (childMin < minRank) {
        minRank = childMin;
      }
    }

    callStack.delete(nodeId);
    memo[nodeId] = minRank;
    return minRank;
  }

  const memoRanks = {};
  visited.add(curr.id);
  let step = 0;

  while (curr && step <= maxDepth) {
    const isTarget = (step === 0);
    const prereqIds = (curr.prerequisites || []).filter(pId => !visited.has(pId) && KNOWLEDGE_GRAPH[pId]);
    const isRoot = (prereqIds.length === 0 || step === maxDepth);

    let stepReason = '';
    if (step > 0 && chain.length > 0) {
      const prevNode = chain[chain.length - 1];
      const depKey = `${prevNode.id}->${curr.id}`;
      stepReason = (dependencyInfoMap && dependencyInfoMap[depKey]?.reason) || `掌握【${prevNode.name}】需要先学好前置基石【${curr.name}】`;
    }

    chain.push(formatChainNode(curr, step, isTarget, isRoot, stepReason));

    if (isRoot) {
      break;
    }

    // Select the prerequisite that leads to earlier grades / foundation
    let bestPrereqId = null;
    let lowestReachableRank = Infinity;
    let lowestDirectGradeRank = Infinity;

    for (const pId of prereqIds) {
      const pNode = KNOWLEDGE_GRAPH[pId];
      const directRank = getGradeRank(pNode.grade);
      const reachableRank = getMinGradeRankReachable(pId, memoRanks);

      if (reachableRank < lowestReachableRank || (reachableRank === lowestReachableRank && directRank < lowestDirectGradeRank)) {
        lowestReachableRank = reachableRank;
        lowestDirectGradeRank = directRank;
        bestPrereqId = pId;
      }
    }

    if (!bestPrereqId) {
      chain[chain.length - 1].isRoot = true;
      break;
    }

    visited.add(bestPrereqId);
    curr = KNOWLEDGE_GRAPH[bestPrereqId];
    step++;
  }

  return chain;
}

function getKnowledgeGraphStats() {
  const topics = Object.values(KNOWLEDGE_GRAPH);
  const subjects = new Set();
  const grades = new Set();
  let totalPrereqs = 0;

  for (const t of topics) {
    if (t.subject) subjects.add(t.subject);
    if (t.grade !== undefined) grades.add(t.grade);
    if (Array.isArray(t.prerequisites)) totalPrereqs += t.prerequisites.length;
  }

  return {
    totalTopics: topics.length,
    totalDependencies: Object.keys(dependencyInfoMap).length || totalPrereqs,
    subjects: Array.from(subjects),
    grades: Array.from(grades).sort((a, b) => getGradeRank(a) - getGradeRank(b))
  };
}

function buildRemedyCard(rootCauseNode, currentNode) {
  if (!rootCauseNode) return null;

  const defaultQuestion = rootCauseNode.foundationQuestion || `【${rootCauseNode.name}基石自测】请根据其核心法则写出标准解答：`;
  const defaultAnswer = rootCauseNode.foundationAnswer || '遵循基本定理推导';
  const defaultHint = rootCauseNode.foundationHint || rootCauseNode.coreRule;
  const defaultAnalysis = rootCauseNode.foundationAnalysis || rootCauseNode.coreRule;

  return {
    nodeId: rootCauseNode.id,
    conceptName: rootCauseNode.name,
    grade: rootCauseNode.grade,
    subject: rootCauseNode.subject || '数学',
    coreRule: rootCauseNode.coreRule,
    commonMistake: rootCauseNode.commonMistake,
    teacherMnemonic: rootCauseNode.teacherMnemonic || '吃透底层概念，解题势如破竹！',
    lifeAnalogy: rootCauseNode.lifeAnalogy || '就像建高楼必须先打好地基，基础概念过关，难题迎刃而解。',
    feynmanChallenge: rootCauseNode.feynmanChallenge || '',
    question: defaultQuestion,
    answer: defaultAnswer,
    hint: defaultHint,
    analysis: defaultAnalysis,
    diagnosisReason: `你在解答【${currentNode.name}】时若遇阻碍，核心根因在于前置基石【${rootCauseNode.name}】存在断层漏洞。先花2分钟打通这个底层卡点，难题即可迎刃而解！`
  };
}

function getCrossGradeRootCause(query, subject = '数学', currentGrade = '7_up', recentWeakPoints = []) {
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

  if (matchedNodes.length === 0) {
    const fallbackNode = subject === '物理' ? KNOWLEDGE_GRAPH['phys_density'] : KNOWLEDGE_GRAPH['math_rational_operations'];
    if (!fallbackNode) return null;
    return {
      currentNode: fallbackNode,
      rootCauseNode: fallbackNode,
      chainPath: [{ id: fallbackNode.id, name: fallbackNode.name, grade: fallbackNode.grade, isCurrent: true, isRoot: true, tag: '底层基石 🌟' }],
      hasCrossGradeGap: false,
      remedy: buildRemedyCard(fallbackNode, fallbackNode)
    };
  }

  const currentNode = matchedNodes[0];
  const allPrereqs = getPrerequisites(currentNode.id, 4);

  if (allPrereqs.length === 0) {
    return {
      currentNode,
      rootCauseNode: currentNode,
      chainPath: [{ id: currentNode.id, name: currentNode.name, grade: currentNode.grade, isCurrent: true, isRoot: true, tag: '核心基石 🌟' }],
      hasCrossGradeGap: false,
      remedy: buildRemedyCard(currentNode, currentNode)
    };
  }

  const currentRank = getGradeRank(currentNode.grade || currentGrade);

  // Find lowest grade prerequisite or deepest ancestor
  let bestRootCause = allPrereqs[allPrereqs.length - 1];
  const lowerGradePrereq = allPrereqs.find(p => getGradeRank(p.grade) < currentRank);
  if (lowerGradePrereq) {
    bestRootCause = lowerGradePrereq;
  }

  const chainPath = [];
  chainPath.push({
    id: bestRootCause.id,
    name: bestRootCause.name,
    grade: bestRootCause.grade,
    isCurrent: false,
    isRoot: true,
    tag: '底层基石 🌟'
  });

  const intermediates = allPrereqs.filter(p => p.id !== bestRootCause.id && p.id !== currentNode.id);
  if (intermediates.length > 0) {
    chainPath.push({
      id: intermediates[0].id,
      name: intermediates[0].name,
      grade: intermediates[0].grade,
      isCurrent: false,
      isRoot: false,
      tag: '过渡阶梯 🪜'
    });
  }

  chainPath.push({
    id: currentNode.id,
    name: currentNode.name,
    grade: currentNode.grade,
    isCurrent: true,
    isRoot: false,
    tag: '当前考点 🎯'
  });

  const remedy = buildRemedyCard(bestRootCause, currentNode);

  return {
    currentNode,
    rootCauseNode: bestRootCause,
    chainPath,
    hasCrossGradeGap: getGradeRank(bestRootCause.grade) < currentRank,
    remedy
  };
}

module.exports = {
  KNOWLEDGE_GRAPH,
  getPrerequisites,
  matchKnowledgeNodes,
  diagnosePrerequisiteKnowledge,
  formatGraphRAGPromptSection,
  getKnowledgeNodeWithVisuals,
  linkQueryToMultimodalConcepts,
  getGradeRank,
  formatGradeLabel,
  buildRemedyCard,
  getCrossGradeRootCause,
  findTopicByKeyword,
  findTopicsByKeyword,
  tracePrerequisiteChain,
  getKnowledgeGraphStats,
  dependencyInfoMap,
  SUBJECT_MAP,
  normalizeSubject
};
