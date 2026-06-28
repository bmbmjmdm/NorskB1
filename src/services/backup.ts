/**
 * Backup envelope for moving a user's data between devices.
 *
 * Bundles BOTH the study progress (`PersistedState`) and the app config
 * (`settings` + `customCards`) into one versioned JSON document. Pure module —
 * no native or storage imports — so the serialize/parse logic is unit-testable.
 */
import type { CardState, PersistedState, Settings, VocabEntry } from '@/types';
import { DEFAULT_SETTINGS } from '@/services/srs';

export const BACKUP_TYPE = 'norskb1-backup';
export const BACKUP_VERSION = 1;

/** The config half of a backup (mirrors storage's AppConfig without importing it). */
export interface BackupConfig {
  settings: Settings;
  customCards: VocabEntry[];
}

export interface Backup {
  app: 'NorskB1';
  type: typeof BACKUP_TYPE;
  version: number;
  exportedAt: string;
  state: PersistedState;
  config: BackupConfig;
}

/** Serialize study progress + config into a pretty-printed backup document. */
export function serializeBackup(
  state: PersistedState,
  config: BackupConfig,
): string {
  const backup: Backup = {
    app: 'NorskB1',
    type: BACKUP_TYPE,
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    state,
    config,
  };
  return JSON.stringify(backup, null, 2);
}

function sanitizeSettings(raw: unknown): Settings {
  const s = (raw && typeof raw === 'object' ? raw : {}) as {
    enFrontProbability?: unknown;
    intervals?: Record<string, { mult?: number; floor?: number } | undefined>;
    newCardRepeats?: unknown;
    wrongRelearnClears?: unknown;
    newCardsPerSession?: unknown;
    maxReviewCards?: unknown;
    maxQueueCards?: unknown; // legacy combined cap
  };
  const savedIntervals: Record<string, { mult?: number; floor?: number } | undefined> =
    s.intervals ?? {};
  const D = DEFAULT_SETTINGS.intervals;
  const pick = (key: keyof typeof D) => {
    const v = savedIntervals[key];
    return v && typeof v.mult === 'number' && typeof v.floor === 'number'
      ? { mult: v.mult, floor: v.floor }
      : D[key];
  };
  return {
    enFrontProbability:
      typeof s.enFrontProbability === 'number'
        ? s.enFrontProbability
        : DEFAULT_SETTINGS.enFrontProbability,
    intervals: {
      trivial: pick('trivial'),
      easy: pick('easy'),
      normal: pick('normal'),
      newHard: pick('newHard'),
      wrong: pick('wrong'),
    },
    newCardRepeats:
      typeof s.newCardRepeats === 'number'
        ? s.newCardRepeats
        : DEFAULT_SETTINGS.newCardRepeats,
    wrongRelearnClears:
      typeof s.wrongRelearnClears === 'number'
        ? s.wrongRelearnClears
        : DEFAULT_SETTINGS.wrongRelearnClears,
    newCardsPerSession:
      typeof s.newCardsPerSession === 'number'
        ? s.newCardsPerSession
        : DEFAULT_SETTINGS.newCardsPerSession,
    maxReviewCards:
      typeof s.maxReviewCards === 'number'
        ? s.maxReviewCards
        : // migrate a legacy combined cap if present
        typeof s.maxQueueCards === 'number'
        ? Math.max(
            0,
            s.maxQueueCards -
              (typeof s.newCardsPerSession === 'number'
                ? s.newCardsPerSession
                : DEFAULT_SETTINGS.newCardsPerSession),
          )
        : DEFAULT_SETTINGS.maxReviewCards,
  };
}

function sanitizeCards(raw: unknown): VocabEntry[] {
  if (!Array.isArray(raw)) return [];
  const ok = (e: unknown): e is VocabEntry =>
    !!e &&
    typeof e === 'object' &&
    typeof (e as VocabEntry).id === 'string' &&
    typeof (e as VocabEntry).en === 'string' &&
    typeof (e as VocabEntry).no === 'string';
  return raw.filter(ok).map(e => ({
    id: e.id,
    en: e.en,
    no: e.no,
    forms: typeof e.forms === 'string' ? e.forms : '',
    pos: e.pos ?? 'expr',
    topic: typeof e.topic === 'string' ? e.topic : 'custom',
  }));
}

function sanitizeState(raw: unknown): PersistedState {
  const s = (raw && typeof raw === 'object' ? raw : {}) as Partial<PersistedState>;
  const cards =
    s.cards && typeof s.cards === 'object'
      ? (s.cards as Record<string, CardState>)
      : {};
  return {
    version: 1,
    cards,
    lastSessionDate:
      typeof s.lastSessionDate === 'string' ? s.lastSessionDate : null,
    session: s.session ?? null,
  };
}

/**
 * Parse and validate backup text. Throws a friendly Error if the text is not a
 * valid Norsk B1 backup; otherwise returns sanitized state + config ready to
 * persist (missing/blank fields are backfilled with defaults).
 */
export function parseBackup(text: string): {
  state: PersistedState;
  config: BackupConfig;
} {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error("That file isn't valid JSON — pick a Norsk B1 backup file.");
  }
  if (!raw || typeof raw !== 'object') {
    throw new Error("That file isn't a Norsk B1 backup.");
  }
  const obj = raw as Partial<Backup>;
  if (obj.type !== BACKUP_TYPE) {
    throw new Error(
      "That file isn't a Norsk B1 backup (wrong format). Pick the file you exported.",
    );
  }
  return {
    state: sanitizeState(obj.state),
    config: {
      settings: sanitizeSettings((obj.config as BackupConfig | undefined)?.settings),
      customCards: sanitizeCards((obj.config as BackupConfig | undefined)?.customCards),
    },
  };
}
