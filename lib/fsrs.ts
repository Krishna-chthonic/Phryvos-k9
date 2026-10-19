/**
 * FSRS Spaced Repetition Scheduler — Free Spaced Repetition Scheduler
 * Implements the modern FSRS algorithm for optimal card scheduling
 *
 * Importers: lib/exam-service.ts (for review scheduling), components/exams/
 * Affected API: Study log review scheduling
 * Data schemas: fsrs_cards table (to be created)
 *
 * Based on: https://github.com/open-spaced-repetition/fsrs4anki
 */

export interface FSRSCard {
  id: number;
  subjectId: number;
  topicId: number | null;
  // FSRS parameters
  due: number;           // Unix timestamp when card is due
  stability: number;     // Memory stability (days)
  difficulty: number;    // Memory difficulty (0-10)
  elapsedDays: number;   // Days since last review
  scheduledDays: number; // Days until next review
  reps: number;          // Number of successful reviews
  lapses: number;        // Number of failed reviews
  state: number;         // 0=New, 1=Learning, 2=Review, 3=Relearning
  lastReview: number | null;
  createdAt: number;
  updatedAt: number;
}

export interface FSRSParameters {
  // Default FSRS parameters (from fsrs4anki)
  requestRetention: number;    // Target retention rate (0.9 default)
  maximumInterval: number;     // Maximum interval in days (36500)
  w: number[];                 // 17 model parameters
  enableFuzz: boolean;         // Add small randomness to intervals
}

// Default FSRS parameters (from official implementation)
export const DEFAULT_FSRS_PARAMETERS: FSRSParameters = {
  requestRetention: 0.9,
  maximumInterval: 36500,
  enableFuzz: true,
  w: [
    0.212, 1.2931, 2.3065, 8.2956, 6.4133, 0.8334, 3.1494, 0.003,
    1.6179, 0.1174, 0.9993, 0.9262, 0.0688, 0.4023, 0.1775, 0.1873, 0.0
  ],
};

export interface ReviewResult {
  card: FSRSCard;
  nextDue: number;
  nextStability: number;
  nextDifficulty: number;
  nextState: number;
  nextElapsedDays: number;
  nextScheduledDays: number;
}

export type Rating = 1 | 2 | 3 | 4; // Again, Hard, Good, Easy

/**
 * Calculate initial stability for a new card based on first rating
 */
function initialStability(rating: Rating, params: FSRSParameters): number {
  const w = params.w;
  switch (rating) {
    case 1: return w[0];
    case 2: return w[1];
    case 3: return w[2];
    case 4: return w[3];
  }
}

/**
 * Calculate initial difficulty for a new card based on first rating
 */
function initialDifficulty(rating: Rating, params: FSRSParameters): number {
  const w = params.w;
  const d = w[4] - w[5] * (rating - 1) + (w[6] * (rating - 1) * (rating - 1));
  return Math.max(1, Math.min(10, d));
}

/**
 * Calculate next interval for a review card
 */
function nextInterval(stability: number, params: FSRSParameters): number {
  const interval = stability / params.requestRetention * Math.log(1 / params.requestRetention);
  return Math.max(1, Math.min(params.maximumInterval, interval));
}

/**
 * Calculate next stability after a review
 */
function nextStability(
  stability: number,
  difficulty: number,
  rating: Rating,
  params: FSRSParameters
): number {
  const w = params.w;

  if (rating === 1) {
    // Again - reset stability
    return w[11] * Math.pow(stability, -w[12]) * Math.pow(difficulty + 1, w[13]) * Math.exp(w[14]);
  }

  // Hard, Good, Easy
  const retrievability = Math.exp(-1 / stability);
  const factor = rating === 2
    ? w[15] * Math.pow(stability, -w[16]) * Math.pow(difficulty + 1, w[17]) * Math.exp(w[18])
    : w[7] * Math.pow(stability, -w[8]) * Math.pow(difficulty + 1, w[9]) * Math.exp(w[10]);

  return stability * (1 + factor * (1 - retrievability));
}

/**
 * Calculate next difficulty after a review
 */
