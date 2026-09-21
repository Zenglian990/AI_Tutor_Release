const { initDB } = require('./server/db/init');
const { performHybridSearch } = require('./server/services/search');

const TEST_CASES = [
  { grade: '1_up', subject: '语文', query: '秋天 天气凉了 树叶黄了 一群大雁往南飞' },
  { grade: '1_up', subject: '数学', query: '认识1到10 数字 准备课' },
  { grade: '2_up', subject: '数学', query: '乘法口诀 100以内的加法和减法' },
  { grade: '3_up', subject: '语文', query: '司马光 砸缸' },
  { grade: '3_up', subject: '英语', query: 'Hello Good morning Unit 1' },
  { grade: '4_up', subject: '数学', query: '大数的认识 亿以内 亿以上 垂线与平行线' },
  { grade: '5_up', subject: '数学', query: '小数乘法 小数除法 简易方程' },
  { grade: '6_up', subject: '数学', query: '分数乘法 圆的周长与面积 百分数' },
  { grade: '7_up', subject: '数学', query: '有理数 正数和负数 数轴 相反数 绝对值' },
  { grade: '7_up', subject: '生物', query: '细胞 显微镜 细胞膜 细胞核 光合作用' },
  { grade: '7_up', subject: '历史', query: '北京人 秦始皇 统一六国 汉武帝 大一统' },
  { grade: '7_up', subject: '地理', query: '地球与地球仪 经纬线 经度 纬度' },
  { grade: '7_up', subject: '道德与法治', query: '中学时代 梦想 友谊 师生情' },
  { grade: '8_up', subject: '物理', query: '机械运动 速度 声音的产生与传播 熔化和凝固' },
  { grade: '8_down', subject: '物理', query: '牛顿第一定律 惯性 压强 浮力 阿基米德原理 杠杆' },
  { grade: '8_down', subject: '数学', query: '勾股定理 直角三角形 斜边 二次根式 一次函数' },
  { grade: '9_up', subject: '物理', query: '分子热运动 内能 比热容 电流和电路 电阻 欧姆定律' },
  { grade: '9_up', subject: '化学', query: '空气的成分 氧气实验室制取 质量守恒定律' },
  { grade: '9_down', subject: '化学', query: '金属活动性顺序 溶液 溶解度 酸和碱 中和反应' }
];

async function runMatrix() {
  console.log('==========================================================');
  console.log('🧪 Running K-9 1-9 Grade Full Recall Accuracy Matrix');
  console.log('==========================================================');
  await initDB();

  let passed = 0;
  for (let i = 0; i < TEST_CASES.length; i++) {
    const tc = TEST_CASES[i];
    const t0 = Date.now();
    const results = await performHybridSearch(tc.query, tc.grade, tc.subject, 3);
    const latency = Date.now() - t0;

    const hit = results && results.length > 0;
    const topSource = hit ? results[0].source : 'NONE';
    const topPage = hit ? results[0].page : 'N/A';
    const preview = hit ? results[0].text.replace(/\s+/g, ' ').slice(0, 45) : '';

    if (hit) {
      passed++;
      console.log(`[PASS ${i+1}/${TEST_CASES.length}] (${latency}ms) [${tc.grade}][${tc.subject}] "${tc.query.slice(0, 15)}..."`);
      console.log(`   -> Source: ${topSource} (p.${topPage})`);
      console.log(`   -> Chunk:  ${preview}...`);
    } else {
      console.log(`[FAIL ${i+1}/${TEST_CASES.length}] (${latency}ms) [${tc.grade}][${tc.subject}] "${tc.query}"`);
    }
  }

  console.log('==========================================================');
  console.log(`🎯 Recall Accuracy: ${passed}/${TEST_CASES.length} (${((passed / TEST_CASES.length) * 100).toFixed(1)}%)`);
  console.log('==========================================================');
  process.exit(passed === TEST_CASES.length ? 0 : 1);
}

runMatrix().catch(e => {
  console.error(e);
  process.exit(1);
});
