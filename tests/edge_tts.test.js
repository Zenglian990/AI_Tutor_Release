const { test } = require('node:test');
const assert = require('node:assert/strict');
const { translateMathToChinese } = require('../server/services/tts-service');

test('TTS Math Translation — oral teacher phrasing', () => {
  const f1 = 'x^2 + y^2 = r^2';
  const c1 = translateMathToChinese(f1);
  console.log('Math oral test 1:', c1);
  assert.ok(c1.includes('平方') || c1.includes('2次方'));

  const f2 = '\\triangle ABC \\cong \\triangle DEF';
  const c2 = translateMathToChinese(f2);
  console.log('Math oral test 2:', c2);
  assert.ok(c2.includes('三角形') || c2.includes('全等于'));
});