function nextDifficulty(
  difficulty: number,
  rating: Rating,
  params: FSRSParameters
): number {
  const w = params.w;

  if (rating === 1) {
    // Again - increase difficulty
    return Math.min(10, difficulty + w[19]);
  }

  // Hard, Good, Easy - decrease difficulty
  const delta = rating === 2 ? w[20] : rating === 3 ? w[21] : w[22];
  return Math.max(1, difficulty - delta);
}

/**
 * Apply fuzz to interval (small randomization)
 */
function fuzzInterval(interval: number, params: FSRSParameters): number {
  if (!params.enableFuzz) return interval;

  const fuzz = Math.min(0.15, 1 / interval);
  const min = interval * (1 - fuzz);
  const max = interval * (1 + fuzz);
  return Math.round(min + Math.random() * (max - min));
}

/**
 * Get the next review state based on rating and current state
 */
function nextState(currentState: number, rating: Rating): number {
  if (currentState === 0) { // New
    return rating === 1 ? 1 : 2; // Learning or Review
  }
  if (currentState === 1) { // Learning
    return rating === 1 ? 1 : 2; // Stay Learning or move to Review
  }
  if (currentState === 2) { // Review
    return rating === 1 ? 3 : 2; // Relearning or stay Review
  }
  if (currentState === 3) { // Relearning
    return rating === 1 ? 3 : 2; // Stay Relearning or move to Review
  }
  return 2;
}

/**
 * Main FSRS scheduling function
 */
export function scheduleCard(
  card: FSRSCard,
  rating: Rating,
  params: FSRSParameters = DEFAULT_FSRS_PARAMETERS,
  now: number = Date.now()
): ReviewResult {
  const daysMs = 24 * 60 * 60 * 1000;

  let nextStabilityVal: number;
  let nextDifficultyVal: number;
  let nextStateVal: number;
  let nextElapsedDays: number;
  let nextScheduledDays: number;
  let nextDue: number;

  if (card.state === 0) {
    // New card
    nextStabilityVal = initialStability(rating, params);
    nextDifficultyVal = initialDifficulty(rating, params);
    nextStateVal = nextState(0, rating);

    if (rating === 1) {
      // Again - short interval (1 minute to 10 minutes)
      nextScheduledDays = 1 / 1440; // 1 minute
    } else if (rating === 2) {
      // Hard - 10 minutes
      nextScheduledDays = 10 / 1440;
    } else if (rating === 3) {
      // Good - 1 day
      nextScheduledDays = 1;
    } else {
      // Easy - 4 days
      nextScheduledDays = 4;
    }
    nextElapsedDays = 0;
  } else if (card.state === 1) {
    // Learning card
    nextStabilityVal = initialStability(rating, params);
    nextDifficultyVal = initialDifficulty(rating, params);
    nextStateVal = nextState(1, rating);

    if (rating === 1) {
      nextScheduledDays = 1 / 1440; // 1 minute
    } else if (rating === 2) {
      nextScheduledDays = 10 / 1440; // 10 minutes
    } else {
      nextScheduledDays = nextInterval(nextStabilityVal, params);
    }
    nextElapsedDays = 0;
  } else if (card.state === 2) {
    // Review card
    nextStabilityVal = nextStability(card.stability, card.difficulty, rating, params);
    nextDifficultyVal = nextDifficulty(card.difficulty, rating, params);
    nextStateVal = nextState(2, rating);
    nextElapsedDays = Math.floor((now - (card.lastReview || card.createdAt)) / daysMs);

    if (rating === 1) {
      nextScheduledDays = 1 / 1440; // 1 minute for relearning
    } else {
      nextScheduledDays = fuzzInterval(nextInterval(nextStabilityVal, params), params);
    }
  } else {
    // Relearning card
    nextStabilityVal = nextStability(card.stability, card.difficulty, rating, params);
    nextDifficultyVal = nextDifficulty(card.difficulty, rating, params);
    nextStateVal = nextState(3, rating);
    nextElapsedDays = Math.floor((now - (card.lastReview || card.createdAt)) / daysMs);

    if (rating === 1) {
      nextScheduledDays = 1 / 1440;
    } else {
      nextScheduledDays = fuzzInterval(nextInterval(nextStabilityVal, params), params);
    }
  }

  nextDue = now + Math.round(nextScheduledDays * daysMs);

  return {
    card: {
      ...card,
      due: nextDue,
      stability: nextStabilityVal,
      difficulty: nextDifficultyVal,
      elapsedDays: nextElapsedDays,
      scheduledDays: nextScheduledDays,
      reps: card.reps + (rating >= 3 ? 1 : 0),
      lapses: card.lapses + (rating === 1 ? 1 : 0),
      state: nextStateVal,
      lastReview: now,
      updatedAt: now,
    },
    nextDue,
    nextStability: nextStabilityVal,
    nextDifficulty: nextDifficultyVal,
    nextState: nextStateVal,
    nextElapsedDays,
    nextScheduledDays,
  };
}

