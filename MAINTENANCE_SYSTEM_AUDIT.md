# 3azza maintenance system audit

Date: 2026-08-01  
Scope: the current `app` implementation, New Symphony ST 200 profile and extraction, SQLite migrations, scheduling, onboarding, maintenance/history screens, notifications, tests, Android build, prior device evidence, and supplied screenshots.  
Audit rule: no production code was changed during this phase.

Lifecycle note: this document intentionally preserves the Phase 1
pre-implementation baseline. Statements below about the "current" system refer
to that audited baseline, not the completed revision. Current implementation and
release status are recorded in `MAINTENANCE_VALIDATION_PLAN.md` and
`ANDROID_DEVICE_QA_REPORT.md`.

## Executive conclusion

The manual extraction is not the main production problem. The current v2 profile preserves action-specific rules and source evidence reasonably well, but the app maps one vehicle-wide history flag into two unsafe extremes:

- `service_history_setup_completed = 0` is treated as proof that no maintenance was ever performed, so an owner joining at 18,080 km receives 35 false overdue items, including 23 break-in tasks.
- `service_history_setup_completed = 1` makes every missing exact rule record legacy/unknown, so the same owner receives roughly 35 separate "History needed" cards.

The current exact profile also contradicts the project owner's final oil decision: recurring engine-oil replacement is still suppressed as an unresolved 1,000/3,000 km conflict. The required 1,000 km recurring replacement countdown is absent.

The product is therefore not production-ready even though the baseline automated gate passes. The green suite validates several obsolete behaviors that must be replaced.

## Evidence inspected

- `maintenance-data/new-symphony-st-200.profile.json` and the universal catalogue.
- `work/extractions/new_symphony_st.json` and `work/validations/new_symphony_st_validation.json`.
- Visual review of owner-manual PDF pages 15, 26, and 29.
- Scheduler, profile validation, migration classification, database schema/migrations, history transactions, notifications, onboarding, dashboard, maintenance, oil, and service-history screens.
- Prior device screenshots under `tmp/device-qa-maintenance-v2/`.
- Android Gradle configuration, installed-package state, and the previous device QA report.
- Baseline `npm run check`: PASS, 135 tests passed and 0 failed.

## Root causes

### Why many tasks say "History needed"

`MaintenanceProjectionInput` can express per-rule knowledge, but no production screen supplies it. Home, Maintenance, Oil, and notifications derive a single default from `service_history_setup_completed`.

When that flag is 1, missing exact action records become `legacy_needs_confirmation`. `unknownProjection()` then returns one generic unknown card for every scheduled rule. Migration version 14 intentionally quarantines legacy rows without profile/rule/action identity, while an older migration marks history setup complete when any old log exists. That combination guarantees a wall of unknown cards for many existing owners.

Unknown replacement history, unknown inspection history, condition-based wear, retired initial milestones, and no-fixed-interval guidance are all collapsed into the same status and wording.

### Why 300 km work appears at 18,080 km

`ScheduleDefinition` has an initial due point but no actionable window or after-window behavior. A one-time rule disappears only after an exact completion event. Otherwise it is calculated from zero indefinitely and remains overdue at any mileage. A current test explicitly expects the initial oil task to remain overdue at 3,000 km.

The profile has 23 applicable 300 km initial rules. At 18,080 km with no exact events:

- the fresh-setup branch projects 37 cards, 35 overdue, including all 23 initial rules;
- the migrated-history branch projects 37 cards, 35 unknown, including all 23 initial rules.

Several recurring rules are also suppressed until an initial same-action rule is completed. Missing break-in history can therefore hide real current recurring work.

### Why planner recording forces the current mileage

The planner save path hardcodes today's date and the active vehicle's current odometer. Non-condition actions use a confirmation alert; condition-result tiles save immediately. There is no editable maintenance form in this flow.

The separate Service Logs form supports historical mileage and date, but it writes the legacy-shaped path and cannot create a scheduler-valid component/action event. The unused `ServiceHistoryWizard` records either mileage with today or date-only history, not both, and is no longer mounted.

### Historical mileage and dates

