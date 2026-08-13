# 3azza Product & UX Audit

Snapshot: 2026-07-19  
Platform audited: Android (`Medium_Phone_API_35`)  
Package: `com.youssefbayoumy.x3azza`

## Product summary

3azza is an offline-first, manual scooter-maintenance tracker for individual scooter and delivery-bike owners, including nontechnical users. It stores vehicle-scoped odometer, maintenance, fuel, service-history, pre-ride, document, parts, and reminder records locally.

3azza does **not** currently provide scooter or sensor connectivity, live telemetry, user accounts, cloud sync, remote APIs, database or file encryption, or model-certified workshop data. The PIN is a local app lock. The navy, silver, and electric-blue industrial identity is distinctive and should be preserved while correctness and accessibility improve incrementally.

At the original audit snapshot, the largest product risks were false confidence and conflicting state: an outdated Android binary could not run the current JavaScript, unlocked state survived restarts, unauthenticated PIN replacement was possible, ordinary files were described as encrypted, universal workshop values were presented as certified, and missing service history became overdue.

## Intended user and core journeys

The primary user is a scooter or delivery-bike owner who wants a dependable private log without technical setup or a network connection.

1. Fresh launch: onboarding -> create local app-lock PIN -> vehicle setup -> Home.
2. Returning launch: unlock local app lock -> active vehicle -> Home.
3. Daily use: confirm odometer and save a manual pre-ride check.
4. Maintenance: review editable intervals -> record work -> inspect history.
5. Record keeping: add fuel, parts, document photos, and manual vehicle readings.
6. Multi-vehicle use: create, configure, switch, edit, and delete separate local profiles.
7. Data safety: configure local reminders, export records, restore a backup, and lock the app.

## Scope and non-goals

- Preserve offline-first SQLite storage, multi-vehicle scoping, and destructive-action confirmations.
- Preserve the established industrial identity; use focused shared primitives instead of a broad rewrite.
- Do not invent connectivity, telemetry, accounts, cloud behavior, encryption, or universal certified specifications.
- "Login/logout" in the original matrix means local lock/unlock.
- Network, remote API, and scooter-connection failures are not applicable. Test offline launch, local storage, permissions, migrations, missing native modules, and no-active-vehicle states instead.
- Android is the only platform product-tested so far. iOS, web, tablet, and release readiness remain unverified.

## Status semantics

| Status | Meaning |
|---|---|
| Open | The problem remains or acceptance criteria have not been implemented. |
| In progress | Source work is underway and acceptance criteria are incomplete. |
| Implemented — verification pending | Source work appears complete, but required automated or runtime checks are incomplete. |
| Verified complete | Acceptance criteria passed with dated command/device evidence. |
| Deferred | Intentionally postponed with the reason recorded; not fixed. |
| Not applicable | The scenario does not exist in the implemented product. |

A source edit alone is never marked verified. Mixed findings remain open or are split into narrower rows.

## Priority summary

| Priority | Findings |
|---|---|
| P0 | Native parity; app-lock integrity; truthful security/product positioning; unsafe specifications; transactional maintenance consistency; unknown first-run baselines. |
| P1 | Daily pre-ride behavior; backup integrity/disclosure; fuel correctness; multi-vehicle completion; navigation; insights/reminders/validation; accessibility/responsiveness; startup/database failure states; quality gates. |
| P2 | Shared visual primitives; storage scaling; inert controls; platform/theme parity. |

## Critical blockers

