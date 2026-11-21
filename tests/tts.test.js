const { test } = require('node:test');
const assert = require('node:assert/strict');
const { cleanTextForTTS, translateMathToChinese } = require('../server/services/tts-service');

test('TTS Text Cleaning — removes markdown syntax and emojis', () => {
  const rawText = "### 标题 🌟\n这是一个 **加粗** 的句子，还有一个 [链接](http://example.com)。";
  const cleaned = cleanTextForTTS(rawText);
  console.log(`Cleaned text: "${cleaned}"`);
  
  assert.ok(!cleaned.includes("###"), "Should remove markdown headers");
  assert.ok(!cleaned.includes("**"), "Should remove markdown bold tags");
  assert.ok(!cleaned.includes("[链接]"), "Should format markdown links");
  assert.ok(cleaned.includes("链接"), "Should keep link text");
  assert.ok(!cleaned.includes("🌟"), "Should strip emojis");
});

test('TTS Text Cleaning — removes Mermaid and other code blocks', () => {
  const rawText = "这里是说明。\n```mermaid\ngraph TD\nA --> B\n```\n这里是后续。";
  const cleaned = cleanTextForTTS(rawText);
  console.log(`Cleaned codeblock text: "${cleaned}"`);

  assert.ok(!cleaned.includes("graph TD"), "Should remove mermaid code");
  assert.ok(cleaned.includes("这里是说明"), "Should preserve text before");
  assert.ok(cleaned.includes("这里是后续"), "Should preserve text after");
});

test('TTS Text Cleaning — translates LaTeX formulas to spoken Chinese', () => {
  const formula1 = "\\( 3 - 1 = 2 \\)";
  const cleaned1 = cleanTextForTTS(formula1);
  console.log(`Cleaned formula 1: "${cleaned1}"`);
  assert.ok(cleaned1.includes("3 减 1 等于 2"), "Should translate simple inline formula");

  const formula2 = "\\[ \\frac{a}{b} \\]";
  const cleaned2 = cleanTextForTTS(formula2);
  console.log(`Cleaned formula 2: "${cleaned2}"`);
  assert.ok(cleaned2.includes("b分之a"), "Should translate block fractions");

  const formula3 = "已知二次函数 \\( y = ax^2 + bx + c \\)";
  const cleaned3 = cleanTextForTTS(formula3);
  console.log(`Cleaned formula 3: "${cleaned3}"`);
  assert.ok(cleaned3.includes("y 等于 ax的2次方 加 bx 加 c"), "Should translate exponents and general equations");
});
