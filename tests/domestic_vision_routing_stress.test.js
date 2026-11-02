const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert');
const http = require('http');
const undici = require('undici');
const { initDB, closeDB } = require('../server/db/init');
const { createApp } = require('../server/app');

// Intercept undici.fetch to record intercepted requests and provide domestic mock responses
const originalFetch = undici.fetch;
let interceptedRequests = [];

undici.fetch = async (url, options) => {
  const urlStr = String(url);
  const parsedBody = options?.body ? JSON.parse(options.body) : null;
  const authHeader = options?.headers?.Authorization || options?.headers?.authorization || '';

  // Mock OpenAI-compatible chat completion response for domestic vision providers
  if (
    urlStr.includes('siliconflow.cn') ||
    urlStr.includes('dashscope.aliyuncs.com') ||
    urlStr.includes('bigmodel.cn') ||
    urlStr.includes('api.deepseek.com')
  ) {
    interceptedRequests.push({
      url: urlStr,
      options,
      body: parsedBody,
      authHeader
    });

    const mockReply = {
      choices: [{
        message: {
          content: JSON.stringify({
            totalCount: 2,
            correctCount: 2,
            wrongCount: 0,
            accuracyPct: 100,
            summaryHeadline: "国内大模型识别成功，全对",
            teacherPraise: "解题步骤严谨清晰！",
            teacherAdvice: "继续保持良好状态。",
            results: [
              {
                questionNumber: 1,
                type: "填空题",
                questionSnippet: "一元一次方程求解",
                studentAnswer: "x=3",
                standardAnswer: "x=3",
                status: "correct",
                score: 10,
                maxScore: 10,
                keyInsight: "移项准确"
              },
              {
                questionNumber: 2,
                type: "计算题",
                questionSnippet: "整式乘除计算",
                studentAnswer: "6a^3",
                standardAnswer: "6a^3",
                status: "correct",
                score: 10,
                maxScore: 10,
                keyInsight: "同底数幂乘法法则正确"
              }
            ]
          })
        }
      }]
    };

    return {
      ok: true,
      status: 200,
      json: async () => mockReply,
      text: async () => JSON.stringify(mockReply),
      headers: new undici.Headers({ 'content-type': 'application/json' })
    };
  }

  // Fallback to original
  return originalFetch(url, options);
};

let server;
let baseUrl;

before(async () => {
  await initDB();
  const app = createApp();
  await new Promise((resolve) => {
    server = http.createServer(app);
    server.listen(0, '127.0.0.1', () => {
      baseUrl = `http://127.0.0.1:${server.address().port}`;
      resolve();
    });
  });
});

after(async () => {
  undici.fetch = originalFetch;
  if (server) {
    await new Promise((resolve) => server.close(resolve));
  }
});

beforeEach(() => {
  interceptedRequests = [];
});

function createMultipartFormData(fields, fileBuffer) {
  const boundary = '----BoundaryChallengerTest' + Math.random().toString(36).substring(2);
  let body = '';
  for (const [key, val] of Object.entries(fields)) {
    body += `--${boundary}\r\nContent-Disposition: form-data; name="${key}"\r\n\r\n${val}\r\n`;
  }
  body += `--${boundary}\r\nContent-Disposition: form-data; name="image"; filename="homework.png"\r\nContent-Type: image/png\r\n\r\n`;

  const payload = Buffer.concat([
    Buffer.from(body, 'utf-8'),
    fileBuffer,
    Buffer.from(`\r\n--${boundary}--\r\n`, 'utf-8')
  ]);

  return { payload, contentType: `multipart/form-data; boundary=${boundary}` };
}

// Minimal 1x1 PNG
const dummyPng = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c63000100000500010d0a2db40000000049454e44ae426082', 'hex');

test('Domestic Vision Routing: SiliconFlow header routes to deepseek-ai/deepseek-vl2 without Gemini keys', async () => {
  const { payload, contentType } = createMultipartFormData({
    student_name: '曾练',
    grade: '7_up',
    subject: '数学'
  }, dummyPng);

  const res = await fetch(`${baseUrl}/api/homework/batch-grade`, {
    method: 'POST',
    headers: {
      'Content-Type': contentType,
      'x-siliconflow-api-key': 'sk-siliconflow-empirical-test-key'
    },
    body: payload
  });

  assert.strictEqual(res.status, 200, `Expected 200 OK but got ${res.status}`);
  const data = await res.json();
  assert.strictEqual(data.success, true);
  assert.strictEqual(data.results.length, 2);

  // Verify intercepted call
  assert.strictEqual(interceptedRequests.length, 1);
  const intercepted = interceptedRequests[0];
  assert.ok(intercepted.url.startsWith('https://api.siliconflow.cn/v1'), `Expected SiliconFlow URL, got ${intercepted.url}`);
  assert.strictEqual(intercepted.body.model, 'deepseek-ai/deepseek-vl2', 'Expected model deepseek-ai/deepseek-vl2');
  assert.strictEqual(intercepted.authHeader, 'Bearer sk-siliconflow-empirical-test-key');
  assert.ok(Array.isArray(intercepted.body.messages));
  const userContent = intercepted.body.messages[0].content;
  assert.ok(Array.isArray(userContent), 'Should be multimodal content array');
  const imgItem = userContent.find(c => c.type === 'image_url');
  assert.ok(imgItem, 'Should contain image_url');
});

