/**
 * Spaced-repetition engine for NorskB1.
 *
 * Two timescales are modelled:
 *   1. Cross-session scheduling — each card has an `interval` (days) and a `due`
 *      timestamp. Grading adjusts the interval SM-2-style: wrong collapses it to
 *      ~1 day, trivial stretches it far out ("almost never").
 *   2. Within-session ordering — handled in `useSession`. A card that stays
 *      (new-card repeat or wrong re-learn) is re-inserted `reinsertOffset` cards
 *      later so it isn't seen too soon; trivial new cards are replaced by fresh
 *      new cards.
 *
 * The user-tunable knobs (English-front probability, per-button interval
 * multiplier/floor, new-card repeats, wrong re-learn clears) live in `Settings`
 * and are threaded through as a `cfg` argument that defaults to DEFAULT_SETTINGS.
 * The remaining structural constants stay in SRS_CONFIG.
 *
 * All functions here are pure and deterministic except where a PRNG is passed.
 */

import type {
  CardState,
  Difficulty,
  Direction,
  Origin,
  SessionItem,
  Settings,
  VocabEntry,
} from '@/types';

export const SRS_CONFIG = {
  /** Target number of *non-trivial* new cards to learn per session. */
  newPerSession: 10,
  /** Hard cap on total new cards introduced in one session (safety bound). */
  maxNewPerSession: 30,
  /** Base number of review cards per session (grows with a large backlog). */
  reviewTarget: 30,
  /** For every `reviewBacklogStep` due cards, add `reviewBacklogBonus` reviews. */
  reviewBacklogStep: 100,
  reviewBacklogBonus: 10,
  /** Default probability a card is shown English-front (else Norwegian-front). */
  enFrontProbability: 0.85,
  /** Difficulty -> numeric value feeding the weight EMA. */
  weightValue: { trivial: 0, easy: 1, normal: 2.5, newHard: 3, wrong: 4 } as Record<
    Difficulty,
    number
  >,
  /** EMA smoothing factor (new value contribution). */
  emaAlpha: 0.4,
  /** Default inter-session interval multipliers + day floors per difficulty. */
  interval: {
    trivial: { mult: 4, floor: 120 },
    easy: { mult: 2.5, floor: 4 },
    normal: { mult: 1.6, floor: 2 },
    // "Hard" (newHard) — a gentle lapse for reviews: halve the interval so the
    // card returns sooner than it would have, without resetting it like wrong.
    newHard: { mult: 0.5, floor: 1 },
    wrong: { mult: 0, floor: 1 },
  } as Record<Difficulty, { mult: number; floor: number }>,
  /** Max interval in days. */
  maxIntervalDays: 365,
  /** Default non-wrong ratings required to clear a card after a "wrong". */
  wrongRelearnClears: 2,
  /** Default extra in-session views a new card needs before it leaves. */
  newCardRepeats: 1,
  /**
   * How many positions ahead a re-added card is placed in the queue (so it isn't
   * shown again too soon). Clamped to the queue length, so with fewer cards left
   * it lands at the end.
   */
  reinsertOffset: 10,
} as const;

/** Default user-tunable settings, derived from SRS_CONFIG. */
export const DEFAULT_SETTINGS: Settings = {
  enFrontProbability: SRS_CONFIG.enFrontProbability,
  intervals: {
    trivial: { ...SRS_CONFIG.interval.trivial },
    easy: { ...SRS_CONFIG.interval.easy },
    normal: { ...SRS_CONFIG.interval.normal },
    newHard: { ...SRS_CONFIG.interval.newHard },
    wrong: { ...SRS_CONFIG.interval.wrong },
  },
  newCardRepeats: SRS_CONFIG.newCardRepeats,
  wrongRelearnClears: SRS_CONFIG.wrongRelearnClears,
};

const DAY_MS = 24 * 60 * 60 * 1000;

/** Outcome of grading a card, as far as the current session queue is concerned. */
export interface ReinsertDecision {
  /** Whether the card is re-queued in the current session. */
  stays: boolean;
  /** Non-wrong clears still required before it may leave. */
  clearsRemaining: number;
  /** Whether the streak is a wrong-induced lapse (forces English-front re-shows). */
  wrongLapse: boolean;
  /** Direction to use for the re-queued presentation. */
  direction: Direction;
  /** Updated "no longer a first encounter" flag. */
  repeatQueued: boolean;
}

/**
 * Resolve which rating actually applies, accounting for the "Hard" (`newHard`)
 * button's dual behavior: while a card is still being learned (a new card) or is
 * mid re-learn (clearsRemaining > 0), pressing Hard counts the same as Wrong;
 * otherwise (a settled review) it stays `newHard` — a gentle ×0.5 reschedule.
 */