| ID | Evidence and impact | Recommended solution / acceptance criteria | Likely files | Status |
|---|---|---|---|---|
| CB-01 | The prior installed APK lacked `RNCDatePicker`; current JS crashed with `TurboModuleRegistry.getEnforcing(...): 'RNCDatePicker' could not be found`. A cached bundle could also silently hide current source when Metro stopped. | Build/install through Expo, keep clean LAN Metro alive, verify the served bundle contains current source, clear/reinstall, open the native date picker, and confirm no native-module/fatal error. | `package.json`, `app.json`, generated `android/`, runbook | **Verified complete** — true uninstall/rebuild installed the linked date-picker module; the current live bundle loaded, the Android calendar opened, and the clean final scan found no native-module/app fatal |
| CB-02 | Auth always opened Login; Login exposed Register; unrestricted `savePin()` overwrote an existing PIN and cleared lockout; biometrics could unlock without a PIN; `isAuthenticated` was persisted. | Fail-closed checking/create/unlock gate; register only the safe auth route; guarded PIN creation; current-PIN requirement for changes; biometric PIN prerequisite; exact PIN validation; transient unlocked session and forced-locked legacy hydration. Verify create, malformed/wrong PIN, lockout, unlock, cold restart, unavailable/denied/cancelled biometrics, and replacement attempt. | `RootNavigator.tsx`, `AuthNavigator.tsx`, auth screens/service, store, app-lock utility/tests | Implemented — verification pending (PIN creation/validation, transient unlock, cold relock, unavailable biometrics, five-attempt lockout, locked-state blocking, and expiry recovery are verified; enrolled-hardware biometric denied/cancelled/success remain unverified) |
| CB-03 | UI claimed encryption, secure assets, telemetry, systems, scans, sync, and live diagnostics although data is ordinary SQLite/files/UTF-8 exports and readings are manual. | Present a manual local tracker. State that PIN is an app lock, photos/exports are unencrypted, no connection is required, and readings are entered by the user. Verify all fresh-user and settings copy on rebuilt current JS. | Onboarding, auth, setup, Dashboard, Fuel, Documents, Pre-Ride, Readings, Settings, notifications, `app.json`, README | **Verified complete** — current-bundle string probe plus fresh-install Android walk showed manual/offline onboarding, local app-lock disclosure, manual readings, recorded-only costs, on-device unencrypted documents, and records-only backup exclusions; no account/cloud/connection/telemetry claim remained |
| CB-04 | `TechSpecsScreen` exposed unsourced certified torque/tool/pressure values, including 32 PSI; Oil details exposed 10W-40 and a universal procedure. No make/model/year/source exists. | Remove all unsourced numbers/instructions. Show a source-required unavailable state. Keep oil history but direct users to the exact manual. Label default intervals as editable templates. | Tech Specs, Oil details, Maintenance, history wizard | **Verified complete** — current Android showed the source gate and no certified badge or unsourced numeric torque, pressure, or oil-grade/capacity specification; Oil details removed 10W-40 and the universal procedure |
| CB-05a | Service completion updated interval and inserted history separately. Deletion removed only the log. Home, planner, oil detail, and insights could derive different baselines. | Use vehicle-scoped transactional completion and delete/recompute operations plus one status selector. Verify completion and latest-log deletion across the consuming screens. | `database.ts`, maintenance transaction/selector utilities, maintenance screens, tests | **Verified complete** — 7 SQLite transaction/rollback tests pass; rebuilt Android completion at 45,000 km, odometer change to 46,000 km, and only-log deletion stayed consistent in Home, Service Logs, Maintenance, and Oil details; the earlier two-log rollback also matched Insights |
| CB-05b | Reminder schedules could become stale after service, odometer, vehicle, interval, or restore mutations. | Reconcile maintenance reminders after every relevant commit and verify permission-enabled scheduled output before and after mutations. | notifications, mutation flows, tests | Implemented — verification pending (resync calls are wired; scheduled-output runtime check pending) |
| CB-06a | Seeded interval baseline `0` made a realistic first odometer immediately overdue across Home/Insights/notifications. | Treat legacy zero without history as unknown and show `Not set`; do not schedule a due warning. | maintenance utility, planner, oil detail, Dashboard, Insights, notifications, tests | **Verified complete** — selector tests and the true fresh 45,000 km first-vehicle setup showed no Home warning; planner and oil detail showed `Not set` |
| CB-06b | The first-history wizard skip is session-scoped, the date path is not clearly reachable, and baseline knowledge is not modeled explicitly in schema. | Persist per-vehicle completion/skip and an explicit known/unknown baseline; make optional date mode reachable and validated. | schema/types, history wizard and duplicate setup screen | Open |

## High-impact usability improvements

