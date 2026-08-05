# 3azza maintenance UX and state-transition specification

Date: 2026-08-01  
Reference profile: SYM New Symphony ST 200, XL20W1-EU/XL20W1-IT.

## Product principles

- Ask owners for useful facts, not internal maintenance rows.
- Keep Unknown honest and compact.
- Show current action before historical uncertainty.
- Group by component/service while preserving action-specific records internally.
- Every saved action is reviewable before write, editable later, and visible in one history.
- Never show citations, extraction metadata, profile status, raw enums, or migration language in production.

## New vehicle setup

State flow:

```text
Scooter selection
  -> current odometer
  -> maintenance history knowledge
  -> optional high-value baselines
  -> Home
```

After the exact scooter and odometer are saved, ask:

"How much maintenance history do you know?"

- I have detailed records
- I remember recent maintenance
- I have little or no history
- Skip for now

Detailed/recent continues to the compact baseline screen. Little/no history records that answer and continues without blocking. Skip continues and leaves one later setup reminder.

### High-value baselines

Ask only for:

- last engine oil change;
- last gear-oil change;
- last air-filter cleaning or replacement;
- last general workshop inspection;
- known brake, tire, battery, engine, or mechanical issues.

For an action baseline, choices are Exact record, I don't know, Never done, and Not applicable. Approximate entry is not offered in the first release. Exact opens editable mileage and date fields. Air filter additionally asks Cleaned or Replaced. A general inspection is recorded as a general historical record and does not automatically complete every checklist item. Known issues are notes, not inferred condition results.

## Existing-owner setup

Vehicles migrated with no explicit answer receive one compact card:

"Finish setting up your maintenance history"

The card opens the same flow. It never creates one setup card per rule. An owner at 18,080 km can skip, enter only an 18,000 km oil change, or add other exact records later.

## Initial-service state

- 0-269 km: show Initial service as upcoming.
- 270-299 km: due soon.
- 300 km: due.
- 301-1,000 km: overdue and actionable.
- Above 1,000 km: remove from Home, Due now, and Coming up; keep one compact Initial service details entry with historical-unverified wording.
- Confirmed historical completion: show in history; do not project a current initial task.

Required copy outside the window:

"The initial break-in milestone is no longer shown because this scooter was added after that stage."

Never say it was completed without a confirmed record.

## Maintenance landing screen

The root Maintenance tab has no back arrow. It uses compact sections:

1. Due now
2. Coming up
3. Scheduled changes
4. Checks and servicing
5. Wear items
6. Maintenance history
7. Initial service, only when relevant or opened explicitly
8. Finish setup, only when setup is unset/skipped

Due now and Coming up use the domain priority order and deduplicate by presentation component. The category sections use compact component rows, not full rule cards. Tapping a row opens details with its independent actions.

### Component groups

- Air filter: inspection, cleaning, fixed paper replacement, earlier condition replacement.
- Engine oil: level check, inspection, replacement, interval setting, records.
- Gear oil: initial/recurring replacement.
- Brakes: inspections and last condition; replacement only by condition.
- Tires: inspections and last condition; replacement only by condition.
- CVT: belt/roller inspection and replacement plus clutch checks.
- Steering and suspension: grouped workshop checklist.
- Check nuts and bolts: engine/general fasteners.
- General workshop inspection: practical low-level technical checklist.

Related rules stay distinct in detail and history, but do not become separate top-level cards.

## Fixed change flow

Example engine-oil row:

```text
Engine oil
Every 1,000 km
Last changed: 18,000 km
Next due: 19,000 km
920 km remaining
[Record oil change] [History]
```

Unknown history:

"Last change unknown. Enter previous maintenance or consider servicing it now."

No overdue distance is calculated without a confirmed baseline.

Record button opens the shared form prefilled with current odometer/today. The user can change both to record previous maintenance. For historical context, the button may read "Record previous oil change."

## Inspection/service flow

Unknown history copy:

"Last check unknown. Consider having it inspected."

Recording an inspection opens the shared form. If the rule has a condition follow-up, condition result is required in the form. Selecting a result never saves immediately; the user reviews and taps Save.

Technician wording appears only when meaningful:

- You can check this
- Workshop inspection recommended
- Workshop service required

It is not repeated on every compact row.

## Wear-item flow

