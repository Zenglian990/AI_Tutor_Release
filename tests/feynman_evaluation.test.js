const { test } = require('node:test');
const assert = require('node:assert');
const { evaluateFeynmanExplanation } = require('../server/routes/feynman');

test('Feynman Evaluation — short input yields friendly guidance from Xiao Ming', () => {
  const result = evaluateFeynmanExplanation({
    question: '解方程 2x + 4 = 10',
    explanation: '就那样',
    studentName: '曾练'
  });

  assert.strictEqual(result.stars, 2);
  assert.ok(result.peer_reply.includes('没听明白'));
  assert.strictEqual(result.mastery_score, 55);
});

test('Feynman Evaluation — well structured explanation earns high score and follow-up question', () => {
  const explanation = '首先我们将常数项 4 移项到等号右边并变号，所以 2x = 10 - 4 = 6。接下来两边同时除以未知数系数 2，由此可得 x = 3。';
  const result = evaluateFeynmanExplanation({
    question: '解方程 2x + 4 = 10',
    explanation,
    studentName: '曾练',
    subject: '数学'
  });

  assert.ok(result.mastery_score >= 85, 'Should score high for logical connectors and terms');
  assert.ok(result.stars >= 4);
  assert.ok(result.key_points_covered.includes('移项') || result.key_points_covered.includes('未知数'));
  assert.ok(result.follow_up_question.includes('变号') || result.follow_up_question.length > 5);
  assert.ok(result.peer_reply.includes('曾练老师'));
});
