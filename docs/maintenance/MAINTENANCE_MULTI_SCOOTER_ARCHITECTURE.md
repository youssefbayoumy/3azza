# Multi-scooter maintenance architecture

## Shared domain

The universal catalogue (`maintenance-data/universal-maintenance-catalogue.json`)
defines stable components, categories, and allowed actions. It contains no due
intervals. Every scooter profile references catalogue component IDs and supplies
its own applicability, action-specific schedule, exact variant identity,
confidence, ambiguity policy, and manual citation.

The scheduler consumes one exact profile, current confirmed odometer/date state,
and action-specific events. It has no manufacturer conditionals. The UI,
dashboard, and notification planner consume the same task projection.

## Profile lifecycle

`draft -> extracted -> needs_review -> validated -> production_ready`

- `draft`, `extracted`, and `needs_review` are never selectable.
- `validated` may be used only when every unresolved ambiguity has an explicit
  safe behavior; critical ambiguity prevents a false countdown.
- `production_ready` additionally requires no unresolved critical ambiguity and
  must pass automated validation plus connected-device QA.
- Profile IDs remain stable; `profileVersion` changes whenever evidence,
  applicability, or schedule semantics change. Events store both values.

### Historical record compatibility

`profileId` identifies a maintenance-profile lineage; `profileVersion` records
the revision that produced or recorded an event. A version change alone never
invalidates trustworthy physical maintenance history. The scheduler decides
compatibility from exact profile, rule, component, and action identity. Keep a
rule ID only while its real-world maintenance action remains semantically
compatible; otherwise author a new rule ID. Do not use profile-version
filtering or generic history migrations to reinterpret a semantic rule change.

## Exact selection and isolation

A profile is resolved by brand, model, manual version, and exact variant ID.
Changing vehicles or scooter identity changes the active profile transactionally.
Events from another profile remain in history but cannot influence the new
profile because the scheduler filters by profile and rule identity. Legacy
component-name records are classified `legacy_needs_confirmation`; they are
preserved and never guessed into a baseline.

## Adding another scooter

1. Identify exact model codes, engine/cooling/fuel variants, years, and markets.
2. Extract each manual row without collapsing actions or initial/recurring rules.
3. Record filename, PDF page, section, and table row for every rule.
4. Mark non-applicable systems explicitly and retain conflicts as alternatives.
5. Validate against the universal catalogue and suspicious-interval checks.
6. Compare the candidate profile with the reference using
   `npm run maintenance:compare -- <reference.json> <candidate.json>`.
7. Add boundary, applicability, condition, switching, and migration tests.
8. Set `validated` only after review; expose it in `MAINTENANCE_PROFILES` only
   after the automated gate passes.
9. Build and test the standalone APK on the connected device before considering
   `production_ready`.

No remaining manual has been migrated by this change. They intentionally stay
unsupported until this process is completed independently for each exact variant.
