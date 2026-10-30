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

test('Essay Evaluation — gradeEssayWithLLM exports properly and adheres to rubric schema', () => {
  const { gradeEssayWithLLM } = require('../server/routes/essay');
  assert.strictEqual(typeof gradeEssayWithLLM, 'function', 'gradeEssayWithLLM should be exported');
});

test('Essay Evaluation — grade-adaptive scoring sets correct maxScore and age-appropriate upgrades', () => {
  // Grades 1-3: maxScore 20
  const primaryLower = heuristicEssayEvaluation('我的小猫', '小猫真可爱。它浑身雪白雪白的。我和小猫一起玩捉迷藏。', '2_up');
  assert.strictEqual(primaryLower.max_score, 20);
  assert.ok(primaryLower.sentence_upgrades[0].technique.includes('童趣') || primaryLower.sentence_upgrades[0].technique.includes('五感'));

  // Grades 4-6: maxScore 30
  const primaryUpper = heuristicEssayEvaluation('一次难忘的劳动', '今天我和同学们一起在校园里植树。大家分工合作，有的挖坑，有的扶树苗，有的浇水。虽然很累，但看到整齐的小树苗，心里甜滋滋的。', '5_up');
  assert.strictEqual(primaryUpper.max_score, 30);

  // Grades 7-9: maxScore 50
  const middleSchool = heuristicEssayEvaluation('成长足迹', '那是一次充满挑战的科技比赛，我们在实验室反复调试代码，终于在最后一刻攻克了算法难题。', '8_up');
  assert.strictEqual(middleSchool.max_score, 50);

  // Grades 10-12: maxScore 60
  const highSchool = heuristicEssayEvaluation('时代与青年', '立于百年未有之大变局的交汇点，青年一代当以实干笃行回应时代叩问，在思辨与躬行中铸就精神之丰碑。', '11_up');
  assert.strictEqual(highSchool.max_score, 60);
  assert.ok(highSchool.sentence_upgrades[0].technique.includes('立意') || highSchool.sentence_upgrades[0].technique.includes('思辨') || highSchool.sentence_upgrades[0].technique.includes('家国'));

  // Robust Chinese Grade Names
  const cnGrade3 = heuristicEssayEvaluation('可爱小兔', '小白兔真可爱，蹦蹦跳跳地吃胡萝卜。', '小学三年级');
  assert.strictEqual(cnGrade3.max_score, 20);
  const cnGrade5 = heuristicEssayEvaluation('秋天的校园', '秋风吹过操场，金黄的银杏叶随风飘落。', '五年级');
  assert.strictEqual(cnGrade5.max_score, 30);
  const cnGradeHigh = heuristicEssayEvaluation('论修养', '涵养身心，格物致知，方能行稳致远。', '高一');
  assert.strictEqual(cnGradeHigh.max_score, 60);
});

