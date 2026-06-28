# NorskB1

A spaced-repetition flashcard app for passing the **Norwegian B1 oral exam**, built with React Native (bare CLI) + TypeScript.

You learn a batch of new words/phrases each session and review old ones, with struggling cards resurfacing fast and easy ones spacing out over time. Cards show English on the front and Norwegian (with inflected forms) on the back, and occasionally flip the direction so you practice both ways. All progress persists on device, and you can resume a session exactly where you left off.

## Running it

```bash
cd ~/Documents/NorskB1
npm install            # restores all native deps (AsyncStorage, file picker, fs, share, …)

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

Each card is graded with one of **five** buttons, which sets its next review date and decides whether it reappears in the current session. Each button also **previews its outcome** right on the button: the number of days the card would be scheduled (e.g. "4 days", "120 days"), or "↻ review" when that grade would keep the card in the current session instead of scheduling it.

The next review date is computed from the card's current interval:

```
newInterval = min(365 days, max(currentInterval × mult, floor))
```

| Button  | mult | floor | First-time interval | In-session behaviour |
|---------|------|-------|---------------------|----------------------|
| Trivial | ×4   | 120   | 120 days            | Leaves; if it was a *new* card it's swapped for a fresh unseen word |
| Easy    | ×2.5 | 4     | 4 days              | *New* card shows once more, then done; *review* leaves |
| Normal  | ×1.6 | 2     | 2 days              | *New* card shows once more, then done; *review* leaves |
| Hard    | ×0.5 | 1     | (review only)       | *Review*: a gentle lapse — halves the interval and leaves. *New / re-learning*: acts exactly like Wrong |
| Wrong   | ×0   | 1     | 1 day               | Lapse + re-learn: resets interval to 1 and re-shows (English-front) until cleared — see below |

Key rules:

- **New** cards rated anything but *trivial* are shown exactly once more before the session ends, then finalize. Trivial new cards don't count toward your 10 and are replaced with fresh words, so consistently-easy material keeps the queue moving toward 10 genuinely-new words.
- **Hard** is context-sensitive. On a **settled review** it's a soft lapse: it multiplies the interval by **0.5** (so the card returns sooner than before) and the card leaves the session — no re-show. But while a card is still being learned (**new**) or is **mid re-learn**, pressing Hard counts the same as Wrong. (Internally it's a distinct value, `newHard`, so it doesn't clash with the old "Hard" that was renamed to Wrong.)
- **Review** cards re-enter the session only when rated *wrong* (or *hard* while still re-learning).
- **Wrong is a lapse + re-learn loop.** It immediately resets the card's interval to 1 day, then requires **two non-wrong ratings** to clear before the card may leave the session, showing **English-front** each time so you practice recalling the Norwegian. Hitting wrong again re-arms the two-clear requirement and re-applies the reset.
- **Only the grade that lets a card *leave* sets its next review date**, and it's applied to the card's interval as of its last lapse (a wrong resets that to 1). Intermediate stays — re-learn clears or a new card's single repeat — keep the schedule frozen, so repeated markings never compound: a wrong → normal → normal sequence schedules off the post-lapse interval (≈2 days), not off the original interval and not compounded across the two clears.
- Any card that stays in the session (a new-card repeat or a wrong re-learn) is re-inserted **10 cards later**, or at the end of the queue if fewer than 10 remain, so it isn't shown again too soon.

Cards are shown English-front a configurable percentage of the time (default **85%**) and Norwegian-front the rest (re-learning wrong cards are always English-front, as noted above).

> Each card stores a `weight` — an exponential moving average of your ratings (0 = always trivial … ~4 = always wrong) that captures how difficult it has proven over time. It's used to order a new session (see below).

### Session order

A freshly built session is ordered **hardest to easiest**: all **new** words come first, then the due **reviews** sorted by `weight` (descending), so the cards you've historically struggled with are surfaced while you're freshest, and consistently-easy ones come last. (Which reviews are *selected* is still by most-overdue; this is only the order they're shown in.)

### Undo

An **↶ Undo** button in the header (placed away from the grading buttons) reverts the last grade — restoring the card to the front of the queue, its scheduling, session counters, any swapped-in new word, and the persisted state. It's multi-level within a session. Undo history does not survive an app restart.

### Persistence & resume

Every grade is written to device storage (AsyncStorage): per-card scheduling plus a snapshot of the live session (queue order, reserve, counters), stored compactly by card id. Close the app mid-queue and reopening **resumes exactly where you left off**, including pending repeats and wrong re-shows. The saved session is cleared when it completes; "Start new session" and "Reset all progress" always build fresh. Settings and custom cards are stored separately, so adjusting them never touches your study progress.

### Settings

Open settings from the **⚙** in the header (or "⚙ Settings" on the session-complete screen). The sheet lets you adjust, all persisted on device:

- **English on front** — the percentage of cards shown English-first (0–100%).
- **New cards per session** — how many never-seen words to introduce each session (default 10).
- **Max review cards per session** — caps the due reviews per session (default 30). The backlog scaling (+10 per 100 due) still applies but never exceeds this limit.
- **Grading intervals** — the `floor` (minimum days) and `× mult` for each of the five buttons, i.e. the two numbers in the `newInterval` formula above.
- **Repeats before a card leaves** — extra in-session views for a new card, and the number of non-wrong clears required after a *wrong*.
- **Add a flashcard** — enter a Norwegian word and its English; it's added to your deck unless that headword already exists (in which case it shows an error naming the existing entry). Custom cards merge with the built-in vocabulary and show up as new cards in your next session.
- **Backup & restore** — **Export backup** bundles your progress, settings, and custom cards into a JSON file and opens the system share sheet (save to Files/Drive, AirDrop, email, etc.). **Import backup** opens the file picker; selecting a backup replaces the current data on the device and reloads. Use this to move to a new phone.
- **Reset settings to defaults.**

Setting changes apply going forward — new gradings and the next session use the new values immediately, without disturbing the session in progress.

The engine, config storage, and backup logic are unit-tested (36 tests) — see `src/services/__tests__/`.

> Backup/restore adds three native modules — `@react-native-documents/picker`, `@dr.pogodin/react-native-fs`, and `react-native-share`. After pulling these changes run `npm install`, then `cd ios && pod install`, and **rebuild** the app (a JS-only reload isn't enough for new native modules).

## Project structure

```
src/
  components/
    FlashCard.tsx          animated 3D flip card (built-in Animated API)
    DifficultyButtons.tsx  trivial / easy / normal / hard / wrong
    ProgressHeader.tsx     progress bar, queue count, undo + settings buttons
    Screen.tsx             safe-area layout wrapper
  data/
    vocabulary.ts          built-in vocabulary
  hooks/
    useSession.ts          session state machine (queue, replenishment, grading, undo, resume)
    useAppConfig.ts        settings + custom cards, merged with the vocabulary
  screens/
    SessionScreen.tsx      composes the study screen
    SettingsScreen.tsx     settings sheet + add-flashcard form
  services/
    srs.ts                 spaced-repetition engine (pure, tested)
    storage.ts             AsyncStorage persistence (progress + config)
    backup.ts              backup envelope: serialize/parse (pure, tested)
    backupIO.ts            native file export/import (share sheet + picker)
  theme/                   colors, spacing, typography tokens
  types/                   domain types
  utils/
    dedup.ts               headword normalization / duplicate detection
