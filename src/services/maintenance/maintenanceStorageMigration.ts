export type MaintenanceStorageMigrationExecutor = {
  execAsync(source: string): Promise<void>;
  getAllAsync<T>(source: string): Promise<T[]>;
};

const SERVICE_LOG_COLUMNS: readonly (readonly [string, string])[] = [
  ['maintenance_mileage_confidence', "TEXT NOT NULL DEFAULT 'legacy_unmapped'"],
  ['maintenance_date_confidence', "TEXT NOT NULL DEFAULT 'legacy_unmapped'"],
  ['maintenance_record_source', "TEXT NOT NULL DEFAULT 'legacy'"],
  ['service_provider', 'TEXT'],
  ['service_package_id', 'TEXT'],
  ['service_package_title', 'TEXT'],
  ['oil_brand', 'TEXT'],
  ['oil_type', 'TEXT'],
  ['oil_viscosity', 'TEXT'],
  ['oil_notes', 'TEXT'],
  ['duplicate_confirmed', 'INTEGER NOT NULL DEFAULT 0'],
  // SQLite cannot add a column with a non-constant default. Existing rows are
  // backfilled below; new writes always provide these values.
  ['created_at', 'TEXT'],
  ['updated_at', 'TEXT'],
];

const MAINTENANCE_OVERRIDE_COLUMNS: readonly (readonly [string, string])[] = [
  ['original_interval_km', 'INTEGER'],
  ['original_interval_months', 'INTEGER'],
  ['custom_interval_km', 'INTEGER'],
  ['custom_interval_months', 'INTEGER'],
  ['effective_interval_months', 'INTEGER'],
  ['distance_enabled', 'INTEGER NOT NULL DEFAULT 0'],
  ['time_enabled', 'INTEGER NOT NULL DEFAULT 0'],
  ['condition_based_default', 'INTEGER NOT NULL DEFAULT 0'],
  ['custom_condition_reminder_enabled', 'INTEGER NOT NULL DEFAULT 0'],
];

async function columns(
  database: MaintenanceStorageMigrationExecutor,
  table: string
): Promise<Set<string>> {
  const rows = await database.getAllAsync<{ name: string }>(`PRAGMA table_info(${table})`);
  return new Set(rows.map((row) => row.name));
}

/**
 * Installs the v15 maintenance storage contract over a v14 database.
 *
 * It is intentionally idempotent. Exact v14 rows are promoted only when all
 * action identity fields exist; vague legacy labels are never guessed into a
 * component/action rule.
 */
