const { test } = require('node:test');
const assert = require('node:assert');
const {
  convertGeminiToDeepSeekPayload,
  isOpenAiVisionModel
} = require('../server/services/embedding');

test('isOpenAiVisionModel identifies Qwen-VL and GLM-4V correctly', () => {
  assert.strictEqual(isOpenAiVisionModel('qwen2.5-vl-72b-instruct'), true);
  assert.strictEqual(isOpenAiVisionModel('qwen-vl-max'), true);
  assert.strictEqual(isOpenAiVisionModel('glm-4v-plus'), true);
  assert.strictEqual(isOpenAiVisionModel('step-1v'), true);
  assert.strictEqual(isOpenAiVisionModel('deepseek-chat'), false);
  assert.strictEqual(isOpenAiVisionModel('deepseek-reasoner'), false);
  assert.strictEqual(isOpenAiVisionModel('gemini-3.6-flash'), false);
});

test('convertGeminiToDeepSeekPayload constructs standard OpenAI image_url for Qwen-VL', () => {
  const geminiPayload = {
    contents: [{
      parts: [
        { inline_data: { mime_type: 'image/jpeg', data: 'fakebase64string' } },
        { text: '请批改这道题' }
      ]
    }],
    generationConfig: {
      temperature: 0.1,
      responseMimeType: 'application/json',
      maxOutputTokens: 4096
    }
  };

  const payload = convertGeminiToDeepSeekPayload(geminiPayload, false, 'qwen2.5-vl-72b-instruct');

  assert.strictEqual(payload.model, 'qwen2.5-vl-72b-instruct');
  assert.strictEqual(payload.response_format?.type, 'json_object');
  assert.strictEqual(payload.max_tokens, 4096);
  assert.strictEqual(Array.isArray(payload.messages), true);
  assert.strictEqual(payload.messages.length, 1);
  
  const content = payload.messages[0].content;
  assert.strictEqual(Array.isArray(content), true);
  assert.strictEqual(content.length, 2);

  const imgPart = content.find(c => c.type === 'image_url');
  assert.ok(imgPart, 'Should contain image_url part');
  assert.strictEqual(imgPart.image_url.url, 'data:image/jpeg;base64,fakebase64string');

  const textPart = content.find(c => c.type === 'text');
  assert.ok(textPart, 'Should contain text part');
  assert.strictEqual(textPart.text, '请批改这道题');
});

test('convertGeminiToDeepSeekPayload degrades safely to text-only mode for deepseek-chat', () => {
  const geminiPayload = {
    contents: [{
      parts: [
        { inline_data: { mime_type: 'image/jpeg', data: 'fakebase64string' } },
        { text: '请帮我讲讲这个题' }
      ]
    }]
  };

  const payload = convertGeminiToDeepSeekPayload(geminiPayload, false, 'deepseek-chat');

  assert.strictEqual(payload.model, 'deepseek-chat');
  assert.strictEqual(typeof payload.messages[0].content, 'string');
  assert.ok(payload.messages[0].content.includes('纯文本模型模式'));
});
