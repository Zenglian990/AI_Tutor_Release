const { test, before, after } = require('node:test');
const assert = require('node:assert');
const http = require('http');
const undici = require('undici');
const { initDB, closeDB } = require('../server/db/init');

// Mock undici.fetch for Google Gemini Vision response during CI test
const originalFetch = undici.fetch;
undici.fetch = async (url, options) => {
  const urlStr = String(url);

  if (urlStr.includes('generativelanguage.googleapis.com') || urlStr.includes('deepseek')) {
    const mockVisionResponse = {
      candidates: [{
        content: {
          parts: [{
            text: JSON.stringify({
              totalCount: 2,
              correctCount: 1,
              wrongCount: 1,
              accuracyPct: 50,
              summaryHeadline: "整卷批改完成，第2题需复盘分类讨论",
              teacherPraise: "手写步骤非常工整！",
              teacherAdvice: "注意动点射线的双向延伸讨论。",
              results: [
                {
                  questionNumber: 1,
                  type: "填空题",
                  questionSnippet: "一元一次方程化简",
                  studentAnswer: "x = 4",
                  standardAnswer: "x = 4",
                  status: "correct",
                  score: 10,
                  maxScore: 10,
                  mistakeReason: "",
                  keyInsight: "掌握移项合并同类项"
                },
                {
                  questionNumber: 2,
                  type: "解答大题",
                  questionSnippet: "动点问题分类讨论",
                  studentAnswer: "t = 5",
                  standardAnswer: "t = 5 或 t = 15",
                  status: "wrong",
                  score: 4,
                  maxScore: 10,
                  mistakeReason: "遗漏射线反向延伸情况",
                  keyInsight: "题眼在‘射线’关键字"
                }
              ]
            })
          }]
        }
      }]
    };

    return {
      ok: true,
      status: 200,
      json: async () => mockVisionResponse,
      text: async () => JSON.stringify(mockVisionResponse),
      headers: new undici.Headers()
    };
  }

  return originalFetch(url, options);
};

const { createApp } = require('../server/app');

let server;
let baseUrl;

before(async () => {
  await initDB();
  const app = createApp();
  await new Promise((resolve) => {
    server = http.createServer(app);
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      baseUrl = `http://127.0.0.1:${port}`;
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

test('Homework Batch API: rejects request when no image is uploaded', async () => {
  const res = await fetch(`${baseUrl}/api/homework/batch-grade`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ student_name: '曾练' })
  });

  assert.strictEqual(res.status, 400);
  const data = await res.json();
  assert.ok(data.error.includes('请上传整页作业'));
});

test('Homework Batch API: handles multipart image and parses structured results with key rotation', async () => {
  // Create a minimal 1x1 dummy PNG buffer
  const png1x1 = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c63000100000500010d0a2db40000000049454e44ae426082', 'hex');

  const boundary = '----WebKitFormBoundaryBatchTest' + Math.random().toString(36).substring(2);
  let body = '';
  body += `--${boundary}\r\n`;
  body += `Content-Disposition: form-data; name="student_name"\r\n\r\n曾练\r\n`;
  body += `--${boundary}\r\n`;
  body += `Content-Disposition: form-data; name="grade"\r\n\r\n7_up\r\n`;
  body += `--${boundary}\r\n`;
  body += `Content-Disposition: form-data; name="subject"\r\n\r\n数学\r\n`;
  body += `--${boundary}\r\n`;
  body += `Content-Disposition: form-data; name="image"; filename="homework.png"\r\n`;
  body += `Content-Type: image/png\r\n\r\n`;

  const payload = Buffer.concat([
    Buffer.from(body, 'utf-8'),
    png1x1,
    Buffer.from(`\r\n--${boundary}--\r\n`, 'utf-8')
  ]);

  const res = await fetch(`${baseUrl}/api/homework/batch-grade`, {
    method: 'POST',
    headers: {
      'Content-Type': `multipart/form-data; boundary=${boundary}`
    },
    body: payload
  });

  assert.strictEqual(res.status, 200);
  const data = await res.json();
  assert.strictEqual(data.success, true);
  assert.strictEqual(data.studentName, '曾练');
  assert.strictEqual(data.accuracyPct, 50);
  assert.strictEqual(data.results.length, 2);
  assert.strictEqual(data.autoArchivedCount, 1);
});
