# Next task

Read `PRODUCT_SCOPE.md`, `CURRENT_STATE.md`, and `docs/architecture/ARCHITECTURE.md` before beginning this work.

## Completed in the current batch

### Replace onboarding and maintenance scheduling with an explicit lifecycle model

- Initial setup and Add Vehicle now ask exact scooter, odometer, and bought new/used; the detailed history questionnaire and daily-average requirement are gone.
- Fresh installs now open directly to that vehicle setup instead of an introductory tour. The optional app lock remains available in Settings, but no longer forces PIN registration before setup is complete.
- New scooters alone receive one isolated first-service checkpoint and transition to the normal plan after completion or cutoff. Used and migrated-unknown scooters start normal with unknown per-action history.
- Home, Maintenance, oil details, Insights, and notifications use `projectVehicleMaintenance`; legacy service-interval calculators and their runtime APIs were removed.
- Schema v21 migrates existing ownership to unknown and preserves records/preferences. Exact record anchors, custom intervals, changed-now, edit, and delete recalculation are covered by automated tests.
- Focused connected-device maintenance-record QA now covers disclosure, lower-field keyboard scrolling, Save reachability, Android Back draft safety, touch targets, and a user-confirmed Arabic RTL smoke. Notification-output and broader accessibility QA remain follow-up work.
- Maintenance recording now uses a compact default form: a predetermined action is presented as a header, mileage/date remain primary, and optional workshop, cost, notes, title, and oil fields are collapsed until requested. Existing optional edit values expand the disclosure; record persistence, validation, lifecycle, and scheduling behavior were deliberately unchanged.
- The maintenance form now bounds its scrollable content to the keyboard-reduced viewport. Android Back dismisses an open keyboard before form close; the keyboard decision has focused regression coverage.

## Active task

### Improve unsafe unknown/custom vehicle capability behavior

Ensure unknown or custom vehicle selections do not silently expose every motorcycle system.
Keep unknown capability facts unknown, preserve existing maintenance history and persistence,
and avoid inventing manufacturer-specific guidance.

Scope guards: do not change maintenance record persistence semantics or begin secondary
feature work unless a minimal dependency requires it.

## Next task

Perform broader connected-device accessibility and notification-output QA for the stabilized
maintenance loop, including TalkBack, font scaling, and notification taps.

Do not begin the queued task while the active task is unfinished. After a
meaningful implementation, update `CURRENT_STATE.md`; update this file when a
task is completed; update `ARCHITECTURE.md` only for an architectural change;
and change `PRODUCT_SCOPE.md` only for an intentional product-direction change.
