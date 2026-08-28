# Current state

Updated: 2026-08-28 (Africa/Cairo)

## Build and verification

- The current source configuration declares version **2.3.4** and Android version code **16**.
- The latest connected-device QA report verifies version **2.3.3** / code **12** on 2026-08-03. It is not evidence that the current 2.3.4/16 source has been device-qualified.
- The production EAS AAB for **2.3.4** / code **16** completed successfully and its compiled base manifest was verified with Bundletool. This verifies the artifact identity and packaged launcher/notification configuration, not connected-device behavior or Play acceptance.
- After the lifecycle refactor, `npm test` passes all **248 tests** and both `npm run typecheck` and `npm run lint` pass. No Android build was needed for this maintenance-only verification.
- `npm run release:check` currently stops at Expo Doctor. It reports six Expo SDK 57 patch-version mismatches: `expo`, `expo-file-system`, `expo-image-picker`, `expo-notifications`, `expo-sharing`, and `expo-splash-screen`. The subsequent security-audit step does not run when Doctor stops the command.

## What the product currently does well

- Stores multiple vehicle-scoped local records with an active-vehicle switcher.
- Uses validated, exact-manual maintenance data for the supported New Symphony ST 200 variant; generated-data and profile validation are part of `npm run check`.
- First-run and Add Vehicle setup ask only for exact scooter identity, current odometer, and bought-new/bought-used ownership. The detailed history questionnaire and daily-average requirement are removed.
- Uses `NEW -> BREAK_IN -> NORMAL` and `USED -> NORMAL`. Only explicitly new scooters receive the grouped 23-action, 300 km first-service checkpoint; it retires after completion or the configured 1,000 km window and never appears as recurring lifetime work.
- Uses one plan engine for Home, Maintenance, oil details, Insights, and notifications. A recurring deadline exists only from the latest exact compatible record plus the effective interval; used, migrated-unknown, or unanchored actions remain `unknown_history` with null due/remaining values.
- Preserves per-vehicle custom intervals and exact maintenance records across odometer changes. Recording work now, entering a previous record, editing, or deleting causes the affected action to recalculate from the latest remaining exact record.
- Schema v21 adds `purchase_condition` and `maintenance_started_at`. Existing databases and older backups migrate to unknown/null without altering service records, history rows, or preferences.
- Commits maintenance completion/deletion and baseline recalculation transactionally.
- Resolves new-scooter first-service packages in one database transaction; package logs and per-action states remain vehicle/profile scoped and backup-compatible.
- Provides English and Egyptian Arabic resource coverage, RTL-aware behavior, and automated localization checks.
- Provides local app-lock behavior, local export/restore, and on-device reminders without claiming cloud, telemetry, or encryption.
- Prevents duplicate Add Vehicle submissions with an in-flight guard, disabled draft controls, and an explicit Creating state while the local write completes.

## Product-relevant architecture facts

- `src/services/database.ts` remains the public persistence seam; all records are SQLite-backed and vehicle-scoped.
- `src/maintenance/`, `maintenance-data/`, catalog/model data, and generated artifacts jointly determine maintenance guidance. Generated data is checked, not hand-edited.
- The app is Android-qualified only. The latest QA APKs were debug-certificate signed, not store-production signed.

## Highest-impact known gaps and risks

- The active product task is to fix maintenance-record bottom-sheet behavior around keyboard opening and validation; see `NEXT_TASK.md`.
- The simplified setup, new/used lifecycle, first-service package, and changed-now/previous-record actions are covered by automated tests but have not yet received connected-device interaction QA (scrolling, keyboard, TalkBack, RTL, and notification output).
- Reminder reconciliation is wired, but permission-enabled scheduled-output verification and notification-tap behavior remain incomplete.
- Startup recovery, migration-failure handling, and several runtime/device scenarios remain unverified.
- Current source has not yet received connected-device qualification at its declared 2.3.4/16 version; compiled AAB verification is not a substitute for device QA.
- No Google Play upload or Play Console validation has been performed, and the failing Expo Doctor dependency-version check still blocks a release-readiness claim.

## Intentionally frozen

Feature expansion outside the maintenance loop is frozen. Secondary areas—Documents, Parts/Inventory, Fuel, Insights, manual readings, Pre-ride, reference/manual tooling, advanced reminder customization, and advanced backup UX—remain supported but should not pull focus from P0/P1 maintenance work.

Use `PRODUCT_SCOPE.md` for stable direction, `NEXT_TASK.md` for the immediate queue, and the QA/maintenance reports for dated evidence and historical detail.
