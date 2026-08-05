# 3azza maintenance domain model

Date: 2026-08-01  
Status: implementation contract for the New Symphony ST 200 production profile.

## Design boundary

The domain separates five facts that the old product conflated:

1. A component, such as an air filter.
2. An action, such as inspect, clean, or replace.
3. A profile rule that schedules one action for one exact scooter.
4. A user's maintenance record, including its confidence and vehicle ownership.
5. A projected current state derived from rules, preferences, history, odometer, and time.

The universal catalogue contains terminology only. It never supplies an interval. Numerical rules live only in an exact profile. A user preference belongs only to one vehicle. Source evidence is retained for validation and diagnostics but is not part of the production view model.

## Core types

```ts
type MaintenanceAction =
  | 'inspect'
  | 'replace'
  | 'clean'
  | 'adjust'
  | 'lubricate'
  | 'test'
  | 'tighten'
  | 'condition_check';

type ScheduleType =
  | 'one_time_initial'
  | 'recurring_distance'
  | 'recurring_time'
  | 'recurring_distance_or_time'
  | 'condition_based'
  | 'inspection_with_condition_replacement'
  | 'manual_only_or_no_fixed_interval';

type HistoryConfidence =
  | 'confirmed'
  | 'estimated'
  | 'unknown'
  | 'historical_unverified'
  | 'legacy_unmapped';

type IntervalSource =
  | 'profile_default'
  | 'user_custom'
  | 'workshop_recommendation';

type RuleConfidence =
  | 'explicit'
  | 'interpreted'
  | 'owner_confirmed'
  | 'unclear';

type TechnicianLevel =
  | 'user_checkable'
  | 'workshop_recommended'
  | 'workshop_required';

type ConditionResult =
  | 'healthy'
  | 'monitor'
  | 'service_soon'
  | 'replace_soon'
  | 'replace_now'
  | 'unable_to_inspect';
```

`estimated` is supported by storage but is not offered in the first production UI. The first release accepts exact or unknown mileage/date so it never calculates an exact deadline from an approximation.

## Source evidence

```ts
interface MaintenanceSource {
  sourceType:
    | 'official_manual'
    | 'official_service_manual'
    | 'official_bulletin'
    | 'project_owner_override'
    | 'verified_external_source';

  manualId?: string;
  filename?: string;
  page?: number;
  section?: string;
  tableRow?: string;
  originalText?: string;

  decisionId?: string;
  decisionDate?: string;
  decisionNote?: string;
}
```

Official manual sources require their manual/page/section fields. A project-owner override requires a stable decision ID, date, and note. An override may retain conflicting official sources in `supportingSources`; it is never relabelled as an unambiguous manual statement.

## Rule model

```ts
interface ScheduleDefinition {
  type: ScheduleType;

  initialServiceKm?: number;
  initialServiceMonths?: number;
  initialActionableUntilKm?: number;
  afterWindowBehavior?: 'historical_unverified';

  intervalKm?: number;
  intervalMonths?: number;
  dueWhen?: 'distance' | 'time' | 'whichever_comes_first';

  replacementCondition?: string;
  severeUseIntervalKm?: number;
  severeUseIntervalMonths?: number;
  severeUseNotes?: string;
}

interface MaintenanceRule {
  id: string;                 // stable and action-specific
  componentId: string;
  category: string;
  internalLabel: string;
  userLabel: string;
  applicable: boolean;
  action: MaintenanceAction;
  schedule: ScheduleDefinition;

  safetyCritical: boolean;
  technicianLevel: TechnicianLevel;

  conditionFollowUp?: {
    ruleId: string;
    triggerResults: Exclude<ConditionResult, 'healthy'>[];
  };

  // Same action/component only, explicitly declared.
  baselineRuleIds?: string[];
  resolutionRuleIds?: string[];

  instructions?: string;
  replacementCondition?: string;
  source: MaintenanceSource;
  supportingSources?: MaintenanceSource[];
  confidence: RuleConfidence;
}
```

One manual row may produce several rules. A component may therefore have multiple independent actions. An inspection never resets replacement, cleaning never resets replacement unless `resolutionRuleIds` explicitly permits it, and a generic service has no rule relationship.

