import { serializeBackup, parseBackup, BACKUP_TYPE } from '@/services/backup';
import { DEFAULT_SETTINGS } from '@/services/srs';
import type { BackupConfig } from '@/services/backup';
import type { PersistedState, Settings, VocabEntry } from '@/types';

const state: PersistedState = {
  version: 1,
  cards: {
    'work-0001': {
      id: 'work-0001', weight: 2, reps: 3, interval: 8,
      due: 1_700_000_000_000, lastSeen: 1_699_000_000_000, introduced: true,
    },
  },
  lastSessionDate: '2026-06-28',
  session: null,
};

const config: BackupConfig = {
  settings: DEFAULT_SETTINGS,
  customCards: [
    { id: 'custom-1', en: 'to test', no: 'å teste', forms: '', pos: 'verb', topic: 'custom' },
  ],
};

describe('backup serialize/parse', () => {
  it('round-trips study state and config', () => {
    const text = serializeBackup(state, config);
    const back = parseBackup(text);
    expect(back.state.cards['work-0001']).toEqual(state.cards['work-0001']);
    expect(back.state.lastSessionDate).toBe('2026-06-28');
    expect(back.config.settings).toEqual(DEFAULT_SETTINGS);
    expect(back.config.customCards).toEqual(config.customCards);
  });

  it('preserves every non-default setting and all custom cards', () => {
    // All fields deliberately non-default, so a dropped field fails the round-trip.
    const customSettings: Settings = {
      enFrontProbability: 0.42,
      intervals: {
        trivial: { mult: 3, floor: 99 },
        easy: { mult: 2.1, floor: 5 },
        normal: { mult: 1.3, floor: 3 },
        newHard: { mult: 0.4, floor: 2 },
        wrong: { mult: 0, floor: 1 },
      },
      newCardRepeats: 3,
      wrongRelearnClears: 4,
      newCardsPerSession: 7,
      maxReviewCards: 25,
    };
    const customCards: VocabEntry[] = [
      { id: 'custom-a', en: 'sunrise', no: 'soloppgang', forms: '', pos: 'noun', topic: 'custom' },
      { id: 'custom-b', en: 'to ponder', no: 'å gruble', forms: 'grubler, grublet, har grublet', pos: 'verb', topic: 'custom' },
    ];
    const back = parseBackup(serializeBackup(state, { settings: customSettings, customCards }));
    expect(back.config.settings).toEqual(customSettings);
    expect(back.config.customCards).toEqual(customCards);
  });

  it('stamps the envelope with type/version', () => {
    const parsed = JSON.parse(serializeBackup(state, config));
    expect(parsed.type).toBe(BACKUP_TYPE);
    expect(parsed.version).toBe(1);
    expect(typeof parsed.exportedAt).toBe('string');
  });

  it('rejects non-JSON', () => {
    expect(() => parseBackup('not json {')).toThrow(/valid JSON/i);
  });

  it('rejects a JSON file that is not a Norsk B1 backup', () => {
    expect(() => parseBackup(JSON.stringify({ hello: 'world' }))).toThrow(
      /Norsk B1 backup/i,
    );
  });

  it('backfills missing settings fields and drops malformed cards', () => {
    const text = JSON.stringify({
      type: BACKUP_TYPE,
      version: 1,
      state: { cards: {} },
      config: {
        settings: { enFrontProbability: 0.5 }, // missing intervals etc.
        customCards: [{ no: 'no id' }, { id: 'c2', en: 'ok', no: 'ok' }],
      },
    });
    const back = parseBackup(text);
    expect(back.config.settings.enFrontProbability).toBe(0.5);
    // backfilled from defaults
    expect(back.config.settings.intervals.wrong).toEqual(
      DEFAULT_SETTINGS.intervals.wrong,
    );
    expect(back.config.settings.newCardRepeats).toBe(
      DEFAULT_SETTINGS.newCardRepeats,
    );
    // only the well-formed card survives
    expect(back.config.customCards).toHaveLength(1);
    expect(back.config.customCards[0]!.id).toBe('c2');
    // missing state fields defaulted
    expect(back.state.lastSessionDate).toBeNull();
    expect(back.state.session).toBeNull();
  });
});
