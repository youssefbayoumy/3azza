# Next task

Read `PRODUCT_SCOPE.md`, `CURRENT_STATE.md`, and `docs/architecture/ARCHITECTURE.md` before beginning this work.

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
