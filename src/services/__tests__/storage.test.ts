import AsyncStorage from '@react-native-async-storage/async-storage';
import { loadConfig, saveConfig } from '@/services/storage';
import { DEFAULT_SETTINGS } from '@/services/srs';
import type { Settings, VocabEntry } from '@/types';

const CONFIG_KEY = '@norskb1/config/v1';

describe('loadConfig', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it('round-trips non-default settings and custom cards (saveConfig -> loadConfig)', async () => {
    const settings: Settings = {
      enFrontProbability: 0.33,
      intervals: {
        trivial: { mult: 5, floor: 200 },
        easy: { mult: 2, floor: 6 },
        normal: { mult: 1.4, floor: 3 },
        newHard: { mult: 0.3, floor: 2 },
        wrong: { mult: 0, floor: 1 },
      },
      newCardRepeats: 2,
      wrongRelearnClears: 3,
      newCardsPerSession: 15,
      maxReviewCards: 50,
    };
    const customCards: VocabEntry[] = [
      { id: 'custom-x', en: 'glacier', no: 'en isbre', forms: 'isbreen, isbreer, isbreene', pos: 'noun', topic: 'custom' },
    ];
    await saveConfig({ settings, customCards });
    const c = await loadConfig();
    expect(c.settings).toEqual(settings);
    expect(c.customCards).toEqual(customCards);
  });

  it('returns defaults when nothing is saved', async () => {
    const c = await loadConfig();
    expect(c.settings).toEqual(DEFAULT_SETTINGS);
    expect(c.customCards).toEqual([]);
  });

  it('migrates a legacy config (pre-rename "hard" keys, no newHard/wrong)', async () => {
    await AsyncStorage.setItem(
      CONFIG_KEY,
      JSON.stringify({
        settings: {
          enFrontProbability: 0.6,
          intervals: {
            trivial: { mult: 4, floor: 120 },
            easy: { mult: 2.5, floor: 4 },
            normal: { mult: 1.6, floor: 2 },
            hard: { mult: 0, floor: 7 }, // legacy lapse button
          },
          hardRelearnClears: 5, // legacy key name
        },
        customCards: [],
      }),
    );

    const c = await loadConfig();
    // legacy "hard" interval migrates to "wrong"
    expect(c.settings.intervals.wrong).toEqual({ mult: 0, floor: 7 });
    // the new "Hard" (newHard) is backfilled from defaults
    expect(c.settings.intervals.newHard).toEqual(DEFAULT_SETTINGS.intervals.newHard);
    // legacy relearn-clears key migrates
    expect(c.settings.wrongRelearnClears).toBe(5);
    // all five keys present, no stale "hard" leaking through
    expect(Object.keys(c.settings.intervals).sort()).toEqual(
      ['easy', 'newHard', 'normal', 'trivial', 'wrong'].sort(),
    );
    expect(c.settings.enFrontProbability).toBe(0.6);
  });

  it('migrates a legacy combined maxQueueCards into a review cap', async () => {
    await AsyncStorage.setItem(
      CONFIG_KEY,
      JSON.stringify({ settings: { maxQueueCards: 40 }, customCards: [] }),
    );
    const c = await loadConfig();
    expect(c.settings.newCardsPerSession).toBe(DEFAULT_SETTINGS.newCardsPerSession);
    // 40 total minus the new-cards budget (10) -> 30 reviews
    expect(c.settings.maxReviewCards).toBe(30);
  });

  it('keeps a saved "wrong" interval over the legacy "hard" one', async () => {
    await AsyncStorage.setItem(
      CONFIG_KEY,
      JSON.stringify({
        settings: {
          intervals: {
            wrong: { mult: 0, floor: 3 },
            hard: { mult: 0, floor: 99 },
          },
        },
      }),
    );
    const c = await loadConfig();
    expect(c.settings.intervals.wrong).toEqual({ mult: 0, floor: 3 });
  });
});
