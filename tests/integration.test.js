const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const undici = require('undici');

// Mutate config cached module to set DEEPSEEK_API_KEY securely for fallback testing
const config = require('../server/config');
config.DEEPSEEK_API_KEY = 'mock_deepseek_key';

// Setup mock state
let mockGeminiFail = false;
let geminiCalled = 0;
let deepseekCalled = 0;

// Override undici.fetch before loading app (so embedding.js imports this mock)
const originalFetch = undici.fetch;
undici.fetch = async (url, options) => {
  const urlStr = String(url);

  // 1. Mock Google Gemini API
  if (urlStr.includes('generativelanguage.googleapis.com')) {
    geminiCalled++;
    if (mockGeminiFail) {
      return {
        ok: false,
        status: 429,
        text: async () => JSON.stringify({ error: { message: "Quota exceeded mock error" } }),
        json: async () => ({ error: { message: "Quota exceeded mock error" } }),
        headers: new undici.Headers()
      };
    }

    // A. Mock Gemini TTS
    if (urlStr.includes('gemini-2.5-flash-preview-tts')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          candidates: [{
            content: {
              parts: [{
                inlineData: {
                  mimeType: 'audio/wav',
                  data: 'UklGRigAAABXQVZFZm10IBIAAAABAAERKgAAK1IAAAQAAgB3YWRhdGEAAAAA' // Mock WAV base64
                }
              }]
            }
          }]
        }),
        headers: new undici.Headers()
      };
    }

    // B. Mock Gemini Stream chat
    if (urlStr.includes('streamGenerateContent')) {
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(Buffer.from('data: ' + JSON.stringify({
            candidates: [{
              content: { parts: [{ text: 'Hello, this is Gemini streaming response!' }] }
            }]
          }) + '\n\n'));
          controller.enqueue(Buffer.from('data: [DONE]\n\n'));
          controller.close();
        }
      });
      return {
        ok: true,
        status: 200,
        body: stream,
        headers: new undici.Headers()
      };
    }

    // C. Mock Gemini standard chat
    return {
      ok: true,
      status: 200,
      json: async () => ({
        candidates: [{
          content: { parts: [{ text: 'Hello, this is Gemini non-stream response!' }] }
        }]
      }),
      text: async () => JSON.stringify({
        candidates: [{
          content: { parts: [{ text: 'Hello, this is Gemini non-stream response!' }] }
        }]
      }),
      headers: new undici.Headers()
    };
  }

  // 2. Mock DeepSeek API
  if (urlStr.includes('api.deepseek.com')) {
    deepseekCalled++;
    const payload = options.body ? JSON.parse(options.body) : {};
    if (payload.stream) {
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(Buffer.from('data: ' + JSON.stringify({
            choices: [{ delta: { content: 'Hello, this is DeepSeek fallback stream!' } }]
          }) + '\n\n'));
          controller.enqueue(Buffer.from('data: [DONE]\n\n'));
          controller.close();
        }
      });
      return {
        ok: true,
        status: 200,
        body: stream,
        headers: new undici.Headers()
      };
    } else {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          choices: [{ message: { content: 'Hello, this is DeepSeek fallback non-stream!' } }]
        }),
        headers: new undici.Headers()
      };
    }
  }

  // Fallback to original fetch for local test server calls
  return originalFetch(url, options);
};

// Now import server components
const { createApp } = require('../server/app');
const { initDB } = require('../server/db/init');

let app;
let server;
let port;
let baseUrl;

before(async () => {
  process.env.NODE_ENV = 'development';
  await initDB();
  app = createApp();
  await new Promise((resolve) => {
    server = app.listen(0, () => {
      port = server.address().port;
      baseUrl = `http://localhost:${port}`;
      resolve();
    });
  });
});

after(async () => {
  if (server) {
    await new Promise((resolve) => server.close(resolve));
  }
  // Restore original fetch
  undici.fetch = originalFetch;
});