/**
 * Create a new FSRS card for a topic/subject
 */
export function createFSRSCard(
  subjectId: number,
  topicId: number | null,
  params: FSRSParameters = DEFAULT_FSRS_PARAMETERS,
  now: number = Date.now()
): FSRSCard {
  return {
    id: 0, // Will be set by DB
    subjectId,
    topicId,
    due: now,
    stability: 0,
    difficulty: 0,
    elapsedDays: 0,
    scheduledDays: 0,
    reps: 0,
    lapses: 0,
    state: 0, // New
    lastReview: null,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Convert FSRS state number to string
 */
export function stateToString(state: number): string {
  switch (state) {
    case 0: return "New";
    case 1: return "Learning";
    case 2: return "Review";
    case 3: return "Relearning";
    default: return "Unknown";
  }
}

/**
 * Convert rating to string
 */
export function ratingToString(rating: Rating): string {
  switch (rating) {
    case 1: return "Again";
    case 2: return "Hard";
    case 3: return "Good";
    case 4: return "Easy";
    default: return "Unknown";
  }
}

/**
 * Get cards due for review
 */
export function getDueCards(cards: FSRSCard[], now: number = Date.now()): FSRSCard[] {
  return cards.filter(c => c.due <= now);
}

/**
 * Get cards due within a time window (for preview)
 */
export function getUpcomingCards(cards: FSRSCard[], windowMs: number, now: number = Date.now()): FSRSCard[] {
  const limit = now + windowMs;
  return cards.filter(c => c.due > now && c.due <= limit).sort((a, b) => a.due - b.due);
}

/**
 * Calculate workload (cards due per day for next N days)
 */
export function calculateWorkload(cards: FSRSCard[], days: number = 30, now: number = Date.now()): number[] {
  const workload = new Array(days).fill(0);
  const dayMs = 24 * 60 * 60 * 1000;

  for (const card of cards) {
    if (card.due > now) {
      const dayIndex = Math.floor((card.due - now) / dayMs);
      if (dayIndex >= 0 && dayIndex < days) {
        workload[dayIndex]++;
      }
    }
  }

  return workload;
}

/**
 * Estimate retention for a card at a given time
 */
export function estimateRetention(card: FSRSCard, atTime: number = Date.now()): number {
  if (card.stability <= 0) return 0;
  const elapsedDays = (atTime - (card.lastReview || card.createdAt)) / (24 * 60 * 60 * 1000);
  return Math.exp(-elapsedDays / card.stability);
}

/**
 * Database schema helpers (to be used with better-sqlite3)
 */
export const FSRS_SCHEMA = `
CREATE TABLE IF NOT EXISTS fsrs_cards (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  subject_id INTEGER NOT NULL,
  topic_id INTEGER,
  due INTEGER NOT NULL,
  stability REAL NOT NULL DEFAULT 0,
  difficulty REAL NOT NULL DEFAULT 0,
  elapsed_days INTEGER NOT NULL DEFAULT 0,
  scheduled_days REAL NOT NULL DEFAULT 0,
  reps INTEGER NOT NULL DEFAULT 0,
  lapses INTEGER NOT NULL DEFAULT 0,
  state INTEGER NOT NULL DEFAULT 0,
  last_review INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (subject_id) REFERENCES exam_subjects(id) ON DELETE CASCADE,
  FOREIGN KEY (topic_id) REFERENCES exam_topics(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_fsrs_cards_due ON fsrs_cards(due);
CREATE INDEX IF NOT EXISTS idx_fsrs_cards_subject ON fsrs_cards(subject_id);
CREATE INDEX IF NOT EXISTS idx_fsrs_cards_topic ON fsrs_cards(topic_id);
`;