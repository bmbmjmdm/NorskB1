import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Settings, VocabEntry } from '@/types';
import { DEFAULT_SETTINGS } from '@/services/srs';
import { loadConfig, saveConfig } from '@/services/storage';
import { VOCABULARY } from '@/data/vocabulary';
import { findByHeadword } from '@/utils/dedup';

export interface AddCardResult {
  ok: boolean;
  /** Set when ok is false — a human-readable reason. */
  error?: string;
  /** The created entry, when ok. */
  entry?: VocabEntry;
}

export interface UseAppConfig {
  loaded: boolean;
  settings: Settings;
  customCards: VocabEntry[];
  /** Built-in vocabulary plus the user's custom cards. */
  entries: VocabEntry[];
  updateSettings: (next: Settings) => void;
  resetSettings: () => void;
  /** Add a flashcard if its Norwegian headword isn't already present. */
  addCard: (no: string, en: string) => AddCardResult;
  /** Replace settings + custom cards wholesale (used by backup import). */
  replaceConfig: (settings: Settings, customCards: VocabEntry[]) => void;
}

/**
 * App-level configuration: persisted tunable settings and user-added flashcards,
 * merged with the built-in vocabulary.
 */
export function useAppConfig(): UseAppConfig {
  const [loaded, setLoaded] = useState(false);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [customCards, setCustomCards] = useState<VocabEntry[]>([]);

  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const cardsRef = useRef(customCards);
  cardsRef.current = customCards;

  useEffect(() => {
    let cancelled = false;
    loadConfig().then(c => {
      if (cancelled) return;
      setSettings(c.settings);
      setCustomCards(c.customCards);
      setLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const updateSettings = useCallback((next: Settings) => {
    setSettings(next);
    saveConfig({ settings: next, customCards: cardsRef.current });
  }, []);

  const resetSettings = useCallback(() => {
    updateSettings(DEFAULT_SETTINGS);
  }, [updateSettings]);

  const entries = useMemo(() => [...VOCABULARY, ...customCards], [customCards]);

  const addCard = useCallback(
    (noRaw: string, enRaw: string): AddCardResult => {
      const no = noRaw.trim();
      const en = enRaw.trim();
      if (!no || !en) {
        return { ok: false, error: 'Enter both a Norwegian and an English word.' };
      }
      const existing = findByHeadword(entries, no);
      if (existing) {
        return {
          ok: false,
          error: `"${existing.no}" is already in the deck (means "${existing.en}").`,
        };
      }
      const entry: VocabEntry = {
        id: `custom-${Date.now()}-${cardsRef.current.length}`,
        en,
        no,
        forms: '',
        pos: 'expr',
        topic: 'custom',
      };
      const next = [...cardsRef.current, entry];
      setCustomCards(next);
      saveConfig({ settings: settingsRef.current, customCards: next });
      return { ok: true, entry };
    },
    [entries],
  );

  const replaceConfig = useCallback(
    (nextSettings: Settings, nextCards: VocabEntry[]) => {
      setSettings(nextSettings);
      setCustomCards(nextCards);
      saveConfig({ settings: nextSettings, customCards: nextCards });
    },
    [],
  );

  return {
    loaded,
    settings,
    customCards,
    entries,
    updateSettings,
    resetSettings,
    addCard,
    replaceConfig,
  };
}
