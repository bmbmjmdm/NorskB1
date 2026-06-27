import AsyncStorage from '@react-native-async-storage/async-storage';
import { loadConfig } from '@/services/storage';
import { DEFAULT_SETTINGS } from '@/services/srs';

const CONFIG_KEY = '@norskb1/config/v1';

describe('loadConfig', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
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
