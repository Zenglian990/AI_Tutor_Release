const { test } = require('node:test');
const assert = require('node:assert');
const { heuristicEssayEvaluation } = require('../server/routes/essay');

test('Essay Evaluation — short input yields rubric with development suggestions', () => {
  const result = heuristicEssayEvaluation('未命题', '今天天气很好。我和朋友一起去公园玩。我们非常开心。', '7_up');

  assert.ok(result.total_score > 0);
  assert.strictEqual(result.max_score, 50);
  assert.ok(result.dimensions.depth);
  assert.ok(result.dimensions.structure);
  assert.ok(result.dimensions.rhetoric);
  assert.ok(result.dimensions.emotion);
  assert.ok(result.dimensions.standards);
  assert.ok(Array.isArray(result.suggestions));
});

test('Essay Evaluation — well structured essay yields high score and gold standard sentence upgrades', () => {
  const sampleEssay = `那年夏天，蝉鸣阵阵，阳光透过密密麻麻的梧桐树叶洒下斑驳的光影。
我独自坐在教室的角落里，面对着模拟考卷上鲜红的分数，心中满是迷茫与沮丧。
母亲轻轻推开门，递给我一杯温热的牛奶。她没有责备我，只是微笑着说：“孩子，一次跌倒并不代表永远爬不起来。”
那一刻，我仿佛看到心中的坚冰在阳光下悄然消融。我重新拿起笔，向着梦想的方向再次起跑。`;

  const result = heuristicEssayEvaluation('阳光总在风雨后', sampleEssay, '7_up');

  assert.ok(result.total_score >= 35, 'Detailed essay should score high');
  assert.ok(result.grade_level_label.includes('一类文') || result.grade_level_label.includes('二类文'));
  assert.ok(Array.isArray(result.sentence_upgrades));
  assert.ok(result.sentence_upgrades.length > 0);
  assert.ok(result.sentence_upgrades[0].upgraded);
  assert.ok(result.sentence_upgrades[0].technique);
  assert.ok(result.sentence_upgrades[0].reason);
});
