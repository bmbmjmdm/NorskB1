/**
 * Spaced-repetition engine for NorskB1.
 *
 * Two timescales are modelled:
 *   1. Cross-session scheduling — each card has an `interval` (days) and a `due`
 *      timestamp. Grading adjusts the interval SM-2-style: hard collapses it to
 *      ~1 day, trivial stretches it far out ("almost never").
 *   2. Within-session ordering — handled in `useSession` using the re-insertion
 *      offsets below. Harder cards are re-queued sooner; trivial new cards are
 *      replaced by fresh new cards; hard reviews are re-added to the session.
 *
 * A card's `weight` is an exponential moving average of difficulty that captures
 * accumulated history and is used to prioritise which due reviews to surface.
 *
 * All functions here are pure and deterministic except where a PRNG is passed.
 */

import type {
  CardState,
  Difficulty,
  Direction,
  Origin,
  SessionItem,
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
  /** Probability a card is shown English-front (else Norwegian-front). */
  enFrontProbability: 0.75,
  /** Difficulty -> numeric value feeding the weight EMA. */
  weightValue: { trivial: 0, easy: 1, normal: 2.5, hard: 4 } as Record<
    Difficulty,
    number
  >,
  /** EMA smoothing factor (new value contribution). */
  emaAlpha: 0.4,
  /** Inter-session interval multipliers + day floors per difficulty. */
  interval: {
    trivial: { mult: 4, floor: 120 },
    easy: { mult: 2.5, floor: 4 },
    normal: { mult: 1.6, floor: 2 },
    hard: { mult: 0, floor: 1 },
  } as Record<Difficulty, { mult: number; floor: number }>,
  /** Max interval in days. */
  maxIntervalDays: 365,
  /** How many positions ahead to re-insert a card within the session. */
  reinsertOffset: { trivial: Infinity, easy: 10, normal: 6, hard: 3 } as Record<
    Difficulty,
    number
  >,
} as const;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Whether a graded card should be re-queued in the current session.
 *
 * - Trivial: never (a new trivial card is replaced with a fresh one elsewhere).
 * - Hard: always re-shown before the session ends (new or review).
 * - New + easy/normal: shown exactly once more, and only on the first encounter,
 *   so it finalises after that single mandatory repeat.
 * - Review + easy/normal: leaves the session.
 */
export function staysInSession(
  origin: Origin,
  difficulty: Difficulty,
  isFirstEncounter: boolean,
): boolean {
  if (difficulty === 'trivial') return false;
  if (difficulty === 'hard') return true;
  if (origin === 'new') return isFirstEncounter;
  return false;
}

/** Compute the next persisted CardState after grading. */
export function gradeCard(
  prev: CardState | undefined,
  difficulty: Difficulty,
  now: number,
  id: string,
): CardState {
  const value = SRS_CONFIG.weightValue[difficulty];
  const weight = prev
    ? prev.weight * (1 - SRS_CONFIG.emaAlpha) + value * SRS_CONFIG.emaAlpha
    : value;

  const prevInterval = prev?.interval ?? 0;
  const { mult, floor } = SRS_CONFIG.interval[difficulty];
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

/** Pick a presentation direction using the provided RNG (defaults to Math.random). */
export function pickDirection(rng: () => number = Math.random): Direction {
  return rng() < SRS_CONFIG.enFrontProbability ? 'en-no' : 'no-en';
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
  rng: () => number,
): SessionItem {
  return { entry, origin, direction: pickDirection(rng), repeatQueued: false };
}

export interface BuildSessionArgs {
  entries: readonly VocabEntry[];
  cards: Record<string, CardState>;
  now: number;
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
 * Assemble the initial session: up to `newPerSession` new cards plus a number of
 * reviews that scales with the due backlog (see `reviewTargetForBacklog` — base
 * 30, +10 per 100 due). Reviews are prioritised by how long overdue they are
 * (most overdue first), with ties broken randomly, so an oversized backlog is
 * still drained over multiple sessions. If too few are due, the soonest-due
 * introduced cards fill the remaining slots so a session is never needlessly
 * thin. When the user is early on and has introduced very few cards, the review
 * set is simply whatever exists — `min(target, available)` handles this.
 */
export function buildSession({
  entries,
  cards,
  now,
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

  // Pick reviews by how long overdue they are (most overdue first). Ties are
  // broken randomly via a per-card random key, so equally-overdue cards don't
  // always appear in the same order. Sorting by `due` ascending also naturally
  // places truly-due cards (due <= now) ahead of any not-yet-due fillers.
  const dueFirst = introduced
    .map(entry => ({ entry, due: cards[entry.id]!.due, rnd: rng() }))
    .sort((a, b) => a.due - b.due || a.rnd - b.rnd)
    .map(d => d.entry);

  // Grow the review target when the due backlog is large (+10 per 100 due).
  const dueCount = introduced.reduce(
    (n, e) => n + (cards[e.id]!.due <= now ? 1 : 0),
    0,
  );
  const reviewTarget = reviewTargetForBacklog(dueCount);

  const reviewItems = dueFirst
    .slice(0, reviewTarget)
    .map(entry => makeItem(entry, 'review', rng));

  const newItems = initialNew.map(entry => makeItem(entry, 'new', rng));

  const queue = shuffle([...newItems, ...reviewItems], rng);

  return {
    queue,
    newReserve,
    newTarget: Math.min(SRS_CONFIG.newPerSession, newPool.length),
    reviewCount: reviewItems.length,
  };
}

/** Clamp an insertion index into a queue of the given remaining length. */
export function reinsertIndex(
  difficulty: Difficulty,
  remaining: number,
): number {
  const offset = SRS_CONFIG.reinsertOffset[difficulty];
  if (!isFinite(offset)) return remaining; // never (append far end)
  return Math.min(offset, remaining);
}
