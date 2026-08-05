export const CURRENT_SCHEMA_VERSION = 17;

/**
 * Installs the narrow database capability used by the dedicated odometer-correction
 * transaction. The short-lived authorization row is consumed by the audit trigger
 * in the same transaction, so a normal vehicle update can never roll mileage back.
 */
export const ODOMETER_CORRECTION_SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS odometer_correction_authorizations (
    vehicle_id INTEGER PRIMARY KEY,
    previous_effective_km INTEGER NOT NULL,
    new_effective_km INTEGER NOT NULL,
    reason TEXT NOT NULL,
    authorized_at TEXT NOT NULL,
    CHECK (typeof(previous_effective_km) = 'integer' AND previous_effective_km >= 0),
    CHECK (typeof(new_effective_km) = 'integer' AND new_effective_km >= 0),
    CHECK (new_effective_km < previous_effective_km),
    CHECK (length(trim(reason)) > 0),
    CHECK (length(trim(authorized_at)) > 0)
  );

  DROP TRIGGER IF EXISTS prevent_vehicle_odometer_rollback;
  DROP TRIGGER IF EXISTS record_authorized_odometer_correction;
  DROP TRIGGER IF EXISTS prevent_invalid_odometer_event_insert;

  CREATE TRIGGER prevent_vehicle_odometer_rollback
  BEFORE UPDATE OF current_mileage ON vehicle_profile
  WHEN NEW.current_mileage < 0
    OR NEW.current_mileage < COALESCE((
      SELECT MAX(mileage) FROM service_logs
      WHERE service_logs.vehicle_id = OLD.id AND sets_odometer_baseline = 1
    ), 0)
    OR NEW.current_mileage < COALESCE((
      SELECT MAX(odometer_km) FROM gas_logs
      WHERE gas_logs.vehicle_id = OLD.id AND odometer_km >= 0
    ), 0)
    OR NEW.current_mileage < COALESCE((
      SELECT MAX(last_service_odometer_km) FROM service_intervals
      WHERE service_intervals.vehicle_id = OLD.id AND has_known_odometer_baseline = 1
    ), 0)
    OR (
      NEW.current_mileage < OLD.current_mileage
      AND NOT EXISTS (
        SELECT 1 FROM odometer_correction_authorizations authorization
        WHERE authorization.vehicle_id = OLD.id
          AND authorization.previous_effective_km = OLD.current_mileage
          AND authorization.new_effective_km = NEW.current_mileage
          AND length(trim(authorization.reason)) > 0
      )
    )
  BEGIN
    SELECT RAISE(ABORT, 'Odometer reading cannot move backwards');
  END;

  CREATE TRIGGER record_authorized_odometer_correction
  AFTER UPDATE OF current_mileage ON vehicle_profile
  WHEN NEW.current_mileage < OLD.current_mileage
  BEGIN
    INSERT INTO odometer_events (
      vehicle_id, event_type, previous_effective_km, new_effective_km,
      previous_displayed_km, new_displayed_km, reason, recorded_at
    )
    SELECT
      OLD.id, 'correction', OLD.current_mileage, NEW.current_mileage,
      OLD.current_mileage, NEW.current_mileage, trim(authorization.reason), authorization.authorized_at
    FROM odometer_correction_authorizations authorization
    WHERE authorization.vehicle_id = OLD.id
      AND authorization.previous_effective_km = OLD.current_mileage
      AND authorization.new_effective_km = NEW.current_mileage;

    DELETE FROM odometer_correction_authorizations
    WHERE vehicle_id = OLD.id
      AND previous_effective_km = OLD.current_mileage
      AND new_effective_km = NEW.current_mileage;
  END;

  CREATE TRIGGER prevent_invalid_odometer_event_insert
  BEFORE INSERT ON odometer_events
  WHEN NEW.event_type NOT IN ('confirmed_reading', 'correction', 'instrument_cluster_replacement')
    OR typeof(NEW.previous_effective_km) != 'integer' OR NEW.previous_effective_km < 0
    OR typeof(NEW.new_effective_km) != 'integer' OR NEW.new_effective_km < 0
    OR (NEW.event_type = 'correction' AND NEW.new_effective_km >= NEW.previous_effective_km)
    OR (NEW.previous_displayed_km IS NOT NULL
      AND (typeof(NEW.previous_displayed_km) != 'integer' OR NEW.previous_displayed_km < 0))
    OR (NEW.new_displayed_km IS NOT NULL
      AND (typeof(NEW.new_displayed_km) != 'integer' OR NEW.new_displayed_km < 0))
    OR trim(NEW.reason) = ''
  BEGIN
    SELECT RAISE(ABORT, 'Odometer event is invalid');
  END;
