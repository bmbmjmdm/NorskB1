# NorskB1

A spaced-repetition flashcard app for passing the **Norwegian B1 oral exam**, built with React Native (bare CLI) + TypeScript.

You learn a batch of new words/phrases each session and review old ones, with struggling cards resurfacing fast and easy ones spacing out over time. Cards show English on the front and Norwegian (with inflected forms) on the back, and occasionally flip the direction so you practice both ways. All progress persists on device, and you can resume a session exactly where you left off.

## Running it

```bash
cd ~/Documents/NorskB1
npm install            # restores deps incl. @react-native-async-storage/async-storage

# iOS (first run)
bundle install
cd ios && pod install && cd ..
npm run ios

# Android (device or emulator)
npm run android
```

Builds run on your Mac (they need the native toolchain — Xcode/CocoaPods for iOS, Android SDK + JDK 17 for Android). If the Android build complains about Gradle/`IBM_SEMERU`, make sure `JAVA_HOME` points at JDK 17, not a newer JDK.

## Scripts

```bash
npm run ios | android   # build & launch
npm start               # Metro bundler
npm test                # Jest (incl. SRS engine unit tests)
npx tsc --noEmit        # typecheck
```

## How it works

### A session

When you open the app it builds a session of:

- **Up to 10 new** (never-seen) words.
- **Reviews whose due date has actually passed**, ordered by how long overdue they are (most overdue first; ties broken randomly).

Only genuinely-due cards are reviewed — cards scheduled into the future are **never pulled forward** to pad a thin session, so a card you rated "trivial" really does disappear for months. The review count scales with your backlog so it never balloons unbounded but still keeps up: base **30**, plus **10 for every 100 cards currently due**. So <100 due → 30 reviews, 100 → 40, 200 → 50, 300 → 60, and so on. A backlog larger than the target drains over multiple sessions, always taking the most-overdue cards first. Early on, when little is due, the session is simply smaller.

The header shows the **total number of cards remaining in the queue** plus how many new words you've learned this session, and a progress bar.

### Grading

Each card is graded with one of four buttons, which sets its next review date and decides whether it reappears in the current session. Each button also **previews its outcome** right on the button: the number of days the card would be scheduled (e.g. "4 days", "120 days"), or "↻ review" when that grade would keep the card in the current session instead of scheduling it.

The next review date is computed from the card's current interval:

```
newInterval = min(365 days, max(currentInterval × mult, floor))
```

| Button  | mult | floor | First-time interval | In-session behaviour |
|---------|------|-------|---------------------|----------------------|
| Trivial | ×4   | 120   | 120 days            | Leaves; if it was a *new* card it's swapped for a fresh unseen word |
| Easy    | ×2.5 | 4     | 4 days              | *New* card shows once more, then done; *review* leaves |
| Normal  | ×1.6 | 2     | 2 days              | *New* card shows once more, then done; *review* leaves |
| Hard    | ×0   | 1     | 1 day               | Lapse + re-learn: resets interval to 1 and re-shows (English-front) until cleared — see below |

Key rules:

- **New** cards rated anything but *trivial* are shown exactly once more before the session ends, then finalize. Trivial new cards don't count toward your 10 and are replaced with fresh words, so consistently-easy material keeps the queue moving toward 10 genuinely-new words.
- **Review** cards re-enter the session only when rated *hard*.
- **Hard is a lapse + re-learn loop.** It immediately resets the card's interval to 1 day, then requires **two non-hard ratings** to clear before the card may leave the session, showing **English-front** each time so you practice recalling the Norwegian. Hitting hard again re-arms the two-clear requirement and re-applies the reset. Within the session it re-shows ≈3 cards later each time.
- **Only the grade that lets a card *leave* sets its next review date**, and it's applied to the card's interval as of its last lapse (a hard resets that to 1). Intermediate stays — re-learn clears or a new card's single repeat — keep the schedule frozen, so repeated markings never compound: a hard → normal → normal sequence schedules off the post-lapse interval (≈2 days), not off the original interval and not compounded across the two clears.
- Within a session, the harder the rating the sooner the re-show (hard ≈ 3 cards ahead, normal ≈ 6, easy ≈ 10).

Cards are shown English-front **75%** of the time and Norwegian-front the rest (re-learning hard cards are always English-front, as noted above).

> Note: each card also stores a `weight` (an EMA of your ratings). It's currently computed but not read by anything — review order is driven purely by how overdue a card is. It's a hook for a future feature (e.g. flagging "leech" cards) rather than active behavior.

### Undo

An **↶ Undo** button in the header (placed away from the grading buttons) reverts the last grade — restoring the card to the front of the queue, its scheduling, session counters, any swapped-in new word, and the persisted state. It's multi-level within a session. Undo history does not survive an app restart.

### Persistence & resume

Every grade is written to device storage (AsyncStorage): per-card scheduling plus a snapshot of the live session (queue order, reserve, counters), stored compactly by card id. Close the app mid-queue and reopening **resumes exactly where you left off**, including pending repeats and hard re-shows. The saved session is cleared when it completes; "Start new session" and "Reset all progress" always build fresh.

The engine is fully unit-tested (18 tests) — see `src/services/__tests__/srs.test.ts`.

## Project structure

```
src/
  components/
    FlashCard.tsx          animated 3D flip card (built-in Animated API)
    DifficultyButtons.tsx  trivial / easy / normal / hard
    ProgressHeader.tsx     progress bar, queue count, undo button
    Screen.tsx             safe-area layout wrapper
  data/
    vocabulary.ts          1,146 entries across 18 topics
  hooks/
    useSession.ts          session state machine (queue, replenishment, grading, undo, resume)
  screens/
    SessionScreen.tsx      composes the study screen
  services/
    srs.ts                 spaced-repetition engine (pure, tested)
    storage.ts             AsyncStorage persistence
  theme/                   colors, spacing, typography tokens
  types/                   domain types
jest.setup.js              registers the in-memory AsyncStorage mock for tests
```

## Vocabulary

`src/data/vocabulary.ts` holds **1,146** entries covering the B1 oral topics: free time, sports, seasons/weather, nature, work, education, technology, health, food, family, emotions, personality, society, environment, housing, travel, opinions/connectors, and common verbs. Each entry has English, Norwegian (Bokmål), inflected forms, part of speech, and a topic.

Forms follow these conventions: nouns are the indefinite singular with article, and `forms` lists definite singular, indefinite plural, definite plural; verbs are the infinitive with `å`, and `forms` lists present, past, present perfect; adjectives give neuter, plural/definite, comparative, superlative.

> ⚠️ The list was AI-generated and spot-checked, not professionally proofread. Treat it as a strong study base and correct any entry inline — it's just a typed array. A few rarer strong-verb conjugations and noun genders are worth a native double-check.

## Notes
- Animations use React Native's built-in `Animated` API (no extra native deps). Reanimated could be layered in later for gesture-driven flips.
- Path alias `@/*` → `src/*` (configured in `tsconfig.json` + `babel.config.js`).
- Tuning knobs (new-per-session, review target + backlog scaling, interval multipliers/floors, re-insertion offsets) live in `SRS_CONFIG` at the top of `src/services/srs.ts`.
