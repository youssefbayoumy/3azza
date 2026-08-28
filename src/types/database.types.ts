export type MaintenanceHistoryLevel =
  | 'not_asked'
  | 'detailed_records'
  | 'recent_memory'
  | 'little_or_none'
  | 'skipped';

export type VehiclePurchaseCondition = 'new' | 'used' | 'unknown';

export type MaintenanceRecordConfidence =
  | 'confirmed'
  | 'estimated'
  | 'unknown'
  | 'historical_unverified'
  | 'legacy_unmapped';

export type MaintenanceRecordSource =
  | 'maintenance_planner'
  | 'manual_entry'
  | 'history_onboarding'
  | 'service_package'
  | 'backup_restore'
  | 'legacy';

export type MaintenanceMigrationStatus =
  | 'confirmed'
  | 'legacy_unmapped'
  // Accepted while reading/restoring pre-v15 data.
  | 'exact'
  | 'legacy_needs_confirmation';

export type MaintenanceIntervalSource =
  | 'profile_default'
  | 'user_custom'
  | 'workshop_recommendation';

export type MaintenanceHistoryStateValue =
  | 'confirmed'
  | 'estimated'
  | 'unknown'
  | 'never_done'
  | 'not_applicable'
  | 'historical_unverified'
  | 'legacy_unmapped';

export interface VehicleProfile {
  id: number;
  name: string;
  current_mileage: number;
  total_km_range: number;
  has_completed_setup: number;
  service_history_setup_completed: number;
  maintenance_history_level?: MaintenanceHistoryLevel;
  created_at: string;
  daily_average_km: number;
  last_odometer_update_timestamp: string | null;
  tank_capacity_liters: number | null;
  scooter_brand_id: string | null;
  scooter_model_id: string | null;
  scooter_version_id: string | null;
  scooter_variant_id?: string | null;
  vehicle_selection_mode?: 'catalog' | 'custom_brand';
  custom_brand_name?: string | null;
  custom_model_name?: string | null;
  vehicle_capabilities_version: number;
  vehicle_capabilities_json: string;
  /** Missing only while normalizing pre-v21 backups. */
  purchase_condition?: VehiclePurchaseCondition;
  /** Missing only while normalizing pre-v21 backups. */
  maintenance_started_at?: string | null;
}

export interface VehicleVitals {
  id: number;
  vehicle_id: number;
  oil_life_pct: number;
  tire_pressure_psi: number;
  battery_health_pct: number;
  coolant_temp_c: number;
  brake_pad_pct: number;
  updated_at: string;
}

export interface GasLog {
  id: number;
  vehicle_id: number;
  liters: number;
  cost: number;
  odometer_km: number;
  station: string | null;
  logged_at: string;
  logged_on: string;
  is_full_tank: number;
}

export interface InventoryItem {
  id: number;
  vehicle_id: number;
  name: string;
  category: string;
  status: 'In Stock' | 'Low' | 'Out';
  quantity: number;
  last_replaced_at: string | null;
}

export interface DocumentItem {
  id: number;
  vehicle_id: number;
  title: string;
  image_uri: string;
  expiry_date: string | null;
  added_at: string;
}

export interface PreRideState {
  id: number;
  vehicle_id: number;
  brakes_checked: number;
  tires_checked: number;
  lights_checked: number;
  oil_checked: number;
  last_run_at: string | null;
}

export interface ServiceLog {
  id: number;
  vehicle_id: number;
  title: string;
  date: string;
  mileage: number;
  category: string;
  notes: string;
  cost: number | null;
  service_type: string | null;
  sets_odometer_baseline: number;
  maintenance_rule_id?: string | null;
  maintenance_component_id?: string | null;
  maintenance_action?: string | null;
  maintenance_profile_id?: string | null;
  maintenance_profile_version?: string | null;
  inspection_result?: string | null;
  maintenance_migration_status?: MaintenanceMigrationStatus;
  maintenance_mileage_confidence?: MaintenanceRecordConfidence;
  maintenance_date_confidence?: MaintenanceRecordConfidence;
  maintenance_record_source?: MaintenanceRecordSource;
  service_provider?: string | null;
  service_package_id?: string | null;
  service_package_title?: string | null;
  oil_brand?: string | null;
  oil_type?: string | null;
  oil_viscosity?: string | null;
  oil_notes?: string | null;
  duplicate_confirmed?: number;
  created_at?: string;
  updated_at?: string;
}

export interface MaintenancePreference {
  id: number;
  vehicle_id: number;
  profile_id: string | null;
  component_id: string;
  action: string;
  profile_recommended_interval_km: number | null;
  user_interval_km: number | null;
  effective_interval_km: number | null;
  original_interval_km?: number | null;
  original_interval_months?: number | null;
  custom_interval_km?: number | null;
  custom_interval_months?: number | null;
  effective_interval_months?: number | null;
  distance_enabled?: number;
  time_enabled?: number;
  condition_based_default?: number;
  custom_condition_reminder_enabled?: number;
  tracked?: number | null;
  interval_source: MaintenanceIntervalSource;
  longer_than_recommended_confirmed: number;
  reason: string | null;
  created_at: string;
  updated_at: string;
}

export interface MaintenanceHistoryState {
  vehicle_id: number;
  profile_id: string | null;
  component_id: string;
  action: string;
  history_state: MaintenanceHistoryStateValue;
  last_service_log_id: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export type OdometerEventType =
  | 'confirmed_reading'
  | 'correction'
  | 'instrument_cluster_replacement';

/**
 * Audit model used by odometer correction and prepared for a future cluster
 * replacement flow. `effective` is lifetime distance; `displayed` is the
 * physical cluster reading.
 */
export interface OdometerEvent {
  id: number;
  vehicle_id: number;
  event_type: OdometerEventType;
  previous_effective_km: number;
  new_effective_km: number;
  previous_displayed_km: number | null;
  new_displayed_km: number | null;
  reason: string;
  recorded_at: string;
}

export interface ServiceInterval {
  id: number;
  vehicle_id: number;
  name: string;
  interval_km: number | null;
  last_service_odometer_km: number;
  has_known_odometer_baseline: number;
  type: string;
  canonical_task_id?: string | null;
  recommended_interval_km?: number | null;
  recommended_interval_months?: number | null;
  user_interval_km?: number | null;
  user_override_active?: number;
  recommendation_origin?: 'manual' | '3azza_policy' | 'user_override';
  source_manual_id?: string | null;
  source_pages_json?: string | null;
  manual_guidance_json?: string | null;
  initial_milestones_json?: string | null;
  severe_use_note?: string | null;
  is_applicable?: number;
  last_service_date?: string | null;
}

export interface PreRideRun {
  id: number;
  vehicle_id: number;
  manual_id: string;
  variant_id: string | null;
  completed_at: string;
  items_json: string;
  completed_count: number;
  total_count: number;
}
