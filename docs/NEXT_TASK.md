# Next task

Read `PRODUCT_SCOPE.md`, `CURRENT_STATE.md`, and `docs/architecture/ARCHITECTURE.md` before beginning this work.

## Completed in the current batch

### Replace onboarding and maintenance scheduling with an explicit lifecycle model

- Initial setup and Add Vehicle now ask exact scooter, odometer, and bought new/used; the detailed history questionnaire and daily-average requirement are gone.
- Fresh installs now open directly to that vehicle setup instead of an introductory tour. The optional app lock remains available in Settings, but no longer forces PIN registration before setup is complete.
- New scooters alone receive one isolated first-service checkpoint and transition to the normal plan after completion or cutoff. Used and migrated-unknown scooters start normal with unknown per-action history.
- Home, Maintenance, oil details, Insights, and notifications use `projectVehicleMaintenance`; legacy service-interval calculators and their runtime APIs were removed.
- Schema v21 migrates existing ownership to unknown and preserves records/preferences. Exact record anchors, custom intervals, changed-now, edit, and delete recalculation are covered by automated tests.
- Connected-device UX and notification-output QA remain follow-up verification, not completed evidence.

## Active task

### Fix maintenance-record bottom-sheet behavior around keyboard opening and validation

Preserve current maintenance-record persistence semantics, validation rules, and
vehicle isolation. Add or update focused automated tests.

Scope guards: do not redesign the maintenance flow, change persistence semantics,
or start a later task unless a minimal dependency is required.

## Next task

Improve unsafe unknown/custom vehicle capability behavior so unknown does not
silently expose every motorcycle system.

Do not begin the queued task while the active task is unfinished. After a
meaningful implementation, update `CURRENT_STATE.md`; update this file when a
task is completed; update `ARCHITECTURE.md` only for an architectural change;
and change `PRODUCT_SCOPE.md` only for an intentional product-direction change.