| ID | Evidence and impact | Recommended solution / acceptance criteria | Likely files | Status |
|---|---|---|---|---|
| UX-01 | Pre-ride used one indefinitely persistent checkbox row, wrote every toggle immediately, and claimed live diagnostics/engine initialization. | Treat checks as a draft, save atomically, reset draft by local calendar day (or store dated runs), clearly confirm incomplete saves, and use manual-check language. Verify same-day revisit, next-day reset, restart, and vehicle switch. | Pre-Ride, database/types, date utility/tests | Implemented — verification pending (next-day and vehicle-switch runtime checks pending) |
| UX-02a | JSON backup contains database rows and document URI strings, not photo bytes; preferences and app-lock PIN are excluded; JSON/CSV are unencrypted. Prior copy said settings/vault data were restored. | Short-term: disclose records-only scope and exclusions before export/restore and warn that files are unencrypted. | Settings, Documents, notifications, export service | Implemented — verification pending |
| UX-02b | Restoring document URI strings cannot restore missing image files. | Create an archive containing images and rewrite restored URIs, or keep the records-only product limitation explicit. Add missing-file and round-trip tests. | export/database services, backup format, Documents | Deferred — disclosure is the safe short-term behavior |
| UX-03a | Efficiency counted the baseline fill and range assumed a fabricated 50 L tank. | Hide efficiency/range until the data model can support valid calculations. | Fuel Log | **Verified complete** — fresh Android showed no efficiency/range number and explicitly kept both hidden until accurate full-tank/capacity data exists |
| UX-03b | Fuel has no fill date/full-tank semantics or tank capacity. | Add full-tank fills, dates, optional capacity, and a tested calculation between consecutive full fills only. | schema/types, Fuel, vehicle profile, pure fuel utility/tests | Open |
| UX-04 | A new vehicle collects only a name, starts at zero, and lacks edit/delete UX despite database support. Entry screens often omit active vehicle context. | Run setup for each new vehicle; collect useful core fields; add edit/delete confirmation; show an active-vehicle chip on entry screens; verify isolation and reminder refresh. | Settings/setup, database/types, navigation, entry screens | Open |
| UX-05 | `Vitals` was actually Maintenance; `Vault`/`Inventory` were jargon; Pre-Ride and Service Logs are hidden tab routes with unpredictable back/tab behavior. | Use Home/Maintenance/Documents/Parts labels and move detail flows to the stack above tabs. | tab/main navigation and route types | In progress — visible labels are device-verified; route topology remains open |
| UX-06 | Service cost is always null while Insights presents spend in EGP. Expired documents were omitted and combined attention routed only to Maintenance. | Collect cost/currency; include expired documents; separate service/document actions with correct routes. Until cost capture exists, label totals as recorded-only. | Service Logs, Insights, dates, schema | In progress — expired-document counts and recorded-only cost disclosure implemented; cost capture and split routing remain open |

## Visual and consistency improvements

| ID | Evidence and impact | Recommended solution / acceptance criteria | Likely files | Status |
|---|---|---|---|---|
| VIS-01 | Repeated app bars, icon buttons, form fields, dialogs, badges, and loading/empty states create inconsistent behavior. | Incrementally add `ScreenScaffold`, `TopAppBar`, `IconButton/FAB`, `FormField`, accessible dialogs/sheets, `ChoiceGroup`, and `StatusBadge`. | new shared components, then screens | Complete — shared primitives and production-screen migration verified 2026-07-25 |
| VIS-02 | Dashboard used invalid NativeWind `h-40.01`; modal scrims and spacing differ; a dark app declares light UI/white splash. Dense uppercase and tiny labels reduce legibility. | Fix invalid classes; align chrome with shared primitives; match Expo theme/splash to the real dark identity; reserve uppercase for short accents. | Dashboard, screens, Tailwind, `app.json` | Complete — dark native chrome and >=12sp essential text verified 2026-07-25 |

## Accessibility improvements

| ID | Evidence and impact | Recommended solution / acceptance criteria | Likely files | Status |
|---|---|---|---|---|
| A11Y-01 | Baseline contained 101 touchables and 24 inputs with almost no roles/labels/state. There are many 8–11 px declarations and opacity-reduced text. | Add roles, labels, hints, selected/checked/disabled state, headings, 44–48 dp targets, >=12sp secondary text, non-color status, and verified contrast. Test TalkBack/large font. | shared primitives and every screen | Complete — semantics, targets, node-tree order, and 1.3× text verified 2026-07-25 |
| A11Y-02 | Safe-area dependency is unused; fixed top padding risks cutouts; modals lack consistent Android back/focus/keyboard behavior; responsive fallbacks are sparse. | Safe-area scaffold, keyboard-aware forms, responsive layouts, accessible dialogs with `onRequestClose` and focus return. Test small phone/tablet/long text. | root/layout, shared primitives, modal/form screens | Complete — safe areas, keyboard, Back, focus, compact, and tablet layouts verified 2026-07-25 |

