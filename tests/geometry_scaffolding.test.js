const { test } = require('node:test');
const assert = require('node:assert');
const {
  AUXILIARY_LINE_MODELS,
  matchGeometryTrigger,
  generateAuxiliaryScaffold
} = require('../server/utils/geometryScaffolding');

test('Geometry Scaffolding Engine — defines the 4 gold-standard Chinese secondary geometry auxiliary line models', () => {
  assert.ok(AUXILIARY_LINE_MODELS.double_midpoint);
  assert.ok(AUXILIARY_LINE_MODELS.angle_bisector_perpendicular);
  assert.ok(AUXILIARY_LINE_MODELS.intercept_and_add);
  assert.ok(AUXILIARY_LINE_MODELS.zhao_shuang_chord);

  for (const model of Object.values(AUXILIARY_LINE_MODELS)) {
    assert.ok(model.name);
    assert.ok(model.causal_rationale.includes('【核心动因】'));
    assert.strictEqual(model.socratic_steps.length, 3);
    assert.ok(model.default_figure.points);
    assert.ok(model.default_figure.auxiliary_lines.length > 0);
  }
});

test('Geometry Scaffolding Engine — matches problem text to the correct auxiliary line model triggers', () => {
  // 1. Midpoint test
  const q1 = '在△ABC中，AD是BC边上的中线，已知AB=5，AC=3，求AD的取值范围。';
  const match1 = matchGeometryTrigger(q1);
  assert.strictEqual(match1.model_id, 'double_midpoint');
  assert.ok(match1.confidence >= 0.8);

  // 2. Angle bisector test
  const q2 = '已知点P在∠AOB的角平分线上，过点P向两边作垂线，证明距离相等。';
  const match2 = matchGeometryTrigger(q2);
  assert.strictEqual(match2.model_id, 'angle_bisector_perpendicular');

  // 3. Intercept and add test
  const q3 = '如图，在四边形中，已知∠B+∠D=180°，求证线段之和 AB+AC=AD。';
  const match3 = matchGeometryTrigger(q3);
  assert.strictEqual(match3.model_id, 'intercept_and_add');

  // 4. Zhao Shuang Chord / 90 degrees test
  const q4 = '在平面直角坐标系中，正方形ABCD绕原点旋转90度，构造一线三等角K型全等。';
  const match4 = matchGeometryTrigger(q4);
  assert.strictEqual(match4.model_id, 'zhao_shuang_chord');
});

test('Geometry Scaffolding Engine — generates complete Socratic scaffold with figure blueprints', () => {
  const scaffold = generateAuxiliaryScaffold('double_midpoint');
  assert.strictEqual(scaffold.success, true);
  assert.strictEqual(scaffold.model_name, '倍长中线模型');
  assert.ok(scaffold.figure_blueprint.points.A);
  assert.ok(scaffold.figure_blueprint.auxiliary_lines.length > 0);
});
