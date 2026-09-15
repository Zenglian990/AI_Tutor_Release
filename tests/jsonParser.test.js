const { test } = require('node:test');
const assert = require('node:assert');
const { extractAndParseJson } = require('../server/utils/jsonParser');

test('jsonParser: parses clean JSON', () => {
  const input = JSON.stringify({ totalCount: 2, results: [{ questionNumber: 1, standardAnswer: 'x = 3' }] });
  const res = extractAndParseJson(input);
  assert.strictEqual(res.totalCount, 2);
  assert.strictEqual(res.results.length, 1);
});

test('jsonParser: strips markdown code fences and surrounding commentary', () => {
  const input = `
这里是批改结果：
\`\`\`json
{
  "totalCount": 3,
  "correctCount": 2,
  "results": [
    { "questionNumber": 1, "status": "correct" }
  ]
}
\`\`\`
请同学认真订正！
`;
  const res = extractAndParseJson(input);
  assert.strictEqual(res.totalCount, 3);
  assert.strictEqual(res.correctCount, 2);
  assert.strictEqual(res.results.length, 1);
});

test('jsonParser: handles unescaped LaTeX backslashes without crashing', () => {
  // LaTeX formulas like \frac, \sqrt, \pm, \alpha, \angle
  const rawLatexJson = `\`\`\`json
{
  "totalCount": 1,
  "results": [
    {
      "questionNumber": 1,
      "standardAnswer": "x = \\frac{-b \\pm \\sqrt{\\Delta}}{2a}, \\angle ABC = 60^\\circ",
      "keyInsight": "运用求根公式 \\frac{-b \\pm \\sqrt{b^2-4ac}}{2a}"
    }
  ]
}
\`\`\``;
  const res = extractAndParseJson(rawLatexJson);
  assert.ok(res);
  assert.strictEqual(res.totalCount, 1);
  assert.ok(res.results[0].standardAnswer.includes('frac'));
  assert.ok(res.results[0].keyInsight.includes('sqrt'));
});

test('jsonParser: handles trailing commas safely', () => {
  const trailingCommaJson = `{
    "totalCount": 1,
    "results": [
      { "questionNumber": 1, "status": "correct", },
    ],
  }`;
  const res = extractAndParseJson(trailingCommaJson);
  assert.ok(res);
  assert.strictEqual(res.totalCount, 1);
});

test('jsonParser: parses real-world math homework with fractions and Rightarrow', () => {
  const rawInput = "```json\n" +
  "{\n" +
  '  "totalCount": 14,\n' +
  '  "correctCount": 11,\n' +
  '  "wrongCount": 3,\n' +
  '  "accuracyPct": 78,\n' +
  '  "summaryHeadline": "整卷批改完成",\n' +
  '  "results": [\n' +
  '    {\n' +
  '      "questionNumber": 2,\n' +
  '      "type": "解答题",\n' +
  '      "questionSnippet": "解方程 \\frac{x-1}{2} - \\frac{2x+3}{3} = 1",\n' +
  '      "standardAnswer": "3(x-1) - 2(2x+3) = 6 \\Rightarrow x = -15",\n' +
  '      "status": "wrong"\n' +
  '    }\n' +
  '  ]\n' +
  "}\n" +
  "```";

  const res = extractAndParseJson(rawInput);
  assert.ok(res);
  assert.strictEqual(res.totalCount, 14);
  assert.strictEqual(res.correctCount, 11);
  assert.strictEqual(res.results.length, 1);
  assert.ok(res.results[0].standardAnswer.includes('Rightarrow'));
});

