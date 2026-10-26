const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const undici = require('undici');
const { createApp } = require('../server/app');
const { initDB, closeDB } = require('../server/db/init');

// Mock undici.fetch
const originalFetch = undici.fetch;
undici.fetch = async (url, options) => {
  const urlStr = String(url);

  if (urlStr.includes('generativelanguage.googleapis.com')) {
    if (urlStr.includes('models/gemini-embedding') || urlStr.includes('embedContent')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({ embedding: { values: new Array(768).fill(0.1) } }),
        headers: new undici.Headers()
      };
    }

    const reqBody = options.body ? JSON.parse(options.body) : {};
    const promptText = reqBody.contents?.[0]?.parts?.[0]?.text || "";

    if (promptText.includes('高考高频押题') || promptText.includes('新高考数学真实结构')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          candidates: [{
            content: {
              parts: [{
                text: JSON.stringify({
                  title: "2026年新高考数学高频押题密卷",
                  questions: [
                    { id: 1, type: "choice", question: "全集U，集合A={x|x^2-2x-3<0}，B={x|x>1}，A∩B=?", options: ["A. (1,3)", "B. (-1,1)", "C. (-1,3)", "D. (3,+∞)"], score: 5, answer: "A", explanation: "简单交集运算" },
                    { id: 2, type: "choice", question: "复数z(1-i)=1+i，则共轭复数是?", options: ["A. i", "B. -i", "C. 1", "D. -1"], score: 5, answer: "B", explanation: "复数代数运算" },
                    { id: 3, type: "essay", question: "已知函数 f(x) = ln(x) - ax，讨论单调性并证明极值点偏移 x1+x2>2", score: 17, answer: "步骤略", explanation: "构造对称函数F(x)=g(x)-g(2-x)求导判定" }
                  ]
                })
              }]
            }
          }]
        }),
        headers: new undici.Headers()
      };
    }

    if (promptText.includes('高考阅卷标准与步骤采分原则')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          candidates: [{
            content: {
              parts: [{
                text: JSON.stringify({
                  score: 15,
                  comment: "解题思路宏阔，向量建系规范，采分点步骤清晰完整，仅末尾数值有轻微瑕疵，扣除答案分2分。",
                  step_breakdown: {
                    concept: "【审题与立意】成功识别出极值点偏移模型与对称构造法 (4/4分)",
                    deduction: "【逻辑与推导】构造辅助函数 F(x)=g(x)-g(2-x)，求导判定 F'(x)<0 步骤严谨 (9/9分)",
                    conclusion: "【结论与规范】末尾结论推导完整，注意分类讨论边界区间标注 (2/4分)"
                  }
                })
              }]
            }
          }]
        }),
        headers: new undici.Headers()
      };
    }

    return {
      ok: true,
      status: 200,
      json: async () => ({ candidates: [{ content: { parts: [{ text: "{}" }] } }] }),
      headers: new undici.Headers()
    };
  }

  return originalFetch(url, options);
};

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

test('High School Efficacy: Gaokao Hit Paper Generation (高考高频押题与必考母题密卷)', async () => {
  const res = await undici.fetch(`${baseUrl}/api/test-paper/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grade: '12_up',
      subject: '数学',
      type: 'gaokao_hit',
      region: '新高考全国卷 (I卷/II卷)'
    })
  });

  assert.equal(res.status, 200);
  const data = await res.json();
  assert.ok(data.paper, 'Should return a test paper');
  assert.ok(Array.isArray(data.paper.questions), 'Questions should be an array');
  assert.ok(data.paper.title.includes('高考'), 'Title should reflect Gaokao test paper');
});

test('High School Efficacy: Step-based Grading with Detailed Breakdown (按步给分与步骤采分点)', async () => {
  const res = await undici.fetch(`${baseUrl}/api/test-paper/grade`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      student_name: '曾小侠',
      grade: '12_up',
      questions: [
        {
          id: 1,
          type: 'essay',
          question: '已知函数 f(x) = ln(x) - ax，证明极值点偏移 x1 + x2 > 2',
          score: 17,
          answer: '构造函数证明 x1 + x2 > 2',
          explanation: '构造 F(x) = g(x) - g(2-x)'
        }
      ],
      answers: {
        1: '设极值点为 x0=1，构造辅助函数 F(x)=g(x)-g(2-x)，求导可得 F(x)<0，由单调性得 x1+x2>2。'
      }
    })
  });

  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.score, 15);
  assert.ok(data.results[0].step_breakdown, 'Should preserve AI detailed step breakdown');
  assert.ok(data.results[0].step_breakdown.concept.includes('极值点偏移'), 'Should capture concept step breakdown');
  assert.ok(data.results[0].step_breakdown.deduction.includes('推导'), 'Should capture deduction step breakdown');
});
