/**
 * fsrs.js
 * Free Spaced Repetition Scheduler (FSRS v4.5) Core Algorithm
 * 
 * References:
 * - Open Spaced Repetition (ts-fsrs / fsrs-rs)
 * - Modern cognitive retention curve with stability (S) and difficulty (D)
 * - At 90% target retention (r = 0.9), interval I = S (in days)
 */

// Standard FSRS v4.5 default weight vector (17 parameters)
const DEFAULT_WEIGHTS = [
  0.40255, 1.18385, 3.173, 15.69105, // w[0..3]: initial stability for Again, Hard, Good, Easy
  7.1949, 0.5345,                     // w[4..5]: initial difficulty
  1.4604, 0.0046,                     // w[6..7]: difficulty update & mean reversion
  1.54575, 0.1192, 1.01925,           // w[8..10]: stability after success
  1.9395, 0.11, 0.29605, 0.22695,     // w[11..14]: stability after lapse (Again)
  0.5698, 2.85535                     // w[15..16]: hard penalty & easy bonus
];

// FSRS Rating Constants
const Rating = {
  Again: 1, // 忘记 / 重来
  Hard: 2,  // 困难 / 勉强
  Good: 3,  // 掌握 / 良好
  Easy: 4   // 轻松 / 秒杀
};

// FSRS State Constants
const State = {
  New: 0,
  Learning: 1,
  Review: 2,
  Relearning: 3
};

/**
 * Maps legacy 0-5 SM-2 quality score to 1-4 FSRS rating
 * @param {number} quality - SM-2 quality (0 to 5)
 * @returns {number} FSRS rating (1 to 4)
 */
function mapQualityToRating(quality) {
  const q = Number(quality);
  if (isNaN(q) || q < 3) return Rating.Again;
  if (q === 3) return Rating.Hard;
  if (q === 4) return Rating.Good;
  return Rating.Easy;
}

/**
 * Calculates Retrievability (probability of recall)
 * @param {number} daysElapsed - Days since last review
 * @param {number} stability - Current stability (in days)
 * @returns {number} Probability between 0 and 1
 */
function calculateRetrievability(daysElapsed, stability) {
  if (stability <= 0) return 0;
  if (daysElapsed <= 0) return 1;
  return 1 / (1 + (daysElapsed / (9 * stability)));
}

/**
 * Calculate next FSRS state for a card review
 * @param {number} ratingOrQuality - 1-4 (FSRS Rating) or 0-5 (SM-2 Quality)
 * @param {Object} currentCard - { stability, difficulty, review_count, last_interval, days_elapsed, easiness_factor }
 * @param {Object} options - { desiredRetention: 0.9, weights: DEFAULT_WEIGHTS }
 * @returns {Object} Updated FSRS metrics { review_count, stability, difficulty, interval, retrievability, state }
 */
function calculateFSRS(ratingOrQuality, currentCard = {}, options = {}) {
  const w = options.weights || DEFAULT_WEIGHTS;
  const desiredRetention = options.desiredRetention || 0.9;

  // Normalize rating
  let rating = Number(ratingOrQuality);
  if (rating > 4 || rating < 1) {
    rating = mapQualityToRating(ratingOrQuality);
  }

  const reviewCount = Math.max(0, Number(currentCard.review_count || 0));
  const hasLegacyHistory = reviewCount > 0 || (Number(currentCard.last_interval) > 0);
  const isFirstReview = !hasLegacyHistory && (!currentCard.stability || reviewCount === 0);

  let S = Number(currentCard.stability);
  let D = Number(currentCard.difficulty);

  // Backward compatibility from legacy SM-2 fields
  if (isNaN(S) || S <= 0) {
    const legacyInterval = Number(currentCard.last_interval || 0);
    S = legacyInterval > 0 ? legacyInterval : w[rating - 1];
  }
  if (isNaN(D) || D <= 0) {
    const legacyEF = Number(currentCard.easiness_factor || 2.5);
    // Map SM-2 EF (1.3 to 2.5) inversely to Difficulty (1 to 10)
    D = Math.max(1, Math.min(10, 10 - ((legacyEF - 1.3) / 1.2) * 6));
  }

  let nextS = S;
  let nextD = D;
  let nextReviewCount = reviewCount + 1;
  let nextState = State.Review;

  if (isFirstReview) {
    // Initial card setup
    nextS = w[rating - 1];
    nextD = Math.max(1, Math.min(10, w[4] - Math.exp(w[5] * (rating - 1)) + 1));
    nextState = rating === Rating.Again ? State.Learning : State.Review;
  } else {
    // Existing card update
    const elapsedDays = Math.max(0.1, Number(currentCard.days_elapsed ?? currentCard.last_interval ?? S));
    const R = calculateRetrievability(elapsedDays, S);

    // Update Difficulty with mean reversion towards D0(3)
    const D0_Good = w[4] - Math.exp(w[5] * (Rating.Good - 1)) + 1;
    const rawNextD = w[7] * D0_Good + (1 - w[7]) * (D - w[6] * (rating - 3));
    nextD = Math.max(1, Math.min(10, rawNextD));

    if (rating === Rating.Again) {
      // Lapse: Stability drop after memory failure
      nextS = w[11] * Math.pow(nextD, -w[12]) * (Math.pow(S + 1, w[13]) - 1) * Math.exp(w[14] * (1 - R));
      nextS = Math.max(0.1, nextS);
      nextState = State.Relearning;
    } else {
      // Successful recall: Stability expansion
      const hardPenalty = rating === Rating.Hard ? w[15] : 1.0;
      const easyBonus = rating === Rating.Easy ? w[16] : 1.0;

      const deltaS = S * (
        Math.exp(w[8]) *
        (11 - nextD) *
        Math.pow(S, -w[9]) *
        (Math.exp(w[10] * (1 - R)) - 1) *
        hardPenalty *
        easyBonus + 1
      );
      nextS = Math.max(S + 0.1, deltaS);
      nextState = State.Review;
    }
  }

  // Round values for precision and safety
  nextS = Math.round(nextS * 100) / 100;
  nextD = Math.round(nextD * 100) / 100;

  // At desiredRetention = 0.9, optimal interval I = round(9 * S * (1/r - 1)) = round(S)
  const factor = (1 / desiredRetention) - 1;
  const rawInterval = 9 * nextS * factor;
  let interval = Math.max(1, Math.round(rawInterval));

  // If rating is Again, interval is strictly 1 day
  if (rating === Rating.Again) {
    interval = 1;
  }

  const retrievability = Math.round(calculateRetrievability(0, nextS) * 100) / 100;

  return {
    review_count: nextReviewCount,
    stability: nextS,
    difficulty: nextD,
    interval: interval,
    retrievability: retrievability,
    state: nextState,
    rating: rating
  };
}

module.exports = {
  Rating,
  State,
  DEFAULT_WEIGHTS,
  mapQualityToRating,
  calculateRetrievability,
  calculateFSRS
};
