export type MaintenanceAction =
  | 'inspect'
  | 'replace'
  | 'clean'
  | 'adjust'
  | 'lubricate'
  | 'test'
  | 'tighten'
  | 'initial_service'
  | 'condition_check';

export type ScheduleType =
  | 'one_time_initial'
  | 'recurring_distance'
  | 'recurring_time'
  | 'recurring_distance_or_time'
  | 'condition_based'
  | 'inspection_with_condition_replacement'
  | 'manual_only_or_no_fixed_interval';

export type RuleConfidence = 'explicit' | 'interpreted' | 'owner_confirmed' | 'unclear';
export type ProfileStatus = 'draft' | 'extracted' | 'needs_review' | 'validated' | 'production_ready';
export type InspectionResult =
  | 'healthy'
  | 'cleaning_needed'
  | 'monitor'
  | 'service_soon'
  | 'replace_soon'
  | 'replace_now'
  | 'unable_to_inspect';

export type HistoryConfidence =
  | 'confirmed'
  | 'estimated'
  | 'unknown'
  | 'historical_unverified'
  | 'legacy_unmapped';

export type IntervalSource = 'profile_default' | 'user_custom' | 'workshop_recommendation';

export type MaintenanceSourceType =
  | 'official_manual'
  | 'official_service_manual'
  | 'official_bulletin'
  | 'project_owner_override'
  | 'verified_external_source';

export type TechnicianLevel = 'user_checkable' | 'workshop_recommended' | 'workshop_required';
export type RuleHistoryKnowledge =
  | 'known_no_prior_completion'
  | 'known_from_events'
  | 'not_applicable'
  | 'unknown'
  | 'legacy_needs_confirmation';

export type MaintenanceCategory =
  | 'engine_and_lubrication'
  | 'fuel_and_intake'
  | 'ignition'
  | 'cooling'
  | 'transmission_and_cvt'
  | 'brakes'
  | 'wheels_and_tires'
  | 'steering_and_suspension'
  | 'electrical_system'
  | 'chassis_and_fasteners'
  | 'emissions_systems'
  | 'general_safety_inspections';

export type MaintenanceSource = {
  sourceType?: MaintenanceSourceType;
  manualId?: string;
  filename?: string;
  page?: number;
  section?: string;
  tableRow?: string;
  originalText?: string;
};

export type ScheduleDefinition = {
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
};

export type MaintenanceRule = {
  id: string;
  componentId: string;
  category: MaintenanceCategory;
  label: string;
  applicable: boolean;
  action: MaintenanceAction;
  schedule: ScheduleDefinition;
  safetyCritical: boolean;
  technicianRecommended: boolean;
  userInspectable: boolean;
  technicianLevel?: TechnicianLevel;
  profileRecommendedIntervalKm?: number;
  presentation?: {
    componentGroupId?: string;
    userLabel?: string;
    surface?: 'individual' | 'workshop_group' | 'background_checklist';
  };
  conditionFollowUp?: {
    ruleId: string;
    triggerResults: Exclude<InspectionResult, 'healthy'>[];
  };
  baselineRuleIds?: string[];
  suppressWhileRuleOutstanding?: string[];
  instructions?: string;
  notes?: string;
  source: MaintenanceSource;
  supportingSources?: MaintenanceSource[];
  confidence: RuleConfidence;
  ambiguity?: {
    description: string;
    alternatives: { schedule: ScheduleDefinition; sources: MaintenanceSource[] }[];
    safeBehavior: 'no_automatic_reminder' | 'informational_only';
  };
};

export type ScooterMaintenanceProfile = {
  schemaVersion: number;
  id: string;
  profileVersion: string;
  status: ProfileStatus;
  manufacturer: string;
  model: string;
  modelCodes: string[];
  engine: {
    marketedDisplacementClass?: string;
    displacementCc: number | null;
    engineFamily?: string;
    cycle?: string;
    cooling: 'air' | 'liquid' | 'unknown';
    coolingConfidence?: RuleConfidence;
    notes?: string;
  };
  supportedYears: { from: number; to: number | null; confidence?: string };
  markets: string[];
  catalogSelection: {
    brandId: string;
    modelId: string;
    versionId: string;
    variantId: string;
  };
  manual: { id: string; filename: string; pageCount: number };
  identitySources: MaintenanceSource[];
  manualLegend: Record<string, unknown>;
  severeUseGuidance: { text: string; source: MaintenanceSource }[];
  profileAmbiguities: {
    id: string;
    critical: boolean;
    description: string;
    safeBehavior: 'no_automatic_reminder' | 'informational_only';
    resolutionRequired?: string;
  }[];
  initialServicePolicy?: {
    actionableUntilKm: number;
    afterWindowBehavior: 'historical_unverified';
  };
  rules: MaintenanceRule[];
};

