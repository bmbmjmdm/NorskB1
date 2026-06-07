import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  CardState,
  Difficulty,
  PersistedSession,
  PersistedState,
  SessionItem,
  SessionStats,
  VocabEntry,
} from '@/types';
import {
  buildSession,
  gradeCard,
  pickDirection,
  reinsertIndex,
  resolveReinsertion,
} from '@/services/srs';
import { clearState, loadState, saveState } from '@/services/storage';
import { DIFFICULTIES } from '@/types';

export type { SessionStats } from '@/types';

type Phase = 'loading' | 'active' | 'done';

/** What pressing a given button will do to the current card. */
export interface GradePreview {
  /** True if the card will be reviewed again this session instead of scheduled. */
  stays: boolean;
  /** Days until next review if the card leaves the session on this grade. */
  days: number;
}

export type GradePreviews = Record<Difficulty, GradePreview>;

/** Full mutable session state captured before a grade, for undo. */
interface Snapshot {
  queue: SessionItem[];
  stats: SessionStats;
  cards: Record<string, CardState>;
  reserve: VocabEntry[];
  base: PersistedState | null;
}

/** Max number of grades that can be undone. */
const UNDO_LIMIT = 50;

export interface UseSession {
  phase: Phase;
  current: SessionItem | null;
  remaining: number;
  stats: SessionStats;
  grade: (difficulty: Difficulty) => void;
  /** Per-button outcome for the current card (days scheduled, or "review again"). */
  previews: GradePreviews | null;
  /** Revert the most recent grade. No-op when there is nothing to undo. */
  undo: () => void;
  /** Whether an undo is currently available. */
  canUndo: boolean;
  startNewSession: () => void;
  resetAllProgress: () => void;
}

const todayISO = (): string => new Date().toISOString().slice(0, 10);

const insertAt = <T,>(arr: readonly T[], index: number, item: T): T[] => [
  ...arr.slice(0, index),
  item,
  ...arr.slice(index),
];

const EMPTY_STATS: SessionStats = {
  newLearned: 0,
  newTarget: 0,
  reviewTotal: 0,
  graded: 0,
};

/** Serialize the live session to id-based form for persistence. */
function serializeSession(
  queue: readonly SessionItem[],
  reserve: readonly VocabEntry[],
  stats: SessionStats,
): PersistedSession {
  return {
    queue: queue.map(i => ({
      id: i.entry.id,
      origin: i.origin,
      direction: i.direction,
      repeatQueued: i.repeatQueued,
      clearsRemaining: i.clearsRemaining,
    })),
    reserve: reserve.map(e => e.id),
    stats,
  };
}

/** Rehydrate a persisted session into live items, dropping any unknown ids. */
function rehydrateSession(
  saved: PersistedSession,
  byId: Map<string, VocabEntry>,
): { queue: SessionItem[]; reserve: VocabEntry[] } {
  const queue: SessionItem[] = [];
  for (const it of saved.queue) {
    const entry = byId.get(it.id);
    if (entry) {
      queue.push({
        entry,
        origin: it.origin,
        direction: it.direction,
        repeatQueued: it.repeatQueued,
        clearsRemaining: it.clearsRemaining ?? 0,
      });
    }
  }
  const reserve: VocabEntry[] = [];
  for (const id of saved.reserve) {
    const entry = byId.get(id);
    if (entry) reserve.push(entry);
  }
  return { queue, reserve };
}

/**
 * Drives one study session end-to-end: building the queue from persisted state,
 * applying the within-session re-insertion / replenishment rules on each grade,
 * and persisting card progress as it happens.
 */
