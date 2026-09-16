const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  solveSquaresToRectangle,
  solveCornerCutPerimeter,
  solveChickenAndRabbits,
  solveTreePlanting,
  extractAndVerifyDeterministicMath
} = require('../server/services/mathSolver');
const {
  sanitizeAndArbitrateHomeworkResults,
  extractOptionLetter,
  extractNumbers
} = require('../server/services/homeworkValidator');

test('MathSolver: solveSquaresToRectangle computes exact perimeter and area without hallucination', () => {
  // 3个边长2厘米的正方形拼成长方形: 长=6, 宽=2, 周长=(6+2)*2=16
  const res = solveSquaresToRectangle(3, 2);
  assert.ok(res);
  assert.strictEqual(res.length, 6);
  assert.strictEqual(res.width, 2);
  assert.strictEqual(res.perimeter, 16);
  assert.strictEqual(res.area, 12);
  assert.ok(res.explanation.includes('周长 = (6 + 2) × 2 = 16 厘米'));
});

test('MathSolver: solveCornerCutPerimeter preserves rectangle perimeter', () => {
  // 长10宽6，角落剪去边长2正方形，周长不变=(10+6)*2=32
  const res = solveCornerCutPerimeter(10, 6, 2);
  assert.ok(res);
  assert.strictEqual(res.originalPerimeter, 32);
  assert.strictEqual(res.newPerimeter, 32);
  assert.strictEqual(res.perimeterChange, 0);
});

test('MathSolver: solveChickenAndRabbits solves classical heads and legs problem', () => {
  // 35头, 94脚 -> 兔12只, 鸡23只
  const res = solveChickenAndRabbits(35, 94);
  assert.ok(res);
  assert.strictEqual(res.rabbits, 12);
  assert.strictEqual(res.chickens, 23);
  assert.strictEqual(res.rabbits * 4 + res.chickens * 2, 94);
});

test('MathSolver: solveTreePlanting handles interval trees calculation', () => {
  // 全长100米，每隔5米栽一棵，两端都栽 -> 100/5 + 1 = 21棵
  const res = solveTreePlanting(100, 5, 'both_ends');
  assert.ok(res);
  assert.strictEqual(res.sections, 20);
  assert.strictEqual(res.trees, 21);
});

test('MathSolver: extractAndVerifyDeterministicMath identifies K-12 patterns from snippet', () => {
  const snippet = '用3个边长2厘米的正方形拼成一个长方形，该长方形的周长是（ ）厘米。';
  const match = extractAndVerifyDeterministicMath(snippet);
  assert.ok(match);
  assert.strictEqual(match.matched, true);
  assert.strictEqual(match.category, '几何周长与面积');
  assert.strictEqual(match.expectedPerimeter, 16);
  assert.strictEqual(match.expectedArea, 12);
});

test('HomeworkValidator: extractOptionLetter and extractNumbers extract accurately', () => {
  assert.strictEqual(extractOptionLetter('B. 16'), 'B');
  assert.strictEqual(extractOptionLetter('b'), 'B');
  assert.strictEqual(extractOptionLetter('选项C'), null);
  assert.deepStrictEqual(extractNumbers('周长是16厘米，面积是12平方厘米'), [16, 12]);
});

test('HomeworkValidator: auto-corrects LLM geometric hallucination and validates student answer', () => {
  const mockParsedData = {
    totalCount: 1,
    correctCount: 0,
    wrongCount: 1,
    accuracyPct: 0,
    results: [
      {
        questionNumber: 1,
        type: '选择题',
        questionSnippet: '用3个边长2厘米的正方形拼成一个长方形，该长方形的周长是（ ）厘米。',
        studentAnswer: 'B. 16',
        standardAnswer: 'C. 20 (因为3个正方形周长24减去4厘米)',
        status: 'wrong',
        score: 0,
        maxScore: 10,
        mistakeReason: '计算周长有误'
      }
    ]
  };

  const validated = sanitizeAndArbitrateHomeworkResults(mockParsedData, { subject: '数学' });
  assert.strictEqual(validated.correctCount, 1);
  assert.strictEqual(validated.wrongCount, 0);
  assert.strictEqual(validated.accuracyPct, 100);

  const item = validated.results[0];
  assert.strictEqual(item.status, 'correct');
  assert.strictEqual(item.score, 10);
  assert.strictEqual(item.mistakeReason, '');
  assert.ok(item.standardAnswer.includes('正确答案应为：16厘米'));
});

test('HomeworkValidator: respects teacher checkmark and self-contradicting reasons', () => {
  const mockParsedData = {
    results: [
      {
        questionNumber: 2,
        type: '填空题',
        questionSnippet: '化简绝对值',
        studentAnswer: '3',
        standardAnswer: '3',
        status: 'wrong',
        mistakeReason: '卷面有红勾表示正确，此处修正为正确'
      }
    ]
  };

  const validated = sanitizeAndArbitrateHomeworkResults(mockParsedData, { subject: '数学' });
  assert.strictEqual(validated.results[0].status, 'correct');
  assert.strictEqual(validated.correctCount, 1);
});
