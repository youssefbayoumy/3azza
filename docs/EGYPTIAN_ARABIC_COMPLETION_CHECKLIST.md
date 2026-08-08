# Egyptian Arabic completion checklist

## Scope

- [x] Shared UI, alerts, validation, accessibility labels, and app-recovery states
- [x] Onboarding, app lock, vehicle setup, navigation, and settings
- [x] Dashboard, pre-ride, maintenance schedule, history, reminders, and record forms
- [x] Documents, inventory, fuel, service logs, insights, vitals, and specifications
- [x] Notifications, backup/export/restore, and offline/error paths

## Content policy

- [x] Translate app-owned copy through typed locale keys.
- [x] Preserve brands, model codes, database keys, backup schema, and user-entered data.
- [x] Keep manual-source English until reviewed Arabic is available; label it as original source text.
- [x] Use reviewed canonical translations for maintenance component/action IDs.

## Acceptance gates

- [x] English and `ar-EG` key sets match with no empty values.
- [x] No hard-coded user-visible English remains outside the approved allowlist.
- [x] RTL audit covers rows, directional icons, modals, tabs, forms, and mixed Arabic/code text.
- [x] Dates, units, counts, and notifications are locale-aware.
- [x] Typecheck, lint, and tests pass.
