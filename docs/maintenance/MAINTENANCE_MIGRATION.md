# 3azza maintenance migration

Date: 2026-08-01  
Target: upgrade supported legacy databases through schema v15/v16 to schema v17.

## Goals

- Preserve every existing user record and its vehicle ownership.
- Never infer an exact action from a vague title or old interval name.
- Keep exact v2 planner events usable.
- Retire generated schedules as active authority.
- Add vehicle-scoped preferences and history state without changing shared profiles.
- Preserve multi-action service packages as logical history records.
- Permit an explicitly confirmed odometer correction without rewriting history.
- Make migration idempotent and backup-safe.

## Storage evolution

`service_logs` remains the canonical history table. New columns add:

- mileage/date confidence;
- record source;
- service provider;
- package ID;
- oil metadata;
- created and updated timestamps.

New tables add:

- `maintenance_preferences`, unique by vehicle/profile/component/action;
- `maintenance_history_states`, unique by vehicle/profile/component/action;
- `odometer_events`, an append-only audit trail for explicit display-odometer
  corrections.

Schema v17 extends each `maintenance_preferences` row with immutable-original
distance/month snapshots, optional custom distance/month values, effective time,
distance/time enable flags, and condition-reminder flags. Existing distance-only
overrides are backfilled without changing their value or scope. A legacy row with
no profile remains quarantined with `profile_id = NULL`.

Multi-action packages remain normalized `service_logs` rows joined by one
`service_package_id`; list pagination and cost aggregation operate on the logical
package rather than multiplying it by action count.

`vehicle_profile` gains `maintenance_history_level`. The old `service_history_setup_completed` flag is retained for backup compatibility but is no longer interpreted as proof about every rule.

## Existing record classification

### Exact v2 planner row

Required fields: profile ID/version, rule ID, component ID, action, and `maintenance_migration_status = exact`.

Migration:

- keep the row and ID;
- set confirmed mileage when `sets_odometer_baseline = 1`, otherwise unknown;
- set confirmed date when the stored date is valid, otherwise unknown;
- set source to planner/import as appropriate;
- preserve inspection result, notes, cost, and vehicle;
- normalize the visible title from the current rule when the exact rule still exists;
- never alter the stored profile/rule identity.

### Vague legacy row

Examples: Service, Cleaning, Tune-up, General service, or an old component-name interval.

Migration:

- preserve title, date, mileage, notes, cost, and vehicle;
- set confidence to `legacy_unmapped`;
- set source to `legacy`;
- keep exact action fields null;
- show it in history as an older maintenance record;
- never use it as an action baseline.

Legacy "Cleaning" does not complete every cleaning rule. Legacy "Service" does not complete oil, brakes, air filter, gear oil, or workshop checks.

### Partial/malformed exact row

If any required action identity is missing or invalid, downgrade to `legacy_unmapped`. Do not repair by display-name matching.

## Initial-service migration

No historical-unverified initial task is inserted into history.

At projection time:

- a confirmed exact initial record completes that initial rule;
- no record and odometer through 1,000 km leaves the task actionable;
- no record and odometer above 1,000 km projects `historical_unverified` and hides it from current priorities.

This preserves uncertainty without creating a fake 300 km event.

## Legacy intervals and preferences

All old `service_intervals` remain inactive and preserved for forensic/backup compatibility. They are not schedule authority.

An old interval becomes a `maintenance_preferences` row only when all of the following are true:

- vehicle ownership is known;
- canonical component and action are unambiguous;
- the row explicitly indicates a user override rather than a generated/default value;
- the target exact profile has the matching action;
- the value passes current validation.

Otherwise it remains preserved but unmapped. Known generated 300 km recurrences and universal defaults are never imported as personal choices. A preference import affects one vehicle only.

## History knowledge migration

- Existing vehicles receive `maintenance_history_level = unset` unless a new explicit choice already exists.
- The existence of any log does not mark setup complete.
- Old `service_history_setup_completed` may suppress a destructive rerun of the obsolete wizard, but it does not supply per-rule baselines.
- The user sees one compact finish-setup reminder until they answer or explicitly choose little/no history.

## Profile and vehicle switching

- Records remain attached to their original `vehicle_id`.
- Preferences and history states remain attached to that vehicle.
- A changed scooter selection projects only the new exact profile.
- Old-profile records remain visible but cannot influence the new profile without an explicit compatibility mapping.
- Component or display-name equality is never sufficient.

## Edit/delete after migration

Exact and legacy records use the same history UI. Editing a legacy row does not silently map it to an action; mapping requires an explicit component/action choice. Deleting any row is vehicle-scoped and confirmed. The scheduler rereads the remaining exact records, so dependent reminders recalculate without mutable baseline fields.

## Backups

The backup format includes the new record columns, preferences, history states,
and odometer events. Restore performs domain validation before replacing local
tables, restores all rows transactionally, then reruns safe classification. Older
supported backups are upgraded with default confidence/source values. Missing new
collections in an older backup are treated as empty, not as permission to discard
old logs.

## Idempotency

- Schema changes use versioned migrations.
- Column/table creation is conditional.
- Record classification updates existing rows in place.
- Exact records are not copied.
- Any package or preference import uses stable uniqueness keys.
- Running initialization twice produces the same records, preferences, and active projection.

## Required migration tests

- v14 database with exact v2 rows retains IDs and action identity.
- Vague Service/Cleaning rows remain visible and never complete precise rules.
- Old generated 300 km intervals remain inactive and are not imported as preferences.
- A trustworthy vehicle-specific override affects only that vehicle.
- High-mileage initial milestones create no history rows.
- Restore/import does not reactivate stale intervals.
- Records remain on their vehicle after active vehicle or model changes.
- Package pagination never splits a logical package and package cost counts once.
- Editing a preserved exact record cannot rewrite its profile/rule provenance.
- An authorized odometer correction respects the durable history-derived floor,
  writes one audit event atomically, and leaves service/fuel/interval records
  untouched.
- Re-running migration creates no duplicates.
- Editing/deleting a migrated exact record refreshes due values.
