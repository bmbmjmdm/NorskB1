import {
  DEFAULT_SETTINGS,
  SRS_CONFIG,
  applyGrade,
  buildSession,
  gradeCard,
  reinsertIndex,
  resolveReinsertion,
  reviewTargetForBacklog,
  shuffle,
} from '@/services/srs';
import { findByHeadword, normalizeHeadword } from '@/utils/dedup';
import type { CardState, Origin, SessionItem, Settings, VocabEntry } from '@/types';

const DAY = 24 * 60 * 60 * 1000;
const NOW = 1_700_000_000_000;

const entry = (id: string): VocabEntry => ({
  id,
  en: `en-${id}`,
  no: `no-${id}`,
  forms: '',
  pos: 'noun',
  topic: 'test',
});

const makeEntries = (n: number): VocabEntry[] =>
  Array.from({ length: n }, (_, i) => entry(`w${i}`));

// Deterministic PRNG so tests are stable.
const seeded = (seed: number) => () => {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296;
};

describe('gradeCard', () => {
  it('initialises a new card from its rating', () => {
    const s = gradeCard(undefined, 'normal', NOW, 'w1');
    expect(s.id).toBe('w1');
    expect(s.reps).toBe(1);
    expect(s.introduced).toBe(true);
    expect(s.weight).toBe(SRS_CONFIG.weightValue.normal);
    expect(s.interval).toBe(SRS_CONFIG.interval.normal.floor);
    expect(s.due).toBe(NOW + s.interval * DAY);
  });

  it('collapses interval to 1 day on hard and stretches far on trivial', () => {
    const base: CardState = {
      id: 'w1',
      weight: 2,
      reps: 3,
      interval: 10,
      due: NOW,
      lastSeen: NOW,
      introduced: true,
    };
    expect(gradeCard(base, 'hard', NOW, 'w1').interval).toBe(1);
    expect(gradeCard(base, 'trivial', NOW, 'w1').interval).toBe(
      Math.max(10 * SRS_CONFIG.interval.trivial.mult, SRS_CONFIG.interval.trivial.floor),
    );
  });

  it('moves weight via EMA toward the new rating', () => {
    const first = gradeCard(undefined, 'hard', NOW, 'w1'); // weight 4
    const second = gradeCard(first, 'trivial', NOW, 'w1'); // EMA toward 0
    expect(second.weight).toBeLessThan(first.weight);
    expect(second.weight).toBeCloseTo(4 * (1 - SRS_CONFIG.emaAlpha));
  });

  it('caps interval at the configured maximum', () => {
    const base: CardState = {
      id: 'w1', weight: 0, reps: 9, interval: 300, due: NOW, lastSeen: NOW, introduced: true,
    };
    expect(gradeCard(base, 'trivial', NOW, 'w1').interval).toBe(SRS_CONFIG.maxIntervalDays);
  });
});

describe('applyGrade (per-grade scheduling)', () => {
  it('does not compound easy ratings within or across sessions', () => {
    // Session 1: a new card is shown twice — first stays (frozen), repeat leaves.
    let s = applyGrade(undefined, 'easy', NOW, 'w', true); // first encounter, stays
    expect(s.interval).toBe(0); // frozen — no schedule advance yet
    s = applyGrade(s, 'easy', NOW, 'w', false); // repeat, leaves
    expect(s.interval).toBe(4);
    // Subsequent review sessions (×2.5 each): 4 -> 10 -> 25.
    s = applyGrade(s, 'easy', NOW, 'w', false);
    expect(s.interval).toBe(10);
    s = applyGrade(s, 'easy', NOW, 'w', false);
    expect(s.interval).toBe(25);
  });

  it('hard lapses to 1 day even while the card stays, then a clear schedules off 1', () => {
    const base: CardState = {
      id: 'w', weight: 1, reps: 5, interval: 30,
      due: NOW, lastSeen: NOW, introduced: true,
    };
    const lapsed = applyGrade(base, 'hard', NOW, 'w', true); // stays for re-learn
    expect(lapsed.interval).toBe(1); // reset applied despite staying
    const clear1 = applyGrade(lapsed, 'normal', NOW, 'w', true); // first clear, frozen
    expect(clear1.interval).toBe(1);
    const leaves = applyGrade(clear1, 'normal', NOW, 'w', false); // final clear
    expect(leaves.interval).toBe(2); // max(1 × 1.6, 2)
  });
});