## Reliability and edge cases

| ID | Evidence and impact | Recommended solution / acceptance criteria | Likely files | Status |
|---|---|---|---|---|
| REL-01 | Reminders previously reconciled only at startup/toggle; notification route payloads have no response listener. | Resync after relevant commits/restore/switch, handle notification taps through typed navigation, cancel stale schedules, and test permission denial. | notifications, App, navigation, mutation flows | In progress — resync is wired after service, interval, odometer, vehicle, and restore changes; notification-tap handling and permission/output verification remain open |
| REL-02 | Negative fuel values, odometer rollback, free-text dates, interval bounds, and several async cleanup paths are weak. | Shared validators/database invariants with inline errors and `finally` cleanup. | forms, database migrations, validators/tests | In progress — fuel validation/cleanup and service/date/interval transaction-boundary validation implemented; odometer rollback, shared form validation, and remaining cleanup paths stay open |
| REL-03 | App startup logs database failure then proceeds; many loaders cannot distinguish error from empty data; migrations are not one transaction. A schema-version Fast Refresh produced one `NativeDatabase.execAsync` null-reference failure, while a cold relaunch recovered. | Startup recovery/retry, explicit loading/empty/error states, transactional migrations, rollback tests, and a repeatable migration/refresh check. | App, database, loaders, shared state components | Open |
| REL-04 | Some read paths seed defaults; Insights can trigger many writes; lists are unbounded and indexes are limited. | Make reads side-effect free, seed on create/migration, add indexes and bounded queries when warranted. | database and list screens | Complete — schema v11, indexes, bounded reads, and stable ordering verified 2026-07-25 |
| REL-05 | Baseline had 9 pure tests in 4 suites; no component/E2E/accessibility tests, lint, CI, or verified release signing. | Add auth/transaction/component/smoke coverage, lint/CI, and non-debug release signing before distribution. | package scripts, test setup, CI, Android Gradle | In progress — 21 tests in 6 suites now cover app-lock rules, SQLite transactions/rollback, dates, backup format, export formatting, and maintenance selectors; component/E2E/accessibility, lint/CI, and release signing remain open |

## Nice-to-have and deferred work

| ID | Finding | Recommendation | Status |
|---|---|---|---|
| NTH-01 | Inventory search/notification controls, decorative document menu, Garage Mode, and long-press-only deletion were inert or undiscoverable; Dashboard loaded a remote Google avatar. | Remove or implement inert controls; add discoverable delete menus while retaining confirmation; keep assets local. | In progress — Garage Mode control and remote avatar removed; other controls remain open |
| NTH-02 | iOS/web/tablet/theme parity was not tested. | Complete platform and theme QA only after Android correctness stabilizes. | Deferred |
| Deferred product scope | Accounts, cloud sync, scooter connectivity, sensor telemetry, and encryption are not present. | Keep out of this pass unless separately designed and implemented end-to-end. | Deferred by design |
| Deferred redesign research | The existing identity remains viable; correctness is the binding constraint. | Broad AI-led redesign is unnecessary until P0/P1 correctness and accessibility stabilize. | Deferred |

## Verification history