test('Domestic Vision Routing: DashScope header routes to qwen2.5-vl-72b-instruct without Gemini keys', async () => {
  const { payload, contentType } = createMultipartFormData({
    student_name: '曾练',
    grade: '8',
    subject: '物理'
  }, dummyPng);

  const res = await fetch(`${baseUrl}/api/homework/batch-grade`, {
    method: 'POST',
    headers: {
      'Content-Type': contentType,
      'x-dashscope-api-key': 'sk-dashscope-empirical-test-key'
    },
    body: payload
  });

  assert.strictEqual(res.status, 200, `Expected 200 OK but got ${res.status}`);
  const data = await res.json();
  assert.strictEqual(data.success, true);

  assert.strictEqual(interceptedRequests.length, 1);
  const intercepted = interceptedRequests[0];
  assert.ok(intercepted.url.startsWith('https://dashscope.aliyuncs.com'), `Expected DashScope URL, got ${intercepted.url}`);
  assert.strictEqual(intercepted.body.model, 'qwen2.5-vl-72b-instruct', 'Expected model qwen2.5-vl-72b-instruct');
  assert.strictEqual(intercepted.authHeader, 'Bearer sk-dashscope-empirical-test-key');
});

test('Domestic Vision Routing: Zhipu header routes to glm-4v-flash without Gemini keys', async () => {
  const { payload, contentType } = createMultipartFormData({
    student_name: '曾练',
    grade: '9',
    subject: '化学'
  }, dummyPng);

  const res = await fetch(`${baseUrl}/api/homework/batch-grade`, {
    method: 'POST',
    headers: {
      'Content-Type': contentType,
      'x-zhipu-api-key': 'sk-zhipu-empirical-test-key'
    },
    body: payload
  });

  assert.strictEqual(res.status, 200, `Expected 200 OK but got ${res.status}`);
  const data = await res.json();
  assert.strictEqual(data.success, true);

  assert.strictEqual(interceptedRequests.length, 1);
  const intercepted = interceptedRequests[0];
  assert.ok(intercepted.url.startsWith('https://open.bigmodel.cn'), `Expected Zhipu URL, got ${intercepted.url}`);
  assert.strictEqual(intercepted.body.model, 'glm-4v-flash', 'Expected model glm-4v-flash');
  assert.strictEqual(intercepted.authHeader, 'Bearer sk-zhipu-empirical-test-key');
});

test('Domestic Vision Routing: Auto-switches from text-only model (deepseek-chat) to domestic vision model', async () => {
  const { payload, contentType } = createMultipartFormData({
    student_name: '曾练',
    grade: '7_up',
    subject: '数学',
    model: 'deepseek-chat' // Text-only model requested
  }, dummyPng);

  const res = await fetch(`${baseUrl}/api/homework/batch-grade`, {
    method: 'POST',
    headers: {
      'Content-Type': contentType,
      'x-siliconflow-api-key': 'sk-siliconflow-empirical-test-key'
    },
    body: payload
  });

  assert.strictEqual(res.status, 200);
  assert.strictEqual(interceptedRequests.length, 1);
  const intercepted = interceptedRequests[0];
  // Since deepseek-chat lacks vision capability, it should resolve to deepseek-ai/deepseek-vl2
  assert.strictEqual(intercepted.body.model, 'deepseek-ai/deepseek-vl2');
});

test('Domestic Vision Routing: Preserves client-specified vision model if already vision-capable', async () => {
  const { payload, contentType } = createMultipartFormData({
    student_name: '曾练',
    grade: '7_up',
    subject: '数学',
    model: 'qwen-vl-max' // Client explicitly requested Qwen vision
  }, dummyPng);

  const res = await fetch(`${baseUrl}/api/homework/batch-grade`, {
    method: 'POST',
    headers: {
      'Content-Type': contentType,
      'x-dashscope-api-key': 'sk-dashscope-empirical-test-key'
    },
    body: payload
  });

  assert.strictEqual(res.status, 200);
  assert.strictEqual(interceptedRequests.length, 1);
  const intercepted = interceptedRequests[0];
  assert.strictEqual(intercepted.body.model, 'qwen-vl-max');
});

test('Domestic Vision Routing: Rejects gracefully with 500 when no API keys are configured (no unhandled crash)', async () => {
  const { payload, contentType } = createMultipartFormData({
    student_name: '曾练',
    grade: '7_up',
    subject: '数学'
  }, dummyPng);

  // Send request with NO keys at all
  const res = await fetch(`${baseUrl}/api/homework/batch-grade`, {
    method: 'POST',
    headers: {
      'Content-Type': contentType
    },
    body: payload
  });

  // Should return error JSON, NOT crash node or hang
  assert.ok(res.status >= 400, `Expected error status, got ${res.status}`);
  const data = await res.json();
  assert.ok(data.error, 'Response should contain error field');
});

test('Domestic Vision Routing: Recognizes title-cased headers (X-SiliconFlow-Api-Key) robustly', async () => {
  const { payload, contentType } = createMultipartFormData({
    student_name: '曾练',
    grade: '7_up',
    subject: '数学'
  }, dummyPng);

  const res = await fetch(`${baseUrl}/api/homework/batch-grade`, {
    method: 'POST',
    headers: {
      'Content-Type': contentType,
      'X-SiliconFlow-Api-Key': 'sk-siliconflow-titlecase-key'
    },
    body: payload
  });

  assert.strictEqual(res.status, 200);
  assert.strictEqual(interceptedRequests.length, 1);
  const intercepted = interceptedRequests[0];
  assert.strictEqual(intercepted.body.model, 'deepseek-ai/deepseek-vl2');
  assert.strictEqual(intercepted.authHeader, 'Bearer sk-siliconflow-titlecase-key');
});

