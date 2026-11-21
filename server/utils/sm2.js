/**
 * sm2.js
 * Spaced Repetition (SuperMemo 2) Core Algorithm
 */

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

module.exports = {
  calculateSM2
};
