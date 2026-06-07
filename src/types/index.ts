/**
 * Core domain types for the NorskB1 spaced-repetition flashcard app.
 */

/** Part of speech for a vocabulary entry. */
export type Pos = 'noun' | 'verb' | 'adj' | 'adv' | 'prep' | 'conj' | 'expr';

/** A single vocabulary item (static content shipped with the app). */
export interface VocabEntry {
  /** Stable unique id, e.g. "work-0007". */
  id: string;
  /** English gloss (the default front of the card). */
  en: string;
  /** Norwegian headword (Bokmål), incl. article for nouns / "å" for verbs. */
  no: string;
  /** Inflected forms, comma-separated. May be empty. */
  forms: string;
  /** Part of speech. */
  pos: Pos;
  /** Topic key, e.g. "work", "nature". */
  topic: string;
}

/** The four grading buttons. Order matters (easiest -> hardest). */
export type Difficulty = 'trivial' | 'easy' | 'normal' | 'hard';

export const DIFFICULTIES: readonly Difficulty[] = [
  'trivial',
  'easy',
  'normal',
  'hard',
] as const;

/**
 * Persisted learning state for a single card, keyed by VocabEntry.id.
 * Absence of a record means the card has never been seen ("new").
 */
export interface CardState {
  id: string;
  /**
   * Exponential moving average of difficulty (0 = trivial .. ~4 = hard).
   * Higher = harder = surfaced sooner.
   */
  weight: number;
  /** Number of times graded across all sessions. */
  reps: number;
  /** Current inter-session interval in days. */
  interval: number;
  /** Epoch ms when the card next becomes due for review. */
  due: number;
  /** Epoch ms of the last grading. */
  lastSeen: number;
  /**
   * True once the card has been graded at least once (i.e. it has been
   * "introduced" / learned and now participates in reviews).
   */
  introduced: boolean;
}

/** Which language is shown on the front of a given card presentation. */
export type Direction = 'en-no' | 'no-en';

/** Why a card is in the current session queue. */
export type Origin = 'new' | 'review';

/** A single scheduled presentation of a card within the active session. */
export interface SessionItem {
  entry: VocabEntry;
  origin: Origin;
  direction: Direction;
  /**
   * For new cards: becomes true once the user has graded it at least once this
   * session (so it is no longer a "first encounter").
   */
  repeatQueued: boolean;
  /**
   * Non-hard ratings still required before the card may leave the session. A
   * "hard" rating arms this (re-learn steps); reaches 0 to let the card exit.
   */
  clearsRemaining: number;
}

/** Per-session progress counters. */
export interface SessionStats {
  /** Distinct new cards graded non-trivially this session. */
  newLearned: number;
  /** Goal for newLearned (capped by available new cards). */
  newTarget: number;
  /** Review cards included at session start. */
  reviewTotal: number;
  /** Total gradings performed this session. */
  graded: number;
}

/** A queued card serialized by id (entries are rehydrated from VOCABULARY). */
export interface PersistedSessionItem {
  id: string;
  origin: Origin;
  direction: Direction;
  repeatQueued: boolean;
  clearsRemaining: number;
}

/** Snapshot of an in-progress session so it can be resumed after the app closes. */
export interface PersistedSession {
  queue: PersistedSessionItem[];
  /** Ids of new cards held back to replenish trivially-rated new cards. */
  reserve: string[];
  stats: SessionStats;
}

/** Aggregate persisted state, versioned for safe migrations. */
export interface PersistedState {
  version: number;
  cards: Record<string, CardState>;
  /** ISO date (yyyy-mm-dd) of the last session start, for daily bookkeeping. */
  lastSessionDate: string | null;
  /** In-progress session to resume, or null when none is active. */
  session: PersistedSession | null;
}
