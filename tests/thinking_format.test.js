const { test } = require('node:test');
const assert = require('node:assert');

/**
 * Split thinking logic matching ChatMessage.jsx
 */
function splitThinkingContent(rawText) {
  if (!rawText || typeof rawText !== 'string') {
    return { thinking: null, body: rawText || '' };
  }

  // 1. Standard <think> ... </think>
  const thinkMatch = rawText.match(/<think>([\s\S]*?)(?:<\/think>|$)/i);
  if (thinkMatch) {
    const thinking = thinkMatch[1].trim();
    const body = rawText.replace(/<think>[\s\S]*?(?:<\/think>|$)/i, '').trim();
    return { thinking, body };
  }

  // 2. Legacy blockquote format: > 🧠 **[思考过程]**
  const bqMatch = rawText.match(/(?:^|\n)>\s*🧠\s*\**\[思考过程\]\**\s*([\s\S]*?)(?=(?:\n[^\n>]|\n\n[^\n>]|$))/i);
  if (bqMatch) {
    const rawThinking = bqMatch[1]
      .split('\n')
      .map(line => line.replace(/^>\s?/, ''))
      .join('\n')
      .trim();
    const body = rawText.replace(bqMatch[0], '').trim();
    return { thinking: rawThinking, body };
  }

  return { thinking: null, body: rawText };
}

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