export type MaintenanceComponentDefinition = {
  id: string;
  category: MaintenanceCategory;
  label: string;
  description: string;
  defaultSafetyCritical: boolean;
  allowedActions: MaintenanceAction[];
};

export type MaintenanceCatalogue = {
  schemaVersion: number;
  description: string;
  categories: { id: MaintenanceCategory; label: string }[];
  components: MaintenanceComponentDefinition[];
};

export type MaintenanceEvent = {
  id: string;
  vehicleId: number;
  profileId: string;
  profileVersion: string;
  ruleId: string;
  componentId: string;
  action: MaintenanceAction;
  performedOn: string;
  odometerKm: number | null;
  mileageConfidence?: HistoryConfidence;
  dateConfidence?: HistoryConfidence;
  inspectionResult?: InspectionResult | null;
  notes?: string;
  cost?: number | null;
  serviceProvider?: string | null;
  recordSource?: 'planner' | 'manual_entry' | 'history_onboarding' | 'legacy' | 'import';
  createdAt?: string;
  updatedAt?: string;
  migratedFromLegacyId?: number;
  migrationConfidence?: 'exact' | 'needs_user_confirmation';
};

export type TaskStatus =
  | 'upcoming'
  | 'due_soon'
  | 'due'
  | 'overdue'
  | 'completed_confirmed'
  | 'history_unknown_recommend_service'
  | 'history_unknown_request_record'
  | 'historical_unverified'
  | 'not_applicable'
  | 'no_fixed_interval'
  /** @deprecated Kept while older screens migrate to differentiated history states. */
  | 'unknown'
  /** @deprecated Kept while older screens migrate to no_fixed_interval. */
  | 'informational'
  | 'condition_attention';

export type MaintenanceTaskProjection = {
  key: string;
  ruleId: string;
  componentId: string;
  action: MaintenanceAction;
  label: string;
  scheduleType: ScheduleType;
  status: TaskStatus;
  dueAtKm: number | null;
  dueOn: string | null;
  dueBy: 'distance' | 'time' | 'both' | 'condition' | 'manual' | 'unknown';
  lastPerformedAtKm: number | null;
  lastPerformedOn: string | null;
  remainingKm: number | null;
  remainingDays: number | null;
  profileRecommendedIntervalKm: number | null;
  originalIntervalMonths: number | null;
  effectiveIntervalKm: number | null;
  effectiveIntervalMonths: number | null;
  distanceEnabled: boolean;
  timeEnabled: boolean;
  conditionBasedDefault: boolean;
  customConditionReminderEnabled: boolean;
  reminderDisabled: boolean;
  intervalSource: IntervalSource;
  conditionResult?: InspectionResult;
  title: string;
  reason: string;
  source: MaintenanceSource;
  safetyCritical: boolean;
  technicianRecommended: boolean;
  userInspectable: boolean;
  technicianLevel: TechnicianLevel;
  isOneTime: boolean;
  instructions?: string;
  ambiguity?: MaintenanceRule['ambiguity'];
};

export type VehicleMaintenancePreference = {
  vehicleId: number;
  profileId?: string;
  componentId: string;
  action: MaintenanceAction;
  profileRecommendedIntervalKm?: number | null;
  originalIntervalKm?: number | null;
  originalIntervalMonths?: number | null;
  userIntervalKm?: number | null;
  customIntervalKm?: number | null;
  customIntervalMonths?: number | null;
  effectiveIntervalKm?: number | null;
  effectiveIntervalMonths?: number | null;
  distanceEnabled?: boolean;
  timeEnabled?: boolean;
  conditionBasedDefault?: boolean;
  customConditionReminderEnabled?: boolean;
  /** Opt-in tracking: null = default, true = explicitly tracked, false = explicitly hidden. */
  tracked?: boolean | null;
  intervalSource: IntervalSource;
  reason?: string;
  changedAt: string;
  longerThanRecommendedConfirmed?: boolean;
};

export type MaintenanceProjectionInput = {
  profile: ScooterMaintenanceProfile;
  currentOdometerKm: number;
  vehicleId?: number;
  now: Date;
  events: MaintenanceEvent[];
  preferences?: VehicleMaintenancePreference[];
  historyByRule?: Partial<Record<string, RuleHistoryKnowledge>>;
  historyByAction?: Partial<Record<string, RuleHistoryKnowledge>>;
  defaultHistoryKnowledge?: RuleHistoryKnowledge;
  vehicleInServiceDate?: string | null;
};
