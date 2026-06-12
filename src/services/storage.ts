import AsyncStorage from '@react-native-async-storage/async-storage';
import type { CardState, PersistedState, Settings, VocabEntry } from '@/types';
import { DEFAULT_SETTINGS } from '@/services/srs';

const STORAGE_KEY = '@norskb1/state/v1';
const CONFIG_KEY = '@norskb1/config/v1';
const CURRENT_VERSION = 1;

/** App-level configuration: tunable settings + user-added flashcards. */
export interface AppConfig {
  settings: Settings;
  customCards: VocabEntry[];
}

const emptyConfig = (): AppConfig => ({
  settings: DEFAULT_SETTINGS,
  customCards: [],
});

/** Load settings + custom cards, backfilling any missing fields with defaults. */
export async function loadConfig(): Promise<AppConfig> {
  try {
    const json = await AsyncStorage.getItem(CONFIG_KEY);
    if (!json) return emptyConfig();
    const raw = JSON.parse(json) as Partial<AppConfig>;
    const s: Partial<Settings> = raw.settings ?? {};
    return {
      settings: {
        enFrontProbability:
          s.enFrontProbability ?? DEFAULT_SETTINGS.enFrontProbability,
        intervals: { ...DEFAULT_SETTINGS.intervals, ...(s.intervals ?? {}) },
        newCardRepeats: s.newCardRepeats ?? DEFAULT_SETTINGS.newCardRepeats,
        hardRelearnClears:
          s.hardRelearnClears ?? DEFAULT_SETTINGS.hardRelearnClears,
      },
      customCards: Array.isArray(raw.customCards) ? raw.customCards : [],
    };
  } catch (err) {
    if (__DEV__) console.warn('[storage] loadConfig failed:', err);
    return emptyConfig();
  }
}

/** Persist settings + custom cards. */
export async function saveConfig(config: AppConfig): Promise<void> {
  try {
    await AsyncStorage.setItem(CONFIG_KEY, JSON.stringify(config));
  } catch (err) {
    if (__DEV__) console.warn('[storage] saveConfig failed:', err);
  }
}

const emptyState = (): PersistedState => ({
  version: CURRENT_VERSION,
  cards: {},
  lastSessionDate: null,
  session: null,
});

/**
 * Best-effort migration hook. Today there is only v1, but isolating this keeps
 * future schema changes safe and non-destructive.
 */
function migrate(raw: unknown): PersistedState {
  if (!raw || typeof raw !== 'object') {
    return emptyState();
  }
  const candidate = raw as Partial<PersistedState>;
  if (candidate.version !== CURRENT_VERSION || typeof candidate.cards !== 'object') {
    return emptyState();
  }
  return {
    version: CURRENT_VERSION,
    cards: candidate.cards ?? {},
    lastSessionDate: candidate.lastSessionDate ?? null,
    session: candidate.session ?? null,
  };
}

/** Load the full persisted state, falling back to an empty state on any error. */
export async function loadState(): Promise<PersistedState> {
  try {
    const json = await AsyncStorage.getItem(STORAGE_KEY);
    if (!json) {
      return emptyState();
    }
    return migrate(JSON.parse(json));
  } catch (err) {
    if (__DEV__) {
      console.warn('[storage] loadState failed, resetting:', err);
    }
    return emptyState();
  }
}

/** Persist the full state. Swallows write errors (logged in dev). */
export async function saveState(state: PersistedState): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (err) {
    if (__DEV__) {
      console.warn('[storage] saveState failed:', err);
    }
  }
}

/** Merge an updated set of card states and persist. Returns the new state. */
export async function persistCards(
  prev: PersistedState,
  updated: Record<string, CardState>,
  lastSessionDate?: string,
): Promise<PersistedState> {
  const next: PersistedState = {
    ...prev,
    cards: { ...prev.cards, ...updated },
    lastSessionDate: lastSessionDate ?? prev.lastSessionDate,
  };
  await saveState(next);
  return next;
}

/** Wipe all progress. Used by the in-app reset action. */
export async function clearState(): Promise<PersistedState> {
  try {
    await AsyncStorage.removeItem(STORAGE_KEY);
  } catch (err) {
    if (__DEV__) {
      console.warn('[storage] clearState failed:', err);
    }
  }
  return emptyState();
}
