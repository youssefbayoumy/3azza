# Egyptian Arabic implementation handoff

## Objective

Finish phases 1–8 of Egyptian Arabic (`ar-EG`) localization for the Expo/React Native app. Do not claim completion until all app-owned user-visible text is localized, RTL/formatting is correct, and automated completeness checks pass. Device/Play rollout is intentionally phase 9+.

## Completion status — 2026-08-08

Phases 1–8 are complete. App-owned copy is routed through typed English and
Egyptian-Arabic resources, normal Arabic workflows are protected from raw
English diagnostics, manual-source English is explicitly labelled, and locale
formatting retains Western digits. The documented hard-coded UI scanner and RTL
directional-icon check are part of the test suite. Phase 9+ device/Play rollout
was not performed.

## Repository and safety

- App root: `C:\Users\youss\Desktop\Vibe coding\3azza2\app`
- Package: `com.youssefbayoumy.x3azza`; QA package: `com.youssefbayoumy.x3azza.qa`
- Preserve all existing records, database/backup schemas, route names, maintenance IDs, model codes, and source citations.
- The worktree is dirty. Do not reset, discard, or overwrite unrelated changes.
- The icon/app metadata changes in `app.json`, `assets/*`, `src/utils/androidConfiguration.test.ts`, the untracked logo SVG/PNG files, and `tmp/debug-test-20260808/` may belong to another user task. Preserve them unless the user explicitly says otherwise.
- Use `apply_patch` for source edits.

## Work completed

- Added persisted `locale: 'en' | 'ar-EG'` preference to Zustand/SecureStore.
- Added English/Arabic selector during onboarding and in Vehicle Settings.
- Added `I18nManager` RTL configuration with close/reopen prompt.
- Added and loads Cairo Arabic fonts (`@expo-google-fonts/cairo`).
- Added `src/i18n/core.ts`, `index.ts`, `localeState.ts`, and `core.test.ts`.
- Localized onboarding, key login text, vehicle setup, bottom tabs, notification channel/content, and selected Dashboard/Maintenance text.
- Added locale-aware date formatting and deliberately retains Western digits for odometer/manual compatibility.
- Added canonical Arabic maintenance component/action labels in `src/maintenance/presentation.ts`.
- Added selected Arabic maintenance record-form labels.
- Added `docs/EGYPTIAN_ARABIC_COMPLETION_CHECKLIST.md`.
- Built and installed a previous side-by-side QA APK successfully; it predates the latest partial Dashboard/Maintenance changes.

## Resolved architectural debt

- The transitional product-copy bridge and local bilingual maps were removed.
- Typed, namespaced resource modules now compose one exact-parity `en`/`ar-EG`
  dictionary.
- Canonical maintenance component/action IDs resolve through localized technical
  presentation helpers.
- The pure translation and formatting core remains independent of React Native
  and SecureStore so domain tests run under Node.

## Migrated surface

The full inventory covered the app shell, shared UI, and every screen, including:

- `App.tsx`, `src/navigation/RootNavigator.tsx`
- `src/components/ui/*`, `MaintenanceActionMenu.tsx`, `MaintenanceActionRow.tsx`, `MaintenanceHistoryOnboarding.tsx`, `MaintenanceRecordForm.tsx`, `ScooterSelectionFields.tsx`, `ServiceHistoryWizard.tsx`
- All files under `src/screens/`, especially DocumentsVault, Inventory, GasLog, ServiceLogs, Insights, TechSpecs, VehicleVitals, VehicleSettings, PreRideCheck, OilChangeDetails, and reminder/history screens
- `src/maintenance/presentation.ts`, `scheduler.ts`
- Validation/export/reminder helpers and notification services

The automated AST scanner now enforces this inventory. Useful manual audit commands remain:

```powershell
rg -n "<Text|Alert\.alert|accessibilityLabel|placeholder=" App.tsx src -g "*.tsx" -g "*.ts"
rg -n "toLocale(DateString|String)|toLocaleString" src -g "*.ts" -g "*.tsx"
```

## Content policy

- Translate all app-owned copy into clear Egyptian Arabic.
- Use clear technical Arabic for safety/maintenance; avoid slang that reduces precision.
- Preserve SYM, model/variant names, VIN/ABS/CVT, part/engine codes, route IDs, schema keys, units when appropriate, user-entered data, citations, and filenames.
- Never silently machine-translate original manual guidance. Preserve English source text and show a localized notice that it is original manual text until a reviewed Arabic translation exists.
- Resolve maintenance labels from stable canonical IDs, never by mutating stored/generated English labels.

## Required phases 1–8

1. Produce/maintain a complete string inventory and classification.
2. Consolidate localization into typed namespaced `en` and `ar-EG` resources with identical keys; remove transitional maps only after migration.
3. Translate every workflow, including alerts, placeholders, errors, empty/loading states, accessibility labels, and recovery paths.
4. Complete canonical technical terminology and record/action/status phrasing.
5. Implement the manual-source display/review policy without changing original source records.
6. Audit RTL: row order, start/end alignment, back/forward icons, tabs, modals, forms, mixed Arabic/Latin codes, and truncation. Do not mirror logos/vehicle imagery/nondirectional mechanical icons.
7. Centralize locale formatting for dates, EGP, km, litres, percentages, days/months, plurals, due/overdue, and combined schedules. Retain Western digits consistently unless the user changes that decision.
8. Add enforcement tests: exact key parity, no empty translations, interpolation/plural tests, persistence/fallback/notification/formatting tests, and a hard-coded user-visible English scanner with an explicit allowlist.

## Validation and completion gates

Run:

```powershell
npm run typecheck
npm run lint
npm test
git diff --check
```

Do not say phases 1–8 are complete unless:

- English and Arabic key sets match exactly and all Arabic values are nonempty.
- The hard-coded UI scanner passes outside the approved allowlist.
- No unintended English remains in normal Arabic workflows.
- Manual-source English is explicitly labelled, not presented as translated.
- Locale formatting and RTL code paths are covered by tests.
- Typecheck, lint, and the full test suite pass.

## Current known validation history

- `npm run typecheck` passes.
- `npm run lint` passes with no warnings.
- `npm test` passes all 239 tests, including localization parity, interpolation,
  plurals, persistence, notifications, formatting, RTL icon direction, and the
  hard-coded English scanner.
- `git diff --check` passes.
