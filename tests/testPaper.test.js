const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const undici = require('undici');

// Mock undici.fetch
const originalFetch = undici.fetch;
undici.fetch = async (url, options) => {
  const urlStr = String(url);

  if (urlStr.includes('generativelanguage.googleapis.com')) {
    const reqBody = options.body ? JSON.parse(options.body) : {};
    const promptText = reqBody.contents?.[0]?.parts?.[0]?.text || "";

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
    } else {
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
    }
  }

  return originalFetch(url, options);
};

// Import app
const { createApp } = require('../server/app');
const { initDB } = require('../server/db/init');

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
