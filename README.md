# 3azza

3azza is an offline-first, manual scooter-maintenance tracker for scooter and delivery-bike owners. It keeps separate local records for multiple vehicles while preserving the app's navy, silver, and electric-blue industrial interface.

> Repository orientation: `C:\Users\youss\Desktop\Vibe coding\3azza2\app` is the canonical application repository. Its parent directory is a workspace containing source manuals and extraction material used by generation scripts; it is not part of this application repository's source layout. See [the architecture map](./docs/architecture/ARCHITECTURE.md) before making structural changes.

> Before substantial product work, read [PRODUCT_SCOPE.md](./docs/PRODUCT_SCOPE.md), [CURRENT_STATE.md](./docs/CURRENT_STATE.md), [ARCHITECTURE.md](./docs/architecture/ARCHITECTURE.md), and [NEXT_TASK.md](./docs/NEXT_TASK.md), in that order. Update the control document that matches any completed change.

## Product boundaries

3azza is a record-keeping tool, not a connected vehicle system or workshop manual.

- Odometer, fuel, pre-ride, document, part, and vehicle-condition values are entered by the user.
- The app does not connect to a scooter, read sensors, provide live telemetry, or require internet access.
- There are no user accounts, cloud sync, remote APIs, or multi-device recovery.
- The four-digit PIN is a local app lock. It is not an account password and does not encrypt the SQLite database, photos, or exports.
- JSON backups and CSV exports are unencrypted. JSON backups include local records and document photos; CSV contains service history only. The app-lock PIN and app preferences are excluded.
- Maintenance recommendations are generated from the exact selected validated owner manual, retain visible PDF-page provenance, and remain editable planning aids rather than workshop certification.
- Each vehicle stores one catalog-backed brand, model, manual version, and—where needed—exact variant ID. A guided selector narrows candidates with manual-backed displacement, cooling, fuel-system, and exact-code facts; ambiguity or missing evidence is never guessed.

## Current capabilities

- Multiple vehicle profiles with an active-vehicle switcher and vehicle-scoped SQLite rows.
- Manual odometer confirmation and optional daily-distance prediction between confirmations.
- Editable maintenance templates with Unknown, Manual, Optimal, Due Soon, and Overdue states.
- Transactional service completion and deletion: the linked interval baseline and service history commit or roll back together.
- Service history, parts inventory, fuel records, manual vehicle readings, and local document photos.
- A daily manual pre-ride checklist saved per vehicle.
- Exact-manual specifications, fluids/tires, indicators, troubleshooting, break-in guidance, conflicts, missing-data states, and cited online-manual actions.
- Model-derived maintenance with stable task IDs, distance/time rules, retained break-in milestones, user overrides, and the approved recurring 1,000 km engine-oil policy.
- Local maintenance, document-expiry, and backup reminders.
- Self-contained JSON backup/restore with document photos, plus CSV service-history export with explicit disclosure of exclusions.
- Local app-lock PIN with attempt throttling and optional device biometrics when hardware and enrollment are available.

## First-run flow

1. Review the short offline/manual onboarding.
2. Create a four-digit local app-lock PIN.
3. Select the scooter brand, model family, and manual years, answer only the useful manual-backed identification questions, confirm the exact candidate, then enter the current odometer and optional daily average.
4. Optionally enter known service history. Unknown history remains `Not set`; it is not treated as overdue.
5. Use Home, Maintenance, Documents, and Parts, with additional records available from Home.

On every cold launch, the unlocked session starts locked again. Existing users unlock with the current PIN; an unauthenticated screen cannot replace that PIN.

## Tech stack

- Expo 55 and React Native 0.83
- React 19 and TypeScript 5.9
- React Navigation 7
- NativeWind 4 / Tailwind CSS
- `expo-sqlite` for local domain records
- `expo-secure-store` for the app-lock verifier and small persisted preferences
- Zustand for in-memory/global app state
- `expo-notifications`, `expo-image-picker`, `expo-local-authentication`, and the native community date picker

## Development

Prerequisites are Node.js, npm, Android Studio, and an Android device or emulator. This repository's verified Android development target is `Medium_Phone_API_35`; the package is `com.youssefbayoumy.x3azza`.

Install dependencies:

```bash
npm install
```

Start a clean LAN Metro server:

```bash
npx expo start --lan --clear
```

In a second terminal, build and install the native Android app:

```bash
npx expo run:android --no-bundler --device Medium_Phone_API_35
```

Adding or changing a native dependency requires another native build. A stale installed APK can fail even when Metro serves current JavaScript.

Run the quality gates:

```bash
npm run typecheck
npm test
npm run lint
```

The test suite uses Node's test runner through `tsx`. Transaction tests use the `node:sqlite` API available in the verified Node 22 environment.

## Source layout

```text
App.tsx                         startup, fonts, database, reminders
src/navigation/                onboarding/app-lock/setup/main routing
src/screens/                   product screens
src/components/ui/             shared UI primitives
src/components/maintenance/    maintenance-owned flows
src/components/vehicle/        vehicle/manual-selection flows
src/services/database.ts       vehicle-scoped SQLite service
src/services/maintenance/      maintenance persistence internals
src/services/auth.ts           local PIN and biometric app-lock service
src/services/notifications.ts  on-device reminder reconciliation
src/services/export.ts         self-contained backup/restore and CSV export
src/store/useAppStore.ts       transient session and persisted preferences
src/utils/                     pure selectors, validation, and tests
docs/                          architecture, maintenance, QA, and handoffs
```

## Data and safety notes

- Domain records live in the local `3azza.db` SQLite database and are scoped by `vehicle_id`.
- Document rows store local image URIs. Version 4 JSON backups embed each readable document photo with an integrity digest and rewrite its URI into app storage during restore. Older backup versions remain readable but do not contain photo bytes.
- Service due state is derived through one shared selector. A zero legacy baseline means Unknown unless a linked history record establishes a positive odometer baseline.
- Tracked service completion validates the selected interval for the active vehicle, then persists its service name in a vehicle-scoped transaction. Backfilled lower-mileage logs do not move a baseline backward; deleting the latest linked log recomputes the previous maximum.
- Local reminders are conveniences, not safety guarantees. Riders remain responsible for confirming work and values against their own vehicle documentation.

## Known limitations

- Android is the only release-qualified platform. A remotely signed EAS Android App Bundle has passed clean-install, upgrade, phone, tablet-width, notification, app-lock, and final log checks. iOS/App Store and web support are intentionally unverified and outside the current release claim.
- Biometric denied/cancelled/success paths require enrolled hardware and are not covered by the Android emulator.
- TalkBack on physical hardware and Play Console pre-launch reports remain final distribution checks.

## Android release gate

Use Node 22, install from the committed lockfile, and run:

```bash
npm ci
npm run release:check
npx --yes eas-cli@21.2.0 build --platform android --profile production
```

The automated gate includes TypeScript, Expo lint, unit tests, Expo Doctor, and a zero-Critical Android dependency policy. See [docs/ANDROID_RELEASE_CHECKLIST.md](./docs/ANDROID_RELEASE_CHECKLIST.md) for candidate evidence, signing, manual QA, Play Console, and rollback requirements.

See [the product UX audit](./docs/qa/PRODUCT_UX_AUDIT.md) for evidence, open risks, and the remaining smoke matrix.
