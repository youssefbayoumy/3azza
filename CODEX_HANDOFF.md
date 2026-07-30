# Codex handoff: 3azza

Snapshot: 2026-07-19. Workspace: `C:\Users\youss\Desktop\Vibe coding\3azza2`; application repository: `C:\Users\youss\Desktop\Vibe coding\3azza2\app`.

## 1. Project overview

### Purpose

3azza is an offline-first scooter maintenance app for individual scooter and delivery-bike owners. Its real, implemented product is a private manual log for odometer readings, fuel, service, maintenance schedules, pre-ride checks, documents, parts, and reminders. It has no scooter/sensor connection, account server, cloud sync, or remote API.

### Current architecture

- `App.tsx` loads fonts, initializes SQLite, hydrates the Zustand store, and schedules local reminders.
- `RootNavigator.tsx` gates onboarding, local app-lock authentication, and vehicle setup before the main UI.
- `MainNavigator.tsx` and `TabNavigator.tsx` compose native-stack and custom bottom-tab navigation.
- Zustand persists onboarding/auth/setup/preferences through `expo-secure-store`.
- `expo-sqlite` stores vehicle-scoped domain records. The dirty working tree includes multi-vehicle migrations and models.
- Service modules own database, app-lock, export/backup, and notification behavior.
- Pure date, maintenance, backup-format, and CSV helpers live in `src/utils` and have Node tests.

### Tech stack

- Expo SDK 55 (`~55.0.27`), React Native 0.83.6, React 19.2, TypeScript 5.9 in strict mode.
- React Navigation 7, Zustand 5, Expo SQLite/SecureStore/Notifications/Local Authentication/File System/Image Picker.
- NativeWind 4 + Tailwind 3, React Native SVG, Reanimated, Pager View.
- Space Grotesk, Manrope, and Plus Jakarta Sans fonts.
- Scripts: `npm start`, `npm run android`, `npm run ios`, `npm run web`, `npm run typecheck`, `npm test`.

### Important design decisions

- Position the app honestly as a manual, local maintenance tracker. Do not simulate a connection state or claim live telemetry.
- A PIN is a local app lock, not account authentication or database/file encryption. Copy and flows must reflect that.
- Preserve the dark navy/silver/electric-blue industrial visual identity, but improve it incrementally with accessible shared primitives rather than a broad rewrite.
- Missing maintenance history must be represented as **Not set/Unknown**, not Overdue.
- Preserve the multi-vehicle data model and existing destructive-action confirmations.

## 2. Current state

### Completed before this handoff

The current dirty application tree contains onboarding, PIN/biometric app lock, vehicle setup, dashboard, multi-vehicle data, maintenance intervals, service history, fuel logs, pre-ride checks, manual vehicle vitals, documents, parts inventory, insights, local reminders, exports, and JSON backup/restore.

This interrupted product-quality phase completed the following read-only work:

- Reset and walked the Android app from fresh onboarding through auth screens.
- Audited product/UX, onboarding, architecture/reliability, accessibility, responsive layout, copy, trust, and safety.
- Captured baseline screenshots in `C:\Users\youss\.codex\visualizations\2026\07\19\019f77fc-c1f4-77f2-bc5d-770975fd9c5d\ux-audit\before`.
- Diagnosed the current Android runtime blocker described below.
- Re-ran verification on 2026-07-19: `npm run typecheck` passes; `npm test` passes all 9 tests in 4 suites.

### Files modified

The audit did **not** modify application source. This handoff adds only `CODEX_HANDOFF.md`.

The nested app repository already had the following uncommitted user work; preserve it and do not reset/revert it:

Modified: `App.tsx`, `app.json`, `assets/icon.png`, `build_out.txt`, `package-lock.json`, `package.json`, `src/navigation/RootNavigator.tsx`, `src/navigation/TabNavigator.tsx`, `src/screens/DashboardScreen.tsx`, `DocumentsVaultScreen.tsx`, `GasLogScreen.tsx`, `InsightsScreen.tsx`, `MaintenanceScheduleScreen.tsx`, `OilChangeDetailsScreen.tsx`, `PreRideCheckScreen.tsx`, `ServiceLogsScreen.tsx`, `TechSpecsScreen.tsx`, `VehicleSettingsScreen.tsx`, `VehicleVitalsScreen.tsx`, `src/screens/auth/LoginScreen.tsx`, `RegisterScreen.tsx`, `src/services/database.ts`, `src/store/useAppStore.ts`, and `src/types/database.types.ts`.

Untracked: `src/navigation/MainNavigator.tsx`, `src/navigation/types.ts`, `src/services/auth.ts`, `src/services/export.ts`, `src/services/notifications.ts`, and all files currently under `src/utils/`.

