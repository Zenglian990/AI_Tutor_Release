const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const undici = require('undici');

// Mock undici.fetch
const originalFetch = undici.fetch;
undici.fetch = async (url, options) => {
  const urlStr = String(url);

  if (urlStr.includes('generativelanguage.googleapis.com')) {
    if (urlStr.includes('models/gemini-embedding-2') || urlStr.includes('embedContent')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({ embedding: { values: new Array(768).fill(0.1) } }),
        headers: new undici.Headers()
      };
    }

    const reqBody = options.body ? JSON.parse(options.body) : {};
    const promptText = reqBody.contents?.[0]?.parts?.[0]?.text || "";

    if (promptText.includes('靶向溯源变式') || promptText.includes('真实错题集')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          candidates: [{
            content: {
              parts: [{
                text: JSON.stringify({
                  title: "【曾小侠】专属靶向溯源巩固卷",
                  subtitle: "针对薄弱知识点靶向查漏补缺",
                  subject: "数学",
                  grade: "7_up",
                  duration: 45,
                  totalScore: 100,
                  rootCauseTopic: "有理数四则运算与去括号",
                  teacherAdvice: "先完成第1题概念自测，遇到变式题注意类比错题的解题规律。",
                  questions: [
                    { id: 1, type: "blank", category: "prerequisite_grounding", question: "计算：- (-5) = ____", score: 15, answer: "5", explanation: "负数的相反数是正数" },
                    { id: 2, type: "choice", category: "isomorphic_variant", question: "若 a = -2，则 -a 的值是？", options: ["A. -2", "B. 2", "C. 0", "D. 4"], score: 15, answer: "B", explanation: "去括号法则" },
                    { id: 3, type: "blank", category: "isomorphic_variant", question: "化简：-(3 - x) = ____", score: 15, answer: "x - 3", explanation: "括号前是负号各项变号" },
                    { id: 4, type: "essay", category: "isomorphic_variant", question: "解方程：3(x - 2) = - (x + 6)", score: 15, answer: "x = 0", explanation: "去括号移项" },
                    { id: 5, type: "essay", category: "advanced_extension", question: "综合探究数轴动点与绝对值", score: 20, answer: "t = 3 或 7", explanation: "分类讨论" },
                    { id: 6, type: "essay", category: "advanced_extension", question: "中考压轴变式拓展", score: 20, answer: "推导成立", explanation: "综合证明" }
                  ]
                })
              }]
            }
          }]
        }),
        headers: new undici.Headers()
      };
    }

    if (promptText.includes('中小学教研员')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          candidates: [{
            content: {
              parts: [{
                text: JSON.stringify({
                  title: "七年级数学下期期末检测模拟题",
                  questions: [
                    { id: 1, type: "choice", question: "已知直线AB、CD相交于点O，且∠AOC=30°，则∠BOD是？", options: ["A. 30°", "B. 60°", "C. 150°", "D. 180°"], score: 8, answer: "A", explanation: "对顶角相等" },
                    { id: 2, type: "choice", question: "测试选择2", options: ["A. 1", "B. 2", "C. 3", "D. 4"], score: 8, answer: "B", explanation: "解析2" },
                    { id: 3, type: "choice", question: "测试选择3", options: ["A. 1", "B. 2", "C. 3", "D. 4"], score: 8, answer: "C", explanation: "解析3" },
                    { id: 4, type: "choice", question: "测试选择4", options: ["A. 1", "B. 2", "C. 3", "D. 4"], score: 8, answer: "D", explanation: "解析4" },
                    { id: 5, type: "choice", question: "测试选择5", options: ["A. 1", "B. 2", "C. 3", "D. 4"], score: 8, answer: "A", explanation: "解析5" },
                    { id: 6, type: "blank", question: "平行线之间的距离处处_____。", score: 8, answer: "相等", explanation: "平行线的基本性质" },
                    { id: 7, type: "blank", question: "测试填空2", score: 8, answer: "2", explanation: "填空2" },
                    { id: 8, type: "blank", question: "测试填空3", score: 8, answer: "3", explanation: "填空3" },
                    { id: 9, type: "essay", question: "测试计算题", score: 20, answer: "9分", explanation: "计算解析" },
                    { id: 10, type: "essay", question: "测试证明题", score: 26, answer: "对顶角", explanation: "证明解析" },
                    { id: 11, type: "essay", question: "测试应用题", score: 40, answer: "40分", explanation: "应用解析" }
                  ]
                })
              }]
            }
          }]
        }),
        headers: new undici.Headers()
      };
    } else if (promptText.includes('阅卷老师')) {
      // 动态返回分数，使客观题和简答题都能被合理阅卷
      let mockScore = 0;
      if (promptText.includes('测试填空2')) mockScore = 8;
      else if (promptText.includes('测试填空3')) mockScore = 8;
      else if (promptText.includes('测试计算题')) mockScore = 20;
      else if (promptText.includes('测试证明题')) mockScore = 26;
      else if (promptText.includes('测试应用题')) mockScore = 30; // 40分扣10分，得30分

      return {
        ok: true,
        status: 200,
        json: async () => ({
          candidates: [{
            content: {
              parts: [{
                text: JSON.stringify({
                  score: mockScore,
                  comment: `阅卷判定成功，得分 ${mockScore}`
                })
              }]
            }
          }]
        }),
        headers: new undici.Headers()
      };
    } else if (promptText.includes('AI 私教')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          candidates: [{
            content: {
              parts: [{
                text: "曾小侠，你今天做得很好！大部分题都掌握了，总评优秀，请继续保持！"
              }]
            }
          }]
        }),
        headers: new undici.Headers()
      };
    } else {
      throw new Error(`Mock Error: Unexpected prompt format! The test expected '中小学教研员', '阅卷老师' or 'AI 私教' but got: ${promptText.substring(0, 100)}...`);
    }
  }

  return originalFetch(url, options);
};