export function useSession(entries: readonly VocabEntry[]): UseSession {
  const [phase, setPhase] = useState<Phase>('loading');
  const [queue, setQueue] = useState<SessionItem[]>([]);
  const [stats, setStats] = useState<SessionStats>(EMPTY_STATS);
  const [canUndo, setCanUndo] = useState(false);
  const historyRef = useRef<Snapshot[]>([]);

  // Refs hold the authoritative mutable session state so grade() never reads a
  // stale closure and updates stay atomic.
  const queueRef = useRef<SessionItem[]>([]);
  const statsRef = useRef<SessionStats>(EMPTY_STATS);
  const cardsRef = useRef<Record<string, CardState>>({});
  const reserveRef = useRef<VocabEntry[]>([]);
  const baseRef = useRef<PersistedState | null>(null);

  const commitQueue = useCallback((next: SessionItem[]) => {
    queueRef.current = next;
    setQueue(next);
    if (next.length === 0) {
      setPhase('done');
    }
  }, []);

  const commitStats = useCallback((next: SessionStats) => {
    statsRef.current = next;
    setStats(next);
  }, []);

  const begin = useCallback(
    (base: PersistedState, options?: { resume?: boolean }) => {
      const resume = options?.resume ?? true;
      baseRef.current = base;
      cardsRef.current = { ...base.cards };
      historyRef.current = [];
      setCanUndo(false);

      // Resume an in-progress session if one was saved and still has cards.
      if (resume && base.session && base.session.queue.length > 0) {
        const byId = new Map(entries.map(e => [e.id, e] as const));
        const { queue, reserve } = rehydrateSession(base.session, byId);
        if (queue.length > 0) {
          reserveRef.current = reserve;
          commitStats(base.session.stats);
          queueRef.current = queue;
          setQueue(queue);
          setPhase('active');
          return;
        }
      }

      // Otherwise build a fresh session.
      const built = buildSession({
        entries,
        cards: cardsRef.current,
        now: Date.now(),
      });
      reserveRef.current = built.newReserve;
      const initialStats: SessionStats = {
        newLearned: 0,
        newTarget: built.newTarget,
        reviewTotal: built.reviewCount,
        graded: 0,
      };
      commitStats(initialStats);
      queueRef.current = built.queue;
      setQueue(built.queue);
      setPhase(built.queue.length === 0 ? 'done' : 'active');

      // Persist the freshly built session so an immediate close still resumes.
      const freshBase: PersistedState = {
        ...base,
        lastSessionDate: todayISO(),
        session:
          built.queue.length === 0
            ? null
            : serializeSession(built.queue, built.newReserve, initialStats),
      };
      baseRef.current = freshBase;
      saveState(freshBase);
    },
    [entries, commitStats],
  );

  // Initial load.
  useEffect(() => {
    let cancelled = false;
    loadState().then(state => {
      if (!cancelled) begin(state);
    });
    return () => {
      cancelled = true;
    };
  }, [begin]);

  const grade = useCallback(
    (difficulty: Difficulty) => {
      const prevQueue = queueRef.current;
      if (prevQueue.length === 0) return;

      // Snapshot the full pre-grade state so this action can be undone. The refs
      // hold immutable values that are *replaced* (not mutated) below, so keeping
      // their current references is a safe snapshot.
      historyRef.current.push({
        queue: prevQueue,
        stats: statsRef.current,
        cards: cardsRef.current,
        reserve: reserveRef.current,
        base: baseRef.current,
      });
      if (historyRef.current.length > UNDO_LIMIT) {
        historyRef.current.shift();
      }
      setCanUndo(true);

      const item = prevQueue[0]!;
      const rest = prevQueue.slice(1);
      const now = Date.now();
      const firstEncounter = item.origin === 'new' && !item.repeatQueued;
      const decision = resolveReinsertion(item, difficulty, firstEncounter);

      // 1. Update card scheduling. While a card stays in the session (re-learn
      // steps or the new-card repeat), keep its existing schedule untouched so
      // only the final, leaving grade sets the next interval — repeated markings
      // (e.g. hard then two clears) never compound the future-queuing.
      const prevState = cardsRef.current[item.entry.id];
      let nextState = gradeCard(prevState, difficulty, now, item.entry.id);
      if (decision.stays) {
        nextState = {
          ...nextState,
          interval: prevState?.interval ?? 0,
          due: prevState?.due ?? now,
        };
      }
      cardsRef.current = { ...cardsRef.current, [item.entry.id]: nextState };

      // 2. Update session stats.
      const nextStats: SessionStats = {
        ...statsRef.current,
        graded: statsRef.current.graded + 1,
        newLearned:
          firstEncounter && difficulty !== 'trivial'
            ? statsRef.current.newLearned + 1
            : statsRef.current.newLearned,
      };

      // 3. Re-enter or leave the session per the decision above.
      let nextQueue = rest;

      if (decision.stays) {
        const repeatItem: SessionItem = {
          ...item,
          direction: decision.direction,
          repeatQueued: decision.repeatQueued,
          clearsRemaining: decision.clearsRemaining,
        };
        const idx = reinsertIndex(difficulty, rest.length);
        nextQueue = insertAt(rest, idx, repeatItem);
      } else if (
        firstEncounter &&
        difficulty === 'trivial' &&
        reserveRef.current.length > 0
      ) {
        // Too-easy new card: replace it with a fresh new card so the user still
        // works toward ~newPerSession genuinely-new words.
        const replacement = reserveRef.current[0]!;
        reserveRef.current = reserveRef.current.slice(1);
        const replacementItem: SessionItem = {
          entry: replacement,
          origin: 'new',
          direction: pickDirection(),
          repeatQueued: false,
          clearsRemaining: 0,
        };
        const idx = Math.floor(Math.random() * (rest.length + 1));
        nextQueue = insertAt(rest, idx, replacementItem);
      }

      // 4. Commit and persist full state (cards + resumable session) atomically.
      commitStats(nextStats);
      commitQueue(nextQueue);
      if (baseRef.current) {
        const nextBase: PersistedState = {
          ...baseRef.current,
          cards: cardsRef.current,
          lastSessionDate: todayISO(),
          session:
            nextQueue.length === 0
              ? null // session finished — nothing to resume
              : serializeSession(nextQueue, reserveRef.current, nextStats),
        };
        baseRef.current = nextBase;
        saveState(nextBase);
      }
    },
    [commitQueue, commitStats],
  );

  const undo = useCallback(() => {
    const snap = historyRef.current.pop();
    if (!snap) return;

    cardsRef.current = snap.cards;
    reserveRef.current = snap.reserve;
    baseRef.current = snap.base;
    commitStats(snap.stats);
    queueRef.current = snap.queue;
    setQueue(snap.queue);
    // A snapshot always restores at least the just-graded card to the front.
    setPhase('active');
    setCanUndo(historyRef.current.length > 0);

    // Roll persisted storage back to the pre-grade state (also removes any card
    // that had been newly introduced by the undone grade).
    if (snap.base) {
      saveState(snap.base);
    }
  }, [commitStats]);

  const startNewSession = useCallback(() => {
    setPhase('loading');
    // Force a fresh build, ignoring any resumable session.
    loadState().then(state => begin(state, { resume: false }));
  }, [begin]);

  const resetAllProgress = useCallback(() => {
    setPhase('loading');
    clearState().then(state => begin(state, { resume: false }));
  }, [begin]);

  const current = queue[0] ?? null;
  const previews = current
    ? buildPreviews(current, cardsRef.current[current.entry.id])
    : null;

  return {
    phase,
    current,
    remaining: queue.length,
    stats,
    grade,
    previews,
    undo,
    canUndo,
    startNewSession,
    resetAllProgress,
  };
}

/** Compute, for each button, what grading the current card would do. */
function buildPreviews(
  item: SessionItem,
  prevState: CardState | undefined,
): GradePreviews {
  const firstEncounter = item.origin === 'new' && !item.repeatQueued;
  const result = {} as GradePreviews;
  for (const d of DIFFICULTIES) {
    const decision = resolveReinsertion(item, d, firstEncounter);
    const days = Math.round(gradeCard(prevState, d, 0, item.entry.id).interval);
    result[d] = { stays: decision.stays, days };
  }
  return result;
}