### Tests and documentation

- Existing tests: `backupFormat.test.ts`, `dates.test.ts`, `exportFormat.test.ts`, and `maintenance.test.ts`.
- Result: 9/9 tests pass; TypeScript passes with no errors.
- Tests cover only pure utilities. There are no component, integration, E2E, accessibility, or CI tests and no lint script/config.
- `README.md` was not changed during this phase.
- The requested `PRODUCT_UX_AUDIT.md` has **not** yet been created. This handoff is the only new documentation.

### Android/emulator state

- AVD: `Medium_Phone_API_35`; serial normally `emulator-5554`.
- Package: `com.youssefbayoumy.x3azza`.
- Expo Go was installed and then removed because it repeatedly failed to download its remote runtime from Expo's CDN.
- The installed/debug APK is stale (last observed timestamp 2026-03-26, about 206.7 MB) and lacks the native `RNCDatePicker` module now required by `@react-native-community/datetimepicker`.
- Metro successfully built the current JS bundle when started with `npx expo start --lan --clear`, but the stale binary then crashed with `TurboModuleRegistry.getEnforcing(...): 'RNCDatePicker' could not be found`.
- `npx expo run:android --no-bundler --device Medium_Phone_API_35` began compiling the date-picker module but was interrupted before completion. The APK was not replaced. Metro was no longer listening at the last check.

## 3. Outstanding work

### Ordered TODO

1. **Restore a reproducible current Android build.** Finish a native debug build containing `RNCDatePicker`, install it, reset app data, and verify current source rather than the embedded stale bundle.
2. **Fix app-lock/security truth and bypasses.** Use `hasRegisteredPin()` to distinguish Create PIN from Unlock; never expose unauthenticated PIN replacement; require current PIN/biometric to change it; make `isAuthenticated` transient or add auto-lock. Remove all encryption claims unless actual database and file encryption is implemented.
3. **Remove unsafe, universal workshop claims.** Hide or redesign hardcoded “CERTIFIED” torque/pressure specs and fixed 10W-40 guidance until values are sourced by make/model/year or explicitly user-entered with a source. Mark default intervals as editable templates.
4. **Unify maintenance correctness.** Add one transactional service-completion operation and transactional delete/baseline recomputation. Use one status selector across Home, Maintenance, Insights, and notifications.
5. **Repair first-run maintenance setup.** Do not mark every service overdue from baseline zero. Add an optional baseline step, persist skip/completion, make date mode reachable, and show unknown items as Not set.
6. **Make the pre-ride check genuinely daily.** Store dated runs or reset by local day; rename the CTA to “Save pre-ride check”; remove “engine initialized/live diagnostics” copy; record incomplete overrides clearly.
7. **Correct backup behavior.** Include document image files and rewrite restored URIs, or clearly state that backups are records-only and photos/settings are excluded. Warn that JSON/CSV exports are unencrypted.
8. **Correct fuel calculations.** Add fill date/full-tank semantics, calculate between consecutive full fills without counting the baseline fill, collect tank capacity, and hide efficiency/range until enough valid data exists. Remove the fabricated 50 L assumption.
9. **Replace misleading product copy.** Remove “telemetry,” “system,” “scan,” “sync,” “connection,” and “live diagnostics” language. Explain that no scooter connection is required and readings are entered manually.
10. **Finish multi-vehicle UX.** Collect nickname/core fields, run setup for new vehicles, support editing/deleting, and display the active scooter on every data-entry screen.
11. **Fix information architecture.** Rename the Vitals tab to Maintenance; move pre-ride/service-history detail routes into the stack above tabs; use Home/Maintenance/Documents/Parts labels and predictable back/tab behavior.
12. **Repair insights, reminders, and validation.** Add service cost/currency; include expired documents and correct attention routes; resync reminders after mutations/vehicle switches and handle notification taps; reject invalid/negative/rollback data with inline errors.
13. **Add failure states and database resilience.** Provide startup recovery, loading/empty/error/retry/success states, `finally` cleanup, and transactional migrations. Stop silently treating load errors as empty data.
14. **Build an accessible/responsive UI layer.** Add safe areas, keyboard-aware scrolling, 44–48 dp targets, labels/roles/states/headings, 12sp minimum secondary text, corrected contrast, modal back/focus behavior, and small-screen/tablet fallbacks.
15. **Remove or implement inert controls.** Inventory search/notification buttons, decorative vault menus, Garage Mode, and long-press-only deletion must not remain misleading or undiscoverable. Remove the remote Google avatar.
16. **Add quality gates.** Component/integration/E2E/accessibility tests, Android smoke coverage, linting, and CI. Verify release signing does not use a debug key.

