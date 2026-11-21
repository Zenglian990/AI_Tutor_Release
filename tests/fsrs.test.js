const test = require('node:test');
const assert = require('node:assert/strict');
const { calculateFSRS, mapQualityToRating, calculateRetrievability, Rating, State } = require('../server/utils/fsrs');

test('FSRS: mapQualityToRating correctly maps 0-5 SM2 quality to 1-4 FSRS rating', () => {
  assert.equal(mapQualityToRating(0), Rating.Again);
  assert.equal(mapQualityToRating(1), Rating.Again);
  assert.equal(mapQualityToRating(2), Rating.Again);
  assert.equal(mapQualityToRating(3), Rating.Hard);
  assert.equal(mapQualityToRating(4), Rating.Good);
  assert.equal(mapQualityToRating(5), Rating.Easy);
});

test('FSRS: Initial review produces expected stability and interval for Good and Easy ratings', () => {
  const goodCard = calculateFSRS(Rating.Good);
  assert.equal(goodCard.review_count, 1);
  assert.ok(goodCard.stability > 2.5, `Stability should be > 2.5, got ${goodCard.stability}`);
  assert.ok(goodCard.interval >= 3, `Interval should be >= 3, got ${goodCard.interval}`);
  assert.equal(goodCard.state, State.Review);

  const easyCard = calculateFSRS(Rating.Easy);
  assert.ok(easyCard.stability > goodCard.stability, 'Easy stability must exceed Good stability');
  assert.ok(easyCard.interval > goodCard.interval, 'Easy interval must exceed Good interval');
});

test('FSRS: Lapse (Again) resets interval to 1 day and transitions state', () => {
  const lapseCard = calculateFSRS(Rating.Again, {
    stability: 8.5,
    difficulty: 4.2,
    review_count: 3,
    last_interval: 8
  });

  assert.equal(lapseCard.interval, 1, 'Lapse interval must reset to 1 day');
  assert.equal(lapseCard.state, State.Relearning);
  assert.ok(lapseCard.stability < 8.5, 'Stability should drop on memory failure');
});

test('FSRS: Subsequent Good reviews expand stability exponentially', () => {
  // First review: Good
  const r1 = calculateFSRS(Rating.Good);
  // Second review: Good after r1.interval days
  const r2 = calculateFSRS(Rating.Good, {
    stability: r1.stability,
    difficulty: r1.difficulty,
    review_count: r1.review_count,
    last_interval: r1.interval
  });
  // Third review: Good
  const r3 = calculateFSRS(Rating.Good, {
    stability: r2.stability,
    difficulty: r2.difficulty,
    review_count: r2.review_count,
    last_interval: r2.interval
  });

  assert.ok(r2.stability > r1.stability, 'r2 stability > r1');
  assert.ok(r3.stability > r2.stability, 'r3 stability > r2');
  assert.ok(r3.interval > r2.interval, 'r3 interval > r2');
});

test('FSRS: Seamless backward compatibility with legacy SM-2 cards', () => {
  // Legacy card with easiness_factor 2.5 and last_interval 6
  const legacyCard = {
    review_count: 2,
    easiness_factor: 2.5,
    last_interval: 6
  };

  const updated = calculateFSRS(Rating.Good, legacyCard);
  assert.ok(updated.stability >= 6, 'Stability initialized from last_interval');
  assert.ok(updated.difficulty >= 1 && updated.difficulty <= 10, 'Difficulty mapped within bounds');
  assert.ok(updated.interval >= 6, 'Next interval escalates from previous');
});

test('FSRS: calculateRetrievability models power-law forgetting curve', () => {
  const S = 10; // 10 days stability
  const r0 = calculateRetrievability(0, S);
  const r5 = calculateRetrievability(5, S);
  const r10 = calculateRetrievability(10, S);
  const r30 = calculateRetrievability(30, S);

  assert.equal(r0, 1.0, 'Day 0 retrievability must be 1.0');
  assert.ok(r5 > r10, 'Recall probability decays over time');
  assert.ok(r10 > r30, 'Recall probability continues to decay');
  assert.ok(r10 >= 0.88 && r10 <= 0.92, `Day S retrievability should be near 0.9, got ${r10}`);
});