jest.setup.js              registers the in-memory AsyncStorage mock for tests
```

## Vocabulary

`src/data/vocabulary.ts` holds **1,648** entries (a base set plus words imported from personal notes) covering the B1 oral topics: free time, sports, seasons/weather, nature, work, education, technology, health, food, family, emotions, personality, society, environment, housing, travel, opinions/connectors, and common verbs. Each entry has English, Norwegian (Bokmål), inflected forms, part of speech, and a topic. Cards you add in Settings are stored separately and merged in at runtime.

Forms follow these conventions: nouns are the indefinite singular with article, and `forms` lists definite singular, indefinite plural, definite plural; verbs are the infinitive with `å`, and `forms` lists present, past, present perfect; adjectives give neuter, plural/definite, comparative, superlative.

> ⚠️ The list was AI-generated and spot-checked, not professionally proofread. Treat it as a strong study base and correct any entry inline — it's just a typed array. A few rarer strong-verb conjugations and noun genders are worth a native double-check.

## Notes
- Animations use React Native's built-in `Animated` API (no extra native deps). Reanimated could be layered in later for gesture-driven flips.
- Path alias `@/*` → `src/*` (configured in `tsconfig.json` + `babel.config.js`).
- Tuning knobs (new-per-session, review target + backlog scaling, interval multipliers/floors, re-insertion offsets) live in `SRS_CONFIG` at the top of `src/services/srs.ts`.

## Release

The app is configured for a `1.0.0` release. Identity is set in the repo:

| | Value |
|---|---|
| Display name | **Norsk B1** (`strings.xml`, `Info.plist`, `app.json`) |
| Bundle / application id | **com.norskb1** (Android `applicationId`/`namespace`, iOS `PRODUCT_BUNDLE_IDENTIFIER`) |
| Version | `1.0.0`, build/versionCode `1` |

What's already done in the repo:

- Versions, display name, and identifiers set (iOS no longer uses the invalid `org.reactjs.native.example.*` placeholder).
- **No network**: the app is fully offline, so the `INTERNET` permission was moved to a debug-only manifest (`android/app/src/debug/AndroidManifest.xml`). Release builds request no permissions — your Play **Data safety** form can declare no data collected or shared.
- iOS `ITSAppUsesNonExemptEncryption = false` (skips the per-upload encryption-compliance question; the app uses no non-exempt crypto).
- Android release **signing scaffold**: `build.gradle` reads `MYAPP_UPLOAD_*` from Gradle properties when present and otherwise falls back to debug signing (so `npm run android:release` still works for sideloading).
- Removed the unused `@react-native/new-app-screen` dependency.
- `.gitignore` updated so keystores/credentials are never committed.

### What you still need to do

**Icons & launch screen** (you're handling): replace `android/app/src/main/res/mipmap-*/ic_launcher*` and the iOS `Images.xcassets/AppIcon` set.

**Android — signing & build:**
1. Generate an upload keystore (`keytool -genkeypair -v -keystore upload.keystore -alias upload -keyalg RSA -keysize 2048 -validity 10000`).
2. Put credentials in `~/.gradle/gradle.properties` (outside the repo):
   ```
   MYAPP_UPLOAD_STORE_FILE=/absolute/path/to/upload.keystore
   MYAPP_UPLOAD_KEY_ALIAS=upload
   MYAPP_UPLOAD_STORE_PASSWORD=•••
   MYAPP_UPLOAD_KEY_PASSWORD=•••
   ```
3. Build the app bundle: `cd android && ./gradlew bundleRelease` → `app/build/outputs/bundle/release/app-release.aab`. Upload to Play Console (consider enabling Play App Signing).

**iOS — signing & build:**
1. In Xcode, open `ios/NorskB1.xcworkspace`, select the team under Signing & Capabilities (bundle id is already `com.norskb1`).
2. `cd ios && bundle install && pod install` (first time).
3. Product → Archive (Release scheme) → distribute to App Store Connect.

**Both stores:** create the app listing (name, description, screenshots, category, age rating) and submit for review. Bump `versionCode`/`CURRENT_PROJECT_VERSION` for each subsequent upload.

### Store review readiness (checked June 2026)

Already handled in the project:

- **Privacy policy** — see `PRIVACY_POLICY.txt` at the repo root. Both stores require a privacy-policy **URL**, so host this text somewhere public (GitHub Pages, a gist, your site) and paste the link into App Store Connect and the Play Console. Fill in the `[contact]` placeholder first.
- **Android target API** — `targetSdkVersion`/`compileSdkVersion` is **36 (Android 16)**, which satisfies both the current API-35 minimum and the API-36 minimum that takes effect **Aug 31, 2026**.
- **16 KB page sizes** — required for API-35+ apps. RN 0.85 + NDK 27 build 16 KB-aligned native libraries, so this is satisfied; you can confirm via the Play Console pre-launch report.
- **iOS privacy manifest** — `ios/NorskB1/PrivacyInfo.xcprivacy` is present and declares the standard React Native required-reason APIs (file timestamp, UserDefaults, system boot time), `NSPrivacyTracking = false`, and no collected data types. AsyncStorage ships its own manifest in its pod. If Apple ever emails about an undeclared reason, add the code from the email to this file.
- **iOS encryption compliance** — `ITSAppUsesNonExemptEncryption = false` in `Info.plist` (no compliance prompt per upload).
- **Permissions** — release builds request **none** (the `INTERNET` permission is debug-only); the unused location usage-description was removed.

You must still do (tooling / store console — outside the repo):

- **Build with Xcode 26 / iOS 26 SDK.** Since **Apr 28, 2026**, App Store Connect rejects uploads not built with the iOS 26 SDK. (Your deployment target can stay lower to support older devices.)
- **Answer the updated App Store age-rating questionnaire** (the new format has been required since Jan 31, 2026).
- **Play Data safety form** — declare **no data collected and no data shared** (true: the app is offline and local-only).
- **Account deletion** — not applicable (the app has no accounts).
