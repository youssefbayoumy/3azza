# Egyptian Arabic hard-coded UI allowlist

The automated scanner covers JSX text, user-facing string props, direct alert
copy, loader failure copy, and fixed directional icons in `App.tsx` and app
components/screens. Locale resources and tests are intentionally outside its UI
source scope.

Approved literals are limited to stable brands, compatibility units, and input
schema tokens:

- `3AZZA`, `3AZZA App`, and `3azza`: product brand and its accessibility name.
- `EGP`: stored/displayed currency code.
- `KM/L` and `L`: fuel/manual compatibility units.
- `psi` and `°C`: technical dashboard/manual units.
- `YYYY-MM-DD`: storage-compatible date entry schema.

Manual excerpts, citations, model names, codes, filenames, and user-entered
values are data rather than app-owned copy. They are not allowlisted as JSX
literals. Arabic screens that render original manual data must also render the
localized `common.manualEnglishNotice` notice.

Internal diagnostic exception strings may remain in service code, but every UI
boundary must pass them through `localizeErrorMessage`. In an Arabic session,
that helper preserves already-localized validation errors and replaces raw
English diagnostics with the operation-specific localized recovery message.