## Initial-service lifecycle

For the New Symphony ST 200 reference profile, every 300 km initial milestone uses this product decision:

```ts
{
  type: 'one_time_initial',
  initialServiceKm: 300,
  initialActionableUntilKm: 1000,
  afterWindowBehavior: 'historical_unverified'
}
```

The window is inclusive through 1,000 km:

- 0-269 km: upcoming;
- 270-299 km: due soon;
- 300 km: due;
- 301-1,000 km: overdue but still actionable;
- 1,001 km and above: historical-unverified.

Historical-unverified is not a maintenance record and never appears as a current Home, Due now, or Coming up item. It remains available in Initial service details with: "The initial break-in milestone is no longer shown because this scooter was added after that stage."

An exact historical completion can later be added. The app never inserts a fake 300 km record and never says the initial service was completed unless a confirmed record exists.

## Vehicle history knowledge

```ts
type MaintenanceHistoryLevel =
  | 'unset'
  | 'detailed_records'
  | 'recent_memory'
  | 'little_or_none'
  | 'skipped';

type RuleHistoryState = 'unknown' | 'never_done' | 'not_applicable';

interface VehicleRuleHistoryState {
  vehicleId: number;
  componentId: string;
  action: MaintenanceAction;
  state: RuleHistoryState;
  updatedAt: string;
}
```

The vehicle-level answer controls onboarding and whether one finish-setup reminder is shown. It is not proof that every rule was or was not completed. Per-action state is used only when the user explicitly chooses Unknown, Never done, or Not applicable.

## Vehicle-specific interval preference

```ts
interface VehicleMaintenancePreference {
  vehicleId: number;
  profileId: string;
  componentId: string;
  action: MaintenanceAction;

  originalIntervalKm?: number;
  originalIntervalMonths?: number;
  customIntervalKm?: number;
  customIntervalMonths?: number;
  effectiveIntervalKm?: number;
  effectiveIntervalMonths?: number;
  distanceEnabled: boolean;
  timeEnabled: boolean;
  conditionBasedDefault: boolean;
  customConditionReminderEnabled: boolean;
  intervalSource: IntervalSource;

  reason?: string;
  changedAt: string;
  updatedAt: string;
}
```

Preferences are keyed by vehicle, profile, component, and action. They do not mutate profile JSON and cannot affect another vehicle or another action on the same component. The scheduler always derives the original schedule from the immutable profile and applies enabled custom distance/time values only to the matching action-specific rule.

There are no interval presets. Any positive whole-number distance or month value within storage limits is accepted without clamping. Values longer than the immutable original schedule require explicit confirmation at both the UI and persistence boundary; extreme values receive a stronger confirmation. A condition-based rule remains condition-based, although the owner may add a clearly labelled personal reminder. Disabling a reminder leaves the rule and history intact. Restoring the original schedule deletes only the vehicle-specific override.

Oil type, brand, viscosity, and interval are separate facts. No oil metadata changes a reminder interval automatically.

## Unified maintenance record

`service_logs` remains the canonical table so existing records are preserved. It is evolved into an atomic action-record system. A single action is one row. A multi-action workshop package inserts one row for each selected action in one transaction, tied by a shared `servicePackageId`. The history UI groups those rows as one package. Unlisted work uses the same table with no component/action identity.

```ts
interface MaintenanceRecord {
  id: number;
  vehicleId: number;

  componentId?: string;
  action?: MaintenanceAction;
  ruleId?: string;
  profileId?: string;
  profileVersion?: string;

  mileageKm?: number;
  serviceDate?: string;
  mileageConfidence: HistoryConfidence;
  dateConfidence: HistoryConfidence;

  conditionResult?: ConditionResult;
  title: string;
  notes?: string;
  cost?: number;
  serviceProvider?: string;

  oilBrand?: string;
  oilType?: 'mineral' | 'semi_synthetic' | 'synthetic' | 'other';
  oilViscosity?: string;
  mechanicRecommendation?: string;

  recordSource:
    | 'planner'
    | 'manual_entry'
    | 'history_onboarding'
    | 'legacy'
    | 'import';

  servicePackageId?: string;
  createdAt: string;
  updatedAt: string;
}
```

