const { test } = require('node:test');
const assert = require('node:assert/strict');

// The SM-2 calculation logic extracted from routes/mistakes.js
function calculateSM2(quality, review_count, easiness_factor, last_interval) {
  let interval = 1;
  let next_review_count = review_count;

  if (quality >= 3) {
    if (review_count === 0) interval = 1;
    else if (review_count === 1) interval = 6;
    else interval = Math.round(last_interval * easiness_factor);
    next_review_count += 1;
  } else {
    next_review_count = 0;
    interval = 1;
  }

  // SM-2: EF is updated regardless of quality score
  let next_easiness_factor = Math.max(
    1.3,
    easiness_factor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02))
  );

  return {
    review_count: next_review_count,
    easiness_factor: next_easiness_factor,
    interval: interval
  };
}

test('SM-2: first correct review (quality >= 3)', () => {
  const result = calculateSM2(4, 0, 2.5, 0);
  assert.equal(result.review_count, 1, 'review_count should increment');
  assert.equal(result.interval, 1, 'interval for first review should be 1');
  // EF change: quality = 4, 5-q = 1.
  // diff = 0.1 - 1 * (0.08 + 1 * 0.02) = 0.1 - 0.1 = 0
  assert.equal(result.easiness_factor, 2.5, 'EF should remain 2.5 when quality is 4');
});

test('SM-2: second correct review (quality >= 3)', () => {
  const result = calculateSM2(4, 1, 2.5, 1);
  assert.equal(result.review_count, 2, 'review_count should increment');
  assert.equal(result.interval, 6, 'interval for second review should be 6');
  assert.equal(result.easiness_factor, 2.5, 'EF should remain 2.5');
});

test('SM-2: third correct review with quality = 5 (excellent)', () => {
  const result = calculateSM2(5, 2, 2.5, 6);
  assert.equal(result.review_count, 3);
  assert.equal(result.interval, 15, 'interval should be 6 * 2.5 = 15');
  // EF change: quality = 5, 5-q = 0.
  // diff = 0.1
  assert.equal(result.easiness_factor, 2.6, 'EF should increase by 0.1 for quality 5');
});

test('SM-2: incorrect review (quality < 3)', () => {
  const result = calculateSM2(2, 3, 2.5, 15);
  assert.equal(result.review_count, 0, 'review_count should reset to 0');
  assert.equal(result.interval, 1, 'interval should reset to 1');
  // EF change: quality = 2, 5-q = 3.
  // diff = 0.1 - 3 * (0.08 + 3 * 0.02) = 0.1 - 3 * (0.14) = 0.1 - 0.42 = -0.32
  // EF = 2.5 - 0.32 = 2.18
  assert.equal(Number(result.easiness_factor.toFixed(2)), 2.18, 'EF should decrease significantly');
});

test('SM-2: EF lower bound (should not drop below 1.3)', () => {
  const result = calculateSM2(0, 1, 1.3, 1);
  assert.equal(result.easiness_factor, 1.3, 'EF should not drop below 1.3');
});