### Confirmed bugs

- Current-source Android crash: missing native `RNCDatePicker` in stale APK.
- Register can overwrite an existing PIN without prior authentication; biometric unlock can be offered without a registered PIN; authenticated state persists across restarts.
- Deleting the latest service log can leave stale interval state on Home/Insights/notifications.
- A realistic first odometer immediately marks default services overdue.
- Daily pre-ride booleans persist indefinitely.
- Backup restores document URI strings but not their image files.
- Fuel efficiency counts the baseline fill and range assumes a 50 L tank.
- Expired documents can be omitted from attention logic; document attention links to Maintenance.
- Dashboard contains invalid NativeWind class `h-40.01`.

### Technical debt

- Service completion, deletion, and schema migration operations are non-transactional and maintenance status is duplicated.
- Some read paths seed default intervals and therefore perform writes; Insights may trigger dozens of `INSERT OR IGNORE` operations.
- Unbounded lists/full-table reads and missing indexes will degrade with larger datasets.
- 101 `TouchableOpacity` and 24 `TextInput` usages have almost no explicit accessibility metadata; shared primitives are missing.
- Eight modals have inconsistent scrims/keyboard behavior and only one has `onRequestClose`.
- There are 119 text declarations at 8–11px and no safe-area usage despite the dependency being installed.
- Native dependency and generated APK state have drifted from JavaScript dependencies.

### Known limitations

- Android is the only platform walked; iOS and web were not product-tested.
- The app is dark-only in practice, although `app.json` currently declares a light UI/white splash.
- There is no real scooter connection, network API, user account, cloud backup, or cloud sync. Connection/API failure test cases from the original brief are therefore inapplicable; test no vehicle, offline/no internet, local database/storage, permissions, and missing-native-module failures instead.
- Some baseline screenshots came from the older embedded APK before live-source bundling was fixed. The visible copy matched current source, but behavior must be reverified after the native rebuild.
- ADB secure-field input against the stale bundle was unreliable and must not be recorded as an app bug without reproduction on the rebuilt APK.

## 4. Branch and repository state

- Root repository: branch `main`, commit `77bb5ce` (`Initial commit: 3azza scooter maintenance app`), status `M app` because the nested repository is dirty.
- App repository: branch `main`, tracking `origin/main`, commit `021e742` (`Initial commit: 3azza scooter maintenance app`), with the pre-existing dirty state listed above.
- No audit commit or feature branch exists. Do not create/reset/rebase a branch without checking the user's intent.

Inspect these first:

1. `CODEX_HANDOFF.md`, then `package.json` and `app.json`.
2. `App.tsx`, `src/navigation/RootNavigator.tsx`, `MainNavigator.tsx`, and `TabNavigator.tsx`.
3. `src/store/useAppStore.ts`, `src/services/auth.ts`, and `src/services/database.ts`.
4. `RegisterScreen.tsx`, `LoginScreen.tsx`, `MaintenanceScheduleScreen.tsx`, `ServiceLogsScreen.tsx`, `TechSpecsScreen.tsx`, and `PreRideCheckScreen.tsx`.
5. `src/services/export.ts`, `notifications.ts`, and `src/utils/*` with their tests.
6. Original product-quality brief: `C:\Users\youss\.codex\attachments\c221f9e5-7576-4ca6-b6be-d7f7bbeb1cc2\pasted-text.txt`.

## 5. Coding standards

- Use strict TypeScript, functional components, and hooks.
- Follow the surrounding file's indentation and organization; the intended convention is two spaces, but existing files are inconsistent.
- Continue using NativeWind classes and the established tokens in `tailwind.config.js`; avoid one-off color systems.
- Keep database/auth/export/notification logic in services, database shapes in `database.types.ts`, navigation params in `navigation/types.ts`, and pure tested logic in `src/utils`.
- Prefer typed React Navigation routes and vehicle-scoped database operations.
- Use `apply_patch` for edits and keep changes focused. The dirty files belong to the user.
- Do **not** replace the offline-first architecture, remove multi-vehicle support, rewrite the application wholesale, claim encryption/certification/telemetry, or remove confirmation dialogs for destructive actions.
- Do not hand-edit generated Android output to mask dependency drift; rebuild the native project from the Expo configuration and dependencies.

## 6. Context that would otherwise be lost

### Why the direction changed

The strongest product is a dependable manual tracker. Source and runtime inspection found no hardware integration or backend, so adding fake “disconnected/connecting” states would deepen the trust problem. The correct product-quality move is honest copy and reliable local workflows.