describe('resolveReinsertion', () => {
  const item = (
    origin: Origin,
    over: Partial<SessionItem> = {},
  ): SessionItem => ({
    entry: entry('x'),
    origin,
    direction: 'no-en',
    repeatQueued: false,
    clearsRemaining: 0,
    hardLapse: false,
    ...over,
  });

  it('repeats a new card once on first encounter, then finalises', () => {
    expect(resolveReinsertion(item('new'), 'easy', true).stays).toBe(true);
    expect(resolveReinsertion(item('new'), 'normal', true).stays).toBe(true);
    // The mandatory repeat (not first encounter) leaves on easy/normal.
    expect(resolveReinsertion(item('new'), 'easy', false).stays).toBe(false);
    expect(resolveReinsertion(item('new'), 'normal', false).stays).toBe(false);
  });

  it('keeps reviews only when hard', () => {
    expect(resolveReinsertion(item('review'), 'normal', false).stays).toBe(false);
    expect(resolveReinsertion(item('review'), 'easy', false).stays).toBe(false);
    expect(resolveReinsertion(item('review'), 'trivial', false).stays).toBe(false);
  });

  it('hard arms a 2-clear re-learn and forces English-front', () => {
    const d = resolveReinsertion(item('review'), 'hard', false);
    expect(d.stays).toBe(true);
    expect(d.clearsRemaining).toBe(SRS_CONFIG.hardRelearnClears);
    expect(d.direction).toBe('en-no');
  });

  it('requires two non-hard clears before a hard card leaves', () => {
    // After hard: clearsRemaining = 2.
    const first = resolveReinsertion(
      item('review', { clearsRemaining: 2, hardLapse: true }),
      'easy',
      false,
    );
    expect(first.stays).toBe(true);
    expect(first.clearsRemaining).toBe(1);
    expect(first.direction).toBe('en-no');
    // Second clear -> leaves.
    const second = resolveReinsertion(
      item('review', { clearsRemaining: 1, hardLapse: true }),
      'normal',
      false,
    );
    expect(second.stays).toBe(false);
    expect(second.clearsRemaining).toBe(0);
  });

  it('re-arms to 2 clears if marked hard again mid-re-learn', () => {
    const d = resolveReinsertion(item('review', { clearsRemaining: 1 }), 'hard', false);
    expect(d.clearsRemaining).toBe(SRS_CONFIG.hardRelearnClears);
    expect(d.stays).toBe(true);
  });
});

describe('buildSession', () => {
  it('serves up to newPerSession new cards and no reviews when nothing is introduced', () => {
    const entries = makeEntries(100);
    const built = buildSession({ entries, cards: {}, now: NOW, rng: seeded(1) });
    const newItems = built.queue.filter(i => i.origin === 'new');
    expect(newItems).toHaveLength(SRS_CONFIG.newPerSession);
    expect(built.reviewCount).toBe(0);
    expect(built.newTarget).toBe(SRS_CONFIG.newPerSession);
    // remaining new cards (capped) are held in reserve for replenishment
    expect(built.newReserve.length).toBe(
      SRS_CONFIG.maxNewPerSession - SRS_CONFIG.newPerSession,
    );
  });

  it('selects the most-overdue reviews and caps at reviewTarget', () => {
    const entries = makeEntries(50);
    const cards: Record<string, CardState> = {};
    // Introduce 40 cards overdue by ascending amounts: w0 is the LEAST overdue
    // (due 1 day ago), w39 the MOST overdue (due 40 days ago).
    for (let i = 0; i < 40; i++) {
      const overdueDays = i + 1;
      cards[`w${i}`] = {
        id: `w${i}`,
        weight: 1,
        reps: 1,
        interval: 1,
        due: NOW - overdueDays * DAY,
        lastSeen: NOW - overdueDays * DAY,
        introduced: true,
      };
    }
    const built = buildSession({ entries, cards, now: NOW, rng: seeded(2) });
    const reviews = built.queue.filter(i => i.origin === 'review');
    expect(reviews).toHaveLength(SRS_CONFIG.reviewTarget);
    const ids = new Set(reviews.map(r => r.entry.id));
    // The 30 most overdue (w10..w39) are included; the 10 least overdue are not.
    expect(ids.has('w39')).toBe(true); // most overdue
    expect(ids.has('w10')).toBe(true); // 30th most overdue (boundary)
    expect(ids.has('w9')).toBe(false); // 31st — pushed to a later session
    expect(ids.has('w0')).toBe(false); // least overdue
  });

  it('never pulls not-yet-due cards into reviews', () => {
    const entries = makeEntries(50);
    const cards: Record<string, CardState> = {};
    // 8 cards due (overdue), 20 scheduled into the future.
    for (let i = 0; i < 8; i++) {
      cards[`w${i}`] = {
        id: `w${i}`, weight: 1, reps: 1, interval: 1,
        due: NOW - DAY, lastSeen: NOW - DAY, introduced: true,
      };
    }
    for (let i = 8; i < 28; i++) {
      cards[`w${i}`] = {
        id: `w${i}`, weight: 1, reps: 1, interval: 30,
        due: NOW + 10 * DAY, lastSeen: NOW, introduced: true,
      };
    }
    const built = buildSession({ entries, cards, now: NOW, rng: seeded(8) });
    const reviews = built.queue.filter(i => i.origin === 'review');
    // Only the 8 due cards are reviewed; the 20 future cards are left alone.
    expect(reviews).toHaveLength(8);
    expect(built.reviewCount).toBe(8);
  });

  it('breaks ties between equally-overdue cards randomly', () => {
    const entries = makeEntries(60);
    const cards: Record<string, CardState> = {};
    // 50 cards, all due at the SAME instant -> selection must be random.
    for (let i = 0; i < 50; i++) {
      cards[`w${i}`] = {
        id: `w${i}`,
        weight: 1,
        reps: 1,
        interval: 1,
        due: NOW - DAY,
        lastSeen: NOW - DAY,
        introduced: true,
      };
    }
    const idsA = new Set(
      buildSession({ entries, cards, now: NOW, rng: seeded(1) }).queue
        .filter(i => i.origin === 'review')
        .map(i => i.entry.id),
    );
    const idsB = new Set(
      buildSession({ entries, cards, now: NOW, rng: seeded(99) }).queue
        .filter(i => i.origin === 'review')
        .map(i => i.entry.id),
    );
    expect(idsA.size).toBe(SRS_CONFIG.reviewTarget);
    // Different seeds should yield a different selection from the tied pool.
    expect([...idsA].some(id => !idsB.has(id))).toBe(true);
  });
});