export async function applyMaintenanceStorageMigration(
  database: MaintenanceStorageMigrationExecutor
): Promise<void> {
  const profileColumns = await columns(database, 'vehicle_profile');
  if (!profileColumns.has('maintenance_history_level')) {
    await database.execAsync(
      "ALTER TABLE vehicle_profile ADD COLUMN maintenance_history_level TEXT NOT NULL DEFAULT 'not_asked';"
    );
  }

  const serviceLogColumns = await columns(database, 'service_logs');
  for (const [name, definition] of SERVICE_LOG_COLUMNS) {
    if (!serviceLogColumns.has(name)) {
      await database.execAsync(`ALTER TABLE service_logs ADD COLUMN ${name} ${definition};`);
    }
  }

  const preferenceColumns = await columns(database, 'maintenance_preferences');
  if (preferenceColumns.size > 0 && !preferenceColumns.has('profile_id')) {
    // Preserve pre-profile overrides as quarantined rows. A NULL profile_id is
    // never returned by current-profile APIs, so it cannot leak after a scooter
    // selection change and can be reviewed by a future recovery tool.
    await database.execAsync(`
      DROP TRIGGER IF EXISTS prevent_invalid_maintenance_preference_insert;
      DROP TRIGGER IF EXISTS prevent_invalid_maintenance_preference_update;
      CREATE TABLE maintenance_preferences_v15 (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        vehicle_id INTEGER NOT NULL,
        profile_id TEXT,
        component_id TEXT NOT NULL,
        action TEXT NOT NULL,
        profile_recommended_interval_km INTEGER,
        user_interval_km INTEGER,
        effective_interval_km INTEGER,
        interval_source TEXT NOT NULL DEFAULT 'profile_default',
        longer_than_recommended_confirmed INTEGER NOT NULL DEFAULT 0,
        reason TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE(vehicle_id, profile_id, component_id, action)
      );
      INSERT INTO maintenance_preferences_v15 (
        id, vehicle_id, profile_id, component_id, action,
        profile_recommended_interval_km, user_interval_km, effective_interval_km,
        interval_source, longer_than_recommended_confirmed, reason, created_at, updated_at
      )
      SELECT id, vehicle_id, NULL, component_id, action,
        profile_recommended_interval_km, user_interval_km, effective_interval_km,
        interval_source, longer_than_recommended_confirmed, reason, created_at, updated_at
      FROM maintenance_preferences;
      DROP TABLE maintenance_preferences;
      ALTER TABLE maintenance_preferences_v15 RENAME TO maintenance_preferences;
    `);
  }

  const historyColumns = await columns(database, 'maintenance_history_states');
  if (historyColumns.size > 0 && !historyColumns.has('profile_id')) {
    await database.execAsync(`
      DROP TRIGGER IF EXISTS prevent_invalid_maintenance_history_state_insert;
      DROP TRIGGER IF EXISTS prevent_invalid_maintenance_history_state_update;
      CREATE TABLE maintenance_history_states_v15 (
        vehicle_id INTEGER NOT NULL,
        profile_id TEXT,
        component_id TEXT NOT NULL,
        action TEXT NOT NULL,
        history_state TEXT NOT NULL DEFAULT 'unknown',
        last_service_log_id INTEGER,
        notes TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY(vehicle_id, profile_id, component_id, action)
      );
      INSERT INTO maintenance_history_states_v15 (
        vehicle_id, profile_id, component_id, action, history_state,
        last_service_log_id, notes, created_at, updated_at
      )
      SELECT vehicle_id, NULL, component_id, action, history_state,
        NULL, notes, created_at, updated_at
      FROM maintenance_history_states;
      DROP TABLE maintenance_history_states;
      ALTER TABLE maintenance_history_states_v15 RENAME TO maintenance_history_states;
    `);
  }

  const currentPreferenceColumns = await columns(database, 'maintenance_preferences');
  if (currentPreferenceColumns.size > 0) {
    for (const [name, definition] of MAINTENANCE_OVERRIDE_COLUMNS) {
      if (!currentPreferenceColumns.has(name)) {
        await database.execAsync(`ALTER TABLE maintenance_preferences ADD COLUMN ${name} ${definition};`);
      }
    }
    await database.execAsync(`
      DROP TRIGGER IF EXISTS prevent_invalid_maintenance_preference_insert;
      DROP TRIGGER IF EXISTS prevent_invalid_maintenance_preference_update;
      UPDATE maintenance_preferences
      SET original_interval_km = COALESCE(original_interval_km, profile_recommended_interval_km),
          custom_interval_km = COALESCE(custom_interval_km, user_interval_km),
          distance_enabled = CASE
            WHEN COALESCE(effective_interval_km, user_interval_km, profile_recommended_interval_km) IS NOT NULL THEN 1
            ELSE 0
          END;
    `);
  }

  await database.execAsync(`
    CREATE TABLE IF NOT EXISTS maintenance_preferences (
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

    CREATE TABLE IF NOT EXISTS maintenance_history_states (
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

    CREATE TABLE IF NOT EXISTS odometer_events (
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

    UPDATE maintenance_history_states
    SET last_service_log_id = NULL
    WHERE profile_id IS NULL AND last_service_log_id IS NOT NULL;

    UPDATE service_logs
    SET maintenance_mileage_confidence = CASE
          WHEN maintenance_migration_status IN ('exact', 'confirmed')
            AND maintenance_rule_id IS NOT NULL
            AND maintenance_component_id IS NOT NULL
            AND maintenance_action IS NOT NULL
            AND maintenance_profile_id IS NOT NULL
            AND maintenance_profile_version IS NOT NULL
            AND sets_odometer_baseline = 1
          THEN 'confirmed'
          ELSE 'legacy_unmapped'
        END,
        maintenance_date_confidence = CASE
          WHEN maintenance_migration_status IN ('exact', 'confirmed')
            AND maintenance_rule_id IS NOT NULL
            AND maintenance_component_id IS NOT NULL
            AND maintenance_action IS NOT NULL
            AND maintenance_profile_id IS NOT NULL
            AND maintenance_profile_version IS NOT NULL
            AND date GLOB '????-??-??'
          THEN 'confirmed'
          ELSE 'legacy_unmapped'
        END,
        maintenance_record_source = CASE
          WHEN maintenance_migration_status IN ('exact', 'confirmed')
            AND maintenance_rule_id IS NOT NULL
            AND maintenance_component_id IS NOT NULL
            AND maintenance_action IS NOT NULL
            AND maintenance_profile_id IS NOT NULL
            AND maintenance_profile_version IS NOT NULL
          THEN 'maintenance_planner'
          ELSE 'legacy'
        END,
        maintenance_migration_status = CASE
          WHEN maintenance_migration_status IN ('exact', 'confirmed')
            AND maintenance_rule_id IS NOT NULL
            AND maintenance_component_id IS NOT NULL
            AND maintenance_action IS NOT NULL
            AND maintenance_profile_id IS NOT NULL
            AND maintenance_profile_version IS NOT NULL
          THEN 'confirmed'
          ELSE 'legacy_unmapped'
        END,
        created_at = COALESCE(created_at, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        updated_at = COALESCE(updated_at, created_at, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    WHERE maintenance_migration_status IN ('exact', 'legacy_needs_confirmation')
      OR (
        maintenance_migration_status = 'confirmed'
        AND maintenance_mileage_confidence = 'legacy_unmapped'
        AND maintenance_date_confidence = 'legacy_unmapped'
        AND maintenance_record_source = 'legacy'
      );

    UPDATE service_logs
    SET created_at = COALESCE(created_at, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        updated_at = COALESCE(updated_at, created_at, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    WHERE created_at IS NULL OR updated_at IS NULL;

    CREATE INDEX IF NOT EXISTS idx_service_logs_vehicle_package
      ON service_logs(vehicle_id, service_package_id, id);
    CREATE INDEX IF NOT EXISTS idx_service_logs_vehicle_component_action
      ON service_logs(vehicle_id, maintenance_component_id, maintenance_action, date DESC, mileage DESC, id DESC);
    CREATE INDEX IF NOT EXISTS idx_maintenance_preferences_vehicle
      ON maintenance_preferences(vehicle_id, profile_id, component_id, action);
    CREATE INDEX IF NOT EXISTS idx_maintenance_history_states_vehicle
      ON maintenance_history_states(vehicle_id, profile_id, component_id, action);
    CREATE INDEX IF NOT EXISTS idx_odometer_events_vehicle_date
      ON odometer_events(vehicle_id, recorded_at DESC, id DESC);

    DROP TRIGGER IF EXISTS prevent_date_only_odometer_insert;
    DROP TRIGGER IF EXISTS prevent_date_only_odometer_update;

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

    CREATE TRIGGER IF NOT EXISTS prevent_invalid_maintenance_history_level_insert
    BEFORE INSERT ON vehicle_profile
    WHEN NEW.maintenance_history_level NOT IN (
      'not_asked', 'detailed_records', 'recent_memory', 'little_or_none', 'skipped'
    )
    BEGIN
      SELECT RAISE(ABORT, 'Maintenance history level is invalid');
    END;

    CREATE TRIGGER IF NOT EXISTS prevent_invalid_maintenance_history_level_update
    BEFORE UPDATE OF maintenance_history_level ON vehicle_profile
    WHEN NEW.maintenance_history_level NOT IN (
      'not_asked', 'detailed_records', 'recent_memory', 'little_or_none', 'skipped'
    )
    BEGIN
      SELECT RAISE(ABORT, 'Maintenance history level is invalid');
    END;

    CREATE TRIGGER IF NOT EXISTS prevent_invalid_maintenance_record_insert
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

    CREATE TRIGGER IF NOT EXISTS prevent_invalid_maintenance_record_update
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

    CREATE TRIGGER IF NOT EXISTS prevent_invalid_maintenance_preference_insert
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

    CREATE TRIGGER IF NOT EXISTS prevent_invalid_maintenance_preference_update
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

    CREATE TRIGGER IF NOT EXISTS prevent_invalid_maintenance_history_state_insert
    BEFORE INSERT ON maintenance_history_states
    WHEN NEW.history_state NOT IN (
      'confirmed', 'estimated', 'unknown', 'never_done', 'not_applicable',
      'historical_unverified', 'legacy_unmapped'
    )
    BEGIN
      SELECT RAISE(ABORT, 'Maintenance history state is invalid');
    END;

    CREATE TRIGGER IF NOT EXISTS prevent_invalid_maintenance_history_state_update
    BEFORE UPDATE OF history_state ON maintenance_history_states
    WHEN NEW.history_state NOT IN (
      'confirmed', 'estimated', 'unknown', 'never_done', 'not_applicable',
      'historical_unverified', 'legacy_unmapped'
    )
    BEGIN
      SELECT RAISE(ABORT, 'Maintenance history state is invalid');
    END;

    CREATE TRIGGER IF NOT EXISTS prevent_invalid_odometer_event_insert
    BEFORE INSERT ON odometer_events
    WHEN NEW.event_type NOT IN ('confirmed_reading', 'correction', 'instrument_cluster_replacement')
      OR typeof(NEW.previous_effective_km) != 'integer' OR NEW.previous_effective_km < 0
      OR typeof(NEW.new_effective_km) != 'integer' OR NEW.new_effective_km < 0
      OR (NEW.previous_displayed_km IS NOT NULL
        AND (typeof(NEW.previous_displayed_km) != 'integer' OR NEW.previous_displayed_km < 0))
      OR (NEW.new_displayed_km IS NOT NULL
        AND (typeof(NEW.new_displayed_km) != 'integer' OR NEW.new_displayed_km < 0))
      OR trim(NEW.reason) = ''
    BEGIN
      SELECT RAISE(ABORT, 'Odometer event is invalid');
    END;
  `);
}
