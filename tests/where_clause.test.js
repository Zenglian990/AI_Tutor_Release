const { test } = require('node:test');
const assert = require('node:assert/strict');
const { buildLanceDBWhereClause } = require('../server/prompts/guidelines');

test('RAG Where Clause — subject whitelist filtering blocks SQL injection attempts', () => {
  // Test malicious subjects
  const malicious1 = "数学' OR 1=1 --";
  const clause1 = buildLanceDBWhereClause('7_up', malicious1);
  console.log(`Malicious subject 1 result: "${clause1}"`);
  
  // Since it is not in the whitelist, the subject part must be completely ignored.
  // The output should only contain the grade condition and absolutely no subject condition.
  assert.ok(!clause1.includes("OR 1=1"), "Should block OR 1=1 injection");
  assert.ok(!clause1.includes("数学"), "Should not contain the malicious subject");

  // Whitelisted subjects should work
  const mathClause = buildLanceDBWhereClause(null, '数学');
  assert.ok(mathClause.includes("source LIKE '%数学%'") || mathClause.includes("source LIKE '%Math%'"));
});

test('RAG Where Clause — grade filter removes over-broad matchers and is strictly scoped', () => {
  const clause7 = buildLanceDBWhereClause('7_up', '数学');
  console.log(`Grade 7 math clause: "${clause7}"`);
  
  // Grade 7 must NOT match broad '%初中%' or '%小学%'
  assert.ok(!clause7.includes("LIKE '%初中%'"), "Should not include broad junior high school match");
  assert.ok(!clause7.includes("LIKE '%小学%'"), "Should not include broad primary school match");

  // Grade 7 must match specific grade markers
  assert.ok(clause7.includes("七年级") || clause7.includes("7年级") || clause7.includes("初一"));
  
  // Grade 7 volume 'up' must strictly match '上册' or '全一册'
  assert.ok(clause7.includes("上册") || clause7.includes("上") || clause7.includes("上"));
  assert.ok(clause7.includes("全一册"));
});

test('RAG Where Clause — handles Humanities & Geography (人文地理) exceptions correctly', () => {
  const geography7 = buildLanceDBWhereClause('7_up', '地理');
  console.log(`Grade 7 geography clause: "${geography7}"`);
  
  // Humanities & Geography exception must be included for Grade 7
  assert.ok(geography7.includes("人文地理上册"), "Grade 7 geography filter must match 人文地理上册");
  assert.ok(!geography7.includes("人文地理下册"), "Grade 7 geography filter must NOT match 人文地理下册");

  const geography8 = buildLanceDBWhereClause('8_down', '地理');
  console.log(`Grade 8 geography clause: "${geography8}"`);
  
  // Humanities & Geography exception must be included for Grade 8
  assert.ok(geography8.includes("人文地理下册"), "Grade 8 geography filter must match 人文地理下册");
  assert.ok(!geography8.includes("人文地理上册"), "Grade 8 geography filter must NOT match 人文地理上册");
});