describe('reviewTargetForBacklog', () => {
  it('adds 10 reviews for every 100 due cards', () => {
    expect(reviewTargetForBacklog(0)).toBe(30);
    expect(reviewTargetForBacklog(90)).toBe(30);
    expect(reviewTargetForBacklog(99)).toBe(30);
    expect(reviewTargetForBacklog(100)).toBe(40);
    expect(reviewTargetForBacklog(199)).toBe(40);
    expect(reviewTargetForBacklog(200)).toBe(50);
    expect(reviewTargetForBacklog(300)).toBe(60);
  });
});

describe('buildSession backlog scaling', () => {
  it('serves more reviews when the due backlog crosses 100', () => {
    const entries = makeEntries(200);
    const cards: Record<string, CardState> = {};
    // 150 cards all overdue -> target should be 30 + 10 = 40.
    for (let i = 0; i < 150; i++) {
      cards[`w${i}`] = {
        id: `w${i}`,
        weight: 1,
        reps: 1,
        interval: 1,
        due: NOW - DAY,
        lastSeen: NOW - DAY,
        introduced: true,
      };
    }
    const built = buildSession({ entries, cards, now: NOW, rng: seeded(5) });
    const reviews = built.queue.filter(i => i.origin === 'review');
    expect(reviews).toHaveLength(40);
    expect(built.reviewCount).toBe(40);
  });
});

describe('reinsertIndex', () => {
  it('places harder cards sooner and trivial at the far end', () => {
    expect(reinsertIndex('hard', 20)).toBe(SRS_CONFIG.reinsertOffset.hard);
    expect(reinsertIndex('normal', 20)).toBe(SRS_CONFIG.reinsertOffset.normal);
    expect(reinsertIndex('easy', 20)).toBe(SRS_CONFIG.reinsertOffset.easy);
    expect(reinsertIndex('trivial', 20)).toBe(20); // never (append)
    expect(reinsertIndex('hard', 1)).toBe(1); // clamped to remaining length
  });
});

describe('custom settings', () => {
  const cfg: Settings = {
    ...DEFAULT_SETTINGS,
    intervals: {
      ...DEFAULT_SETTINGS.intervals,
      easy: { mult: 2.0, floor: 3 },
    },
    newCardRepeats: 2,
    hardRelearnClears: 3,
  };

  it('gradeCard honors a custom interval multiplier/floor', () => {
    // floor wins when small: from 0 -> floor 3.
    expect(gradeCard(undefined, 'easy', NOW, 'w', cfg).interval).toBe(3);
    // then ×2.0.
    const s = gradeCard(undefined, 'easy', NOW, 'w', cfg);
    expect(gradeCard(s, 'easy', NOW, 'w', cfg).interval).toBe(6);
  });

  it('resolveReinsertion honors custom new-card repeats and hard clears', () => {
    const newItem: SessionItem = {
      entry: entry('w'), origin: 'new', direction: 'no-en',
      repeatQueued: false, clearsRemaining: 0, hardLapse: false,
    };
    expect(resolveReinsertion(newItem, 'easy', true, cfg).clearsRemaining).toBe(2);
    expect(resolveReinsertion(newItem, 'hard', false, cfg).clearsRemaining).toBe(3);
  });
});

describe('dedup util', () => {
  it('normalizes headwords (article/å, case, parentheticals)', () => {
    expect(normalizeHeadword('å jobbe')).toBe('jobbe');
    expect(normalizeHeadword('En Hest')).toBe('hest');
    expect(normalizeHeadword('strategi (ga sing)')).toBe('strategi');
  });

  it('finds an existing entry by headword regardless of article', () => {
    const entries: VocabEntry[] = [
      { id: 'x-1', en: 'a horse', no: 'en hest', forms: '', pos: 'noun', topic: 'nature' },
    ];
    expect(findByHeadword(entries, 'hest')?.id).toBe('x-1');
    expect(findByHeadword(entries, 'Hesten')).toBeNull(); // different headword
    expect(findByHeadword(entries, 'katt')).toBeNull();
  });
});

describe('shuffle', () => {
  it('preserves all elements', () => {
    const arr = makeEntries(30);
    const out = shuffle(arr, seeded(3));
    expect(out).toHaveLength(30);
    expect(new Set(out.map(e => e.id)).size).toBe(30);
  });
});