Wear items show:

- last inspection;
- last known condition;
- inspection guidance;
- a record-inspection action;
- condition-triggered service wording.

They do not show a replacement countdown. Condition states are Healthy, Monitor, Service soon, Replace soon, Replace now, and Unable to inspect. `replace_now` is the highest Home priority.

## Shared historical record form

Used by Planner, Add maintenance, setup baselines, and Edit record.

Fields:

- component and action (visible; locked only when launched from an exact task);
- mileage when performed, default current odometer, with Unknown toggle;
- date when performed, default today, with Unknown toggle;
- condition result when relevant;
- optional cost;
- optional notes;
- optional workshop/service provider;
- oil brand/type/viscosity/mechanic recommendation for oil replacement.

Validation is inline and repeated at the persistence boundary. Mileage below current is valid; above current is rejected. Future dates are rejected. Historical save does not change odometer.

Duplicate detection occurs before insert. If the same action/date/mileage exists, show the matching record and offer Cancel or Save anyway.

## Custom engine-oil interval

Engine oil details show:

```text
Your interval: every 800 km
Recommended interval: every 1,000 km
```

Options:

- 600 km
- 800 km
- 1,000 km - recommended
- Custom
- Restore recommended interval

Values at or below 1,000 km save immediately. A longer value opens an explicit warning:

"This is longer than the 1,000 km interval recommended for this scooter. Use it only if you have made an informed maintenance decision."

Buttons: Keep 1,000 km / Use custom interval.

Changing the interval refreshes the next current due point from the latest confirmed oil replacement. It does not rewrite history. Oil type never changes the selected interval.

## General service package

"Add maintenance" supports:

- a single action;
- a named package such as "10,000 km workshop service";
- Other work for repair, modification, bodywork, or an unlisted service.

Package actions are checkboxes, for example:

- Engine oil replaced
- Brakes inspected
- Air filter cleaned
- Tires inspected
- Fasteners checked

Only checked actions create exact action records. The package saves transactionally with a shared package ID and appears once in the timeline with its action list. Other work has no schedule effect.

## Maintenance history

Header wording is "Latest maintenance record," never generic "Last service." Component detail can separately show Last engine-oil change, Last general inspection, and Last air-filter service.

Every history item supports:

- view details;
- edit;
- delete with confirmation.

Edit explains that the next due value may change, preserves creation time, and refreshes projection after save. Delete confirmation names affected actions and refreshes projection after deletion.

Legacy unmapped rows remain visible with neutral copy such as "Older maintenance record." They do not display raw IDs or pretend to complete precise actions.

## Home

Home uses the same projected status as Maintenance and notifications. It shows at most three deduplicated priorities plus one compact setup reminder when applicable.

Ranking:

1. safety-critical Replace now;
2. other safety condition attention;
3. confirmed overdue;
4. confirmed due replacement;
5. confirmed due inspection/service;
6. due soon;
7. important unknown fixed-change history;
8. setup reminder;
9. informational/upcoming.

The progress gauge uses progress since the latest relevant confirmed record. For 18,000 -> 19,000 at 18,080, progress is 8% and remaining is 920 km. Status, color, remaining, and warning count use the same odometer basis.

## Vehicle changes and odometer safety

- Records and preferences stay attached to their vehicle.
- Changing the selected scooter never remaps old exact actions by name.
- Only the active vehicle is projected.
- Normal odometer editing cannot roll back.
- A separate correction flow is required for true correction; future schema should support instrument-cluster replacement.
- Historical maintenance entry never changes current odometer.

## Navigation and accessibility

- Rename the internal `Vitals` tab route to `Maintenance`.
- Keep safe-area bottom padding.
- Use minimum 44-48 px touch targets.
- Avoid 8 px tab labels and aggressive font-scale limits.
- Root tab has no back control; pushed details do.
- Forms remain scrollable with the keyboard and bottom navigation never covers content.
- Buttons use natural language: Record oil change, Record previous oil change, Record air-filter inspection, Add historical maintenance.

## Production UI safety

Automated tests inspect presentation output and production screen source to prevent rendering:

- rule IDs;
- manual filenames;
- PDF/page/table citations;
- source/confidence metadata;
- profile versions/status;
- release-candidate labels;
- raw enum names;
- extraction/migration/developer explanations.
