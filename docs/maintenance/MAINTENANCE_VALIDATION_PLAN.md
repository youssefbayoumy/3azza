# Maintenance validation plan

Date: 2026-08-01  
Profile: New Symphony ST 200, XL20W1-EU/XL20W1-IT.

## Current execution status

- Catalogue/model checks, profile validation, TypeScript, lint, all 191 tests,
  Expo Doctor, and the critical production-dependency audit gate passed.
- Standalone release and side-by-side QA APKs were built and inspected with
  bundled JavaScript; neither requires Metro.
- Installation and interactive connected-device QA are intentionally pending by
  owner instruction. No current-build device acceptance is claimed.

## Release invariants

- Engine-oil replacement profile default is exactly 1,000 km.
- No active exact-profile rule or scheduler branch uses 3,000 km for oil replacement.
- A high-mileage owner receives no active 300 km task and no fake initial record.
- Unknown history never creates a fabricated overdue distance.
- Inspection, cleaning, replacement, and generic service have independent effects.
- Preferences, records, and history state are vehicle-scoped.
- Production presentation never contains internal evidence or identifiers.

## Initial-service matrix

| Odometer | No exact initial record | Confirmed record |
| ---: | --- | --- |
| 0 | upcoming | completed/hidden |
| 299 | due soon | completed/hidden |
| 300 | due | completed/hidden |
| 500 | overdue/actionable | completed/hidden |
| 1,000 | overdue/actionable | completed/hidden |
| 1,001 | historical-unverified; hidden from current priorities | completed/hidden |
| 18,080 | historical-unverified; hidden; no inserted record | completed/hidden |

Run each relevant boundary with Unknown, Never done, confirmed, and legacy-unmapped history. Recurring rules must remain independently available after the initial window.

## Oil matrix

- No history at 18,080: last change unknown; no due/overdue mileage.
- Change at 18,000, default 1,000: next 19,000; remaining 920.
- Change at 17,500, default 1,000: next 18,500; remaining 420.
- Inspection at 18,000 does not reset replacement.
- Generic service at 18,000 does not reset replacement.
- Historical oil change does not update current odometer.
- Oil type/brand/viscosity do not alter the interval.

## Preference matrix

- Enter arbitrary positive values such as 700 km, 2,000 km, and 20,000 km; no fixed preset list exists.
- Exercise distance-only, time-only, and combined distance/time schedules; combined schedules become due at whichever boundary arrives first.
- Restore the immutable original profile schedule by deleting only the matching override.
- Custom values shorter than or equal to the original save normally.
- Custom values longer than the original fail unless explicit confirmation reaches storage; extreme values receive stronger UI confirmation and are not clamped.
- Disable and re-enable distance/time channels and the whole reminder while preserving the rule and history.
- Add a personal interval to a condition-based action without turning it into a manufacturer-backed replacement schedule.
- Preference changes recalculate current next due from the latest confirmed replacement.
- Preference changes preserve all records.
- Inspection/cleaning/replacement preferences remain action-specific.
- A preference affects one vehicle/profile only and never mutates profile JSON.
- Reject zero, negative, non-numeric, and values outside technical storage limits.

## Historical record matrix

- Record/edit a date and mileage below current odometer.
- Reject mileage above current odometer.
- Reject future or invalid date.
- Support unknown mileage and/or date without using an unknown baseline.
- Allow multiple different actions at the same mileage/date.
- Warn on same vehicle/component/action/date/mileage duplicate; allow explicit override.
- Edit preserves created time and advances updated time.
- Delete requires confirmation and recalculates projection.
- Provider, cost, notes, condition, oil metadata, and record source persist across restart/backup.

## Action and package matrix

- Inspection does not reset replacement.
- Cleaning does not reset replacement unless an explicit relationship says so.
- Fixed replacement can resolve the matching current condition warning only through an explicit relationship.
- General service with no selected action resets nothing.
- Multi-action package creates only selected action records in one transaction.
- Package history groups selected actions and survives edit/delete/restart.
- Duplicate package action handling is deterministic.

## Condition matrix

Test Healthy, Monitor, Service soon, Replace soon, Replace now, and Unable to inspect for brake pads and tires. No wear item receives a replacement mileage. Replace now is the highest Home priority. A later healthy inspection or confirmed replacement resolves the applicable warning without fabricating another action.

## Presentation matrix

- Fixed replacements appear under Scheduled changes.
- Inspect/clean/adjust/lubricate/test/tighten appear under Checks and servicing.
- Brake pads, tires, battery, and other condition parts appear under Wear items.
- Air-filter actions share one component presentation.
- Low-level rows appear inside General workshop inspection.
- Unknown history produces at most one finish-setup reminder.
- Home is safety/action prioritized and deduplicated by component.
- Gauge progress uses the latest action baseline, not absolute odometer.

## Production UI safety

Test representative view-model output and inspect production maintenance screens for:

- no raw rule IDs or enum values;
- no manual filenames, PDF pages, citations, table rows, or original text;
- no confidence/profile/status/version/release-candidate values;
- no extraction/migration/developer terminology;
- natural action labels and meaningful technician guidance only.

## Migration and vehicle matrix

- Exact v2 rows remain exact and usable.
- Vague legacy Service/Cleaning rows remain visible as legacy-unmapped and reset nothing.
- Generated 300 km intervals stay inactive.
- Re-running migration is idempotent.
- Backup/restore retains new record metadata, preferences, and history states.
- Switching active vehicle leaves records/preferences with their vehicle.
- Changing scooter selection does not reinterpret old actions for the new profile.

## Automated gates

Run catalogue/model checks, profile validation, TypeScript, lint, all tests, Expo Doctor, dependency audit, Android unit/build checks, and a standalone release APK build. Failures must be fixed at root cause; assertions are not weakened.

Status for this revision: passed. The live audit inventory still contains
non-critical transitive Expo/tooling advisories documented in
[`ANDROID_DEVICE_QA_REPORT.md`](../qa/ANDROID_DEVICE_QA_REPORT.md).

## Connected-device gate

After automated gates, follow `android-apk-device-qa`. Verify arbitrary engine-oil and inspection values, transmission oil at 20,000 km, time-only and combined schedules, condition-based personal reminders, warning text, restore, disable/re-enable, latest-action recalculation, persistence, vehicle isolation, navigation/layout, and fatal-log scan. Installation/launch alone is not acceptance.

Status for this revision: pending. The owner instructed Codex not to install the
APK yet, so this gate remains deliberately open.