| Date | Check | Result and meaning |
|---|---|---|
| 2026-07-19 | `npx expo run:android --no-bundler --device Medium_Phone_API_35` | `BUILD SUCCESSFUL in 25s`; 366 tasks; date-picker native tasks linked; installed/opened package. |
| 2026-07-19 | True fresh install | `adb uninstall com.youssefbayoumy.x3azza` returned `Success`; the new package reported `firstInstallTime=lastUpdateTime=2026-07-19 06:32:32`, `versionName=1.0.0`, and `versionCode=1`. |
| 2026-07-19 | `npx expo start --lan --clear` and served bundle probe | Metro returned HTTP 200; the final 10,654,408-byte Android dev bundle contained `RNCDatePicker`, `Recorded Costs`, `Not set`, `ON SCHEDULE`, the corrected singular-attempt copy, and conditional tracked/custom delete disclosure. It did not contain the old overdue/delete claims, `Cost Intel`, `CERTIFIED`, 32 PSI, or 10W-40. Metro was restarted once after its one-hour command lifetime expired. |
| 2026-07-19 | Current-bundle launch | Android logged `Running "main"`; current onboarding visible; no `RNCDatePicker`, TurboModule, ReactNativeJS fatal, or Android fatal error. |
| 2026-07-19 | Native date picker | Documents expiry control opened the Android calendar dialog; process remained alive; no module/fatal error. |
| 2026-07-19 | App-lock fresh-install smoke | Fresh state routed only to Create App Lock; empty PIN was rejected; PIN 2580 was created; correct PIN unlocked; force-stop/relaunch returned to App Locked; Create PIN was absent; the un-enrolled AVD showed PIN-only guidance. Five cumulative wrong attempts produced the five-minute lock, a valid four-digit PIN was blocked with the remaining-seconds countdown, and the correct PIN unlocked after expiry. |
| 2026-07-19 | First vehicle / maintenance smoke | True fresh setup with 45,000 km + 30 km/day reached Home with no false due banner; the wizard labeled intervals as templates; skip produced `NOT SET`, not `OVERDUE`; Oil details also showed `NOT SET`. |
| 2026-07-19 | Workshop-safety smoke | Vehicle Reference displayed `No verified specs saved` plus a source warning; no certified badge or numeric torque, pressure, or oil specification was shown. Oil details contained no 10W-40 or universal work procedure. |
| 2026-07-19 | Transactional maintenance smoke | On rebuilt Android, Oil completion at 45,000 km showed `ON SCHEDULE`/1,000 km remaining; updating to 46,000 km made Home show one due service; deleting the only linked log cleared the Home warning and returned Service Logs, Maintenance, and Oil details to empty/`NOT SET`. An earlier two-log latest-delete sequence also rolled back to 45,000 km in Maintenance/Oil and left one Insights service log. |
| 2026-07-19 | `npm run typecheck` | Passed after current trust/safety and transaction edits. |
| 2026-07-19 | `npm test` | 21/21 passed in 6 suites, including 7 SQLite transaction/rollback tests. |
| 2026-07-19 | Smoke-harness incident | A shell PIN tap was injected before the cleared dev bundle had produced a focused window while Metro was expiring; Android reported an input-dispatch ANR. `dumpsys activity lastanr` identified `Application does not have a focused window`. After restarting live Metro and waiting for `App Locked` before input, the clean run had no ANR/app/native-module/database fatal. |
| 2026-07-19 | Final Android runtime scan | Package PID 19826 remained alive on Home. The post-restart package log had 0 fatal/native-module/database matches and the global log had 0 package ANR matches. |
| Pending | iOS/web/TalkBack/large-font/tablet | Not performed; no readiness claim. |

Baseline screenshots are stored under:

`C:\Users\youss\.codex\visualizations\2026\07\19\019f77fc-c1f4-77f2-bc5d-770975fd9c5d\ux-audit\before`

## Required remaining Android smoke matrix

1. Onboarding interruption/resumption and full non-skip completion.
2. Biometrics denied, cancelled, and successful on enrolled hardware; unavailable is verified.
3. Background/resume policy beyond the verified cold-start relock.
4. Next-local-day pre-ride reset and multi-vehicle switch.
5. Permission-enabled reminder output before and after service, interval, odometer, vehicle, and restore changes.
6. Camera/gallery/notification denial and modal/back/keyboard behavior.
7. Small-screen, large-font, TalkBack, and long-text layouts.
8. Offline launch, database startup failure/retry, migration rollback, and restore with missing photos.

## Readiness assessment

The original snapshot was not ready for normal scooter owners. The current trust-and-safety pass materially improves Android first-run honesty, removes the most dangerous generic guidance, and makes linked maintenance mutations transactional. Normal-user release readiness still depends on the highest-risk P1 validation, backup, accessibility, reminder-output, and failure-state work. iOS/web and production signing remain unverified.