`;

/** Canonical schema for a new install. Existing databases continue through versioned migrations. */
export const CURRENT_SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS app_meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY,
    applied_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE vehicle_profile (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL DEFAULT 'Primary Vehicle',
    current_mileage INTEGER NOT NULL DEFAULT 0,
    total_km_range INTEGER NOT NULL DEFAULT 0,
    has_completed_setup INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    daily_average_km INTEGER NOT NULL DEFAULT 0,
    last_odometer_update_timestamp TEXT,
    service_history_setup_completed INTEGER NOT NULL DEFAULT 0,
    maintenance_history_level TEXT NOT NULL DEFAULT 'not_asked',
    tank_capacity_liters REAL,
    scooter_brand_id TEXT,
    scooter_model_id TEXT,
    scooter_version_id TEXT,
    scooter_variant_id TEXT
  );

  CREATE TABLE vehicle_vitals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    vehicle_id INTEGER NOT NULL UNIQUE,
    oil_life_pct INTEGER NOT NULL DEFAULT 0,
    tire_pressure_psi INTEGER NOT NULL DEFAULT 0,
    battery_health_pct INTEGER NOT NULL DEFAULT 0,
    coolant_temp_c INTEGER NOT NULL DEFAULT 0,
    brake_pad_pct INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE gas_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    liters REAL NOT NULL,
    cost REAL NOT NULL,
    odometer_km INTEGER NOT NULL,
    station TEXT,
    logged_at TEXT NOT NULL DEFAULT (datetime('now')),
    vehicle_id INTEGER NOT NULL DEFAULT 1,
    is_full_tank INTEGER NOT NULL DEFAULT 0,
    logged_on TEXT NOT NULL
  );

  CREATE TABLE inventory_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'In Stock',
    quantity INTEGER NOT NULL DEFAULT 0,
    last_replaced_at TEXT,
    vehicle_id INTEGER NOT NULL DEFAULT 1
  );

  CREATE TABLE documents_vault (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    image_uri TEXT NOT NULL,
    expiry_date TEXT,
    added_at TEXT NOT NULL DEFAULT (datetime('now')),
    vehicle_id INTEGER NOT NULL DEFAULT 1
  );

  CREATE TABLE pre_ride_checks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    vehicle_id INTEGER NOT NULL UNIQUE,
    brakes_checked INTEGER NOT NULL DEFAULT 0,
    tires_checked INTEGER NOT NULL DEFAULT 0,
    lights_checked INTEGER NOT NULL DEFAULT 0,
    oil_checked INTEGER NOT NULL DEFAULT 0,
    last_run_at TEXT
  );

  CREATE TABLE pre_ride_runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    vehicle_id INTEGER NOT NULL,
    manual_id TEXT NOT NULL,
    variant_id TEXT,
    completed_at TEXT NOT NULL,
    items_json TEXT NOT NULL,
    completed_count INTEGER NOT NULL,
    total_count INTEGER NOT NULL
  );

  CREATE TABLE service_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    date TEXT NOT NULL,
    mileage INTEGER NOT NULL,
    category TEXT NOT NULL,
    notes TEXT NOT NULL,
    cost REAL,
    service_type TEXT,
    vehicle_id INTEGER NOT NULL DEFAULT 1,
    sets_odometer_baseline INTEGER NOT NULL DEFAULT 0,
    maintenance_rule_id TEXT,
    maintenance_component_id TEXT,
    maintenance_action TEXT,
    maintenance_profile_id TEXT,
    maintenance_profile_version TEXT,
    inspection_result TEXT,
    maintenance_migration_status TEXT NOT NULL DEFAULT 'legacy_unmapped',
    maintenance_mileage_confidence TEXT NOT NULL DEFAULT 'legacy_unmapped',
    maintenance_date_confidence TEXT NOT NULL DEFAULT 'legacy_unmapped',
    maintenance_record_source TEXT NOT NULL DEFAULT 'legacy',
    service_provider TEXT,
    service_package_id TEXT,
    service_package_title TEXT,
    oil_brand TEXT,
    oil_type TEXT,
    oil_viscosity TEXT,
    oil_notes TEXT,
    duplicate_confirmed INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  );

  CREATE TABLE service_intervals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    vehicle_id INTEGER NOT NULL DEFAULT 1,
    name TEXT NOT NULL,
    interval_km INTEGER,
    last_service_odometer_km INTEGER NOT NULL DEFAULT 0,
    type TEXT NOT NULL,
    has_known_odometer_baseline INTEGER NOT NULL DEFAULT 0,
    canonical_task_id TEXT,
    recommended_interval_km INTEGER,
    recommended_interval_months INTEGER,
    user_interval_km INTEGER,
    user_override_active INTEGER NOT NULL DEFAULT 0,
    recommendation_origin TEXT NOT NULL DEFAULT 'manual',
    source_manual_id TEXT,
    source_pages_json TEXT,
    manual_guidance_json TEXT,
    initial_milestones_json TEXT,
    severe_use_note TEXT,
    is_applicable INTEGER NOT NULL DEFAULT 1,
    last_service_date TEXT,
    UNIQUE(vehicle_id, name)
  );

  CREATE TABLE maintenance_preferences (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    vehicle_id INTEGER NOT NULL,
    profile_id TEXT,
    component_id TEXT NOT NULL,
    action TEXT NOT NULL,
    profile_recommended_interval_km INTEGER,
    user_interval_km INTEGER,
    effective_interval_km INTEGER,
    original_interval_km INTEGER,
    original_interval_months INTEGER,
    custom_interval_km INTEGER,
    custom_interval_months INTEGER,
    effective_interval_months INTEGER,
    distance_enabled INTEGER NOT NULL DEFAULT 0,
    time_enabled INTEGER NOT NULL DEFAULT 0,
    condition_based_default INTEGER NOT NULL DEFAULT 0,
    custom_condition_reminder_enabled INTEGER NOT NULL DEFAULT 0,
    interval_source TEXT NOT NULL DEFAULT 'profile_default',
    longer_than_recommended_confirmed INTEGER NOT NULL DEFAULT 0,
    reason TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    UNIQUE(vehicle_id, profile_id, component_id, action)
  );

  CREATE TABLE maintenance_history_states (
    vehicle_id INTEGER NOT NULL,
    profile_id TEXT,
    component_id TEXT NOT NULL,
    action TEXT NOT NULL,
    history_state TEXT NOT NULL DEFAULT 'unknown',
    last_service_log_id INTEGER,
    notes TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    PRIMARY KEY(vehicle_id, profile_id, component_id, action)
  );

  CREATE TABLE odometer_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    vehicle_id INTEGER NOT NULL,
    event_type TEXT NOT NULL,
    previous_effective_km INTEGER NOT NULL,
    new_effective_km INTEGER NOT NULL,
    previous_displayed_km INTEGER,
    new_displayed_km INTEGER,
    reason TEXT NOT NULL,
    recorded_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  );

  ${ODOMETER_CORRECTION_SCHEMA_SQL}

  CREATE TRIGGER prevent_invalid_inventory_quantity_insert
  BEFORE INSERT ON inventory_items
  WHEN typeof(NEW.quantity) != 'integer' OR NEW.quantity < 0
  BEGIN
    SELECT RAISE(ABORT, 'Inventory quantity must be a non-negative whole number');
  END;

  CREATE TRIGGER prevent_invalid_inventory_quantity_update
  BEFORE UPDATE OF quantity ON inventory_items
  WHEN typeof(NEW.quantity) != 'integer' OR NEW.quantity < 0
  BEGIN
    SELECT RAISE(ABORT, 'Inventory quantity must be a non-negative whole number');
  END;

  CREATE TRIGGER prevent_invalid_vehicle_vitals_insert
  BEFORE INSERT ON vehicle_vitals
  WHEN typeof(NEW.oil_life_pct) != 'integer' OR NEW.oil_life_pct NOT BETWEEN 0 AND 100
    OR typeof(NEW.tire_pressure_psi) != 'integer' OR NEW.tire_pressure_psi < 0
    OR typeof(NEW.battery_health_pct) != 'integer' OR NEW.battery_health_pct NOT BETWEEN 0 AND 100
    OR typeof(NEW.coolant_temp_c) != 'integer' OR NEW.coolant_temp_c < 0
    OR typeof(NEW.brake_pad_pct) != 'integer' OR NEW.brake_pad_pct NOT BETWEEN 0 AND 100
  BEGIN
    SELECT RAISE(ABORT, 'Vehicle readings are outside their valid ranges');
  END;

  CREATE TRIGGER prevent_invalid_vehicle_vitals_update
  BEFORE UPDATE OF oil_life_pct, tire_pressure_psi, battery_health_pct, coolant_temp_c, brake_pad_pct
  ON vehicle_vitals
  WHEN typeof(NEW.oil_life_pct) != 'integer' OR NEW.oil_life_pct NOT BETWEEN 0 AND 100
    OR typeof(NEW.tire_pressure_psi) != 'integer' OR NEW.tire_pressure_psi < 0
    OR typeof(NEW.battery_health_pct) != 'integer' OR NEW.battery_health_pct NOT BETWEEN 0 AND 100
    OR typeof(NEW.coolant_temp_c) != 'integer' OR NEW.coolant_temp_c < 0
    OR typeof(NEW.brake_pad_pct) != 'integer' OR NEW.brake_pad_pct NOT BETWEEN 0 AND 100
  BEGIN
    SELECT RAISE(ABORT, 'Vehicle readings are outside their valid ranges');
  END;

  CREATE TRIGGER prevent_invalid_service_history_setup_flag_insert
  BEFORE INSERT ON vehicle_profile
  WHEN NEW.service_history_setup_completed NOT IN (0, 1)
  BEGIN
    SELECT RAISE(ABORT, 'Service history setup flag must be 0 or 1');
  END;

  CREATE TRIGGER prevent_invalid_service_history_setup_flag
  BEFORE UPDATE OF service_history_setup_completed ON vehicle_profile
  WHEN NEW.service_history_setup_completed NOT IN (0, 1)
  BEGIN
    SELECT RAISE(ABORT, 'Service history setup flag must be 0 or 1');
  END;

  CREATE TRIGGER prevent_invalid_maintenance_history_level_insert
  BEFORE INSERT ON vehicle_profile
  WHEN NEW.maintenance_history_level NOT IN (
    'not_asked', 'detailed_records', 'recent_memory', 'little_or_none', 'skipped'
  )
  BEGIN
    SELECT RAISE(ABORT, 'Maintenance history level is invalid');
  END;

  CREATE TRIGGER prevent_invalid_maintenance_history_level_update
  BEFORE UPDATE OF maintenance_history_level ON vehicle_profile
  WHEN NEW.maintenance_history_level NOT IN (
    'not_asked', 'detailed_records', 'recent_memory', 'little_or_none', 'skipped'
  )
  BEGIN
    SELECT RAISE(ABORT, 'Maintenance history level is invalid');
  END;

  CREATE TRIGGER prevent_invalid_service_baseline_flag_insert
  BEFORE INSERT ON service_logs
  WHEN NEW.sets_odometer_baseline NOT IN (0, 1)
  BEGIN
    SELECT RAISE(ABORT, 'Service baseline flag must be 0 or 1');
  END;

  CREATE TRIGGER prevent_invalid_service_baseline_flag_update
  BEFORE UPDATE OF sets_odometer_baseline ON service_logs
  WHEN NEW.sets_odometer_baseline NOT IN (0, 1)
  BEGIN
    SELECT RAISE(ABORT, 'Service baseline flag must be 0 or 1');
  END;

  CREATE TRIGGER prevent_invalid_maintenance_record_insert
  BEFORE INSERT ON service_logs
  WHEN NEW.duplicate_confirmed NOT IN (0, 1)
    OR NEW.maintenance_migration_status NOT IN (
      'confirmed', 'legacy_unmapped', 'exact', 'legacy_needs_confirmation'
    )
    OR NEW.maintenance_mileage_confidence NOT IN (
      'confirmed', 'estimated', 'unknown', 'historical_unverified', 'legacy_unmapped'
    )
    OR NEW.maintenance_date_confidence NOT IN (
      'confirmed', 'estimated', 'unknown', 'historical_unverified', 'legacy_unmapped'
    )
    OR NEW.maintenance_record_source NOT IN (
      'maintenance_planner', 'manual_entry', 'history_onboarding',
      'service_package', 'backup_restore', 'legacy'
    )
  BEGIN
    SELECT RAISE(ABORT, 'Maintenance record metadata is invalid');
  END;

  CREATE TRIGGER prevent_invalid_maintenance_record_update
  BEFORE UPDATE OF duplicate_confirmed, maintenance_migration_status,
    maintenance_mileage_confidence, maintenance_date_confidence, maintenance_record_source
  ON service_logs
  WHEN NEW.duplicate_confirmed NOT IN (0, 1)
    OR NEW.maintenance_migration_status NOT IN (
      'confirmed', 'legacy_unmapped', 'exact', 'legacy_needs_confirmation'
    )
    OR NEW.maintenance_mileage_confidence NOT IN (
      'confirmed', 'estimated', 'unknown', 'historical_unverified', 'legacy_unmapped'
    )
    OR NEW.maintenance_date_confidence NOT IN (
      'confirmed', 'estimated', 'unknown', 'historical_unverified', 'legacy_unmapped'
    )
    OR NEW.maintenance_record_source NOT IN (
      'maintenance_planner', 'manual_entry', 'history_onboarding',
      'service_package', 'backup_restore', 'legacy'
    )
  BEGIN
    SELECT RAISE(ABORT, 'Maintenance record metadata is invalid');
  END;

  CREATE TRIGGER prevent_invalid_maintenance_preference_insert
  BEFORE INSERT ON maintenance_preferences
  WHEN NEW.longer_than_recommended_confirmed NOT IN (0, 1)
    OR NEW.interval_source NOT IN ('profile_default', 'user_custom', 'workshop_recommendation')
    OR (NEW.profile_recommended_interval_km IS NOT NULL AND NEW.profile_recommended_interval_km <= 0)
    OR (NEW.user_interval_km IS NOT NULL AND NEW.user_interval_km <= 0)
    OR (NEW.effective_interval_km IS NOT NULL AND NEW.effective_interval_km <= 0)
    OR (NEW.original_interval_km IS NOT NULL AND NEW.original_interval_km <= 0)
    OR (NEW.original_interval_months IS NOT NULL AND NEW.original_interval_months <= 0)
    OR (NEW.custom_interval_km IS NOT NULL AND NEW.custom_interval_km <= 0)
    OR (NEW.custom_interval_months IS NOT NULL AND NEW.custom_interval_months <= 0)
    OR (NEW.effective_interval_months IS NOT NULL AND NEW.effective_interval_months <= 0)
    OR NEW.distance_enabled NOT IN (0, 1)
    OR NEW.time_enabled NOT IN (0, 1)
    OR NEW.condition_based_default NOT IN (0, 1)
    OR NEW.custom_condition_reminder_enabled NOT IN (0, 1)
  BEGIN
    SELECT RAISE(ABORT, 'Maintenance preference is invalid');
  END;

  CREATE TRIGGER prevent_invalid_maintenance_preference_update
  BEFORE UPDATE ON maintenance_preferences
  WHEN NEW.longer_than_recommended_confirmed NOT IN (0, 1)
    OR NEW.interval_source NOT IN ('profile_default', 'user_custom', 'workshop_recommendation')
    OR (NEW.profile_recommended_interval_km IS NOT NULL AND NEW.profile_recommended_interval_km <= 0)
    OR (NEW.user_interval_km IS NOT NULL AND NEW.user_interval_km <= 0)
    OR (NEW.effective_interval_km IS NOT NULL AND NEW.effective_interval_km <= 0)
    OR (NEW.original_interval_km IS NOT NULL AND NEW.original_interval_km <= 0)
    OR (NEW.original_interval_months IS NOT NULL AND NEW.original_interval_months <= 0)
    OR (NEW.custom_interval_km IS NOT NULL AND NEW.custom_interval_km <= 0)
    OR (NEW.custom_interval_months IS NOT NULL AND NEW.custom_interval_months <= 0)
    OR (NEW.effective_interval_months IS NOT NULL AND NEW.effective_interval_months <= 0)
    OR NEW.distance_enabled NOT IN (0, 1)
    OR NEW.time_enabled NOT IN (0, 1)
    OR NEW.condition_based_default NOT IN (0, 1)
    OR NEW.custom_condition_reminder_enabled NOT IN (0, 1)
  BEGIN
    SELECT RAISE(ABORT, 'Maintenance preference is invalid');
  END;

  CREATE TRIGGER prevent_invalid_maintenance_history_state_insert
  BEFORE INSERT ON maintenance_history_states
  WHEN NEW.history_state NOT IN (
    'confirmed', 'estimated', 'unknown', 'never_done', 'not_applicable',
    'historical_unverified', 'legacy_unmapped'
  )
  BEGIN
    SELECT RAISE(ABORT, 'Maintenance history state is invalid');
  END;

  CREATE TRIGGER prevent_invalid_maintenance_history_state_update
  BEFORE UPDATE OF history_state ON maintenance_history_states
  WHEN NEW.history_state NOT IN (
    'confirmed', 'estimated', 'unknown', 'never_done', 'not_applicable',
    'historical_unverified', 'legacy_unmapped'
  )
  BEGIN
    SELECT RAISE(ABORT, 'Maintenance history state is invalid');
  END;

  CREATE TRIGGER prevent_date_only_odometer_insert
  BEFORE INSERT ON service_logs
  WHEN NEW.sets_odometer_baseline = 0 AND NEW.mileage != 0
    AND NEW.maintenance_mileage_confidence NOT IN ('estimated', 'historical_unverified')
  BEGIN
    SELECT RAISE(ABORT, 'Date-only service history cannot include an odometer reading');
  END;

  CREATE TRIGGER prevent_date_only_odometer_update
  BEFORE UPDATE OF mileage, sets_odometer_baseline, maintenance_mileage_confidence ON service_logs
  WHEN NEW.sets_odometer_baseline = 0 AND NEW.mileage != 0
    AND NEW.maintenance_mileage_confidence NOT IN ('estimated', 'historical_unverified')
  BEGIN
    SELECT RAISE(ABORT, 'Date-only service history cannot include an odometer reading');
  END;

  CREATE TRIGGER prevent_invalid_interval_baseline_flag_insert
  BEFORE INSERT ON service_intervals
  WHEN NEW.has_known_odometer_baseline NOT IN (0, 1)
  BEGIN
    SELECT RAISE(ABORT, 'Interval baseline flag must be 0 or 1');
  END;

  CREATE TRIGGER prevent_invalid_interval_baseline_flag_update
  BEFORE UPDATE OF has_known_odometer_baseline ON service_intervals
  WHEN NEW.has_known_odometer_baseline NOT IN (0, 1)
  BEGIN
    SELECT RAISE(ABORT, 'Interval baseline flag must be 0 or 1');
  END;

  CREATE TRIGGER prevent_service_odometer_above_vehicle_insert
  BEFORE INSERT ON service_logs
  WHEN NOT EXISTS (SELECT 1 FROM vehicle_profile WHERE id = NEW.vehicle_id)
    OR NEW.mileage > COALESCE((SELECT current_mileage FROM vehicle_profile WHERE id = NEW.vehicle_id), -1)
  BEGIN
    SELECT RAISE(ABORT, 'Service odometer cannot exceed confirmed vehicle odometer');
  END;

  CREATE TRIGGER prevent_service_odometer_above_vehicle_update
  BEFORE UPDATE OF mileage, vehicle_id ON service_logs
  WHEN NOT EXISTS (SELECT 1 FROM vehicle_profile WHERE id = NEW.vehicle_id)
    OR NEW.mileage > COALESCE((SELECT current_mileage FROM vehicle_profile WHERE id = NEW.vehicle_id), -1)
  BEGIN
    SELECT RAISE(ABORT, 'Service odometer cannot exceed confirmed vehicle odometer');
  END;

  CREATE TRIGGER prevent_fuel_odometer_above_vehicle_insert
  BEFORE INSERT ON gas_logs
  WHEN NOT EXISTS (SELECT 1 FROM vehicle_profile WHERE id = NEW.vehicle_id)
    OR NEW.odometer_km > COALESCE((SELECT current_mileage FROM vehicle_profile WHERE id = NEW.vehicle_id), -1)
  BEGIN
    SELECT RAISE(ABORT, 'Fuel odometer cannot exceed confirmed vehicle odometer');
  END;

  CREATE TRIGGER prevent_fuel_odometer_above_vehicle_update
  BEFORE UPDATE OF odometer_km, vehicle_id ON gas_logs
  WHEN NOT EXISTS (SELECT 1 FROM vehicle_profile WHERE id = NEW.vehicle_id)
    OR NEW.odometer_km > COALESCE((SELECT current_mileage FROM vehicle_profile WHERE id = NEW.vehicle_id), -1)
  BEGIN
    SELECT RAISE(ABORT, 'Fuel odometer cannot exceed confirmed vehicle odometer');
  END;

  CREATE TRIGGER prevent_invalid_fuel_tracking_insert
  BEFORE INSERT ON gas_logs
  WHEN NEW.is_full_tank NOT IN (0, 1)
    OR NEW.logged_on IS NULL
    OR NEW.logged_on NOT GLOB '????-??-??'
  BEGIN
    SELECT RAISE(ABORT, 'Fuel log has invalid full-tank or date fields');
  END;

  CREATE TRIGGER prevent_invalid_fuel_tracking_update
  BEFORE UPDATE OF is_full_tank, logged_on ON gas_logs
  WHEN NEW.is_full_tank NOT IN (0, 1)
    OR NEW.logged_on IS NULL
    OR NEW.logged_on NOT GLOB '????-??-??'
  BEGIN
    SELECT RAISE(ABORT, 'Fuel log has invalid full-tank or date fields');
  END;

  CREATE INDEX idx_gas_logs_vehicle_date ON gas_logs(vehicle_id, logged_on DESC, odometer_km DESC, id DESC);
  CREATE INDEX idx_service_logs_vehicle_date ON service_logs(vehicle_id, date DESC, mileage DESC, id DESC);
  CREATE INDEX idx_service_logs_vehicle_maintenance_rule ON service_logs(vehicle_id, maintenance_profile_id, maintenance_rule_id, date DESC);
  CREATE INDEX idx_service_logs_vehicle_package ON service_logs(vehicle_id, service_package_id, id);
  CREATE INDEX idx_service_logs_vehicle_component_action
    ON service_logs(vehicle_id, maintenance_component_id, maintenance_action, date DESC, mileage DESC, id DESC);
  CREATE INDEX idx_inventory_items_vehicle_name ON inventory_items(vehicle_id, name COLLATE NOCASE);
  CREATE INDEX idx_documents_vault_vehicle_expiry ON documents_vault(vehicle_id, expiry_date, added_at DESC);
  CREATE INDEX idx_service_intervals_vehicle_name ON service_intervals(vehicle_id, name);
  CREATE INDEX idx_vehicle_vitals_vehicle ON vehicle_vitals(vehicle_id);
  CREATE INDEX idx_pre_ride_checks_vehicle ON pre_ride_checks(vehicle_id);
  CREATE INDEX idx_pre_ride_runs_vehicle_date ON pre_ride_runs(vehicle_id, completed_at DESC);
  CREATE INDEX idx_service_intervals_vehicle_task ON service_intervals(vehicle_id, canonical_task_id, is_applicable);
  CREATE INDEX idx_maintenance_preferences_vehicle
    ON maintenance_preferences(vehicle_id, profile_id, component_id, action);
  CREATE INDEX idx_maintenance_history_states_vehicle
    ON maintenance_history_states(vehicle_id, profile_id, component_id, action);
  CREATE INDEX idx_odometer_events_vehicle_date
    ON odometer_events(vehicle_id, recorded_at DESC, id DESC);
`;