Unknown mileage is stored without an odometer baseline and displayed as unknown. Unknown date is stored with unknown confidence and is not used as a time baseline. A confirmed zero-kilometre record remains distinguishable from unknown.

Legacy vague records remain normal visible history rows with `legacy_unmapped` confidence and no exact action identity. Exact v2 rows migrate to confirmed records. A title such as "Service" or "Cleaning" never completes multiple rules.

## Record validation

- Mileage and date default to current odometer and today but remain editable.
- Confirmed mileage must be a non-negative whole number no greater than the vehicle odometer.
- Confirmed date must be a real calendar date no later than today.
- Historical records never update or reduce the vehicle odometer.
- Multiple actions may share mileage/date.
- A duplicate is the same vehicle, component, action, confirmed mileage, and confirmed date. The user is warned and may explicitly continue.
- A condition-linked inspection requires a condition result.
- Edit preserves `createdAt`, changes `updatedAt`, and revalidates ownership and all fields.
- Delete requires confirmation. Projection is recalculated from remaining records.
- A service package inserts only selected actions. Generic work has no scheduling effect.

## Projection statuses

```ts
type MaintenanceTaskStatus =
  | 'upcoming'
  | 'due_soon'
  | 'due'
  | 'overdue'
  | 'completed_confirmed'
  | 'history_unknown_recommend_service'
  | 'history_unknown_request_record'
  | 'condition_attention'
  | 'historical_unverified'
  | 'not_applicable'
  | 'no_fixed_interval';
```

Rules project as follows:

- Fixed scheduled replacement with no confirmed baseline: `history_unknown_recommend_service`; no fabricated due mileage.
- Scheduled inspect/clean/adjust/lubricate/test/tighten with no baseline: `history_unknown_request_record`.
- Condition replacement: `no_fixed_interval` until a condition result requires attention; never a kilometre countdown.
- Manual-only guidance: `no_fixed_interval`.
- Initial rule outside its window: `historical_unverified`.
- Exact compatible record: calculate from that action only and apply the matching vehicle preference.
- Explicit Never done: use the confirmed new-vehicle/zero baseline only when the user chose it.

## Deterministic priority

Priority is calculated once in the domain and reused by Home, Maintenance, and notifications:

1. Safety-critical `replace_now`.
2. Other safety-critical condition attention.
3. Confirmed overdue maintenance.
4. Confirmed due replacement.
5. Confirmed due inspection/service.
6. Due soon.
7. Important unknown fixed-change history.
8. One finish-history-setup reminder.
9. Upcoming and informational items.

Ties prefer safety-critical, then replacement, then smaller remaining distance/date, then stable user-facing component order. Home deduplicates by presentation component so one air-filter group cannot occupy all slots.

## Production presentation boundary

The production view model may expose only:

- user-facing component/group label;
- natural action phrase;
- status wording;
- last relevant confirmed record;
- next due mileage/date and remaining distance/time;
- active and recommended intervals where relevant;
- last condition and short practical guidance;
- meaningful technician guidance;
- record/history actions.

It must not expose source objects, filenames, pages, table rows, original text, confidence enums, rule IDs, profile versions, validation status, migration terms, or extraction notes. A non-production diagnostics build may inspect those fields separately.

## Exact engine-oil owner override

The active New Symphony ST 200 rule is:

```ts
{
  id: 'engine-oil.replace.recurring-1000km',
  componentId: 'engine-oil',
  userLabel: 'Engine oil change',
  action: 'replace',
  schedule: { type: 'recurring_distance', intervalKm: 1000 },
  confidence: 'owner_confirmed',
  source: {
    sourceType: 'project_owner_override',
    decisionId: 'owner-new-symphony-st-200-oil-1000km',
    decisionDate: '2026-08-01',
    decisionNote: 'Exact-profile override resolving conflicting manual guidance.'
  },
  supportingSources: [/* conflicting official page 15 and page 26 evidence */]
}
```

This is an exact-profile default, not a universal policy and not an unambiguous manual claim.
