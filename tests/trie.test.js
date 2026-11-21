const { test } = require('node:test');
const assert = require('node:assert/strict');
const { checkSafetyAndRedirect } = require('../server/trie');

test('Sensitive word filtering — exact match', () => {
  // Profanity
  const res1 = checkSafetyAndRedirect("你是一个傻逼");
  assert.ok(res1 !== null, "Should block '傻逼'");
  assert.ok(res1.includes("文明"), "Should return profanity redirect response");

  // Violence
  const res2 = checkSafetyAndRedirect("我想去自杀");
  assert.ok(res2 !== null, "Should block '自杀'");
  assert.ok(res2.includes("生命和安全"), "Should return violence redirect response");

  // Games
  const res3 = checkSafetyAndRedirect("我想充值王者荣耀买皮肤");
  assert.ok(res3 !== null, "Should block game reference '王者荣耀'");
  assert.ok(res3.includes("游戏"), "Should return game redirect response");
});

test('Sensitive word filtering — homoglyphs & character variant normalization', () => {
  // Fullwidth letters
  const res1 = checkSafetyAndRedirect("fｕck");
  assert.ok(res1 !== null, "Should block fullwidth 'fｕck'");

  // Cyrillic lookalike: 'і' (\u0456)
  const res2 = checkSafetyAndRedirect("shіt");
  assert.ok(res2 !== null, "Should block homoglyph 'shіt'");

  // Fullwidth letters
  const res3 = checkSafetyAndRedirect("ｓｈｉｔ");
  assert.ok(res3 !== null, "Should block fullwidth 'ｓｈｉｔ'");

  // Zero-width space bypass (\u200B)
  const res4 = checkSafetyAndRedirect("傻\u200B逼");
  assert.ok(res4 !== null, "Should block with zero-width space bypass");
});

test('Sensitive word filtering — Pinyin & homophone bypass detection', () => {
  // Pinyin bypass patterns
  const res1 = checkSafetyAndRedirect("caonima");
  assert.ok(res1 !== null, "Should block pinyin 'caonima'");

  // Pinyin bypass with spaces
  const res2 = checkSafetyAndRedirect("cao ni ma");
  assert.ok(res2 !== null, "Should block space-separated pinyin 'cao ni ma'");

  const res3 = checkSafetyAndRedirect("shabi");
  assert.ok(res3 !== null, "Should block pinyin 'shabi'");
});
