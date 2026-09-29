const { test, before, after } = require('node:test');
const assert = require('node:assert');
const http = require('http');
const undici = require('undici');

// 关键：必须在 require('../server/app') 之前完成 undici.fetch 的 Mock！
const originalUndiciFetch = undici.fetch;
let currentMockResponse = null;

undici.fetch = async (url, options) => {
  const urlStr = String(url);

  // Mock embedding calls immediately so LanceDB dimension check never fails or invalidates test keys
  if (urlStr.includes('models/gemini-embedding-2') || urlStr.includes('embedContent')) {
    return {
      ok: true,
      status: 200,
      json: async () => ({ embedding: { values: new Array(768).fill(0.1) } }),
      headers: new undici.Headers()
    };
  }

  if (urlStr.includes('generativelanguage.googleapis.com') || urlStr.includes('deepseek') || urlStr.includes('chat/completions')) {
    if (currentMockResponse) {
      const text = typeof currentMockResponse === 'string'
        ? currentMockResponse
        : (currentMockResponse.candidates?.[0]?.content?.parts?.[0]?.text ||
           currentMockResponse.choices?.[0]?.message?.content ||
           JSON.stringify(currentMockResponse));

      const dualResponse = {
        candidates: [{
          content: {
            parts: [{ text }]
          }
        }],
        choices: [{
          message: {
            content: text
          }
        }]
      };

      return {
        ok: true,
        status: 200,
        json: async () => dualResponse,
        text: async () => JSON.stringify(dualResponse),
        headers: new undici.Headers()
      };
    }
  }
  return originalUndiciFetch(url, options);
};

// 在 Mock 生效之后，再加载应用模块
const { initDB, closeDB } = require('../server/db/init');
const { createApp } = require('../server/app');
const { resetKeyPool } = require('../server/services/embedding');

test('Variant Questions Workflow (作业帮式举一反三变式母题闭环)', async (t) => {
  let server;
  let baseUrl;

  before(async () => {
    resetKeyPool();
    await initDB();
    const app = createApp();
    server = http.createServer(app);
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const port = server.address().port;
    baseUrl = `http://127.0.0.1:${port}`;
  });

  after(async () => {
    undici.fetch = originalUndiciFetch;
    if (server) await new Promise(resolve => server.close(resolve));
    await closeDB();
  });

  await t.test('POST /api/mistakes/generate-variants rejects missing question', async () => {
    const res = await undici.request(`${baseUrl}/api/mistakes/generate-variants`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    assert.strictEqual(res.statusCode, 400);
    const body = await res.body.json();
    assert.match(body.error, /Missing original question/i);
  });

  await t.test('POST /api/mistakes/generate-variants successfully returns 2 structured variants', async () => {
    currentMockResponse = {
      candidates: [{
        content: {
          parts: [{
            text: JSON.stringify({
              core_knowledge: "一元一次方程的应用与追及问题模型",
              variants: [
                {
                  type: "consolidation",
                  tag: "同类巩固",
                  question: "小明和小红相距200米，小明速度5m/s，小红速度3m/s，问几秒后追上？",
                  hint: "设追及时间为t，利用速度差×时间=路程差列方程。",
                  answer: "100秒",
                  analysis: "方程为 (5 - 3)t = 200，解得 t = 100。"
                },
                {
                  type: "advanced",
                  tag: "避坑拔高",
                  question: "若小红先出发10秒，小明再开始追赶，问小明出发多少秒后追上小红？",
                  hint: "注意先算出小红先跑了多少米路程，追及初始距离发生了变化。",
                  answer: "115秒",
                  analysis: "小红先走距离为 3×10=30米，总追及距离变为 230米。(5-3)t = 230 => t = 115。"
                }
              ]
            })
          }]
        }
      }]
    };

    const res = await undici.request(`${baseUrl}/api/mistakes/generate-variants`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        question: "甲乙两人在400米环形跑道同向跑步，甲速6m/s，乙速4m/s，多少秒后甲第一次追上乙？",
        answer: "400 / (6 - 4) = 200 秒",
        grade: "7_up",
        subject: "数学"
      })
    });

    assert.strictEqual(res.statusCode, 200);
    const body = await res.body.json();
    assert.strictEqual(body.success, true);
    assert.strictEqual(body.data.variants.length, 2);
    assert.strictEqual(body.data.variants[0].tag, "同类巩固");
    assert.strictEqual(body.data.variants[1].tag, "避坑拔高");
  });

  await t.test('POST /api/mistakes/check-variant-answer checks student answer and awards score', async () => {
    currentMockResponse = {
      candidates: [{
        content: {
          parts: [{
            text: JSON.stringify({
              is_correct: true,
              rating: "excellent",
              score_earned: 20,
              comment: "步骤严密！公式变形完全正确！",
              detailed_step: "(5-3)t = 200 => 2t = 200 => t = 100秒"
            })
          }]
        }
      }]
    };

    const res = await undici.request(`${baseUrl}/api/mistakes/check-variant-answer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        question: "小明和小红相距200米，小明速度5m/s，小红速度3m/s，问几秒后追上？",
        standard_answer: "100秒",
        student_answer: "设t秒，(5-3)t = 200，解得 t = 100秒",
        grade: "7_up"
      })
    });

    assert.strictEqual(res.statusCode, 200);
    const body = await res.body.json();
    assert.strictEqual(body.success, true);
    assert.strictEqual(body.feedback.is_correct, true);
    assert.strictEqual(body.feedback.score_earned, 20);
    assert.strictEqual(body.feedback.rating, "excellent");
  });
});