Storage validation correctly permits a maintenance mileage below the current odometer and rejects one above it. A maintenance record does not update the vehicle odometer. The generic history form rejects future dates, but the action-specific database API checks only date syntax and can accept a future date if called outside that UI.

There is no unified support for:

- an editable historical date and mileage in every flow;
- unknown mileage or unknown date with explicit confidence;
- service provider;
- record source;
- created/updated timestamps;
- record editing;
- service packages;
- duplicate detection;
- oil details.

### Initial and recurring work

The profile uses separate rule IDs for initial and recurring work, which is correct. Runtime behavior is incomplete because initial rules lack a retirement window and recurring rules can be blocked by missing initial history.

### Inspection and replacement

The v2 scheduler correctly requires matching rule, component, and action, and existing tests prove that inspection does not complete replacement. This is a valid foundation.

Gaps remain:

- the condition result `service_soon` is missing;
- some condition-only rules have no inbound inspection relationship and never project;
- fixed replacement and condition replacement for the same component do not define explicit resolution relationships;
- general service history cannot select precise actions;
- the normal UI derives awkward labels such as "Record inspect" from raw actions.

### Fixed changes and condition-based parts

The profile distinguishes them internally. The current UI does not. Every projected rule is rendered as the same large card. Brake pads, tires, and battery need condition-oriented presentation with no unsupported replacement countdown.

### Two semantic history systems

Both flows ultimately insert rows into `service_logs`, but they do not form one maintenance-record system:

- Planner writes exact profile/rule/component/action metadata that the v2 scheduler reads.
- General Add service writes a legacy interval name or a generic category.
- V2 disables all legacy `service_intervals`, so the general form's tracked planner choices are empty/dead for the supported profile.
- Planner records appear in the timeline, but generic history cannot update the planner.

Shared storage is not enough; the creation, editing, duplicate, package, and scheduling semantics must also be unified.

### Why internal data appears in the UI

The projection exposes `source`, and the screens render it directly. Production screens currently show:

- manual filenames, PDF pages, sections, and table rows;
- profile version and validation status;
- manual conflicts and developer explanations;
- "manual-backed," migration, and baseline terminology;
- raw rule IDs through `service_type` in history;
- raw action/status enum wording.

`OilChangeDetailsScreen` is a latent release risk even though it currently has no visible caller: it exposes the oil conflict, profile version, citations, filenames, and raw statuses.

### Why Home shows the wrong items

Scheduler order is generic overdue, due, condition, due-soon, unknown, upcoming, informational. It ignores safety severity, action type, and condition severity. Home then removes informational rows and takes the first three database projections.

Consequences:

- missing historical initial tasks outrank real maintenance;
- `monitor` and `replace_now` have the same condition rank;
- one component can occupy all three slots;
- due-soon is labelled as "Service Due";
- the gauge uses current odometer divided by absolute due mileage instead of progress since the last action-specific baseline;
- status uses confirmed mileage while remaining distance can use predicted mileage.

### Why Maintenance scrolls excessively

The screen renders one full card per projected internal rule. The exact profile contains 63 applicable rules, including 23 initial rules and many low-level workshop checks. Every card repeats badges, explanation, technician warning, source evidence, and a full-width button. The screenshots confirm multi-line filenames/citations, repeated "Professional service recommended," and a page that extends many screens.

## Duplicate and grouping audit

No exact duplicate semantic rules were found by the current validator. The user-visible duplication comes from legitimate row/action decomposition plus extraction siblings that should be grouped.

