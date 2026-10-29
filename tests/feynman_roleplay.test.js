const test = require('node:test');
const assert = require('node:assert/strict');
const {
  generatePeerStudentPersonaPrompt,
  evaluateFeynmanExplanation,
  PEER_CHALLENGES
} = require('../server/services/feynmanRoleplayService');

test('Feynman Roleplay: generatePeerStudentPersonaPrompt formats peer persona for student', () => {
  const prompt = generatePeerStudentPersonaPrompt('二次函数顶点式', '曾练', '八年级');
  assert.ok(prompt.includes('虚拟小同桌角色扮演模式'), 'Prompt contains roleplay header');
  assert.ok(prompt.includes('曾练小老师'), 'Prompt references student as teacher');
  assert.ok(prompt.includes('二次函数顶点式'), 'Prompt references concept');
  assert.ok(prompt.includes('同桌在草稿纸旁交流'), 'Prompt enforces conversational peer tone');
});

test('Feynman Roleplay: evaluateFeynmanExplanation rewards rich concept, causality, and analogies', () => {
  const richExplanation = `
    因为直角三角形的三条边构成的正方形面积，正好可以通过拼图割补证明两直角边的正方形面积相加等于斜边正方形面积。
    比如赵爽弦图，把四个一样的直角三角形拼成大正方形，所以 a² + b² = c²。
    如果是锐角或者钝角三角形，拐角不是90度，拼图面积就对不上了，公式自然不成立！
  `;

  const report = evaluateFeynmanExplanation(richExplanation, 'math_pythagorean');
  assert.ok(report.passed, 'Explanation should pass');
  assert.ok(report.overallScore >= 75, `Score should be >= 75, got ${report.overallScore}`);
  assert.ok(report.accuracy >= 60, `Accuracy score should be high, got ${report.accuracy}`);
  assert.ok(report.logic >= 60, `Logic score should be high, got ${report.logic}`);
  assert.ok(report.analogy >= 60, `Analogy score should be high, got ${report.analogy}`);
  assert.ok(report.feedback.includes('同桌小明'), 'Feedback contains persona reaction');
});

test('Feynman Roleplay: evaluateFeynmanExplanation rejects empty or lazy answers with peer question', () => {
  const lazyExplanation = '就是这样做啊';
  const report = evaluateFeynmanExplanation(lazyExplanation, 'math_pythagorean');

  assert.equal(report.passed, false, 'Lazy answer must fail');
  assert.ok(report.overallScore < 50, 'Score should be low');
  assert.ok(report.feedback.includes('困惑') || report.feedback.includes('多教教我'), 'Xiao Ming responds with peer curiosity');
});
