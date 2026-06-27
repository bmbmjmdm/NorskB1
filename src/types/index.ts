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

/**
 * The five grading buttons, ordered easiest -> hardest. Note `newHard` (label
 * "Hard") is distinct from `wrong` (the old "Hard"); the internal value is
 * `newHard` so its persisted settings never collide with the legacy `hard` key.
 */
export type Difficulty = 'trivial' | 'easy' | 'normal' | 'newHard' | 'wrong';

export const DIFFICULTIES: readonly Difficulty[] = [
  'trivial',
  'easy',
  'normal',
  'newHard',
  'wrong',
] as const;

/**
 * Persisted learning state for a single card, keyed by VocabEntry.id.
 * Absence of a record means the card has never been seen ("new").
 */
export interface CardState {
  id: string;
  /**
   * Exponential moving average of difficulty (0 = trivial .. ~4 = wrong).
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

/** Tunable interval parameters for one grading button. */
export interface GradingConfig {
  /** Multiplier applied to the card's current interval. */
  mult: number;
  /** Minimum interval in days. */
  floor: number;
}

/** User-adjustable engine settings (persisted across sessions). */
export interface Settings {
  /** Probability a card is shown English-front, 0..1. */
  enFrontProbability: number;
  /** Per-button interval multiplier + day floor. */
  intervals: Record<Difficulty, GradingConfig>;
  /** Extra in-session views a new (non-trivial) card needs before it leaves. */
  newCardRepeats: number;
  /** Non-wrong ratings required to clear a card after a "wrong". */
  wrongRelearnClears: number;
}

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
   * Non-wrong ratings still required before the card may leave the session. A
   * "wrong" rating arms this (re-learn steps); a new card's repeats use it too.
   */
  clearsRemaining: number;
  /**
   * True when the current re-learn streak was triggered by a "wrong" rating (so
   * re-shows are forced English-front). False for a new card's ordinary repeats.
   */
  wrongLapse: boolean;
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
  wrongLapse: boolean;
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