export function effectiveDifficulty(
  item: SessionItem,
  difficulty: Difficulty,
): Difficulty {
  if (
    difficulty === 'newHard' &&
    (item.origin === 'new' || item.clearsRemaining > 0)
  ) {
    return 'wrong';
  }
  return difficulty;
}

/**
 * Decide how a graded card re-enters (or leaves) the current session.
 *
 * - Trivial: leaves (a new trivial card is replaced with a fresh one elsewhere).
 * - Wrong: arms a re-learn streak of `cfg.wrongRelearnClears` non-wrong clears
 *   and always comes back English-front so you drill recall.
 * - While clearing (clearsRemaining > 0): each non-wrong rating clears one step;
 *   a wrong-induced streak stays English-front, a new-card streak keeps random
 *   direction. It leaves once the steps run out.
 * - New + easy/normal (first encounter): arms `cfg.newCardRepeats` extra views.
 * - Review + easy/normal (not clearing): leaves immediately.
 */
export function resolveReinsertion(
  item: SessionItem,
  difficulty: Difficulty,
  isFirstEncounter: boolean,
  cfg: Settings = DEFAULT_SETTINGS,
  rng: () => number = Math.random,
): ReinsertDecision {
  if (difficulty === 'trivial') {
    return {
      stays: false,
      clearsRemaining: 0,
      wrongLapse: false,
      direction: item.direction,
      repeatQueued: true,
    };
  }
  if (difficulty === 'wrong') {
    const clears = cfg.wrongRelearnClears;
    return {
      stays: clears > 0,
      clearsRemaining: clears,
      wrongLapse: true,
      direction: 'en-no', // wrong cards always come back English-front
      repeatQueued: true,
    };
  }
  // easy or normal
  if (item.clearsRemaining > 0) {
    const clearsRemaining = item.clearsRemaining - 1;
    return {
      stays: clearsRemaining > 0,
      clearsRemaining,
      wrongLapse: item.wrongLapse,
      direction: item.wrongLapse
        ? 'en-no'
        : pickDirection(cfg.enFrontProbability, rng),
      repeatQueued: true,
    };
  }
  if (item.origin === 'new' && isFirstEncounter && cfg.newCardRepeats > 0) {
    return {
      stays: true,
      clearsRemaining: cfg.newCardRepeats,
      wrongLapse: false,
      direction: pickDirection(cfg.enFrontProbability, rng),
      repeatQueued: true,
    };
  }
  return {
    stays: false,
    clearsRemaining: 0,
    wrongLapse: false,
    direction: item.direction,
    repeatQueued: true,
  };
}

/** Compute the next persisted CardState after grading. */
export function gradeCard(
  prev: CardState | undefined,
  difficulty: Difficulty,
  now: number,
  id: string,
  cfg: Settings = DEFAULT_SETTINGS,
): CardState {
  const value = SRS_CONFIG.weightValue[difficulty];
  const weight = prev
    ? prev.weight * (1 - SRS_CONFIG.emaAlpha) + value * SRS_CONFIG.emaAlpha
    : value;

  const prevInterval = prev?.interval ?? 0;
  const { mult, floor } = cfg.intervals[difficulty];
  const interval = Math.min(
    SRS_CONFIG.maxIntervalDays,
    Math.max(prevInterval * mult, floor),
  );

  return {
    id: prev?.id ?? id,
    weight,
    reps: (prev?.reps ?? 0) + 1,
    interval,
    due: now + interval * DAY_MS,
    lastSeen: now,
    introduced: true,
  };
}

/**
 * Compute the next CardState given the grade AND whether the card stays in the
 * session. This is what actually persists per grade:
 *
 * - A "wrong" rating always applies (a lapse: interval resets to its floor),
 *   even though the card stays for re-learning.
 * - Any other rating that keeps the card in the session (a re-learn clear or a
 *   new card's repeat) freezes the schedule at its current value, so repeated
 *   in-session markings never advance/compound the interval.
 * - A rating that lets the card leave applies normally, using the card's current
 *   interval (which a prior wrong will have reset).
 */
export function applyGrade(
  prev: CardState | undefined,
  difficulty: Difficulty,
  now: number,
  id: string,
  stays: boolean,
  cfg: Settings = DEFAULT_SETTINGS,
): CardState {
  const next = gradeCard(prev, difficulty, now, id, cfg);
  if (stays && difficulty !== 'wrong') {
    return { ...next, interval: prev?.interval ?? 0, due: prev?.due ?? now };
  }
  return next;
}

