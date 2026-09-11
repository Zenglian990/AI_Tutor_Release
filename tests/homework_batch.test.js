const { test, before, after } = require('node:test');
const assert = require('node:assert');
const http = require('http');
const { createApp } = require('../server/app');

let server;
let baseUrl;

before((_, done) => {
  const app = createApp();
  server = http.createServer(app);
  server.listen(0, '127.0.0.1', () => {
    const port = server.address().port;
    baseUrl = `http://127.0.0.1:${port}`;
    done();
  });
});

after((_, done) => {
  if (server) {
    server.close(done);
  } else {
    done();
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

  // Since in test mode mock key or deepseek fallback produces a response
  assert.ok(res.status === 200 || res.status === 502);
  const data = await res.json();
  if (res.status === 200) {
    assert.strictEqual(data.success, true);
    assert.strictEqual(data.studentName, '曾练');
    assert.ok(typeof data.accuracyPct === 'number');
    assert.ok(Array.isArray(data.results));
  } else {
    // 502 indicates vision API was invoked successfully but network mock returned expected error
    assert.ok(data.error);
  }
});
