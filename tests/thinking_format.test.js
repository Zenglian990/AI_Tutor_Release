const { test } = require('node:test');
const assert = require('node:assert');

const { splitThinkingContent } = require('../server/utils/thinking');

test('splitThinkingContent: parses <think> tags cleanly', () => {
  const input = '<think>\nHere is my internal reasoning\nLine 2\n</think>\n\nHello student!';
  const { thinking, body } = splitThinkingContent(input);
  assert.strictEqual(thinking, 'Here is my internal reasoning\nLine 2');
  assert.strictEqual(body, 'Hello student!');
});

test('splitThinkingContent: handles unclosed <think> tag during streaming', () => {
  const input = '<think>\nStill thinking...';
  const { thinking, body } = splitThinkingContent(input);
  assert.strictEqual(thinking, 'Still thinking...');
  assert.strictEqual(body, '');
});

test('splitThinkingContent: folds legacy blockquote > 🧠 **[思考过程]**', () => {
  const input = `> 🧠 **[思考过程]**
> 用户需要动笔支架
> 题目是 35 + 42

🌟 小曾同学，请看第一步支架！`;

  const { thinking, body } = splitThinkingContent(input);
  assert.ok(thinking.includes('用户需要动笔支架'));
  assert.strictEqual(body, '🌟 小曾同学，请看第一步支架！');
});

test('splitThinkingContent: returns original text when no thinking is present', () => {
  const input = '🌟 正常的名师回答内容';
  const { thinking, body } = splitThinkingContent(input);
  assert.strictEqual(thinking, null);
  assert.strictEqual(body, input);
});
