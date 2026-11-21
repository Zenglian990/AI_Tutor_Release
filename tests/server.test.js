const { test } = require('node:test');
const assert = require('node:assert/strict');

const { extractGradeFromSource, matchesGrade } = require('../server/utils/gradeParser');

test('extractGradeFromSource — Chinese numerals', () => {
    assert.equal(extractGradeFromSource('三年级数学上册.pdf'), 3);
    assert.equal(extractGradeFromSource('七年级语文下册.pdf'), 7);
    assert.equal(extractGradeFromSource('九年级物理.pdf'), 9);
    assert.equal(extractGradeFromSource('PEP人教版英语三年级起点四年级下册.pdf'), 4);
    assert.equal(extractGradeFromSource('义务教育教科书·英语（三年级起点）四年级下册.pdf'), 4);
});


test('extractGradeFromSource — junior high aliases', () => {
    assert.equal(extractGradeFromSource('初一英语.pdf'), 7);
    assert.equal(extractGradeFromSource('初二历史.pdf'), 8);
    assert.equal(extractGradeFromSource('初三化学.pdf'), 9);
});

test('extractGradeFromSource — Arabic digits', () => {
    assert.equal(extractGradeFromSource('Grade7_math.pdf'), 7);
    assert.equal(extractGradeFromSource('5年级科学.pdf'), 5);
});

test('extractGradeFromSource — unknown returns null', () => {
    assert.equal(extractGradeFromSource('unknown_book.pdf'), null);
});

test('matchesGrade — correct match', () => {
    assert.ok(matchesGrade('七年级数学上册.pdf', '7'));
    assert.ok(matchesGrade('初一英语.pdf', '7'));
    assert.ok(matchesGrade('三年级语文.pdf', '3'));
});

test('matchesGrade — wrong grade returns false', () => {
    assert.ok(!matchesGrade('七年级数学上册.pdf', '8'));
    assert.ok(!matchesGrade('三年级语文.pdf', '4'));
});