| Production group | Internal rules/components | Decision |
| --- | --- | --- |
| Air filter | element initial inspection, air-cleaner-system inspection, recurring cleaning, fixed paper replacement, condition replacement | One component page; retain actions independently. Review the system/element initial rows as a near-duplicate source pair, but do not delete evidence. |
| Engine oil | initial replacement, level check, inspection, recurring replacement | One component page; replacement history never resets from inspection/check. |
| Gear oil | initial and recurring transmission-oil replacement | One scheduled-change component. |
| Brakes | brake-pad inspection, condition replacement, brake-fluid guidance | Wear/inspection presentation; no fixed brake-pad replacement countdown. |
| Tires | scheduled inspection plus condition replacement | Wear-item presentation. |
| CVT | drive belt/rollers and clutch inspection/replacement | One workshop-oriented component group. |
| Steering and suspension | steering bearing, shock absorbers, front/rear suspension | Workshop checklist with safety emphasis. |
| Check nuts and bolts | engine fasteners plus general fasteners | One understandable reminder/checklist. |
| General workshop inspection | carburetor/idle, fuel lines, throttle cable, leakage, cylinder, exhaust, cam chain/timing, valve clearance, PCV, stands, low-level chassis checks | One service package/checklist rather than many top-level cards. |

Individual user-facing reminders should be limited to important fixed changes, high-value checks, actionable safety findings, and clearly useful owner checks. Low-level manual rows remain available inside grouped workshop details. Pre-ride checks remain separate. Historical initial rules are shown only while actionable or inside initial-service history details.

## Exact New Symphony ST 200 profile findings

The extraction accurately preserves the real source conflict:

- PDF page 15 says change engine oil after 300 km and every 1,000 km thereafter; its oil box also says 3 months or 1,000 km.
- PDF page 26 says initial replacement at 300 km, inspection at 1,000 km/1 month, and replacement every 3,000 km.
- PDF page 29 identifies the XL20W1-EU/IT paper air cleaner.

The product owner has now resolved the application rule for this exact profile: recurring engine-oil replacement is a 1,000 km profile default. The current profile does not implement that decision. It must become an owner-confirmed, profile-scoped override while retaining the conflicting manual evidence internally. It must not be labelled an unambiguous manual rule and must never be inherited by other models.

## Migration audit

What is currently safe:

- old rows are preserved rather than guessed into exact actions;
- reads/writes/deletes are vehicle-scoped;
- events from another profile are ignored;
- normal odometer rollback and record mileage above the vehicle odometer are rejected.

What must change:

- separate history knowledge from "any log exists";
- preserve exact v2 records as confirmed action records;
- keep vague Service/Cleaning rows visible as `legacy_unmapped` and never use them as precise baselines;
- retire invalid generated intervals without losing their metadata;
- import trustworthy vehicle-specific interval choices only through explicit mapping, never into the shared profile;
- add idempotent migration tests from v14 and representative older backups;
- normalize raw exact-rule titles to friendly labels where possible;
- add a separate odometer-correction/instrument-replacement model boundary.

## Android and build audit

Read-only device state during the audit:

- Samsung SM-A566B, serial `RKCY901J8WB`;
- Android 16 / API 36, arm64-v8a;
- installed package `com.youssefbayoumy.x3azza`, version 2.1.0 (code 7);
- no ADB reverse mapping.

The existing release APK is debug-certificate signed, so it cannot support Play/production-signing readiness. The previous device report verified installation and a limited smoke path, but it explicitly left oil unresolved, rendered citations/profile data, and did not persist maintenance actions. It does not satisfy the new release criteria.

The merged manifest also contains permissions that require a separate minimization review. This is a packaging risk, not a reason to weaken the maintenance acceptance tests.

## Required production replacement

1. Add explicit history confidence, per-action knowledge, initial actionable windows, and differentiated task statuses.
2. Implement the exact 1,000 km owner-confirmed engine-oil replacement rule.
3. Add vehicle-scoped interval preferences and longer-interval confirmation.
4. Make `service_logs` the one canonical record path for planner, history, packages, edit, and delete, with exact action metadata where applicable.
5. Add editable historical date/mileage, provider, condition, cost, notes, oil metadata, record source, timestamps, and duplicate checks.
6. Group presentation by component and practical service, not source-table row.
7. Retire initial rules after the documented window without inserting fake history.
8. Replace list-order Home selection with deterministic safety/action/history priority.
9. Remove all evidence, IDs, versions, confidence, and migration language from production view models and screens.
10. Add migration, scheduler, preference, record, grouping, UI-safety, build, and connected-device coverage.

## Audit gate

Phase 1 is complete. Production code may change only against the written domain, migration, and UX contracts that follow this report.
