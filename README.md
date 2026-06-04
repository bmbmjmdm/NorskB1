# NorskB1

A spaced-repetition flashcard app for passing the **Norwegian B1 oral exam**, built with React Native (bare CLI) + TypeScript.

You learn ~10 new words/phrases a day and review old ones, with harder cards resurfacing sooner and easy ones fading into the background over time. Cards show English on the front and Norwegian (with inflected forms) on the back — and occasionally flip the direction.

## One-time finish-up

The app uses one native dependency that wasn't in the initial scaffold. Install it and rebuild:

```bash
cd ~/Documents/NorskB1
npm install                       # picks up @react-native-async-storage/async-storage (already in package.json)

# iOS
bundle install
cd ios && pod install && cd ..
npm run ios

# Android
npm run android
```

`npm install` / `pod install` need network + the native toolchain, so they run on your Mac (they can't run in the assistant sandbox).

## Scripts

```bash
npm run ios | android   # build & launch
npm start               # Metro bundler
npm test                # Jest (incl. SRS engine unit tests)
npx tsc --noEmit        # typecheck
```

## How it works

### Sessions
On launch you get up to **10 new** cards plus up to **30 due reviews** (whatever is available early on, e.g. "up to 20" while your deck is still small). Due reviews are ordered hardest-first by accumulated weight.

### Grading
Each card is graded with one of four buttons, which sets its difficulty and reschedules it:

| Button  | In-session behaviour | Next review |
|---------|----------------------|-------------|
| Trivial | leaves the session; if it was a *new* card it's replaced by another new one | far out (~60+ days) — "almost never" |
| Easy    | leaves the session (new cards repeat once) | interval ×2.5 |
| Normal  | leaves the session (new cards repeat once) | interval ×1.6 |
| Hard    | **re-shown before the session ends** | due tomorrow |

Rules, matching the spec:
- A card's **weight** is an exponential moving average of its difficulty; it drives review priority so harder cards surface sooner across sessions.
- **New** cards rated anything but *trivial* are shown again before the session ends. Trivial new cards don't count toward your 10 and are swapped for fresh ones, so consistently-easy material keeps the queue moving toward 10 genuinely-new words.
- **Review** cards re-enter the current session only when rated *hard*.
- Within a session, harder cards are re-queued sooner (hard ≈ 3 cards ahead, normal ≈ 6, easy ≈ 10).

The engine is fully unit-tested — see `src/services/__tests__/srs.test.ts`.

## Project structure

```
src/
  components/
    FlashCard.tsx        animated 3D flip card (built-in Animated API)
    DifficultyButtons.tsx  trivial / easy / normal / hard
    ProgressHeader.tsx   session progress bar
    Screen.tsx           safe-area layout wrapper
  data/
    vocabulary.ts        1,146 entries across 18 topics
  hooks/
    useSession.ts        session state machine (queue, replenishment, grading)
  screens/
    SessionScreen.tsx    composes the study screen
  services/
    srs.ts               spaced-repetition engine (pure, tested)
    storage.ts           AsyncStorage persistence
  theme/                 colors, spacing, typography tokens
  types/                 domain types
```

## Vocabulary

`src/data/vocabulary.ts` holds **1,146** entries covering the B1 oral topics: free time, sports, seasons/weather, nature, work, education, technology, health, food, family, emotions, personality, society, environment, housing, travel, opinions/connectors, and common verbs. Each entry has English, Norwegian (Bokmål), inflected forms, part of speech, and a topic.

> ⚠️ The list was AI-generated and spot-checked, not professionally proofread. Treat it as a strong study base and correct any entry inline — it's just a typed array. A few rarer strong-verb conjugations and noun genders are worth a native double-check.

## Notes
- Animations use React Native's built-in `Animated` API (no extra native deps). Reanimated can be layered in later if you want gesture-driven flips.
- Path alias `@/*` → `src/*` (configured in `tsconfig.json` + `babel.config.js`).