/**
 * Number of reviews to serve given how many cards are currently due.
 *
 * Stays at the base target until the backlog reaches a full `reviewBacklogStep`
 * (100), then adds `reviewBacklogBonus` (10) for each further step:
 *   <100 due -> 30,  100 -> 40,  200 -> 50,  300 -> 60, ...
 */
export function reviewTargetForBacklog(dueCount: number): number {
  const steps = Math.floor(dueCount / SRS_CONFIG.reviewBacklogStep);
  return SRS_CONFIG.reviewTarget + steps * SRS_CONFIG.reviewBacklogBonus;
}

/** Pick a presentation direction given the English-front probability. */
export function pickDirection(
  enFrontProbability: number = DEFAULT_SETTINGS.enFrontProbability,
  rng: () => number = Math.random,
): Direction {
  return rng() < enFrontProbability ? 'en-no' : 'no-en';
}

/** Fisher–Yates shuffle (non-mutating). */
export function shuffle<T>(input: readonly T[], rng: () => number = Math.random): T[] {
  const arr = input.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = arr[i]!;
    arr[i] = arr[j]!;
    arr[j] = tmp;
  }
  return arr;
}

function makeItem(
  entry: VocabEntry,
  origin: Origin,
  cfg: Settings,
  rng: () => number,
): SessionItem {
  return {
    entry,
    origin,
    direction: pickDirection(cfg.enFrontProbability, rng),
    repeatQueued: false,
    clearsRemaining: 0,
    wrongLapse: false,
  };
}

export interface BuildSessionArgs {
  entries: readonly VocabEntry[];
  cards: Record<string, CardState>;
  now: number;
  cfg?: Settings;
  rng?: () => number;
}

export interface BuiltSession {
  queue: SessionItem[];
  /** Brand-new entries held back to replenish trivially-rated new cards. */
  newReserve: VocabEntry[];
  newTarget: number;
  reviewCount: number;
}

/**
 * Assemble the initial session: up to `newPerSession` new cards plus the due
 * reviews. Only cards whose due date has passed are eligible — future-scheduled
 * cards are never pulled forward, so a "trivial" card really does disappear for
 * months. The review count scales with the due backlog (see
 * `reviewTargetForBacklog` — base 30, +10 per 100 due) and the most-overdue
 * cards are taken first (ties random), so an oversized backlog drains over
 * multiple sessions. Early on, when little is due, the session is simply smaller.
 */
export function buildSession({
  entries,
  cards,
  now,
  cfg = DEFAULT_SETTINGS,
  rng = Math.random,
}: BuildSessionArgs): BuiltSession {
  const newPool: VocabEntry[] = [];
  const introduced: VocabEntry[] = [];

  for (const entry of entries) {
    const state = cards[entry.id];
    if (!state || !state.introduced) {
      newPool.push(entry);
    } else {
      introduced.push(entry);
    }
  }

  const shuffledNew = shuffle(newPool, rng);
  const initialNew = shuffledNew.slice(0, SRS_CONFIG.newPerSession);
  const newReserve = shuffledNew.slice(
    SRS_CONFIG.newPerSession,
    SRS_CONFIG.maxNewPerSession,
  );

  // Only cards that are actually due (due <= now) are eligible for review — a
  // card scheduled into the future (e.g. one you rated "trivial") must wait until
  // its due date and is never pulled forward to pad a thin session. Among the due
  // cards, the most overdue come first, with ties broken randomly.
  const dueEntries = introduced
    .filter(entry => cards[entry.id]!.due <= now)
    .map(entry => ({ entry, due: cards[entry.id]!.due, rnd: rng() }))
    .sort((a, b) => a.due - b.due || a.rnd - b.rnd)
    .map(d => d.entry);

  // Grow the review target when the due backlog is large (+10 per 100 due).
  const reviewTarget = reviewTargetForBacklog(dueEntries.length);

  const reviewItems = dueEntries
    .slice(0, reviewTarget)
    .map(entry => makeItem(entry, 'review', cfg, rng));

  const newItems = initialNew.map(entry => makeItem(entry, 'new', cfg, rng));

  const queue = shuffle([...newItems, ...reviewItems], rng);

  return {
    queue,
    newReserve,
    newTarget: Math.min(SRS_CONFIG.newPerSession, newPool.length),
    reviewCount: reviewItems.length,
  };
}

/**
 * Index at which to re-insert a card that stays in the session: a fixed offset
 * ahead (so it isn't shown again too soon), clamped to the remaining queue
 * length so a short queue places it at the very end.
 */
export function reinsertIndex(remaining: number): number {
  return Math.min(SRS_CONFIG.reinsertOffset, remaining);
}
