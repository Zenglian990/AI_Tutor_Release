const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
process.env.NODE_ENV = 'development';
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

  // Mock Google TTS
  if (urlStr.includes('translate.google')) {
    return {
      ok: true,
      status: 200,
      arrayBuffer: async () => Buffer.from('mock_mp3_audio_data').buffer,
      headers: new undici.Headers({ 'content-type': 'audio/mpeg' })
    };
  }

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

    if (urlStr.includes('models/gemini-embedding-2') || urlStr.includes('embedContent')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({ embedding: { values: new Array(768).fill(0.1) } }),
        headers: new undici.Headers()
      };
    }

    // A. Mock Gemini TTS
    const bodyStr = options && options.body ? String(options.body) : '';
    if (urlStr.includes('gemini-2.5-flash-preview-tts') || bodyStr.includes('responseModalities') || bodyStr.includes('AUDIO')) {
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
const { initDB, closeDB } = require('../server/db/init');

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
  await closeDB();
  // Restore original fetch
  undici.fetch = originalFetch;

  // Fix A3-3: Clear node require cache to prevent mock bleed (equivalent to jest.resetModules())
  Object.keys(require.cache).forEach(key => {
    if (key.includes('server') || key.includes('config')) {
      delete require.cache[key];
    }
  });
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

test('Integration: POST /api/tts — returns audio response', async () => {
  mockGeminiFail = false;
  geminiCalled = 0;

  const res = await fetch(`${baseUrl}/api/tts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: '测试语音合成', grade: '1_up' })
  });
  assert.equal(res.status, 200);
  assert.ok(['audio/mp3', 'audio/wav', 'audio/mpeg'].includes(res.headers.get('Content-Type')));
  
  const buffer = await res.arrayBuffer();
  assert.ok(buffer.byteLength > 0, "Audio response should be non-empty");
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
  const { getSqliteDb } = require('../server/db/init');
  const sqliteDb = getSqliteDb();
  const savedPinHashRow = sqliteDb ? await sqliteDb.get("SELECT value FROM system_settings WHERE key = 'parent_pin_hash'") : null;
  const headers = {};
  if (savedPinHashRow && savedPinHashRow.value) {
    headers['x-parent-pin-hash'] = savedPinHashRow.value;
  }

  const res = await fetch(`${baseUrl}/api/admin/stats`, { headers });
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.ok(data.hasOwnProperty('totalProfiles'));
  assert.ok(data.hasOwnProperty('dailyActive'));
  assert.ok(data.hasOwnProperty('totalMistakes'));
  assert.ok(Array.isArray(data.mistakesBySubject));
  assert.ok(Array.isArray(data.profiles));
});

test('Remediation S1: SSRF validator blocks loopback, private subnets, and cloud metadata', () => {
  const { isSafeExternalUrl } = require('../server/utils/urlValidator');
  assert.strictEqual(isSafeExternalUrl('http://127.0.0.1:3001/admin').safe, false);
  assert.strictEqual(isSafeExternalUrl('http://localhost:3001').safe, false);
  assert.strictEqual(isSafeExternalUrl('http://[::1]:3001').safe, false);
  assert.strictEqual(isSafeExternalUrl('http://10.0.0.1/status').safe, false);
  assert.strictEqual(isSafeExternalUrl('http://172.16.0.1:8080').safe, false);
  assert.strictEqual(isSafeExternalUrl('http://192.168.1.1/router').safe, false);
  assert.strictEqual(isSafeExternalUrl('http://169.254.169.254/latest/meta-data').safe, false);
  assert.strictEqual(isSafeExternalUrl('https://oapi.dingtalk.com/robot/send').safe, true);
});

test('Remediation S3: PIN hash is not leaked and verify/reset endpoints work securely', async () => {
  // Status does not leak hashes
  const statusRes = await fetch(`${baseUrl}/api/admin/pin-status`);
  assert.strictEqual(statusRes.status, 200);
  const statusData = await statusRes.json();
  assert.ok('has_pin' in statusData);
  assert.strictEqual(statusData.pin_hash, undefined);
  assert.strictEqual(statusData.security_answer_hash, undefined);

  // Set pin and question
  const setRes = await fetch(`${baseUrl}/api/admin/pin`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      pin_hash: 'hash_test_pin_999999',
      security_answer_hash: 'mother_name:hash_test_answer_999'
    })
  });
  assert.strictEqual(setRes.status, 200);

  // Verify PIN correctly
  const verifyRes = await fetch(`${baseUrl}/api/admin/verify-pin`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pin_hash: 'hash_test_pin_999999' })
  });
  assert.strictEqual(verifyRes.status, 200);
  const verifyData = await verifyRes.json();
  assert.strictEqual(verifyData.valid, true);

  // Reset PIN
  const resetRes = await fetch(`${baseUrl}/api/admin/reset-pin`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      question_id: 'mother_name',
      answer_hash: 'hash_test_answer_999',
      new_pin_hash: 'hash_new_test_pin_888888'
    })
  });
  assert.strictEqual(resetRes.status, 200);
});

test('Remediation S5: Student Cognitive Memory decrypts encrypted fields for prompt', async () => {
  const { getSqliteDb } = require('../server/db/init');
  const { encryptField } = require('../server/utils/crypto');
  const { getStudentCognitiveMemory } = require('../server/services/studentMemory');
  const db = getSqliteDb();

  const testProfile = 'test_remediation_profile';
  const encQuery = encryptField('已知三角形内角和为180度，求角A');
  const encReason = encryptField('直角三角形判定遗漏');
  const encTags = encryptField('三角形,内角和');

  await db.run(
    `INSERT INTO mistakes (profile_id, query, reason, tags, subject, grade)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [testProfile, encQuery, encReason, encTags, '数学', '7_up']
  );

  const mem = await getStudentCognitiveMemory(testProfile, '7_up', '数学', '曾练');
  assert.strictEqual(mem.hasHistory, true);
  assert.ok(mem.topWeakTags.includes('三角形') || mem.topWeakTags.includes('内角和'));
  assert.ok(mem.recentWeakPoints.includes('直角三角形判定遗漏'));
  assert.ok(mem.rawMistakesSnippet.includes('已知三角形内角和'));
  assert.ok(!mem.rawMistakesSnippet.includes(':'), 'Should not expose ciphertext');
});

test('Remediation G1: Gamification action counters distinguish feynman and scratchpad', async () => {
  const profileId = `test_game_${Date.now()}`;
  await fetch(`${baseUrl}/api/gamification/record-action`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ profile_id: profileId, action_type: 'feynman_challenge' })
  });
  await fetch(`${baseUrl}/api/gamification/record-action`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ profile_id: profileId, action_type: 'scratchpad_draw' })
  });

  const profileRes = await fetch(`${baseUrl}/api/gamification/profile?profile_id=${profileId}`);
  const profileData = await profileRes.json();
  assert.ok(profileData.feynmanCount >= 1);
  assert.ok(profileData.scratchpadCount >= 1);
});

test('Remediation G2: Knowledge graph roadmap filters nodes by subject', async () => {
  const { computeCampaignRoadmap } = require('../server/services/campaignRoadmap');
  const mathRoadmap = await computeCampaignRoadmap('default', '7_up', '数学');
  assert.ok(mathRoadmap.totalNodesCount >= 5);
  const physicsRoadmap = await computeCampaignRoadmap('default', '8_up', '物理');
  assert.ok(physicsRoadmap.totalNodesCount >= 2);
});

test('Remediation M6: LaTeX math delimiters replace \\( with $ and \\) with $', () => {
  const { preprocessLatex } = require('../client/src/utils/math');
  const input = '已知 \\( x = 1 \\) 和 \\[ y = 2 \\]';
  const res = preprocessLatex(input);
  assert.ok(res.includes('$ x = 1 $'));
  assert.ok(!res.includes('$$ x = 1 $$'));
});