// Helper: read SSE stream
async function readSSEStream(res) {
  const reader = res.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let done = false;
  let text = '';
  let sources = null;
  let partialLine = '';

  while (!done) {
    const { value, done: doneReading } = await reader.read();
    done = doneReading;
    if (value) {
      const chunk = decoder.decode(value, { stream: !done });
      const lines = (partialLine + chunk).split('\n');
      partialLine = lines.pop() || '';
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const dataStr = line.slice(6).trim();
          if (dataStr === '[DONE]') continue;
          try {
            const parsed = JSON.parse(dataStr);
            if (parsed.sources) {
              sources = parsed.sources;
            }
            if (parsed.text) {
              text += parsed.text;
            }
          } catch (e) {}
        }
      }
    }
  }
  return { text, sources };
}

test('Integration: POST /api/chat — normal SSE stream through Gemini', async () => {
  mockGeminiFail = false;
  geminiCalled = 0;
  deepseekCalled = 0;

  const res = await fetch(`${baseUrl}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query: '1+1等于几？',
      grade: '三年级',
      subject: '数学'
    })
  });

  assert.equal(res.status, 200);
  const streamData = await readSSEStream(res);
  assert.ok(geminiCalled > 0, "Should have called Gemini API");
  assert.equal(deepseekCalled, 0, "Should not call DeepSeek when Gemini works");
  assert.ok(streamData.text.includes('Gemini streaming response'), "Should receive mock Gemini stream response");
  assert.ok(Array.isArray(streamData.sources), "Should receive sources array");
});

test('Integration: POST /api/chat-vision — uploads image and streams response', async () => {
  mockGeminiFail = false;
  geminiCalled = 0;
  deepseekCalled = 0;

  const formData = new FormData();
  formData.append('query', '这道题怎么做？');
  // 1x1 transparent PNG buffer
  const pngBytes = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1F, 0x15, 0xC4, 0x89, 0x00, 0x00, 0x00, 0x0A, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9C, 0x63, 0x00, 0x01, 0x00, 0x00, 0x05, 0x00, 0x01, 0x0D, 0x0A, 0x2D, 0xB4, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4E, 0x44, 0xAE, 0x42, 0x60, 0x82]);
  const blob = new Blob([pngBytes], { type: 'image/png' });
  formData.append('image', blob, 'test.png');

  const res = await fetch(`${baseUrl}/api/chat-vision`, {
    method: 'POST',
    body: formData
  });

  assert.equal(res.status, 200);
  const streamData = await readSSEStream(res);
  assert.ok(geminiCalled > 0, "Should have called Gemini API for vision");
  assert.ok(streamData.text.includes('Gemini streaming response'), "Should receive mock Gemini response");
});

test('Integration: GET /api/tts — returns WAV audio response', async () => {
  mockGeminiFail = false;
  geminiCalled = 0;

  const res = await fetch(`${baseUrl}/api/tts?text=测试语音合成&grade=1_up`);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('Content-Type'), 'audio/wav');
  
  const buffer = await res.arrayBuffer();
  assert.ok(buffer.byteLength > 0, "Audio response should be non-empty");
  assert.ok(geminiCalled > 0, "Should have called Gemini TTS API");
});

test('Integration: Fallback to DeepSeek when Gemini mock-fails', async () => {
  mockGeminiFail = true;
  geminiCalled = 0;
  deepseekCalled = 0;

  const res = await fetch(`${baseUrl}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query: '故障转移测试',
      grade: '三年级',
      subject: '数学'
    })
  });

  assert.equal(res.status, 200);
  const streamData = await readSSEStream(res);
  assert.ok(geminiCalled > 0, "Should have attempted Gemini API");
  assert.ok(deepseekCalled > 0, "Should have fallen back to DeepSeek");
  assert.ok(streamData.text.includes('DeepSeek fallback stream'), "Should receive DeepSeek stream response");
});

test('Integration: GET /api/admin/stats — returns admin stats structure', async () => {
  const res = await fetch(`${baseUrl}/api/admin/stats`);
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.ok(data.hasOwnProperty('totalProfiles'));
  assert.ok(data.hasOwnProperty('dailyActive'));
  assert.ok(data.hasOwnProperty('totalMistakes'));
  assert.ok(Array.isArray(data.mistakesBySubject));
  assert.ok(Array.isArray(data.profiles));
});
