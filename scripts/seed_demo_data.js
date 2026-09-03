/**
 * seed_demo_data.js
 * 
 * Provides an out-of-the-box demo textbook dataset for LanceDB.
 * Allows new users to test RAG features immediately without downloading huge PDF files.
 */
const lancedb = require('@lancedb/lancedb');
const path = require('path');
const { DB_PATH } = require('../server/config');
const { getEmbedding } = require('../server/services/embedding');

const DEMO_CHUNKS = [
  {
    source: '人教版_数学_一年级上册_第一单元.pdf',
    page: 2,
    text: '第一单元：准备课。数一数：图中有一面国旗，两张桌子，三副单杠，四个垃圾桶，五架飞机，六棵大树，七朵花，八个小朋友，九只小鸟，十只蝴蝶。认识数字1到10是数学学习的第一步。'
  },
  {
    source: '人教版_语文_一年级上册_课文.pdf',
    page: 12,
    text: '课文《秋天》：天气凉了，树叶黄了，一片片叶子从树上落下来。天空那么蓝，那么高。一群大雁往南飞，一会儿排成个“人”字，一会儿排成个“一”字。啊！秋天来了！'
  },
  {
    source: '人教版_数学_三年级上册_万以内的加法和减法.pdf',
    page: 15,
    text: '第二单元：万以内的加法和减法。两位数加两位数的口算方法：先把加数分解成整十数和一位数，然后整十数加整十数，一位数加一位数，最后把两次相加的结果合起来。加法验算：可以通过交换两个加数的位置再算一遍，或者用和减去其中一个加数。'
  },
  {
    source: '人教版_数学_七年级上册_第一章有理数.pdf',
    page: 8,
    text: '第一章：有理数。正数和负数：像3、1.5、2/3这样大于0的数叫做正数；在正数前面加上负号“-”的数叫做负数，如-3、-1.5等。0既不是正数，也不是负数。相反数：只有符号不同的两个数互为相反数，0的相反数是0。绝对值：数轴上表示数a的点与原点的距离叫做数a的绝对值，记作|a|。'
  },
  {
    source: '人教版_数学_八年级上册_勾股定理.pdf',
    page: 22,
    text: '第十七章：勾股定理。如果直角三角形的两条直角边长分别为a，b，斜边长为c，那么a的平方加上b的平方等于c的平方，即 a^2 + b^2 = c^2。勾股定理揭示了直角三角形三边之间的数量关系，是初中几何的重要基石。'
  },
  {
    source: '人教版_物理_八年级上册_声现象.pdf',
    page: 14,
    text: '第一章：机械运动与声现象。声音是由物体的振动产生的，一切发声的物体都在振动。声音的传播需要介质，真空中不能传声。声音在固体中传播最快，在液体中次之，在气体中最慢。15℃时空气中的声速约为340米/秒。'
  },
  {
    source: '人教版_化学_九年级上册_空气与氧气.pdf',
    page: 27,
    text: '第二单元：我们周围的空气。空气是由多种成分组成的混合物，按体积分数计算：氮气约占78%，氧气约占21%，稀有气体约占0.94%，二氧化碳约占0.03%，其他气体和杂质约占0.03%。纯净物由单一物质组成，混合物由两种或多种物质混合而成。'
  }
];

async function seed() {
  console.log('🚀 [Seed] Starting demo textbook dataset initialization for LanceDB...');
  console.log(`📁 Database path: ${DB_PATH}`);

  const db = await lancedb.connect(DB_PATH);
  
  const records = [];
  for (let i = 0; i < DEMO_CHUNKS.length; i++) {
    const chunk = DEMO_CHUNKS[i];
    console.log(`Processing [${i + 1}/${DEMO_CHUNKS.length}]: ${chunk.source}`);
    
    let vector = null;
    try {
      vector = await getEmbedding(chunk.text);
    } catch (e) {
      // ignore
    }

    if (!vector || vector.length !== 768) {
      // Deterministic mock vector matching 768 dimensions
      vector = new Array(768).fill(0).map((_, idx) => Math.sin(idx + i) * 0.05);
    }

    records.push({
      id: i + 1,
      vector,
      text: chunk.text,
      source: chunk.source,
      page: chunk.page
    });
  }

  let table;
  try {
    table = await db.openTable('textbooks');
    console.log('📖 Existing "textbooks" table found.');
    const sample = await table.query().limit(1).toArray();
    if (sample.length > 0 && sample[0].vector && sample[0].vector.length !== 768) {
      console.log(`⚠️ Existing table vector dimension is ${sample[0].vector.length} (mismatched with model 768). Recreating table...`);
      await db.dropTable('textbooks');
      table = await db.createTable('textbooks', records);
    } else {
      console.log('Appending demo records to existing textbooks table...');
      await table.add(records);
    }
  } catch (err) {
    if (err.message && (err.message.includes('not found') || err.message.includes('Table') || err.message.includes('Dataset'))) {
      console.log('🆕 Creating new "textbooks" table with demo records...');
      table = await db.createTable('textbooks', records);
    } else {
      throw err;
    }
  }

  // Create FTS index
  try {
    await table.createIndex('text', { config: lancedb.Index.fts() });
    console.log('🔍 Full-Text Search (FTS) index created/verified.');
  } catch (e) {
    console.warn('  Note on FTS index:', e.message);
  }

  const count = await table.countRows();
  console.log(`✅ [Seed Completed] "textbooks" table now has ${count} records with 768 dimensions.`);
  console.log('🎉 You can now start the server and ask curriculum-related questions!');
}

seed().catch(err => {
  console.error('❌ Failed to seed demo data:', err);
  process.exit(1);
});