Security/specification issues were ranked P0 because they can create false confidence: the PIN does not encrypt SQLite/photos/exports, and universal torque/oil/pressure instructions may be unsafe for a user's scooter. Maintenance consistency is also P0 because conflicting due states undermine the app's core purpose.

Accessibility work should be incremental: introduce `ScreenScaffold`, `TopAppBar`, `IconButton/FAB`, `FormField`, `AccessibleDialog/FormBottomSheet`, `ChoiceGroup`, `StatusBadge`, responsive grids, and loading/error states, then migrate screens. This preserves the distinctive industrial look while fixing semantics, contrast, safe areas, touch targets, keyboard coverage, and layout fragility.

### Failed approaches and trade-offs

- Expo Go could not download its runtime from Expo's CDN and was removed. Do not spend another session retrying Expo Go unless connectivity has materially changed.
- Metro initially listened only on localhost and the APK silently fell back to an embedded bundle. `npx expo start --lan --clear` successfully exposed the current bundle on `0.0.0.0:8081`.
- `expo run:android --device emulator-5554` failed because Expo expected a device/AVD name. Use `--device Medium_Phone_API_35`.
- The subsequent native build was interrupted before producing a new APK. Do not assume the presence of date-picker Gradle tasks means the build completed; verify the APK timestamp and installed runtime.
- No source fixes were applied because the user requested this handoff as the context limit approached.

### Assumptions

- Every existing modified/untracked app file is user-owned work and must be preserved.
- The emulator is disposable test state; app data was intentionally reset for the fresh-user audit.
- Default service intervals may remain as editable suggestions, but must never be presented as vehicle-certified facts.
- “Logout/login” in the test matrix means local lock/unlock; there is no account session.

## 7. Next objective

### Single highest-priority objective

Complete a **P0 trust-and-safety pass on a reproducible current Android build**.

Concrete steps:

1. Confirm the AVD is running, start Metro with `npx expo start --lan --clear`, and finish `npx expo run:android --no-bundler --device Medium_Phone_API_35`.
2. Verify a newly timestamped APK is installed, clear `com.youssefbayoumy.x3azza`, launch it, and confirm the `RNCDatePicker` crash is gone and the app is loading current JS.
3. Fix first-install/auth routing with `hasRegisteredPin()`, block unauthenticated PIN replacement, and stop persisting unlocked state across cold starts.
4. Replace false encryption/telemetry/system copy with plain local-app-lock/manual-tracker language.
5. Remove or gate certified/hardcoded workshop specifications and universal oil advice.
6. Add focused tests for auth routing/state and any extracted copy/status logic; run typecheck and the full unit suite.
7. Reset the app and smoke-test onboarding interruption/completion, Create PIN, invalid PIN, unlock, lock/restart, biometrics unavailable/denied, setup, back/keyboard, and a small-screen layout.
8. Create `PRODUCT_UX_AUDIT.md`, copy the prioritized findings from this handoff, and mark only actually verified fixes as complete. Then continue with transactional maintenance correctness.

## Pasteable prompt for a new Codex chat

```text
Continue the interrupted product-quality pass for the 3azza Expo/React Native app at:
C:\Users\youss\Desktop\Vibe coding\3azza2\app

First read C:\Users\youss\Desktop\Vibe coding\3azza2\app\CODEX_HANDOFF.md completely and treat it as the source of truth. Also read the original brief at C:\Users\youss\.codex\attachments\c221f9e5-7576-4ca6-b6be-d7f7bbeb1cc2\pasted-text.txt. Do not repeat the completed audit and do not revert, reset, or overwrite the large pre-existing dirty working tree; those changes belong to me.

Your immediate objective is the handoff's P0 trust-and-safety pass on a reproducible current Android build. The AVD is Medium_Phone_API_35 and the package is com.youssefbayoumy.x3azza. The installed APK is stale and crashes against current JS because it lacks RNCDatePicker. Start Metro with `npx expo start --lan --clear`, finish a native rebuild with `npx expo run:android --no-bundler --device Medium_Phone_API_35`, verify the new APK/current bundle, and then implement the auth/app-lock fixes, truthful security/product copy, and removal/gating of unsafe certified specs described in the handoff.

Preserve the offline-first, multi-vehicle architecture and industrial visual identity. Do not invent scooter connectivity, cloud accounts, encryption, or universal certified maintenance data. Use focused incremental components and tests. Run `npm run typecheck`, `npm test`, and an Android fresh-install smoke test. Create/update PRODUCT_UX_AUDIT.md with the full prioritized audit and mark only verified work complete. Keep working through safe in-scope blockers rather than asking me to repeat context.
```
