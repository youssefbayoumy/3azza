export type KnowledgeSection =
  | 'maintenance_schedule'
  | 'specifications'
  | 'fluids'
  | 'pre_ride_inspection'
  | 'warning_lights'
  | 'dashboard_indicators'
  | 'troubleshooting'
  | 'safety'
  | 'break_in'
  | 'conflicts'
  | 'missing_data';

export type KnowledgeOrigin = 'manual' | '3azza_policy' | 'user_override' | 'conflict' | 'missing';

export type VehicleModelSelection = {
  scooter_brand_id: string | null;
  scooter_model_id: string | null;
  scooter_version_id: string | null;
  scooter_variant_id?: string | null;
};

export type ModelVariant = {
  id: string;
  name: string;
};

export type KnowledgeRecord = {
  recordId: string;
  section: KnowledgeSection;
  subject: string;
  subsection: string | null;
  modelScope: string[];
  pages: number[];
  value: unknown;
  attributes: Record<string, unknown>;
};

export type ConflictRecord = KnowledgeRecord & {
  alternatives: { label: string; value: unknown; pages: number[] }[];
};

export type MaintenanceGuidance = {
  recordId: string;
  value: unknown;
  pages: number[];
};

export type MaintenanceRecommendation = {
  canonicalId: string;
  name: string;
  action: 'check' | 'clean' | 'replace';
  manualIntervalKm: number | null;
  manualIntervalMonths: number | null;
  recommendedIntervalKm: number | null;
  recommendationOrigin: 'manual' | '3azza_policy';
  initialDistanceKm: number[];
  severeUseNotes: string[];
  guidance: MaintenanceGuidance[];
  sourceRecordIds: string[];
  pages: number[];
  policyId?: string;
  policyCaveats?: string[];
};

export type ModelKnowledgeProfile = {
  catalogVersionId: string;
  brandId: string;
  modelId: string;
  manualId: string;
  brandName: string;
  modelName: string;
  manualYears: string;
  manualVersion: string;
  pageCount: number;
  variants: ModelVariant[];
  requiresVariant: boolean;
  maintenanceTasks: MaintenanceRecommendation[];
  records: KnowledgeRecord[];
  conflicts: ConflictRecord[];
};

export type ApplicableSpecification = {
  id: string;
  recordId: string;
  label: string;
  category: 'dimensions' | 'engine' | 'fluids' | 'tires' | 'brakes' | 'electrical' | 'chassis' | 'other';
  value: unknown;
  pages: number[];
  modelScope: string[];
  applicability: 'shared' | 'exact_variant' | 'variant_alternative';
  variantLabel: string | null;
};

export type ApplicableSpecifications = {
  shared: ApplicableSpecification[];
  exactVariant: ApplicableSpecification[];
  variantAlternatives: ApplicableSpecification[];
};

export type ModelKnowledgeBase = {
  schemaVersion: number;
  sourceDatabase: string;
  sourceSchemaVersion: string;
  quality: {
    mergeReady: boolean;
    manualCount: number;
    normalizedRecordCount: number;
    specificationFactCount: number;
    preservedConflictCount: number;
  };
  applicationPolicyOverrides: unknown[];
  profiles: ModelKnowledgeProfile[];
};