// Import app
process.env.NODE_ENV = 'development';
const { createApp } = require('../server/app');
const { initDB, closeDB } = require('../server/db/init');

let app;
let server;
let baseUrl;

before(async () => {
  process.env.NODE_ENV = 'development';
  await initDB();
  app = createApp();
  await new Promise((resolve) => {
    server = app.listen(0, () => {
      const port = server.address().port;
      baseUrl = `http://localhost:${port}`;
      resolve();
    });
  });
});

after(async () => {
  if (server) {
    await new Promise((resolve) => server.close(resolve));
  }
  await closeDB();
  undici.fetch = originalFetch;
});

// Test Cases
test('Test Paper API: Generate', async () => {
  const res = await fetch(`${baseUrl}/api/test-paper/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grade: '7_up',
      subject: '数学',
      type: 'final',
      edition: '人教版'
    })
  });

  assert.equal(res.status, 200);
  const data = await res.json();
  assert.ok(data.paper);
  assert.equal(data.paper.title, '七年级数学下期期末检测模拟题');
  assert.equal(data.paper.questions.length, 11);
});

test('Test Paper API: Grade', async () => {
  const res = await fetch(`${baseUrl}/api/test-paper/grade`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      student_name: '曾小侠',
      questions: [
        { id: 1, type: "choice", question: "已知直线AB、CD相交于点O，且∠AOC=30°，则∠BOD是？", score: 8, answer: "A", explanation: "对顶角相等" },
        { id: 2, type: "choice", question: "测试选择2", score: 8, answer: "B", explanation: "解析2" },
        { id: 3, type: "choice", question: "测试选择3", score: 8, answer: "C", explanation: "解析3" },
        { id: 4, type: "choice", question: "测试选择4", score: 8, answer: "D", explanation: "解析4" },
        { id: 5, type: "choice", question: "测试选择5", score: 8, answer: "A", explanation: "解析5" },
        { id: 6, type: "blank", question: "平行线之间的距离处处_____。", score: 8, answer: "相等", explanation: "平行线的基本性质" },
        { id: 7, type: "blank", question: "测试填空2", score: 8, answer: "2", explanation: "填空2" },
        { id: 8, type: "blank", question: "测试填空3", score: 8, answer: "3", explanation: "填空3" },
        { id: 9, type: "essay", question: "测试计算题", score: 20, answer: "9分", explanation: "计算解析" },
        { id: 10, type: "essay", question: "测试证明题", score: 26, answer: "对顶角", explanation: "证明解析" },
        { id: 11, type: "essay", question: "测试应用题", score: 40, answer: "40分", explanation: "应用解析" }
      ],
      answers: {
        1: 'A', // 客观选择对 (8分)
        2: 'B', // 客观选择对 (8分)
        3: 'C', // 客观选择对 (8分)
        4: 'D', // 客观选择对 (8分)
        5: 'A', // 客观选择对 (8分)
        6: '相等', // 客观填空对 (8分)
        7: '不同', // 填空错，交由 AI 批阅，AI 返回 8分 (8分)
        8: '3', // 填空对，交由 AI 批阅，AI 返回 8分 (8分)
        9: '做完了', // 简答对，AI 返回 20分 (20分)
        10: '对顶角相等', // 简答对，AI 返回 26分 (26分)
        11: '不会' // 简答错，AI 返回 30分 (30分)
      }
    })
  });

  assert.equal(res.status, 200);
  const data = await res.json();
  // 分数计算: 8*8 + 20 + 26 + 30 = 64 + 76 = 140分
  assert.equal(data.score, 140);
  assert.ok(data.overallComment);
  assert.equal(data.results.length, 11);
  assert.equal(data.results[0].score, 8);
  assert.equal(data.results[5].score, 8);
  assert.equal(data.results[8].score, 20);
  assert.equal(data.results[9].score, 26);
  assert.equal(data.results[10].score, 30);
});

test('Test Paper API: Generate From Mistakes (Targeted Variant Paper)', async () => {
  const { getSqliteDb } = require('../server/db/init');
  const { encryptField } = require('../server/utils/crypto');
  const sqliteDb = getSqliteDb();
  await sqliteDb.run(
    'INSERT INTO mistakes (query, answer, grade, subject, reason, profile_id) VALUES (?, ?, ?, ?, ?, ?)',
    [
      encryptField('计算：- (3 - 5) + (-2) 的结果是多少？'),
      encryptField('学生算成了 -4'),
      '7_up',
      '数学',
      encryptField('去括号时负负得正搞混了，符号法则不牢'),
      'test_variant_student'
    ]
  );

  const res = await fetch(`${baseUrl}/api/test-paper/generate-from-mistakes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      profile_id: 'test_variant_student',
      subject: '数学',
      grade: '7_up',
      student_name: '曾小侠'
    })
  });

  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.success, true);
  assert.ok(data.testPaper);
  assert.equal(data.testPaper.totalScore, 100);
  assert.equal(data.testPaper.questions.length, 6);
  assert.equal(data.testPaper.questions[0].category, 'prerequisite_grounding');
  assert.equal(data.testPaper.questions[1].category, 'isomorphic_variant');
  assert.equal(data.testPaper.questions[4].category, 'advanced_extension');
  assert.ok(data.diagnoses.length >= 1, 'Should trigger GraphRAG diagnosis');
});
