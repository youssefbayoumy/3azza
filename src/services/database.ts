import * as SQLite from 'expo-sqlite';
import { Platform } from 'react-native';
import type {
  DocumentItem,
  GasLog,
  InventoryItem,
  MaintenanceHistoryLevel,
  MaintenanceHistoryState,
  MaintenancePreference,
  MaintenanceRecordConfidence,
  MaintenanceRecordSource,
  OdometerEvent,
  PreRideRun,
  PreRideState,
  ServiceInterval,
  ServiceLog,
  VehicleProfile,
  VehicleVitals,
} from '../types/database.types';
import {
  completeServiceHistorySetupInTransaction,
  deleteServiceLogInTransaction,
  insertServiceCompletionInTransaction,
  type ServiceCompletionTransactionInput,
} from './maintenanceTransactions';
import {
  getInventoryStatus,
  validateInventoryQuantity,
  validateOdometerReading,
  validateRecordedOdometer,
  validateVehicleVital,
  validateWholeNumber,
  type VehicleVitalField,
} from '../utils/recordValidation';
import { validateDatabaseBackupData } from '../utils/backupFormat';
import { assertSupportedDatabaseVersion } from '../utils/databaseVersion';
import { resetPreRideStateForNewLocalDay } from '../utils/preRide';
import { validateFuelLogFields, validateTankCapacityLiters } from '../utils/fuel';
import {
  GAS_LOG_METRICS_QUERY,
  getRecordListBounds,
  type RecordListOptions,
} from '../utils/recordList';
import { CURRENT_SCHEMA_SQL, CURRENT_SCHEMA_VERSION } from './databaseSchema';
import {
  isScooterSelectionComplete,
  selectionFromProfile,
  type ScooterSelection,
} from '../catalog/scooterCatalog';
import { updateVehicleScooterIdentityInTransaction } from './vehicleScooterTransactions';
import { getMaintenanceProfileForSelection } from '../maintenance/profiles';
import type { InspectionResult, MaintenanceAction, MaintenanceEvent } from '../maintenance/types';
import {
  deleteMaintenanceRecordInTransaction,
  findDuplicateMaintenanceRecordsInTransaction,
  insertMaintenanceRecordInTransaction,
  MaintenanceDuplicateError,
  updateMaintenanceRecordInTransaction,
  validatePreparedMaintenanceRecord,
  type MaintenanceRecordMutationResult,
  type PreparedMaintenanceRecordAction,
  type PreparedMaintenanceRecordInput,
} from './maintenanceRecordTransactions';
import {
  buildServiceLogListQuery,
  MAINTENANCE_INSIGHTS_QUERY,
} from './maintenanceRecordQueries';
import {
  restoreMaintenancePreferenceInTransaction,
  setMaintenancePreferenceInTransaction,
  setMaintenanceTrackedInTransaction,
  type SetMaintenancePreferenceInput,
} from './maintenancePreferenceTransactions';
import { applyMaintenanceStorageMigration } from './maintenanceStorageMigration';
import { applyOdometerCorrectionMigration } from './odometerCorrectionMigration';
import {
  correctOdometerReadingInTransaction,
  getOdometerCorrectionFloorInTransaction,
  type CorrectOdometerReadingInput,
} from './odometerCorrectionTransactions';
import {
  setMaintenanceHistoryLevelInTransaction,
  setMaintenanceHistoryStateInTransaction,
  type SetMaintenanceHistoryStateInput,
} from './maintenanceHistoryTransactions';

let db: SQLite.SQLiteDatabase | null = null;
const ACTIVE_VEHICLE_KEY = 'active_vehicle_id';

export type DatabaseBackupData = {
  active_vehicle_id: number | null;
  vehicle_profiles: VehicleProfile[];
  vehicle_vitals: VehicleVitals[];
  service_intervals: ServiceInterval[];
  service_logs: ServiceLog[];
  gas_logs: GasLog[];
  inventory_items: InventoryItem[];
  documents_vault: DocumentItem[];
  pre_ride_checks: PreRideState[];
  pre_ride_runs?: PreRideRun[];
  maintenance_preferences?: MaintenancePreference[];
  maintenance_history_states?: MaintenanceHistoryState[];
  odometer_events?: OdometerEvent[];
};

export { MaintenanceDuplicateError };
export type {
  CorrectOdometerReadingInput,
  SetMaintenanceHistoryStateInput,
  SetMaintenancePreferenceInput,
};

async function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (!db) {
    db = await SQLite.openDatabaseAsync('3azza.db');
  }
  return db;
}

async function ensureMetaTables(database: SQLite.SQLiteDatabase): Promise<void> {
  await database.execAsync(`
    CREATE TABLE IF NOT EXISTS app_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

}

async function getSchemaVersion(database: SQLite.SQLiteDatabase): Promise<number> {
  const row = await database.getFirstAsync<{ value: string }>(
    "SELECT value FROM app_meta WHERE key = 'schema_version'"
  );
  return row ? Number(row.value) || 0 : 0;
}

async function setSchemaVersion(database: SQLite.SQLiteDatabase, version: number): Promise<void> {
  await database.runAsync(
    `INSERT INTO app_meta (key, value) VALUES ('schema_version', ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    [String(version)]
  );
  await database.runAsync('INSERT OR IGNORE INTO schema_migrations (version) VALUES (?)', [version]);
}

async function tableColumns(database: SQLite.SQLiteDatabase, tableName: string): Promise<string[]> {
  const rows = await database.getAllAsync<{ name: string }>(`PRAGMA table_info(${tableName})`);
  return rows.map((row) => row.name);
}

async function columnExists(database: SQLite.SQLiteDatabase, tableName: string, columnName: string): Promise<boolean> {
  return (await tableColumns(database, tableName)).includes(columnName);
}

async function tableExists(database: SQLite.SQLiteDatabase, tableName: string): Promise<boolean> {
  const row = await database.getFirstAsync<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?",
    [tableName]
  );
  return row !== null;
}

async function rebuildDocumentsVaultWithNullableExpiry(database: SQLite.SQLiteDatabase): Promise<void> {
  const columns = await database.getAllAsync<{ name: string; notnull: number }>('PRAGMA table_info(documents_vault)');
  const expiryColumn = columns.find((column) => column.name === 'expiry_date');
  if (!expiryColumn || expiryColumn.notnull === 0) return;

  await database.execAsync(`
    DROP TABLE IF EXISTS documents_vault_migration_backup;
    ALTER TABLE documents_vault RENAME TO documents_vault_migration_backup;
    CREATE TABLE documents_vault (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      image_uri TEXT NOT NULL,
      expiry_date TEXT,
      added_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    INSERT INTO documents_vault (id, title, image_uri, expiry_date, added_at)
    SELECT id, title, image_uri, NULLIF(expiry_date, 'N/A'), added_at
    FROM documents_vault_migration_backup;
    DROP TABLE documents_vault_migration_backup;
  `);
}

async function rebuildVehicleProfileForMultiVehicle(database: SQLite.SQLiteDatabase): Promise<void> {
  const columns = await tableColumns(database, 'vehicle_profile');
  if (columns.includes('name') && columns.includes('last_odometer_update_timestamp')) return;

  await database.execAsync(`
    DROP TABLE IF EXISTS vehicle_profile_migration_backup;
    ALTER TABLE vehicle_profile RENAME TO vehicle_profile_migration_backup;
    CREATE TABLE vehicle_profile (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL DEFAULT 'Primary Vehicle',
      current_mileage INTEGER NOT NULL DEFAULT 0,
      total_km_range INTEGER NOT NULL DEFAULT 0,
      has_completed_setup INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      daily_average_km INTEGER NOT NULL DEFAULT 0,
      last_odometer_update_timestamp TEXT
    );
    INSERT INTO vehicle_profile (
      id, name, current_mileage, total_km_range, has_completed_setup, created_at,
      daily_average_km, last_odometer_update_timestamp
    )
    SELECT
      id,
      'Primary Vehicle',
      current_mileage,
      total_km_range,
      has_completed_setup,
      created_at,
      CASE WHEN daily_average_km IS NULL THEN 0 ELSE daily_average_km END,
      last_odometer_update_timestamp
    FROM vehicle_profile_migration_backup;
    DROP TABLE vehicle_profile_migration_backup;
  `);
}

async function addVehicleIdColumn(database: SQLite.SQLiteDatabase, tableName: string): Promise<void> {
  if (!(await columnExists(database, tableName, 'vehicle_id'))) {
    await database.execAsync(`ALTER TABLE ${tableName} ADD COLUMN vehicle_id INTEGER NOT NULL DEFAULT 1;`);
  }
}

async function rebuildSingletonTableForVehicleScope(database: SQLite.SQLiteDatabase, tableName: 'vehicle_vitals' | 'pre_ride_checks'): Promise<void> {
  if (await columnExists(database, tableName, 'vehicle_id')) return;

  if (tableName === 'vehicle_vitals') {
    await database.execAsync(`
      DROP TABLE IF EXISTS vehicle_vitals_migration_backup;
      ALTER TABLE vehicle_vitals RENAME TO vehicle_vitals_migration_backup;
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
      INSERT INTO vehicle_vitals (
        id, vehicle_id, oil_life_pct, tire_pressure_psi, battery_health_pct,
        coolant_temp_c, brake_pad_pct, updated_at
      )
      SELECT id, 1, oil_life_pct, tire_pressure_psi, battery_health_pct, coolant_temp_c, brake_pad_pct, updated_at
      FROM vehicle_vitals_migration_backup;
      DROP TABLE vehicle_vitals_migration_backup;
    `);
    return;
  }

  await database.execAsync(`
    DROP TABLE IF EXISTS pre_ride_checks_migration_backup;
    ALTER TABLE pre_ride_checks RENAME TO pre_ride_checks_migration_backup;
    CREATE TABLE pre_ride_checks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      vehicle_id INTEGER NOT NULL UNIQUE,
      brakes_checked INTEGER NOT NULL DEFAULT 0,
      tires_checked INTEGER NOT NULL DEFAULT 0,
      lights_checked INTEGER NOT NULL DEFAULT 0,
      oil_checked INTEGER NOT NULL DEFAULT 0,
      last_run_at TEXT
    );
    INSERT INTO pre_ride_checks (
      id, vehicle_id, brakes_checked, tires_checked, lights_checked, oil_checked, last_run_at
    )
    SELECT id, 1, brakes_checked, tires_checked, lights_checked, oil_checked, last_run_at
    FROM pre_ride_checks_migration_backup;
    DROP TABLE pre_ride_checks_migration_backup;
  `);
}

async function rebuildServiceIntervalsForVehicleScope(database: SQLite.SQLiteDatabase): Promise<void> {
  if (await columnExists(database, 'service_intervals', 'vehicle_id')) return;

  await database.execAsync(`
    DROP TABLE IF EXISTS service_intervals_migration_backup;
    ALTER TABLE service_intervals RENAME TO service_intervals_migration_backup;
    CREATE TABLE service_intervals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      vehicle_id INTEGER NOT NULL DEFAULT 1,
      name TEXT NOT NULL,
      interval_km INTEGER,
      last_service_odometer_km INTEGER NOT NULL DEFAULT 0,
      type TEXT NOT NULL,
      UNIQUE(vehicle_id, name)
    );
    INSERT INTO service_intervals (id, vehicle_id, name, interval_km, last_service_odometer_km, type)
    SELECT id, 1, name, interval_km, last_service_odometer_km, type
    FROM service_intervals_migration_backup;
    DROP TABLE service_intervals_migration_backup;
  `);
}

async function reconcileLinkedServiceBaselines(database: SQLite.SQLiteDatabase): Promise<void> {
  await database.execAsync(`
    UPDATE service_intervals
    SET last_service_odometer_km = COALESCE((
      SELECT MAX(service_logs.mileage)
      FROM service_logs
      WHERE service_logs.vehicle_id = service_intervals.vehicle_id
        AND service_logs.service_type = service_intervals.name
        AND service_logs.mileage >= 0
    ), 0)
    WHERE EXISTS (
      SELECT 1
      FROM service_logs
      WHERE service_logs.vehicle_id = service_intervals.vehicle_id
        AND service_logs.service_type = service_intervals.name
    );
  `);
}

async function addOdometerIntegrityGuards(database: SQLite.SQLiteDatabase): Promise<void> {
  await database.execAsync(`
    UPDATE vehicle_profile
    SET current_mileage = MAX(
      CASE WHEN current_mileage >= 0 THEN current_mileage ELSE 0 END,
      COALESCE((
        SELECT MAX(mileage) FROM service_logs
        WHERE service_logs.vehicle_id = vehicle_profile.id AND mileage >= 0
      ), 0),
      COALESCE((
        SELECT MAX(odometer_km) FROM gas_logs
        WHERE gas_logs.vehicle_id = vehicle_profile.id AND odometer_km >= 0
      ), 0),
      COALESCE((
        SELECT MAX(last_service_odometer_km) FROM service_intervals
        WHERE service_intervals.vehicle_id = vehicle_profile.id AND last_service_odometer_km >= 0
      ), 0)
    );

    CREATE TRIGGER IF NOT EXISTS prevent_vehicle_odometer_rollback
    BEFORE UPDATE OF current_mileage ON vehicle_profile
    WHEN NEW.current_mileage < 0
      OR NEW.current_mileage < OLD.current_mileage
      OR NEW.current_mileage < COALESCE((
        SELECT MAX(mileage) FROM service_logs
        WHERE service_logs.vehicle_id = OLD.id AND mileage >= 0
      ), 0)
      OR NEW.current_mileage < COALESCE((
        SELECT MAX(odometer_km) FROM gas_logs
        WHERE gas_logs.vehicle_id = OLD.id AND odometer_km >= 0
      ), 0)
      OR NEW.current_mileage < COALESCE((
        SELECT MAX(last_service_odometer_km) FROM service_intervals
        WHERE service_intervals.vehicle_id = OLD.id AND last_service_odometer_km >= 0
      ), 0)
    BEGIN
      SELECT RAISE(ABORT, 'Odometer reading cannot move backwards');
    END;
  `);
}

async function addInventoryIntegrityGuards(database: SQLite.SQLiteDatabase): Promise<void> {
  await database.execAsync(`
    UPDATE inventory_items
    SET quantity = MAX(CAST(quantity AS INTEGER), 0);

    UPDATE inventory_items
    SET status = CASE
      WHEN quantity = 0 THEN 'Out'
      WHEN quantity = 1 THEN 'Low'
      ELSE 'In Stock'
    END;

    CREATE TRIGGER IF NOT EXISTS prevent_invalid_inventory_quantity_insert
    BEFORE INSERT ON inventory_items
    WHEN typeof(NEW.quantity) != 'integer' OR NEW.quantity < 0
    BEGIN
      SELECT RAISE(ABORT, 'Inventory quantity must be a non-negative whole number');
    END;

    CREATE TRIGGER IF NOT EXISTS prevent_invalid_inventory_quantity_update
    BEFORE UPDATE OF quantity ON inventory_items
    WHEN typeof(NEW.quantity) != 'integer' OR NEW.quantity < 0
    BEGIN
      SELECT RAISE(ABORT, 'Inventory quantity must be a non-negative whole number');
    END;
  `);
}

async function addVehicleVitalsIntegrityGuards(database: SQLite.SQLiteDatabase): Promise<void> {
  await database.execAsync(`
    UPDATE vehicle_vitals
    SET oil_life_pct = MIN(MAX(CAST(oil_life_pct AS INTEGER), 0), 100),
        tire_pressure_psi = MAX(CAST(tire_pressure_psi AS INTEGER), 0),
        battery_health_pct = MIN(MAX(CAST(battery_health_pct AS INTEGER), 0), 100),
        coolant_temp_c = MAX(CAST(coolant_temp_c AS INTEGER), 0),
        brake_pad_pct = MIN(MAX(CAST(brake_pad_pct AS INTEGER), 0), 100);

    CREATE TRIGGER IF NOT EXISTS prevent_invalid_vehicle_vitals_insert
    BEFORE INSERT ON vehicle_vitals
    WHEN typeof(NEW.oil_life_pct) != 'integer' OR NEW.oil_life_pct NOT BETWEEN 0 AND 100
      OR typeof(NEW.tire_pressure_psi) != 'integer' OR NEW.tire_pressure_psi < 0
      OR typeof(NEW.battery_health_pct) != 'integer' OR NEW.battery_health_pct NOT BETWEEN 0 AND 100
      OR typeof(NEW.coolant_temp_c) != 'integer' OR NEW.coolant_temp_c < 0
      OR typeof(NEW.brake_pad_pct) != 'integer' OR NEW.brake_pad_pct NOT BETWEEN 0 AND 100
    BEGIN
      SELECT RAISE(ABORT, 'Vehicle readings are outside their valid ranges');
    END;

    CREATE TRIGGER IF NOT EXISTS prevent_invalid_vehicle_vitals_update
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
  `);
}

async function reconcileExplicitServiceBaselines(database: SQLite.SQLiteDatabase): Promise<void> {
  await database.execAsync(`
    UPDATE service_intervals
    SET last_service_odometer_km = COALESCE((
      SELECT MAX(service_logs.mileage)
      FROM service_logs
      WHERE service_logs.vehicle_id = service_intervals.vehicle_id
        AND service_logs.service_type = service_intervals.name
        AND service_logs.sets_odometer_baseline = 1
    ), 0),
    has_known_odometer_baseline = CASE WHEN EXISTS (
      SELECT 1
      FROM service_logs
      WHERE service_logs.vehicle_id = service_intervals.vehicle_id
        AND service_logs.service_type = service_intervals.name
        AND service_logs.sets_odometer_baseline = 1
    ) THEN 1 ELSE 0 END
    WHERE EXISTS (
      SELECT 1
      FROM service_logs
      WHERE service_logs.vehicle_id = service_intervals.vehicle_id
        AND service_logs.service_type = service_intervals.name
    );
  `);
}

async function addServiceHistorySetupModel(database: SQLite.SQLiteDatabase): Promise<void> {
  const profileColumnAdded = !(await columnExists(database, 'vehicle_profile', 'service_history_setup_completed'));
  const intervalColumnAdded = !(await columnExists(database, 'service_intervals', 'has_known_odometer_baseline'));
  const logColumnAdded = !(await columnExists(database, 'service_logs', 'sets_odometer_baseline'));

  if (profileColumnAdded) {
    await database.execAsync(
      'ALTER TABLE vehicle_profile ADD COLUMN service_history_setup_completed INTEGER NOT NULL DEFAULT 0;'
    );
  }
  if (intervalColumnAdded) {
    await database.execAsync(
      'ALTER TABLE service_intervals ADD COLUMN has_known_odometer_baseline INTEGER NOT NULL DEFAULT 0;'
    );
  }
  if (logColumnAdded) {
    await database.execAsync(
      'ALTER TABLE service_logs ADD COLUMN sets_odometer_baseline INTEGER NOT NULL DEFAULT 0;'
    );
  }

  if (logColumnAdded) {
    await database.execAsync(`
      UPDATE service_logs
      SET sets_odometer_baseline = CASE WHEN mileage > 0 THEN 1 ELSE 0 END;
    `);
  }

  if (intervalColumnAdded) {
    await database.execAsync(`
      UPDATE service_intervals
    SET has_known_odometer_baseline = CASE
      WHEN last_service_odometer_km > 0 OR EXISTS (
        SELECT 1 FROM service_logs
        WHERE service_logs.vehicle_id = service_intervals.vehicle_id
          AND service_logs.service_type = service_intervals.name
          AND service_logs.sets_odometer_baseline = 1
      ) THEN 1 ELSE 0 END;
    `);
  }

  await database.execAsync(`
    UPDATE vehicle_profile
    SET service_history_setup_completed = 1
    WHERE EXISTS (
      SELECT 1 FROM service_logs WHERE service_logs.vehicle_id = vehicle_profile.id
    );
  `);

  await reconcileExplicitServiceBaselines(database);

  await database.execAsync(`
    DROP TRIGGER IF EXISTS prevent_vehicle_odometer_rollback;

    CREATE TRIGGER prevent_vehicle_odometer_rollback
    BEFORE UPDATE OF current_mileage ON vehicle_profile
    WHEN NEW.current_mileage < 0
      OR NEW.current_mileage < OLD.current_mileage
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
    BEGIN
      SELECT RAISE(ABORT, 'Odometer reading cannot move backwards');
    END;

    CREATE TRIGGER IF NOT EXISTS prevent_invalid_service_history_setup_flag_insert
    BEFORE INSERT ON vehicle_profile
    WHEN NEW.service_history_setup_completed NOT IN (0, 1)
    BEGIN
      SELECT RAISE(ABORT, 'Service history setup flag must be 0 or 1');
    END;

    CREATE TRIGGER IF NOT EXISTS prevent_invalid_service_history_setup_flag
    BEFORE UPDATE OF service_history_setup_completed ON vehicle_profile
    WHEN NEW.service_history_setup_completed NOT IN (0, 1)
    BEGIN
      SELECT RAISE(ABORT, 'Service history setup flag must be 0 or 1');
    END;

    CREATE TRIGGER IF NOT EXISTS prevent_invalid_service_baseline_flag_insert
    BEFORE INSERT ON service_logs
    WHEN NEW.sets_odometer_baseline NOT IN (0, 1)
    BEGIN
      SELECT RAISE(ABORT, 'Service baseline flag must be 0 or 1');
    END;

    CREATE TRIGGER IF NOT EXISTS prevent_invalid_service_baseline_flag_update
    BEFORE UPDATE OF sets_odometer_baseline ON service_logs
    WHEN NEW.sets_odometer_baseline NOT IN (0, 1)
    BEGIN
      SELECT RAISE(ABORT, 'Service baseline flag must be 0 or 1');
    END;

    CREATE TRIGGER IF NOT EXISTS prevent_date_only_odometer_insert
    BEFORE INSERT ON service_logs
    WHEN NEW.sets_odometer_baseline = 0 AND NEW.mileage != 0
    BEGIN
      SELECT RAISE(ABORT, 'Date-only service history cannot include an odometer reading');
    END;

    CREATE TRIGGER IF NOT EXISTS prevent_date_only_odometer_update
    BEFORE UPDATE OF mileage, sets_odometer_baseline ON service_logs
    WHEN NEW.sets_odometer_baseline = 0 AND NEW.mileage != 0
    BEGIN
      SELECT RAISE(ABORT, 'Date-only service history cannot include an odometer reading');
    END;

    CREATE TRIGGER IF NOT EXISTS prevent_invalid_interval_baseline_flag_insert
    BEFORE INSERT ON service_intervals
    WHEN NEW.has_known_odometer_baseline NOT IN (0, 1)
    BEGIN
      SELECT RAISE(ABORT, 'Interval baseline flag must be 0 or 1');
    END;

    CREATE TRIGGER IF NOT EXISTS prevent_invalid_interval_baseline_flag_update
    BEFORE UPDATE OF has_known_odometer_baseline ON service_intervals
    WHEN NEW.has_known_odometer_baseline NOT IN (0, 1)
    BEGIN
      SELECT RAISE(ABORT, 'Interval baseline flag must be 0 or 1');
    END;
  `);
}

async function addRecordOdometerIntegrityGuards(database: SQLite.SQLiteDatabase): Promise<void> {
  await database.execAsync(`
    UPDATE vehicle_profile
    SET current_mileage = MAX(
      current_mileage,
      COALESCE((
        SELECT MAX(mileage) FROM service_logs
        WHERE service_logs.vehicle_id = vehicle_profile.id
          AND service_logs.sets_odometer_baseline = 1
      ), 0),
      COALESCE((
        SELECT MAX(odometer_km) FROM gas_logs
        WHERE gas_logs.vehicle_id = vehicle_profile.id
      ), 0),
      COALESCE((
        SELECT MAX(last_service_odometer_km) FROM service_intervals
        WHERE service_intervals.vehicle_id = vehicle_profile.id
          AND service_intervals.has_known_odometer_baseline = 1
      ), 0)
    );

    CREATE TRIGGER IF NOT EXISTS prevent_service_odometer_above_vehicle_insert
    BEFORE INSERT ON service_logs
    WHEN NOT EXISTS (SELECT 1 FROM vehicle_profile WHERE id = NEW.vehicle_id)
      OR NEW.mileage > COALESCE((
        SELECT current_mileage FROM vehicle_profile WHERE id = NEW.vehicle_id
      ), -1)
    BEGIN
      SELECT RAISE(ABORT, 'Service odometer cannot exceed confirmed vehicle odometer');
    END;

    CREATE TRIGGER IF NOT EXISTS prevent_service_odometer_above_vehicle_update
    BEFORE UPDATE OF mileage, vehicle_id ON service_logs
    WHEN NOT EXISTS (SELECT 1 FROM vehicle_profile WHERE id = NEW.vehicle_id)
      OR NEW.mileage > COALESCE((
        SELECT current_mileage FROM vehicle_profile WHERE id = NEW.vehicle_id
      ), -1)
    BEGIN
      SELECT RAISE(ABORT, 'Service odometer cannot exceed confirmed vehicle odometer');
    END;

    CREATE TRIGGER IF NOT EXISTS prevent_fuel_odometer_above_vehicle_insert
    BEFORE INSERT ON gas_logs
    WHEN NOT EXISTS (SELECT 1 FROM vehicle_profile WHERE id = NEW.vehicle_id)
      OR NEW.odometer_km > COALESCE((
        SELECT current_mileage FROM vehicle_profile WHERE id = NEW.vehicle_id
      ), -1)
    BEGIN
      SELECT RAISE(ABORT, 'Fuel odometer cannot exceed confirmed vehicle odometer');
    END;

    CREATE TRIGGER IF NOT EXISTS prevent_fuel_odometer_above_vehicle_update
    BEFORE UPDATE OF odometer_km, vehicle_id ON gas_logs
    WHEN NOT EXISTS (SELECT 1 FROM vehicle_profile WHERE id = NEW.vehicle_id)
      OR NEW.odometer_km > COALESCE((
        SELECT current_mileage FROM vehicle_profile WHERE id = NEW.vehicle_id
      ), -1)
    BEGIN
      SELECT RAISE(ABORT, 'Fuel odometer cannot exceed confirmed vehicle odometer');
    END;
  `);
}

async function addFuelTrackingModel(database: SQLite.SQLiteDatabase): Promise<void> {
  if (!(await columnExists(database, 'vehicle_profile', 'tank_capacity_liters'))) {
    await database.execAsync('ALTER TABLE vehicle_profile ADD COLUMN tank_capacity_liters REAL;');
  }
  if (!(await columnExists(database, 'gas_logs', 'is_full_tank'))) {
    await database.execAsync('ALTER TABLE gas_logs ADD COLUMN is_full_tank INTEGER NOT NULL DEFAULT 0;');
  }
  if (!(await columnExists(database, 'gas_logs', 'logged_on'))) {
    await database.execAsync('ALTER TABLE gas_logs ADD COLUMN logged_on TEXT;');
  }

  await database.execAsync(`
    UPDATE gas_logs
    SET logged_on = substr(logged_at, 1, 10)
    WHERE logged_on IS NULL OR logged_on = '';

    CREATE TRIGGER IF NOT EXISTS prevent_invalid_fuel_tracking_insert
    BEFORE INSERT ON gas_logs
    WHEN NEW.is_full_tank NOT IN (0, 1)
      OR NEW.logged_on IS NULL
      OR NEW.logged_on NOT GLOB '????-??-??'
    BEGIN
      SELECT RAISE(ABORT, 'Fuel log has invalid full-tank or date fields');
    END;

    CREATE TRIGGER IF NOT EXISTS prevent_invalid_fuel_tracking_update
    BEFORE UPDATE OF is_full_tank, logged_on ON gas_logs
    WHEN NEW.is_full_tank NOT IN (0, 1)
      OR NEW.logged_on IS NULL
      OR NEW.logged_on NOT GLOB '????-??-??'
    BEGIN
      SELECT RAISE(ABORT, 'Fuel log has invalid full-tank or date fields');
    END;
  `);
}

async function seedDefaultIntervalsForAllVehicles(database: SQLite.SQLiteDatabase): Promise<void> {
  const vehicles = await database.getAllAsync<VehicleProfile>('SELECT * FROM vehicle_profile');
  for (const vehicle of vehicles) {
    const selection = selectionFromProfile(vehicle);
    if (selection) await seedDefaultIntervals(database, vehicle.id, selection);
  }
}

async function addStorageIndexes(database: SQLite.SQLiteDatabase): Promise<void> {
  await seedDefaultIntervalsForAllVehicles(database);
  await database.execAsync(`
    CREATE INDEX IF NOT EXISTS idx_gas_logs_vehicle_date ON gas_logs(vehicle_id, logged_on DESC, odometer_km DESC, id DESC);
    CREATE INDEX IF NOT EXISTS idx_service_logs_vehicle_date ON service_logs(vehicle_id, date DESC, mileage DESC, id DESC);
    CREATE INDEX IF NOT EXISTS idx_inventory_items_vehicle_name ON inventory_items(vehicle_id, name COLLATE NOCASE);
    CREATE INDEX IF NOT EXISTS idx_documents_vault_vehicle_expiry ON documents_vault(vehicle_id, expiry_date, added_at DESC);
    CREATE INDEX IF NOT EXISTS idx_service_intervals_vehicle_name ON service_intervals(vehicle_id, name);
    CREATE INDEX IF NOT EXISTS idx_vehicle_vitals_vehicle ON vehicle_vitals(vehicle_id);
    CREATE INDEX IF NOT EXISTS idx_pre_ride_checks_vehicle ON pre_ride_checks(vehicle_id);
  `);
}

async function addModelKnowledgePersistence(database: SQLite.SQLiteDatabase): Promise<void> {
  if (!(await columnExists(database, 'vehicle_profile', 'scooter_variant_id'))) {
    await database.execAsync('ALTER TABLE vehicle_profile ADD COLUMN scooter_variant_id TEXT;');
  }

  const intervalColumns: [string, string][] = [
    ['canonical_task_id', 'TEXT'],
    ['recommended_interval_km', 'INTEGER'],
    ['recommended_interval_months', 'INTEGER'],
    ['user_interval_km', 'INTEGER'],
    ['user_override_active', 'INTEGER NOT NULL DEFAULT 0'],
    ['recommendation_origin', "TEXT NOT NULL DEFAULT 'manual'"],
    ['source_manual_id', 'TEXT'],
    ['source_pages_json', 'TEXT'],
    ['manual_guidance_json', 'TEXT'],
    ['initial_milestones_json', 'TEXT'],
    ['severe_use_note', 'TEXT'],
    ['is_applicable', 'INTEGER NOT NULL DEFAULT 1'],
    ['last_service_date', 'TEXT'],
  ];
  const existingColumns = new Set(await tableColumns(database, 'service_intervals'));
  const isLegacyIntervalTable = !existingColumns.has('canonical_task_id');
  for (const [name, definition] of intervalColumns) {
    if (!existingColumns.has(name)) {
      await database.execAsync(`ALTER TABLE service_intervals ADD COLUMN ${name} ${definition};`);
    }
  }

  if (isLegacyIntervalTable) {
    await database.execAsync(`
      UPDATE service_intervals
      SET user_interval_km = interval_km,
          user_override_active = 1,
          recommendation_origin = CASE WHEN interval_km IS NULL THEN 'manual' ELSE 'user_override' END;
    `);
  }

  await database.execAsync(`
    UPDATE service_intervals
    SET last_service_date = (
      SELECT MAX(service_logs.date)
      FROM service_logs
      WHERE service_logs.vehicle_id = service_intervals.vehicle_id
        AND service_logs.service_type = service_intervals.name
    );
  `);

  await database.execAsync(`
    CREATE TABLE IF NOT EXISTS pre_ride_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      vehicle_id INTEGER NOT NULL,
      manual_id TEXT NOT NULL,
      variant_id TEXT,
      completed_at TEXT NOT NULL,
      items_json TEXT NOT NULL,
      completed_count INTEGER NOT NULL,
      total_count INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_pre_ride_runs_vehicle_date ON pre_ride_runs(vehicle_id, completed_at DESC);
    CREATE INDEX IF NOT EXISTS idx_service_intervals_vehicle_task
      ON service_intervals(vehicle_id, canonical_task_id, is_applicable);
  `);

  const vehicles = await database.getAllAsync<VehicleProfile>('SELECT * FROM vehicle_profile');
  for (const vehicle of vehicles) {
    const selection = selectionFromProfile(vehicle);
    if (selection) await applyScooterMaintenanceTemplate(database, vehicle.id, selection);
  }
}

async function addMaintenanceDomainV2(database: SQLite.SQLiteDatabase): Promise<void> {
  const columns: [string, string][] = [
    ['maintenance_rule_id', 'TEXT'],
    ['maintenance_component_id', 'TEXT'],
    ['maintenance_action', 'TEXT'],
    ['maintenance_profile_id', 'TEXT'],
    ['maintenance_profile_version', 'TEXT'],
    ['inspection_result', 'TEXT'],
    ['maintenance_migration_status', "TEXT NOT NULL DEFAULT 'legacy_unmapped'"],
  ];
  const existing = new Set(await tableColumns(database, 'service_logs'));
  for (const [name, definition] of columns) {
    if (!existing.has(name)) {
      await database.execAsync(`ALTER TABLE service_logs ADD COLUMN ${name} ${definition};`);
    }
  }

  // Promote only already action-specific rows. Old component-name rows cannot
  // be mapped to exact rules without guessing, so they remain visible history
  // but never become scheduler baselines.
  await database.execAsync(`
    UPDATE service_logs
    SET maintenance_migration_status = CASE
      WHEN maintenance_migration_status IN ('exact', 'confirmed')
        AND maintenance_rule_id IS NOT NULL
        AND maintenance_component_id IS NOT NULL
        AND maintenance_action IS NOT NULL
        AND maintenance_profile_id IS NOT NULL
        AND maintenance_profile_version IS NOT NULL
      THEN 'confirmed'
      ELSE 'legacy_unmapped'
    END;
    UPDATE service_intervals SET is_applicable = 0;
    CREATE INDEX IF NOT EXISTS idx_service_logs_vehicle_maintenance_rule
      ON service_logs(vehicle_id, maintenance_profile_id, maintenance_rule_id, date DESC);
  `);
}

async function withWriteTransaction(
  database: SQLite.SQLiteDatabase,
  task: (transaction: SQLite.SQLiteDatabase) => Promise<void>
): Promise<void> {
  if (Platform.OS === 'web') {
    await database.withTransactionAsync(() => task(database));
    return;
  }

  await database.withExclusiveTransactionAsync(task);
}

async function runMigrations(database: SQLite.SQLiteDatabase): Promise<void> {
  await ensureMetaTables(database);
  let version = await getSchemaVersion(database);
  assertSupportedDatabaseVersion(version, CURRENT_SCHEMA_VERSION);

  if (version < 1) {
    if (!(await columnExists(database, 'vehicle_profile', 'daily_average_km'))) {
      await database.execAsync('ALTER TABLE vehicle_profile ADD COLUMN daily_average_km INTEGER NOT NULL DEFAULT 0;');
    }
    if (!(await columnExists(database, 'vehicle_profile', 'last_odometer_update_timestamp'))) {
      await database.execAsync('ALTER TABLE vehicle_profile ADD COLUMN last_odometer_update_timestamp TEXT;');
    }
    if (!(await columnExists(database, 'service_logs', 'service_type'))) {
      await database.execAsync('ALTER TABLE service_logs ADD COLUMN service_type TEXT;');
    }
    version = 1;
    await setSchemaVersion(database, version);
  }

  if (version < 2) {
    await rebuildDocumentsVaultWithNullableExpiry(database);
    version = 2;
    await setSchemaVersion(database, version);
  }

  if (version < 3) {
    await rebuildVehicleProfileForMultiVehicle(database);
    await rebuildSingletonTableForVehicleScope(database, 'vehicle_vitals');
    await rebuildSingletonTableForVehicleScope(database, 'pre_ride_checks');
    await addVehicleIdColumn(database, 'gas_logs');
    await addVehicleIdColumn(database, 'inventory_items');
    await addVehicleIdColumn(database, 'documents_vault');
    await addVehicleIdColumn(database, 'service_logs');
    await rebuildServiceIntervalsForVehicleScope(database);
    version = 3;
    await setSchemaVersion(database, version);
  }

  if (version < 4) {
    await reconcileLinkedServiceBaselines(database);
    version = 4;
    await setSchemaVersion(database, version);
  }

  if (version < 5) {
    await addOdometerIntegrityGuards(database);
    version = 5;
    await setSchemaVersion(database, version);
  }

  if (version < 6) {
    await addInventoryIntegrityGuards(database);
    version = 6;
    await setSchemaVersion(database, version);
  }

  if (version < 7) {
    await addVehicleVitalsIntegrityGuards(database);
    version = 7;
    await setSchemaVersion(database, version);
  }

  if (version < 8) {
    await addServiceHistorySetupModel(database);
    version = 8;
    await setSchemaVersion(database, version);
  }

  if (version < 9) {
    await addRecordOdometerIntegrityGuards(database);
    version = 9;
    await setSchemaVersion(database, version);
  }

  if (version < 10) {
    await addFuelTrackingModel(database);
    version = 10;
    await setSchemaVersion(database, version);
  }

  if (version < 11) {
    await addStorageIndexes(database);
    version = 11;
    await setSchemaVersion(database, version);
  }

  if (version < 12) {
    if (!(await columnExists(database, 'vehicle_profile', 'scooter_brand_id'))) {
      await database.execAsync('ALTER TABLE vehicle_profile ADD COLUMN scooter_brand_id TEXT;');
    }
    if (!(await columnExists(database, 'vehicle_profile', 'scooter_model_id'))) {
      await database.execAsync('ALTER TABLE vehicle_profile ADD COLUMN scooter_model_id TEXT;');
    }
    if (!(await columnExists(database, 'vehicle_profile', 'scooter_version_id'))) {
      await database.execAsync('ALTER TABLE vehicle_profile ADD COLUMN scooter_version_id TEXT;');
    }
    version = 12;
    await setSchemaVersion(database, version);
  }

  if (version < 13) {
    await addModelKnowledgePersistence(database);
    version = 13;
    await setSchemaVersion(database, version);
  }

  if (version < 14) {
    await addMaintenanceDomainV2(database);
    version = 14;
    await setSchemaVersion(database, version);
  }

  if (version < 15) {
    await applyMaintenanceStorageMigration(database);
    version = 15;
    await setSchemaVersion(database, version);
  } else {
    // The migration is idempotent and also heals partially initialized v15
    // development databases without reclassifying current records.
    await applyMaintenanceStorageMigration(database);
  }

  if (version < 16) {
    await applyOdometerCorrectionMigration(database);
    version = 16;
    await setSchemaVersion(database, version);
  } else {
    // Reinstalling the guard is idempotent and clears any stale development-only
    // authorization row before ordinary profile updates can run.
    await applyOdometerCorrectionMigration(database);
  }

  if (version < 18) {
    await addMaintenancePreferenceTracking(database);
    version = 18;
    await setSchemaVersion(database, version);
  }

  if (version < CURRENT_SCHEMA_VERSION) {
    await setSchemaVersion(database, CURRENT_SCHEMA_VERSION);
  }
}

// Opt-in service tracking: a nullable tri-state flag on maintenance_preferences
// (NULL = unset/default, 1 = explicitly tracked, 0 = explicitly untracked).
async function addMaintenancePreferenceTracking(database: SQLite.SQLiteDatabase): Promise<void> {
  if (!(await columnExists(database, 'maintenance_preferences', 'tracked'))) {
    await database.execAsync('ALTER TABLE maintenance_preferences ADD COLUMN tracked INTEGER;');
  }
}

async function seedDefaultIntervals(
  database: SQLite.SQLiteDatabase,
  vehicleId: number,
  _selection: ScooterSelection
): Promise<void> {
  if (await columnExists(database, 'service_intervals', 'is_applicable')) {
    await database.runAsync('UPDATE service_intervals SET is_applicable = 0 WHERE vehicle_id = ?', [vehicleId]);
  }
}

async function applyScooterMaintenanceTemplate(
  database: SQLite.SQLiteDatabase,
  vehicleId: number,
  _selection: ScooterSelection
): Promise<void> {
  // The v2 scheduler derives tasks directly from immutable, action-specific
  // profile rules. Keep legacy intervals only as preserved history.
  await database.runAsync('UPDATE service_intervals SET is_applicable = 0 WHERE vehicle_id = ?', [vehicleId]);
}

async function setActiveVehicleIdForDb(database: SQLite.SQLiteDatabase, vehicleId: number): Promise<void> {
  await database.runAsync(
    `INSERT INTO app_meta (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    [ACTIVE_VEHICLE_KEY, String(vehicleId)]
  );
}

async function ensureDefaultVehicle(database: SQLite.SQLiteDatabase): Promise<number> {
  const existingActive = await database.getFirstAsync<{ id: number }>(
    `SELECT vp.id
     FROM vehicle_profile vp
     JOIN app_meta meta ON meta.value = CAST(vp.id AS TEXT)
     WHERE meta.key = ?`,
    [ACTIVE_VEHICLE_KEY]
  );
  if (existingActive) {
    return existingActive.id;
  }

  const firstVehicle = await database.getFirstAsync<{ id: number }>(
    'SELECT id FROM vehicle_profile ORDER BY id ASC LIMIT 1'
  );
  if (firstVehicle) {
    await setActiveVehicleIdForDb(database, firstVehicle.id);
    return firstVehicle.id;
  }

  const result = await database.runAsync(
    `INSERT INTO vehicle_profile (name, current_mileage, total_km_range, has_completed_setup)
     VALUES ('Primary Vehicle', 0, 0, 0)`
  );
  const vehicleId = result.lastInsertRowId;
  await setActiveVehicleIdForDb(database, vehicleId);
  return vehicleId;
}

async function getActiveVehicleIdForDb(database: SQLite.SQLiteDatabase): Promise<number> {
  const active = await database.getFirstAsync<{ id: number }>(
    `SELECT vp.id
     FROM vehicle_profile vp
     JOIN app_meta meta ON meta.value = CAST(vp.id AS TEXT)
     WHERE meta.key = ?`,
    [ACTIVE_VEHICLE_KEY]
  );
  if (active) return active.id;

  const firstVehicle = await database.getFirstAsync<{ id: number }>(
    'SELECT id FROM vehicle_profile ORDER BY id ASC LIMIT 1'
  );
  if (firstVehicle) return firstVehicle.id;
  throw new Error('Local database has no vehicle. Restart 3azza to initialize it.');
}

export async function initDatabase(): Promise<void> {
  const database = await getDb();

  try {
    await withWriteTransaction(database, async (transaction) => {
      await ensureMetaTables(transaction);
      const isFreshInstall = !(await tableExists(transaction, 'vehicle_profile'));

      if (isFreshInstall) {
        await transaction.execAsync(CURRENT_SCHEMA_SQL);
        await setSchemaVersion(transaction, CURRENT_SCHEMA_VERSION);
        await ensureDefaultVehicle(transaction);
        return;
      }

      await transaction.execAsync(`
    DROP TABLE IF EXISTS vehicle_stats;

    CREATE TABLE IF NOT EXISTS vehicle_profile (
      id INTEGER PRIMARY KEY DEFAULT 1,
      current_mileage INTEGER NOT NULL DEFAULT 0,
      total_km_range INTEGER NOT NULL DEFAULT 0,
      has_completed_setup INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      daily_average_km INTEGER NOT NULL DEFAULT 0,
      last_odometer_update_timestamp TEXT,
      CHECK (id = 1)
    );

    CREATE TABLE IF NOT EXISTS vehicle_vitals (
      id INTEGER PRIMARY KEY DEFAULT 1,
      oil_life_pct INTEGER NOT NULL DEFAULT 0,
      tire_pressure_psi INTEGER NOT NULL DEFAULT 0,
      battery_health_pct INTEGER NOT NULL DEFAULT 0,
      coolant_temp_c INTEGER NOT NULL DEFAULT 0,
      brake_pad_pct INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      CHECK (id = 1)
    );

    CREATE TABLE IF NOT EXISTS gas_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      liters REAL NOT NULL,
      cost REAL NOT NULL,
      odometer_km INTEGER NOT NULL,
      station TEXT,
      logged_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS inventory_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'In Stock',
      quantity INTEGER NOT NULL DEFAULT 0,
      last_replaced_at TEXT
    );

    CREATE TABLE IF NOT EXISTS documents_vault (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      image_uri TEXT NOT NULL,
      expiry_date TEXT,
      added_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS pre_ride_checks (
      id INTEGER PRIMARY KEY DEFAULT 1,
      brakes_checked INTEGER NOT NULL DEFAULT 0,
      tires_checked INTEGER NOT NULL DEFAULT 0,
      lights_checked INTEGER NOT NULL DEFAULT 0,
      oil_checked INTEGER NOT NULL DEFAULT 0,
      last_run_at TEXT,
      CHECK (id = 1)
    );

    CREATE TABLE IF NOT EXISTS service_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      date TEXT NOT NULL,
      mileage INTEGER NOT NULL,
      category TEXT NOT NULL,
      notes TEXT NOT NULL,
      cost REAL
    );

    CREATE TABLE IF NOT EXISTS service_intervals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      interval_km INTEGER,
      last_service_odometer_km INTEGER NOT NULL DEFAULT 0,
      type TEXT NOT NULL
    );
  `);

      await transaction.execAsync(`
    INSERT OR IGNORE INTO service_intervals (name, interval_km, last_service_odometer_km, type) VALUES 
      ('Oil Change', 1000, 0, 'replace'),
      ('Gearbox Oil Change', 3000, 0, 'replace'),
      ('Air Filter', 1000, 0, 'check'),
      ('Brake Pads', 2000, 0, 'check'),
      ('Cleaning', NULL, 0, 'clean'),
      ('CVT & Pull Rollers', 5000, 0, 'check'),
      ('Carburetor', 5000, 0, 'clean');
  `);

      await runMigrations(transaction);
      await ensureDefaultVehicle(transaction);
    });
  } catch (error) {
    if (db === database) {
      db = null;
    }
    try {
      await database.closeAsync();
    } catch {
      // Preserve the initialization error; retry will open a fresh connection.
    }
    throw error;
  }
}

export async function getActiveVehicleId(): Promise<number> {
  return getActiveVehicleIdForDb(await getDb());
}

export async function getVehicleProfiles(): Promise<VehicleProfile[]> {
  const database = await getDb();
  return database.getAllAsync<VehicleProfile>('SELECT * FROM vehicle_profile ORDER BY id ASC');
}

export async function setActiveVehicleId(vehicleId: number): Promise<void> {
  const database = await getDb();
  const vehicle = await database.getFirstAsync<VehicleProfile>('SELECT * FROM vehicle_profile WHERE id = ?', [vehicleId]);
  if (!vehicle) throw new Error('Vehicle does not exist');

  await setActiveVehicleIdForDb(database, vehicleId);
}

export async function createVehicleProfile(
  name: string,
  currentMileage = 0,
  dailyAverageKm = 0,
  scooterSelection: ScooterSelection
): Promise<VehicleProfile> {
  if (!Number.isSafeInteger(currentMileage) || currentMileage < 0) {
    throw new Error('Starting odometer must be a non-negative whole number.');
  }
  if (!Number.isSafeInteger(dailyAverageKm) || dailyAverageKm < 0) {
    throw new Error('Daily average must be a non-negative whole number.');
  }
  if (!isScooterSelectionComplete(scooterSelection)) {
    throw new Error('Select a valid brand, model, version, and required exact variant.');
  }
  const database = await getDb();
  const trimmedName = name.trim() || `Vehicle ${(await getVehicleProfiles()).length + 1}`;
  let vehicleId: number | null = null;
  await withWriteTransaction(database, async (transaction) => {
    const result = await transaction.runAsync(
      `INSERT INTO vehicle_profile (
         name, current_mileage, total_km_range, has_completed_setup, daily_average_km,
         last_odometer_update_timestamp, service_history_setup_completed,
         scooter_brand_id, scooter_model_id, scooter_version_id, scooter_variant_id
       ) VALUES (?, ?, 0, 1, ?, ?, 0, ?, ?, ?, ?)`,
      [
        trimmedName,
        currentMileage,
        dailyAverageKm,
        new Date().toISOString(),
        scooterSelection.brandId,
        scooterSelection.modelId,
        scooterSelection.versionId,
        scooterSelection.variantId ?? null,
      ]
    );
    vehicleId = result.lastInsertRowId;
    await seedDefaultIntervals(transaction, vehicleId, scooterSelection);
    await setActiveVehicleIdForDb(transaction, vehicleId);
  });
  if (vehicleId === null) throw new Error('Failed to create vehicle');

  const vehicle = await database.getFirstAsync<VehicleProfile>('SELECT * FROM vehicle_profile WHERE id = ?', [vehicleId]);
  if (!vehicle) throw new Error('Failed to create vehicle');
  return vehicle;
}

export async function renameVehicleProfile(vehicleId: number, name: string): Promise<void> {
  const trimmedName = name.trim();
  if (!trimmedName) throw new Error('Vehicle name is required.');

  const database = await getDb();
  const result = await database.runAsync('UPDATE vehicle_profile SET name = ? WHERE id = ?', [trimmedName, vehicleId]);
  if (result.changes !== 1) throw new Error('Vehicle does not exist.');
}

export async function deleteVehicleProfile(vehicleId: number): Promise<void> {
  const database = await getDb();
  const vehicles = await getVehicleProfiles();
  if (vehicles.length <= 1) throw new Error('At least one vehicle is required');

  await database.execAsync('BEGIN;');
  try {
    for (const table of [
      'maintenance_history_states',
      'maintenance_preferences',
      'odometer_correction_authorizations',
      'odometer_events',
      'vehicle_vitals',
      'gas_logs',
      'inventory_items',
      'documents_vault',
      'pre_ride_checks',
      'pre_ride_runs',
      'service_logs',
      'service_intervals',
    ]) {
      await database.runAsync(`DELETE FROM ${table} WHERE vehicle_id = ?`, [vehicleId]);
    }
    await database.runAsync('DELETE FROM vehicle_profile WHERE id = ?', [vehicleId]);

    const activeId = await getActiveVehicleIdForDb(database);
    if (activeId === vehicleId) {
      const next = await database.getFirstAsync<{ id: number }>('SELECT id FROM vehicle_profile ORDER BY id ASC LIMIT 1');
      if (next) await setActiveVehicleIdForDb(database, next.id);
    }
    await database.execAsync('COMMIT;');
  } catch (error) {
    await database.execAsync('ROLLBACK;').catch(() => undefined);
    throw error;
  }
}

export async function getVehicleProfile(): Promise<VehicleProfile | null> {
  const database = await getDb();
  const vehicleId = await getActiveVehicleIdForDb(database);
  return database.getFirstAsync<VehicleProfile>('SELECT * FROM vehicle_profile WHERE id = ?', [vehicleId]);
}

async function getMinimumOdometerForVehicle(
  database: SQLite.SQLiteDatabase,
  vehicleId: number
): Promise<number> {
  const row = await database.getFirstAsync<{ minimum: number }>(
    `SELECT MAX(value) AS minimum
     FROM (
       SELECT current_mileage AS value FROM vehicle_profile WHERE id = ?
       UNION ALL SELECT mileage FROM service_logs WHERE vehicle_id = ? AND sets_odometer_baseline = 1
       UNION ALL SELECT odometer_km FROM gas_logs WHERE vehicle_id = ? AND odometer_km >= 0
       UNION ALL SELECT last_service_odometer_km FROM service_intervals
         WHERE vehicle_id = ? AND has_known_odometer_baseline = 1
     )`,
    [vehicleId, vehicleId, vehicleId, vehicleId]
  );
  return row?.minimum ?? 0;
}

export async function getMinimumOdometerReading(): Promise<number> {
  const database = await getDb();
  const vehicleId = await getActiveVehicleIdForDb(database);
  return getMinimumOdometerForVehicle(database, vehicleId);
}

/** Lowest value accepted by the separate correction flow; excludes current mileage. */
export async function getOdometerCorrectionFloor(): Promise<number> {
  const database = await getDb();
  const vehicleId = await getActiveVehicleIdForDb(database);
  return getOdometerCorrectionFloorInTransaction(database, vehicleId);
}

/**
 * Corrects an accidentally high active-vehicle reading downward while preserving
 * every historical record and atomically appending an odometer audit event.
 */
export async function correctOdometerReading(
  input: CorrectOdometerReadingInput
): Promise<OdometerEvent> {
  const database = await getDb();
  const vehicleId = await getActiveVehicleIdForDb(database);
  let created: OdometerEvent | null = null;
  await withWriteTransaction(database, async (transaction) => {
    created = await correctOdometerReadingInTransaction(
      transaction,
      vehicleId,
      input,
      new Date().toISOString()
    );
  });
  if (!created) throw new Error('The odometer correction could not be saved.');
  return created;
}

/** Read-only audit access for the active vehicle's odometer history. */
export async function getOdometerEvents(): Promise<OdometerEvent[]> {
  const database = await getDb();
  const vehicleId = await getActiveVehicleIdForDb(database);
  return database.getAllAsync<OdometerEvent>(
    'SELECT * FROM odometer_events WHERE vehicle_id = ? ORDER BY recorded_at DESC, id DESC',
    [vehicleId]
  );
}

export async function saveVehicleProfile(
  profile: Partial<Omit<
    VehicleProfile,
    'id' | 'created_at' | 'scooter_brand_id' | 'scooter_model_id' | 'scooter_version_id' | 'scooter_variant_id'
  >>
): Promise<void> {
  const database = await getDb();
  const vehicleId = await getActiveVehicleIdForDb(database);
  const fields: string[] = [];
  const values: (string | number | null)[] = [];

  if (profile.current_mileage !== undefined) {
    const minimum = await getMinimumOdometerForVehicle(database, vehicleId);
    const error = validateOdometerReading(profile.current_mileage, minimum);
    if (error) throw new Error(error);
  }
  if (profile.daily_average_km !== undefined) {
    const error = validateWholeNumber(profile.daily_average_km, { label: 'Daily average', min: 0 });
    if (error) throw new Error(error);
  }

  if (profile.name !== undefined) { fields.push('name = ?'); values.push(profile.name.trim() || 'Vehicle'); }
  if (profile.current_mileage !== undefined) { fields.push('current_mileage = ?'); values.push(profile.current_mileage); }
  if (profile.total_km_range !== undefined) { fields.push('total_km_range = ?'); values.push(profile.total_km_range); }
  if (profile.has_completed_setup !== undefined) { fields.push('has_completed_setup = ?'); values.push(profile.has_completed_setup); }
  if (profile.daily_average_km !== undefined) { fields.push('daily_average_km = ?'); values.push(profile.daily_average_km); }
  if (profile.last_odometer_update_timestamp !== undefined) {
    fields.push('last_odometer_update_timestamp = ?');
    values.push(profile.last_odometer_update_timestamp);
  }
  if (profile.tank_capacity_liters !== undefined) {
    const error = validateTankCapacityLiters(profile.tank_capacity_liters);
    if (error) throw new Error(error);
    fields.push('tank_capacity_liters = ?');
    values.push(profile.tank_capacity_liters);
  }

  if (fields.length === 0) return;

  values.push(vehicleId);
  await database.runAsync(`UPDATE vehicle_profile SET ${fields.join(', ')} WHERE id = ?`, values);
}

export async function saveVehicleScooterSelection(
  selection: ScooterSelection,
  vehicleId?: number
): Promise<void> {
  if (!isScooterSelectionComplete(selection)) {
    throw new Error('Select a valid brand, model, version, and required exact variant.');
  }

  const database = await getDb();
  const targetVehicleId = vehicleId ?? await getActiveVehicleIdForDb(database);
  await withWriteTransaction(database, async (transaction) => {
    await updateVehicleScooterIdentityInTransaction(
      transaction,
      targetVehicleId,
      selection,
      () => applyScooterMaintenanceTemplate(transaction, targetVehicleId, selection)
    );
  });
}

export async function saveInitialVehicleSetup(input: {
  currentMileage: number;
  dailyAverageKm: number;
  selection: ScooterSelection;
}): Promise<void> {
  if (!isScooterSelectionComplete(input.selection)) {
    throw new Error('Select a valid brand, model, version, and required exact variant.');
  }
  const dailyAverageError = validateWholeNumber(input.dailyAverageKm, { label: 'Daily average', min: 0 });
  if (dailyAverageError) throw new Error(dailyAverageError);

  const database = await getDb();
  const vehicleId = await getActiveVehicleIdForDb(database);
  const minimum = await getMinimumOdometerForVehicle(database, vehicleId);
  const odometerError = validateOdometerReading(input.currentMileage, minimum);
  if (odometerError) throw new Error(odometerError);

  await withWriteTransaction(database, async (transaction) => {
    await transaction.runAsync(
      `UPDATE vehicle_profile
       SET current_mileage = ?, daily_average_km = ?, total_km_range = 0,
           has_completed_setup = 1, last_odometer_update_timestamp = ?,
           scooter_brand_id = ?, scooter_model_id = ?, scooter_version_id = ?, scooter_variant_id = ?
       WHERE id = ?`,
      [
        input.currentMileage,
        input.dailyAverageKm,
        new Date().toISOString(),
        input.selection.brandId,
        input.selection.modelId,
        input.selection.versionId,
        input.selection.variantId ?? null,
        vehicleId,
      ]
    );
    await applyScooterMaintenanceTemplate(transaction, vehicleId, input.selection);
  });
}

export async function getVehicleVitals(): Promise<VehicleVitals | null> {
  const database = await getDb();
  const vehicleId = await getActiveVehicleIdForDb(database);
  return database.getFirstAsync<VehicleVitals>('SELECT * FROM vehicle_vitals WHERE vehicle_id = ?', [vehicleId]);
}

export async function saveVehicleVitals(
  vitals: Partial<Omit<VehicleVitals, 'id' | 'vehicle_id' | 'updated_at'>>
): Promise<void> {
  for (const [field, value] of Object.entries(vitals)) {
    if (value === undefined) continue;
    const validationMessage = validateVehicleVital(field as VehicleVitalField, value);
    if (validationMessage) throw new Error(validationMessage);
  }

  const database = await getDb();
  const vehicleId = await getActiveVehicleIdForDb(database);
  const existing = await getVehicleVitals();

  if (!existing) {
    await database.runAsync(
      `INSERT INTO vehicle_vitals (
        vehicle_id, oil_life_pct, tire_pressure_psi, battery_health_pct, coolant_temp_c, brake_pad_pct
      ) VALUES (?, ?, ?, ?, ?, ?)`,
      [
        vehicleId,
        vitals.oil_life_pct ?? 0,
        vitals.tire_pressure_psi ?? 0,
        vitals.battery_health_pct ?? 0,
        vitals.coolant_temp_c ?? 0,
        vitals.brake_pad_pct ?? 0,
      ]
    );
    return;
  }

  const fields: string[] = [];
  const values: number[] = [];

  if (vitals.oil_life_pct !== undefined) { fields.push('oil_life_pct = ?'); values.push(vitals.oil_life_pct); }
  if (vitals.tire_pressure_psi !== undefined) { fields.push('tire_pressure_psi = ?'); values.push(vitals.tire_pressure_psi); }
  if (vitals.battery_health_pct !== undefined) { fields.push('battery_health_pct = ?'); values.push(vitals.battery_health_pct); }
  if (vitals.coolant_temp_c !== undefined) { fields.push('coolant_temp_c = ?'); values.push(vitals.coolant_temp_c); }
  if (vitals.brake_pad_pct !== undefined) { fields.push('brake_pad_pct = ?'); values.push(vitals.brake_pad_pct); }

  if (fields.length === 0) return;

  values.push(vehicleId);
  await database.runAsync(
    `UPDATE vehicle_vitals SET ${fields.join(', ')}, updated_at = datetime('now') WHERE vehicle_id = ?`,
    values
  );
}

export async function getGasLogs(options?: RecordListOptions): Promise<GasLog[]> {
  const database = await getDb();
  const vehicleId = await getActiveVehicleIdForDb(database);
  const bounds = getRecordListBounds(options);
  return database.getAllAsync<GasLog>(
    `SELECT * FROM gas_logs
     WHERE vehicle_id = ?
     ORDER BY logged_on DESC, odometer_km DESC, id DESC${bounds.clause}`,
    [vehicleId, ...bounds.values]
  );
}

export type GasLogMetrics = {
  recordCount: number;
  totalLiters: number;
  totalCost: number;
  segmentCount: number;
  averageKmPerLiter: number | null;
  latestKmPerLiter: number | null;
};

/** Exact fuel totals and full-tank efficiency without loading the entire history into JS. */
export async function getGasLogMetrics(): Promise<GasLogMetrics> {
  const database = await getDb();
  const vehicleId = await getActiveVehicleIdForDb(database);
  const row = await database.getFirstAsync<{
    total_liters: number;
    total_cost: number;
    record_count: number;
    segment_count: number;
    average_km_per_liter: number | null;
    latest_km_per_liter: number | null;
  }>(
    GAS_LOG_METRICS_QUERY,
    [vehicleId]
  );

  return {
    recordCount: row?.record_count ?? 0,
    totalLiters: row?.total_liters ?? 0,
    totalCost: row?.total_cost ?? 0,
    segmentCount: row?.segment_count ?? 0,
    averageKmPerLiter: row?.average_km_per_liter ?? null,
    latestKmPerLiter: row?.latest_km_per_liter ?? null,
  };
}

export async function insertGasLog(log: Omit<GasLog, 'id' | 'vehicle_id' | 'logged_at'>): Promise<void> {
  const inputError = validateFuelLogFields(log);
  if (inputError) throw new Error(inputError);

  const database = await getDb();
  const vehicleId = await getActiveVehicleIdForDb(database);
  const vehicle = await database.getFirstAsync<Pick<VehicleProfile, 'current_mileage'>>(
    'SELECT current_mileage FROM vehicle_profile WHERE id = ?',
    [vehicleId]
  );
  if (!vehicle) throw new Error('The active vehicle no longer exists.');
  const mileageMessage = validateRecordedOdometer(log.odometer_km, vehicle.current_mileage);
  if (mileageMessage) throw new Error(mileageMessage);
  await database.runAsync(
    `INSERT INTO gas_logs (vehicle_id, liters, cost, odometer_km, station, logged_on, is_full_tank)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      vehicleId,
      log.liters,
      log.cost,
      log.odometer_km,
      log.station ?? null,
      log.logged_on,
      log.is_full_tank,
    ]
  );
}

export async function deleteGasLog(id: number): Promise<void> {
  const database = await getDb();
  const vehicleId = await getActiveVehicleIdForDb(database);
  await database.runAsync('DELETE FROM gas_logs WHERE id = ? AND vehicle_id = ?', [id, vehicleId]);
}

export async function getInventoryItems(options?: RecordListOptions): Promise<InventoryItem[]> {
  const database = await getDb();
  const vehicleId = await getActiveVehicleIdForDb(database);
  const bounds = getRecordListBounds(options);
  return database.getAllAsync<InventoryItem>(
    `SELECT * FROM inventory_items
     WHERE vehicle_id = ?
     ORDER BY name COLLATE NOCASE ASC, id ASC${bounds.clause}`,
    [vehicleId, ...bounds.values]
  );
}

export async function getInventoryMetrics(): Promise<{ itemCount: number; totalUnits: number }> {
  const database = await getDb();
  const vehicleId = await getActiveVehicleIdForDb(database);
  const row = await database.getFirstAsync<{ item_count: number; total_units: number }>(
    `SELECT COUNT(*) AS item_count, COALESCE(SUM(quantity), 0) AS total_units
     FROM inventory_items WHERE vehicle_id = ?`,
    [vehicleId]
  );
  return { itemCount: row?.item_count ?? 0, totalUnits: row?.total_units ?? 0 };
}

export async function upsertInventoryItem(
  item: Omit<InventoryItem, 'id' | 'vehicle_id' | 'status'>
): Promise<void> {
  const validationMessage = validateInventoryQuantity(item.quantity);
  if (validationMessage) throw new Error(validationMessage);

  const database = await getDb();
  const vehicleId = await getActiveVehicleIdForDb(database);
  await database.runAsync(
    `INSERT INTO inventory_items (vehicle_id, name, category, status, quantity, last_replaced_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [vehicleId, item.name, item.category, getInventoryStatus(item.quantity), item.quantity, item.last_replaced_at ?? null]
  );
}

export async function updateInventoryItem(
  id: number,
  item: Partial<Omit<InventoryItem, 'id' | 'vehicle_id'>>
): Promise<void> {
  if (item.quantity !== undefined) {
    const validationMessage = validateInventoryQuantity(item.quantity);
    if (validationMessage) throw new Error(validationMessage);
  }

  const database = await getDb();
  const vehicleId = await getActiveVehicleIdForDb(database);
  const fields: string[] = [];
  const values: (string | number | null)[] = [];

  if (item.name !== undefined) { fields.push('name = ?'); values.push(item.name); }
  if (item.category !== undefined) { fields.push('category = ?'); values.push(item.category); }
  if (item.quantity !== undefined) {
    fields.push('quantity = ?', 'status = ?');
    values.push(item.quantity, getInventoryStatus(item.quantity));
  } else if (item.status !== undefined) {
    fields.push('status = ?');
    values.push(item.status);
  }
  if (item.last_replaced_at !== undefined) { fields.push('last_replaced_at = ?'); values.push(item.last_replaced_at); }

  if (fields.length === 0) return;

  values.push(id, vehicleId);
  await database.runAsync(
    `UPDATE inventory_items SET ${fields.join(', ')} WHERE id = ? AND vehicle_id = ?`,
    values
  );
}

export async function deleteInventoryItem(id: number): Promise<void> {
  const database = await getDb();
  const vehicleId = await getActiveVehicleIdForDb(database);
  await database.runAsync('DELETE FROM inventory_items WHERE id = ? AND vehicle_id = ?', [id, vehicleId]);
}

export async function getDocuments(options?: RecordListOptions): Promise<DocumentItem[]> {
  const database = await getDb();
  const vehicleId = await getActiveVehicleIdForDb(database);
  const bounds = getRecordListBounds(options);
  return database.getAllAsync<DocumentItem>(
    `SELECT * FROM documents_vault
     WHERE vehicle_id = ?
     ORDER BY CASE WHEN expiry_date IS NULL THEN 1 ELSE 0 END,
              expiry_date ASC, added_at DESC, id DESC${bounds.clause}`,
    [vehicleId, ...bounds.values]
  );
}

export async function getDocumentCount(): Promise<number> {
  const database = await getDb();
  const vehicleId = await getActiveVehicleIdForDb(database);
  const row = await database.getFirstAsync<{ record_count: number }>(
    'SELECT COUNT(*) AS record_count FROM documents_vault WHERE vehicle_id = ?',
    [vehicleId]
  );
  return row?.record_count ?? 0;
}

export async function addDocument(doc: Omit<DocumentItem, 'id' | 'vehicle_id' | 'added_at'>): Promise<void> {
  const database = await getDb();
  const vehicleId = await getActiveVehicleIdForDb(database);
  await database.runAsync(
    `INSERT INTO documents_vault (vehicle_id, title, image_uri, expiry_date) VALUES (?, ?, ?, ?)`,
    [vehicleId, doc.title, doc.image_uri, doc.expiry_date ?? null]
  );
}

export async function deleteDocument(id: number): Promise<void> {
  const database = await getDb();
  const vehicleId = await getActiveVehicleIdForDb(database);
  await database.runAsync('DELETE FROM documents_vault WHERE id = ? AND vehicle_id = ?', [id, vehicleId]);
}

export async function getDailyPreRideState(now = new Date()): Promise<PreRideState> {
  const database = await getDb();
  let vehicleId = 0;

  await withWriteTransaction(database, async (transaction) => {
    vehicleId = await getActiveVehicleIdForDb(transaction);
    const existing = await transaction.getFirstAsync<PreRideState>(
      'SELECT * FROM pre_ride_checks WHERE vehicle_id = ?',
      [vehicleId]
    );

    if (!existing) {
      await transaction.runAsync(
        `INSERT INTO pre_ride_checks (vehicle_id, brakes_checked, tires_checked, lights_checked, oil_checked, last_run_at)
         VALUES (?, 0, 0, 0, 0, NULL)`,
        [vehicleId]
      );
      return;
    }

    const dailyState = resetPreRideStateForNewLocalDay(existing, now);
    if (dailyState !== existing) {
      await transaction.runAsync(
        `UPDATE pre_ride_checks
         SET brakes_checked = 0, tires_checked = 0, lights_checked = 0, oil_checked = 0, last_run_at = NULL
         WHERE vehicle_id = ?`,
        [vehicleId]
      );
    }
  });

  const state = await database.getFirstAsync<PreRideState>(
    'SELECT * FROM pre_ride_checks WHERE vehicle_id = ?',
    [vehicleId]
  );
  if (!state) throw new Error('Daily pre-ride state was not created');
  return state;
}

export async function savePreRideState(state: Partial<Omit<PreRideState, 'id' | 'vehicle_id'>>): Promise<void> {
  const database = await getDb();
  const fields: string[] = [];
  const values: (string | number | null)[] = [];

  if (state.brakes_checked !== undefined) { fields.push('brakes_checked = ?'); values.push(state.brakes_checked); }
  if (state.tires_checked !== undefined) { fields.push('tires_checked = ?'); values.push(state.tires_checked); }
  if (state.lights_checked !== undefined) { fields.push('lights_checked = ?'); values.push(state.lights_checked); }
  if (state.oil_checked !== undefined) { fields.push('oil_checked = ?'); values.push(state.oil_checked); }
  if (state.last_run_at !== undefined) { fields.push('last_run_at = ?'); values.push(state.last_run_at); }

  if (fields.length === 0) return;

  await withWriteTransaction(database, async (transaction) => {
    const vehicleId = await getActiveVehicleIdForDb(transaction);
    const existing = await transaction.getFirstAsync<PreRideState>(
      'SELECT id FROM pre_ride_checks WHERE vehicle_id = ?',
      [vehicleId]
    );

    if (!existing) {
      await transaction.runAsync(
        `INSERT INTO pre_ride_checks (vehicle_id, brakes_checked, tires_checked, lights_checked, oil_checked, last_run_at)
         VALUES (?, 0, 0, 0, 0, NULL)`,
        [vehicleId]
      );
    }

    await transaction.runAsync(
      `UPDATE pre_ride_checks SET ${fields.join(', ')} WHERE vehicle_id = ?`,
      [...values, vehicleId]
    );
  });
}

export async function getLatestPreRideRun(): Promise<PreRideRun | null> {
  const database = await getDb();
  const vehicleId = await getActiveVehicleIdForDb(database);
  return database.getFirstAsync<PreRideRun>(
    'SELECT * FROM pre_ride_runs WHERE vehicle_id = ? ORDER BY completed_at DESC, id DESC LIMIT 1',
    [vehicleId]
  );
}

export async function recordPreRideRun(input: {
  manualId: string;
  variantId: string | null;
  items: { recordId: string; subject: string; checked: boolean }[];
  completedAt?: string;
}): Promise<void> {
  if (!input.manualId || input.items.length === 0) throw new Error('A selected manual checklist is required.');
  const completedAt = input.completedAt ?? new Date().toISOString();
  const checked = input.items.filter((item) => item.checked);
  const database = await getDb();
  await withWriteTransaction(database, async (transaction) => {
    const vehicleId = await getActiveVehicleIdForDb(transaction);
    await transaction.runAsync(
      `INSERT INTO pre_ride_runs (
        vehicle_id, manual_id, variant_id, completed_at, items_json, completed_count, total_count
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        vehicleId,
        input.manualId,
        input.variantId,
        completedAt,
        JSON.stringify(input.items),
        checked.length,
        input.items.length,
      ]
    );

    const isChecked = (pattern: RegExp) => input.items.some((item) => pattern.test(item.subject) && item.checked) ? 1 : 0;
    await transaction.runAsync(
      `INSERT INTO pre_ride_checks (
        vehicle_id, brakes_checked, tires_checked, lights_checked, oil_checked, last_run_at
       ) VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(vehicle_id) DO UPDATE SET
         brakes_checked = excluded.brakes_checked,
         tires_checked = excluded.tires_checked,
         lights_checked = excluded.lights_checked,
         oil_checked = excluded.oil_checked,
         last_run_at = excluded.last_run_at`,
      [
        vehicleId,
        isChecked(/brake/i),
        isChecked(/tire|tyre/i),
        isChecked(/light|lamp|indicator/i),
        isChecked(/oil/i),
        completedAt,
      ]
    );
  });
}

export async function getServiceLogs(options?: RecordListOptions): Promise<ServiceLog[]> {
  const database = await getDb();
  const vehicleId = await getActiveVehicleIdForDb(database);
  const query = buildServiceLogListQuery(vehicleId, options);
  return database.getAllAsync<ServiceLog>(query.sql, query.params);
}

export async function getServiceLogMaxMileage(): Promise<number> {
  const database = await getDb();
  const vehicleId = await getActiveVehicleIdForDb(database);
  const row = await database.getFirstAsync<{ max_mileage: number }>(
    'SELECT COALESCE(MAX(mileage), 0) AS max_mileage FROM service_logs WHERE vehicle_id = ?',
    [vehicleId]
  );
  return row?.max_mileage ?? 0;
}

export type InsightsRecordSummary = {
  totalFuelCost: number;
  totalMaintenanceCost: number;
  gasLogCount: number;
  serviceLogCount: number;
  inventoryCount: number;
  expiringDocumentCount: number;
  monthFuelCost: number;
  monthMaintenanceCost: number;
  firstKnownMileage: number | null;
};

/** Aggregate-only Insights read; it performs no seeding or record mutation. */
export async function getInsightsRecordSummary(
  currentMonth: string,
  expiringCutoff: string
): Promise<InsightsRecordSummary> {
  const database = await getDb();
  const vehicleId = await getActiveVehicleIdForDb(database);
  const [fuel, maintenance, inventory, documents] = await Promise.all([
    database.getFirstAsync<{
      total_cost: number;
      record_count: number;
      month_cost: number;
      first_mileage: number | null;
    }>(
      `SELECT COALESCE(SUM(cost), 0) AS total_cost,
              COUNT(*) AS record_count,
              COALESCE(SUM(CASE WHEN substr(logged_on, 1, 7) = ? THEN cost ELSE 0 END), 0) AS month_cost,
              MIN(odometer_km) AS first_mileage
       FROM gas_logs WHERE vehicle_id = ?`,
      [currentMonth, vehicleId]
    ),
    database.getFirstAsync<{
      total_cost: number;
      record_count: number;
      month_cost: number;
      first_mileage: number | null;
    }>(
      MAINTENANCE_INSIGHTS_QUERY,
      [vehicleId, currentMonth]
    ),
    database.getFirstAsync<{ record_count: number }>(
      'SELECT COUNT(*) AS record_count FROM inventory_items WHERE vehicle_id = ?',
      [vehicleId]
    ),
    database.getFirstAsync<{ record_count: number }>(
      `SELECT COUNT(*) AS record_count
       FROM documents_vault
       WHERE vehicle_id = ? AND expiry_date IS NOT NULL AND expiry_date <= ?`,
      [vehicleId, expiringCutoff]
    ),
  ]);

  const firstMileages = [fuel?.first_mileage, maintenance?.first_mileage]
    .filter((value): value is number => value !== null && value !== undefined && Number.isFinite(value));

  return {
    totalFuelCost: fuel?.total_cost ?? 0,
    totalMaintenanceCost: maintenance?.total_cost ?? 0,
    gasLogCount: fuel?.record_count ?? 0,
    serviceLogCount: maintenance?.record_count ?? 0,
    inventoryCount: inventory?.record_count ?? 0,
    expiringDocumentCount: documents?.record_count ?? 0,
    monthFuelCost: fuel?.month_cost ?? 0,
    monthMaintenanceCost: maintenance?.month_cost ?? 0,
    firstKnownMileage: firstMileages.length > 0 ? Math.min(...firstMileages) : null,
  };
}

export type ServiceCompletionInput = Omit<
  ServiceLog,
  'id' | 'vehicle_id' | 'service_type' | 'sets_odometer_baseline'
> & {
  serviceIntervalId: number | null;
  setsOdometerBaseline?: boolean;
};

function isValidIsoDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;

  const [, yearText, monthText, dayText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year
    && parsed.getUTCMonth() === month - 1
    && parsed.getUTCDate() === day;
}

function prepareServiceCompletion(log: ServiceCompletionInput): ServiceCompletionTransactionInput {
  const title = log.title.trim();
  const category = log.category.trim();
  if (!title || !category || !isValidIsoDate(log.date)) {
    throw new Error('Service title, category, and date must be valid.');
  }
  if (!Number.isSafeInteger(log.mileage) || log.mileage < 0) {
    throw new Error('Service mileage must be a non-negative whole number.');
  }
  if (log.cost !== null && log.cost !== undefined && (!Number.isFinite(log.cost) || log.cost < 0)) {
    throw new Error('Service cost must be a non-negative number.');
  }
  if (log.serviceIntervalId !== null && (!Number.isSafeInteger(log.serviceIntervalId) || log.serviceIntervalId <= 0)) {
    throw new Error('Service interval ID must be a positive whole number.');
  }

  const setsOdometerBaseline = log.setsOdometerBaseline ?? true;
  if (!setsOdometerBaseline && log.mileage !== 0) {
    throw new Error('Date-only service history cannot include an odometer reading.');
  }

  return {
    serviceIntervalId: log.serviceIntervalId,
    title,
    date: log.date,
    mileage: log.mileage,
    category,
    notes: log.notes.trim(),
    cost: log.cost ?? null,
    setsOdometerBaseline,
  };
}

export async function recordServiceCompletion(log: ServiceCompletionInput): Promise<void> {
  const prepared = prepareServiceCompletion(log);

  const database = await getDb();
  const vehicleId = await getActiveVehicleIdForDb(database);

  await withWriteTransaction(database, async (transaction) => {
    await insertServiceCompletionInTransaction(
      transaction,
      vehicleId,
      prepared
    );
  });
}

export type MaintenanceEventInput = {
  ruleId: string;
  action: MaintenanceAction;
  performedOn: string;
  odometerKm: number;
  inspectionResult?: InspectionResult | null;
  notes?: string;
  cost?: number | null;
};

export type MaintenanceRecordActionInput = {
  ruleId?: string | null;
  componentId?: string;
  action: MaintenanceAction;
  title?: string;
  category?: string;
  inspectionResult?: InspectionResult | null;
};

export type WritableMaintenanceRecordConfidence = Exclude<
  MaintenanceRecordConfidence,
  'legacy_unmapped'
>;

export type WritableMaintenanceRecordSource = Exclude<MaintenanceRecordSource, 'legacy'>;

export type CreateMaintenanceRecordInput = {
  serviceDate: string | null;
  mileageKm: number | null;
  dateConfidence?: WritableMaintenanceRecordConfidence;
  mileageConfidence?: WritableMaintenanceRecordConfidence;
  notes?: string;
  cost?: number | null;
  serviceProvider?: string | null;
  recordSource?: WritableMaintenanceRecordSource;
  packageTitle?: string | null;
  oil?: {
    brand?: string | null;
    type?: string | null;
    viscosity?: string | null;
    notes?: string | null;
  };
  actions: MaintenanceRecordActionInput[];
  otherWork?: {
    title: string;
    category: string;
  };
  allowDuplicate?: boolean;
};

export type MaintenanceRecordResult = MaintenanceRecordMutationResult;

const INSPECTION_RESULTS = new Set<InspectionResult>([
  'healthy',
  'cleaning_needed',
  'monitor',
  'service_soon',
  'replace_soon',
  'replace_now',
  'unable_to_inspect',
]);

const MAINTENANCE_ACTIONS = new Set<MaintenanceAction>([
  'inspect',
  'replace',
  'clean',
  'adjust',
  'lubricate',
  'test',
  'tighten',
  'initial_service',
  'condition_check',
]);

function selectableMaintenanceProfileForVehicle(vehicle: VehicleProfile) {
  const profile = getMaintenanceProfileForSelection({
    brandId: vehicle.scooter_brand_id,
    modelId: vehicle.scooter_model_id,
    versionId: vehicle.scooter_version_id,
    variantId: vehicle.scooter_variant_id,
  });
  return profile?.status === 'validated' || profile?.status === 'production_ready' ? profile : null;
}

function normalizedOptionalText(value: string | null | undefined): string | null {
  return value?.trim() || null;
}

function maintenancePackageId(vehicleId: number): string {
  return `maintenance-${vehicleId}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function prepareMaintenanceRecordInput(
  vehicle: VehicleProfile,
  input: CreateMaintenanceRecordInput,
  timestamp: string,
  existing: ServiceLog | null = null,
  createPackageId = true
): PreparedMaintenanceRecordInput {
  const profile = selectableMaintenanceProfileForVehicle(vehicle);
  const profileIsSelectable = profile !== null;
  if (input.actions.length > 0 && input.otherWork) {
    throw new Error('Choose maintenance actions or other work, not both.');
  }
  const preparedActions: PreparedMaintenanceRecordAction[] = input.actions.length === 0
    ? (() => {
      const title = input.otherWork?.title.trim();
      const category = input.otherWork?.category.trim();
      if (!title || !category) {
        throw new Error('Other work requires a title and category.');
      }
      return [{
        ruleId: null,
        componentId: null,
        action: null,
        profileId: null,
        profileVersion: null,
        title,
        category,
        inspectionResult: null,
      }];
    })()
    : input.actions.map((candidate) => {
    if (!MAINTENANCE_ACTIONS.has(candidate.action)) {
      throw new Error('Select a valid maintenance action.');
    }
    const ruleId = normalizedOptionalText(candidate.ruleId);
    if (ruleId) {
      if (!profile) {
        throw new Error('This scooter does not have a selectable validated maintenance profile.');
      }
      const rule = profile.rules.find((item) => item.id === ruleId);
      if (!rule || !rule.applicable) {
        throw new Error('This maintenance rule is not applicable to the selected scooter.');
      }
      if (rule.action !== candidate.action) {
        throw new Error('The recorded action does not match the maintenance rule.');
      }
      if (candidate.componentId && candidate.componentId.trim() !== rule.componentId) {
        throw new Error('The recorded component does not match the maintenance rule.');
      }
      if (rule.conditionFollowUp && !candidate.inspectionResult) {
        throw new Error('Record the inspection result before completing this action.');
      }
      return {
        ruleId: rule.id,
        componentId: rule.componentId,
        action: rule.action,
        profileId: profile.id,
        profileVersion: profile.profileVersion,
        title: candidate.title?.trim() || rule.label,
        category: candidate.category?.trim() || rule.category,
        inspectionResult: candidate.inspectionResult ?? null,
      };
    }

    const componentId = candidate.componentId?.trim()
      || (input.actions.length === 1 ? existing?.maintenance_component_id?.trim() : undefined);
    const title = candidate.title?.trim()
      || (input.actions.length === 1 ? existing?.title.trim() : undefined);
    const category = candidate.category?.trim()
      || (input.actions.length === 1 ? existing?.category.trim() : undefined);
    if (!componentId || !title || !category) {
      throw new Error('Unscheduled work requires a component, title, and category.');
    }
    return {
      ruleId: null,
      componentId,
      action: candidate.action,
      profileId: profileIsSelectable ? profile?.id ?? null : null,
      profileVersion: profileIsSelectable ? profile?.profileVersion ?? null : null,
      title,
      category,
      inspectionResult: candidate.inspectionResult ?? null,
    };
    });

  const packageTitle = input.packageTitle === undefined
    ? existing?.service_package_title ?? null
    : normalizedOptionalText(input.packageTitle);
  const packageId = existing?.service_package_id
    ?? (createPackageId && (preparedActions.length > 1 || packageTitle !== null)
      ? maintenancePackageId(vehicle.id)
      : null);
  const existingSource = existing?.maintenance_record_source;
  const recordSource = input.recordSource
    ?? (existingSource && existingSource !== 'legacy' ? existingSource : undefined)
    ?? (preparedActions.length > 1 ? 'service_package' : 'manual_entry');

  return {
    serviceDate: input.serviceDate,
    mileageKm: input.mileageKm,
    dateConfidence: input.dateConfidence ?? (input.serviceDate === null ? 'unknown' : 'confirmed'),
    mileageConfidence: input.mileageConfidence ?? (input.mileageKm === null ? 'unknown' : 'confirmed'),
    notes: input.notes === undefined ? existing?.notes ?? '' : input.notes.trim(),
    cost: input.cost === undefined ? existing?.cost ?? null : input.cost,
    serviceProvider: input.serviceProvider === undefined
      ? existing?.service_provider ?? null
      : normalizedOptionalText(input.serviceProvider),
    recordSource,
    packageId,
    packageTitle,
    oilBrand: input.oil?.brand === undefined
      ? existing?.oil_brand ?? null
      : normalizedOptionalText(input.oil.brand),
    oilType: input.oil?.type === undefined
      ? existing?.oil_type ?? null
      : normalizedOptionalText(input.oil.type),
    oilViscosity: input.oil?.viscosity === undefined
      ? existing?.oil_viscosity ?? null
      : normalizedOptionalText(input.oil.viscosity),
    oilNotes: input.oil?.notes === undefined
      ? existing?.oil_notes ?? null
      : normalizedOptionalText(input.oil.notes),
    actions: preparedActions,
    allowDuplicate: input.allowDuplicate === true,
    timestamp,
  };
}

export async function findDuplicateMaintenanceRecords(
  input: CreateMaintenanceRecordInput
): Promise<ServiceLog[]> {
  const database = await getDb();
  const vehicleId = await getActiveVehicleIdForDb(database);
  const vehicle = await database.getFirstAsync<VehicleProfile>(
    'SELECT * FROM vehicle_profile WHERE id = ?',
    [vehicleId]
  );
  if (!vehicle) throw new Error('The active vehicle no longer exists.');
  const prepared = prepareMaintenanceRecordInput(
    vehicle,
    input,
    new Date().toISOString(),
    null,
    false
  );
  validatePreparedMaintenanceRecord(prepared, vehicle.current_mileage);
  return findDuplicateMaintenanceRecordsInTransaction(database, vehicleId, prepared);
}

export async function createMaintenanceRecord(
  input: CreateMaintenanceRecordInput
): Promise<MaintenanceRecordResult> {
  const database = await getDb();
  const vehicleId = await getActiveVehicleIdForDb(database);
  let result: MaintenanceRecordResult | null = null;
  await withWriteTransaction(database, async (transaction) => {
    const vehicle = await transaction.getFirstAsync<VehicleProfile>(
      'SELECT * FROM vehicle_profile WHERE id = ?',
      [vehicleId]
    );
    if (!vehicle) throw new Error('The active vehicle no longer exists.');
    const prepared = prepareMaintenanceRecordInput(vehicle, input, new Date().toISOString());
    result = await insertMaintenanceRecordInTransaction(transaction, vehicleId, prepared);
  });
  if (!result) throw new Error('Maintenance record could not be saved.');
  return result;
}

export async function updateMaintenanceRecord(
  id: number,
  input: CreateMaintenanceRecordInput
): Promise<boolean> {
  if (!Number.isSafeInteger(id) || id <= 0) {
    throw new Error('Maintenance record ID must be a positive whole number.');
  }
  const database = await getDb();
  const vehicleId = await getActiveVehicleIdForDb(database);
  let updated = false;
  await withWriteTransaction(database, async (transaction) => {
    const [vehicle, existing] = await Promise.all([
      transaction.getFirstAsync<VehicleProfile>('SELECT * FROM vehicle_profile WHERE id = ?', [vehicleId]),
      transaction.getFirstAsync<ServiceLog>(
        'SELECT * FROM service_logs WHERE id = ? AND vehicle_id = ?',
        [id, vehicleId]
      ),
    ]);
    if (!vehicle) throw new Error('The active vehicle no longer exists.');
    if (!existing) return;
    const currentProfile = selectableMaintenanceProfileForVehicle(vehicle);
    if (
      existing.maintenance_profile_id
      && existing.maintenance_profile_id !== currentProfile?.id
    ) {
      throw new Error(
        'This record belongs to a previous scooter profile and cannot be reinterpreted under the current selection.'
      );
    }
    const prepared = prepareMaintenanceRecordInput(
      vehicle,
      input,
      new Date().toISOString(),
      existing
    );
    updated = await updateMaintenanceRecordInTransaction(
      transaction,
      vehicleId,
      id,
      prepared
    );
  });
  return updated;
}

export async function deleteMaintenanceRecord(id: number): Promise<boolean> {
  if (!Number.isSafeInteger(id) || id <= 0) {
    throw new Error('Maintenance record ID must be a positive whole number.');
  }
  const database = await getDb();
  const vehicleId = await getActiveVehicleIdForDb(database);
  let deleted = false;
  await withWriteTransaction(database, async (transaction) => {
    deleted = await deleteMaintenanceRecordInTransaction(
      transaction,
      vehicleId,
      id,
      new Date().toISOString()
    );
  });
  return deleted;
}

export async function recordMaintenanceEvent(input: MaintenanceEventInput): Promise<void> {
  if (input.inspectionResult && !INSPECTION_RESULTS.has(input.inspectionResult)) {
    throw new Error('Select a valid inspection result.');
  }
  await createMaintenanceRecord({
    serviceDate: input.performedOn,
    mileageKm: input.odometerKm,
    dateConfidence: 'confirmed',
    mileageConfidence: 'confirmed',
    notes: input.notes,
    cost: input.cost,
    recordSource: 'maintenance_planner',
    actions: [{
      ruleId: input.ruleId,
      action: input.action,
      inspectionResult: input.inspectionResult,
    }],
  });
}

export async function getMaintenanceEvents(): Promise<MaintenanceEvent[]> {
  const database = await getDb();
  const vehicleId = await getActiveVehicleIdForDb(database);
  const vehicle = await database.getFirstAsync<VehicleProfile>(
    'SELECT * FROM vehicle_profile WHERE id = ?',
    [vehicleId]
  );
  if (!vehicle) throw new Error('The active vehicle no longer exists.');
  const profile = selectableMaintenanceProfileForVehicle(vehicle);
  if (!profile) return [];
  const rows = await database.getAllAsync<ServiceLog>(
    `SELECT * FROM service_logs
     WHERE vehicle_id = ? AND maintenance_profile_id = ?
       AND maintenance_migration_status IN ('confirmed', 'exact')
       AND maintenance_rule_id IS NOT NULL AND maintenance_profile_id IS NOT NULL
     ORDER BY
       CASE WHEN maintenance_date_confidence = 'confirmed' THEN 0 ELSE 1 END,
       date ASC,
       CASE WHEN maintenance_mileage_confidence = 'confirmed' THEN 0 ELSE 1 END,
       mileage ASC,
       created_at ASC,
       id ASC`,
    [vehicleId, profile.id]
  );
  return rows.flatMap((row) => {
    if (
      !row.maintenance_rule_id
      || !row.maintenance_component_id
      || !row.maintenance_action
      || !row.maintenance_profile_id
      || !row.maintenance_profile_version
      || !MAINTENANCE_ACTIONS.has(row.maintenance_action as MaintenanceAction)
    ) return [];
    const hasConfirmedDate = row.maintenance_date_confidence === 'confirmed'
      && isValidIsoDate(row.date);
    const hasConfirmedMileage = row.maintenance_mileage_confidence === 'confirmed'
      && row.sets_odometer_baseline === 1;
    if (!hasConfirmedDate && !hasConfirmedMileage) return [];
    const source: MaintenanceEvent['recordSource'] = row.maintenance_record_source === 'maintenance_planner'
      ? 'planner'
      : row.maintenance_record_source === 'history_onboarding'
        ? 'history_onboarding'
        : row.maintenance_record_source === 'backup_restore'
          ? 'import'
          : row.maintenance_record_source === 'legacy'
            ? 'legacy'
            : 'manual_entry';
    return [{
      id: String(row.id),
      vehicleId: row.vehicle_id,
      profileId: row.maintenance_profile_id,
      profileVersion: row.maintenance_profile_version,
      ruleId: row.maintenance_rule_id,
      componentId: row.maintenance_component_id,
      action: row.maintenance_action as MaintenanceAction,
      performedOn: hasConfirmedDate ? row.date : '',
      odometerKm: hasConfirmedMileage ? row.mileage : null,
      mileageConfidence: row.maintenance_mileage_confidence ?? 'unknown',
      dateConfidence: row.maintenance_date_confidence ?? 'unknown',
      inspectionResult: row.inspection_result as InspectionResult | null | undefined,
      notes: row.notes,
      cost: row.cost,
      serviceProvider: row.service_provider ?? null,
      recordSource: source,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      migrationConfidence: 'exact',
    }];
  });
}

export async function getMaintenancePreferences(): Promise<MaintenancePreference[]> {
  const database = await getDb();
  const vehicleId = await getActiveVehicleIdForDb(database);
  const vehicle = await database.getFirstAsync<VehicleProfile>(
    'SELECT * FROM vehicle_profile WHERE id = ?',
    [vehicleId]
  );
  if (!vehicle) throw new Error('The active vehicle no longer exists.');
  const profile = selectableMaintenanceProfileForVehicle(vehicle);
  if (!profile) return [];
  return database.getAllAsync<MaintenancePreference>(
    `SELECT * FROM maintenance_preferences
     WHERE vehicle_id = ? AND profile_id = ?
     ORDER BY component_id COLLATE NOCASE ASC, action ASC, id ASC`,
    [vehicleId, profile.id]
  );
}

export async function setMaintenancePreference(
  input: SetMaintenancePreferenceInput
): Promise<MaintenancePreference> {
  const database = await getDb();
  const vehicleId = await getActiveVehicleIdForDb(database);
  let preference: MaintenancePreference | null = null;
  await withWriteTransaction(database, async (transaction) => {
    const vehicle = await transaction.getFirstAsync<VehicleProfile>(
      'SELECT * FROM vehicle_profile WHERE id = ?',
      [vehicleId]
    );
    if (!vehicle) throw new Error('The active vehicle no longer exists.');
    const profile = selectableMaintenanceProfileForVehicle(vehicle);
    if (!profile) throw new Error('A validated maintenance profile is required.');
    preference = await setMaintenancePreferenceInTransaction(
      transaction,
      vehicleId,
      profile.id,
      input,
      new Date().toISOString()
    );
  });
  if (!preference) throw new Error('Maintenance preference could not be saved.');
  return preference;
}

export async function setMaintenanceTracked(
  componentId: string,
  action: MaintenanceAction,
  tracked: boolean
): Promise<void> {
  const database = await getDb();
  const vehicleId = await getActiveVehicleIdForDb(database);
  await withWriteTransaction(database, async (transaction) => {
    const vehicle = await transaction.getFirstAsync<VehicleProfile>(
      'SELECT * FROM vehicle_profile WHERE id = ?',
      [vehicleId]
    );
    if (!vehicle) throw new Error('The active vehicle no longer exists.');
    const profile = selectableMaintenanceProfileForVehicle(vehicle);
    if (!profile) throw new Error('A validated maintenance profile is required.');
    await setMaintenanceTrackedInTransaction(
      transaction,
      vehicleId,
      profile.id,
      componentId,
      action,
      tracked,
      new Date().toISOString()
    );
  });
}

export async function restoreMaintenancePreference(
  componentId: string,
  action: MaintenanceAction
): Promise<MaintenancePreference | null> {
  const database = await getDb();
  const vehicleId = await getActiveVehicleIdForDb(database);
  let preference: MaintenancePreference | null = null;
  await withWriteTransaction(database, async (transaction) => {
    const vehicle = await transaction.getFirstAsync<VehicleProfile>(
      'SELECT * FROM vehicle_profile WHERE id = ?',
      [vehicleId]
    );
    if (!vehicle) throw new Error('The active vehicle no longer exists.');
    const profile = selectableMaintenanceProfileForVehicle(vehicle);
    if (!profile) throw new Error('A validated maintenance profile is required.');
    preference = await restoreMaintenancePreferenceInTransaction(
      transaction,
      vehicleId,
      profile.id,
      componentId,
      action,
      new Date().toISOString()
    );
  });
  return preference;
}

const MAINTENANCE_HISTORY_LEVELS = new Set<MaintenanceHistoryLevel>([
  'not_asked',
  'detailed_records',
  'recent_memory',
  'little_or_none',
  'skipped',
]);

export async function getMaintenanceHistoryLevel(): Promise<MaintenanceHistoryLevel> {
  const database = await getDb();
  const vehicleId = await getActiveVehicleIdForDb(database);
  const row = await database.getFirstAsync<{ maintenance_history_level: string }>(
    'SELECT maintenance_history_level FROM vehicle_profile WHERE id = ?',
    [vehicleId]
  );
  if (!row) throw new Error('The active vehicle no longer exists.');
  return MAINTENANCE_HISTORY_LEVELS.has(row.maintenance_history_level as MaintenanceHistoryLevel)
    ? row.maintenance_history_level as MaintenanceHistoryLevel
    : 'not_asked';
}

export async function setMaintenanceHistoryLevel(level: MaintenanceHistoryLevel): Promise<void> {
  const database = await getDb();
  const vehicleId = await getActiveVehicleIdForDb(database);
  await withWriteTransaction(database, (transaction) => (
    setMaintenanceHistoryLevelInTransaction(transaction, vehicleId, level)
  ));
}

export async function setMaintenanceHistoryState(
  input: SetMaintenanceHistoryStateInput
): Promise<MaintenanceHistoryState> {
  const [state] = await setMaintenanceHistoryStates([input]);
  return state;
}

export async function setMaintenanceHistoryStates(
  inputs: SetMaintenanceHistoryStateInput[]
): Promise<MaintenanceHistoryState[]> {
  const database = await getDb();
  const vehicleId = await getActiveVehicleIdForDb(database);
  const states: MaintenanceHistoryState[] = [];
  const keys = new Set<string>();
  await withWriteTransaction(database, async (transaction) => {
    const timestamp = new Date().toISOString();
    const vehicle = await transaction.getFirstAsync<VehicleProfile>(
      'SELECT * FROM vehicle_profile WHERE id = ?',
      [vehicleId]
    );
    if (!vehicle) throw new Error('The active vehicle no longer exists.');
    const profile = selectableMaintenanceProfileForVehicle(vehicle);
    if (!profile) throw new Error('A validated maintenance profile is required.');
    for (const input of inputs) {
      const key = `${input.componentId.trim()}\u0000${input.action}`;
      if (keys.has(key)) throw new Error('Maintenance history states cannot repeat a component action.');
      keys.add(key);
      states.push(await setMaintenanceHistoryStateInTransaction(
        transaction,
        vehicleId,
        profile.id,
        input,
        timestamp
      ));
    }
  });
  return states;
}

export async function getMaintenanceHistoryStates(): Promise<MaintenanceHistoryState[]> {
  const database = await getDb();
  const vehicleId = await getActiveVehicleIdForDb(database);
  const vehicle = await database.getFirstAsync<VehicleProfile>(
    'SELECT * FROM vehicle_profile WHERE id = ?',
    [vehicleId]
  );
  if (!vehicle) throw new Error('The active vehicle no longer exists.');
  const profile = selectableMaintenanceProfileForVehicle(vehicle);
  if (!profile) return [];
  return database.getAllAsync<MaintenanceHistoryState>(
    `SELECT * FROM maintenance_history_states
     WHERE vehicle_id = ? AND profile_id = ?
     ORDER BY component_id COLLATE NOCASE ASC, action ASC`,
    [vehicleId, profile.id]
  );
}

export async function completeServiceHistorySetup(entries: ServiceCompletionInput[]): Promise<void> {
  const preparedEntries = entries.map(prepareServiceCompletion);
  const database = await getDb();
  const vehicleId = await getActiveVehicleIdForDb(database);

  await withWriteTransaction(database, async (transaction) => {
    await completeServiceHistorySetupInTransaction(transaction, vehicleId, preparedEntries);
  });
}

export async function getLatestLogForServiceType(serviceTypeName: string): Promise<ServiceLog | null> {
  const database = await getDb();
  const vehicleId = await getActiveVehicleIdForDb(database);
  const row = await database.getFirstAsync<ServiceLog>(
    `SELECT * FROM service_logs
     WHERE vehicle_id = ? AND service_type = ?
     ORDER BY date DESC, id DESC LIMIT 1`,
    [vehicleId, serviceTypeName]
  );
  return row ?? null;
}

export async function deleteServiceLogAndRecomputeBaseline(id: number): Promise<boolean> {
  if (!Number.isSafeInteger(id) || id <= 0) {
    throw new Error('Service log ID must be a positive whole number.');
  }

  const database = await getDb();
  const vehicleId = await getActiveVehicleIdForDb(database);
  let deleted = false;

  await withWriteTransaction(database, async (transaction) => {
    deleted = await deleteServiceLogInTransaction(transaction, vehicleId, id);
  });

  return deleted;
}

export async function getServiceIntervals(): Promise<ServiceInterval[]> {
  const database = await getDb();
  const vehicleId = await getActiveVehicleIdForDb(database);
  return database.getAllAsync<ServiceInterval>(
    'SELECT * FROM service_intervals WHERE vehicle_id = ? AND is_applicable = 1 ORDER BY id ASC',
    [vehicleId]
  );
}

export async function updateServiceInterval(
  id: number,
  updates: Pick<Partial<ServiceInterval>, 'interval_km'>
): Promise<void> {
  if (updates.interval_km !== undefined && updates.interval_km !== null) {
    if (!Number.isSafeInteger(updates.interval_km) || updates.interval_km <= 0) {
      throw new Error('Maintenance interval must be a positive whole number or unset.');
    }
  }

  const database = await getDb();
  const vehicleId = await getActiveVehicleIdForDb(database);
  const fields: string[] = [];
  const values: (string | number | null)[] = [];

  if (updates.interval_km !== undefined) {
    fields.push('interval_km = ?', 'user_interval_km = ?', 'user_override_active = 1', "recommendation_origin = 'user_override'");
    values.push(updates.interval_km, updates.interval_km);
  }
  if (fields.length === 0) return;

  values.push(id, vehicleId);
  await database.runAsync(
    `UPDATE service_intervals SET ${fields.join(', ')} WHERE id = ? AND vehicle_id = ?`,
    values
  );
}

export async function getDatabaseBackupData(): Promise<DatabaseBackupData> {
  const database = await getDb();
  const activeVehicleId = await getActiveVehicleIdForDb(database);
  const [
    vehicleProfiles,
    vehicleVitals,
    serviceIntervals,
    serviceLogs,
    gasLogs,
    inventoryItems,
    documents,
    preRideChecks,
    preRideRuns,
    maintenancePreferences,
    maintenanceHistoryStates,
    odometerEvents,
  ] = await Promise.all([
    database.getAllAsync<VehicleProfile>('SELECT * FROM vehicle_profile ORDER BY id ASC'),
    database.getAllAsync<VehicleVitals>('SELECT * FROM vehicle_vitals ORDER BY id ASC'),
    database.getAllAsync<ServiceInterval>('SELECT * FROM service_intervals ORDER BY id ASC'),
    database.getAllAsync<ServiceLog>('SELECT * FROM service_logs ORDER BY id ASC'),
    database.getAllAsync<GasLog>('SELECT * FROM gas_logs ORDER BY id ASC'),
    database.getAllAsync<InventoryItem>('SELECT * FROM inventory_items ORDER BY id ASC'),
    database.getAllAsync<DocumentItem>('SELECT * FROM documents_vault ORDER BY id ASC'),
    database.getAllAsync<PreRideState>('SELECT * FROM pre_ride_checks ORDER BY id ASC'),
    database.getAllAsync<PreRideRun>('SELECT * FROM pre_ride_runs ORDER BY id ASC'),
    database.getAllAsync<MaintenancePreference>('SELECT * FROM maintenance_preferences ORDER BY id ASC'),
    database.getAllAsync<MaintenanceHistoryState>(
      'SELECT * FROM maintenance_history_states ORDER BY vehicle_id ASC, profile_id ASC, component_id ASC, action ASC'
    ),
    database.getAllAsync<OdometerEvent>('SELECT * FROM odometer_events ORDER BY id ASC'),
  ]);

  return {
    active_vehicle_id: activeVehicleId,
    vehicle_profiles: vehicleProfiles,
    vehicle_vitals: vehicleVitals,
    service_intervals: serviceIntervals,
    service_logs: serviceLogs,
    gas_logs: gasLogs,
    inventory_items: inventoryItems,
    documents_vault: documents,
    pre_ride_checks: preRideChecks,
    pre_ride_runs: preRideRuns,
    maintenance_preferences: maintenancePreferences,
    maintenance_history_states: maintenanceHistoryStates,
    odometer_events: odometerEvents,
  };
}

export async function restoreDatabaseBackupData(data: DatabaseBackupData): Promise<void> {
  validateDatabaseBackupData(data);
  const database = await getDb();
  await database.execAsync('BEGIN;');

  try {
    for (const table of [
      'maintenance_history_states',
      'maintenance_preferences',
      'odometer_correction_authorizations',
      'odometer_events',
      'vehicle_vitals',
      'gas_logs',
      'inventory_items',
      'documents_vault',
      'pre_ride_checks',
      'pre_ride_runs',
      'service_logs',
      'service_intervals',
      'vehicle_profile',
    ]) {
      await database.execAsync(`DELETE FROM ${table};`);
    }

    for (const vehicle of data.vehicle_profiles) {
      await database.runAsync(
        `INSERT INTO vehicle_profile (
          id, name, current_mileage, total_km_range, has_completed_setup, created_at,
          daily_average_km, last_odometer_update_timestamp, service_history_setup_completed, tank_capacity_liters,
          scooter_brand_id, scooter_model_id, scooter_version_id, scooter_variant_id, maintenance_history_level
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          vehicle.id,
          vehicle.name,
          vehicle.current_mileage,
          vehicle.total_km_range,
          vehicle.has_completed_setup,
          vehicle.created_at,
          vehicle.daily_average_km,
          vehicle.last_odometer_update_timestamp,
          vehicle.service_history_setup_completed,
          vehicle.tank_capacity_liters,
          vehicle.scooter_brand_id,
          vehicle.scooter_model_id,
          vehicle.scooter_version_id,
          vehicle.scooter_variant_id ?? null,
          vehicle.maintenance_history_level ?? 'not_asked',
        ]
      );
    }

    for (const row of data.vehicle_vitals) {
      await database.runAsync(
        `INSERT INTO vehicle_vitals (
          id, vehicle_id, oil_life_pct, tire_pressure_psi, battery_health_pct,
          coolant_temp_c, brake_pad_pct, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          row.id,
          row.vehicle_id,
          row.oil_life_pct,
          row.tire_pressure_psi,
          row.battery_health_pct,
          row.coolant_temp_c,
          row.brake_pad_pct,
          row.updated_at,
        ]
      );
    }

    for (const row of data.service_intervals) {
      await database.runAsync(
        `INSERT INTO service_intervals (
           id, vehicle_id, name, interval_km, last_service_odometer_km,
           has_known_odometer_baseline, type, canonical_task_id, recommended_interval_km,
           recommended_interval_months, user_interval_km, user_override_active, recommendation_origin,
           source_manual_id, source_pages_json, manual_guidance_json, initial_milestones_json,
           severe_use_note, is_applicable, last_service_date
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          row.id,
          row.vehicle_id,
          row.name,
          row.interval_km,
          row.last_service_odometer_km,
          row.has_known_odometer_baseline,
          row.type,
          row.canonical_task_id ?? null,
          row.recommended_interval_km ?? row.interval_km,
          row.recommended_interval_months ?? null,
          row.user_interval_km ?? null,
          row.user_override_active ?? 0,
          row.recommendation_origin ?? 'manual',
          row.source_manual_id ?? null,
          row.source_pages_json ?? null,
          row.manual_guidance_json ?? null,
          row.initial_milestones_json ?? null,
          row.severe_use_note ?? null,
          row.is_applicable ?? 1,
          row.last_service_date ?? null,
        ]
      );
    }

    for (const row of data.service_logs) {
      await database.runAsync(
        `INSERT INTO service_logs (
           id, vehicle_id, title, date, mileage, category, notes, cost,
           service_type, sets_odometer_baseline, maintenance_rule_id,
           maintenance_component_id, maintenance_action, maintenance_profile_id,
           maintenance_profile_version, inspection_result, maintenance_migration_status,
           maintenance_mileage_confidence, maintenance_date_confidence,
           maintenance_record_source, service_provider, service_package_id,
           service_package_title, oil_brand, oil_type, oil_viscosity, oil_notes,
           duplicate_confirmed, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          row.id,
          row.vehicle_id,
          row.title,
          row.date,
          row.mileage,
          row.category,
          row.notes,
          row.cost,
          row.service_type,
          row.sets_odometer_baseline,
          row.maintenance_rule_id ?? null,
          row.maintenance_component_id ?? null,
          row.maintenance_action ?? null,
          row.maintenance_profile_id ?? null,
          row.maintenance_profile_version ?? null,
          row.inspection_result ?? null,
          row.maintenance_migration_status === 'exact'
            ? 'confirmed'
            : row.maintenance_migration_status === 'legacy_needs_confirmation'
              ? 'legacy_unmapped'
              : row.maintenance_migration_status ?? 'legacy_unmapped',
          row.maintenance_mileage_confidence
            ?? (row.maintenance_migration_status === 'exact' && row.sets_odometer_baseline === 1
              ? 'confirmed'
              : 'legacy_unmapped'),
          row.maintenance_date_confidence
            ?? (row.maintenance_migration_status === 'exact' && isValidIsoDate(row.date)
              ? 'confirmed'
              : 'legacy_unmapped'),
          row.maintenance_record_source
            ?? (row.maintenance_migration_status === 'exact' ? 'maintenance_planner' : 'legacy'),
          row.service_provider ?? null,
          row.service_package_id ?? null,
          row.service_package_title ?? null,
          row.oil_brand ?? null,
          row.oil_type ?? null,
          row.oil_viscosity ?? null,
          row.oil_notes ?? null,
          row.duplicate_confirmed ?? 0,
          row.created_at ?? new Date().toISOString(),
          row.updated_at ?? row.created_at ?? new Date().toISOString(),
        ]
      );
    }

    for (const row of data.maintenance_preferences ?? []) {
      await database.runAsync(
        `INSERT INTO maintenance_preferences (
           id, vehicle_id, profile_id, component_id, action, profile_recommended_interval_km,
           user_interval_km, effective_interval_km, original_interval_km,
           original_interval_months, custom_interval_km, custom_interval_months,
           effective_interval_months, distance_enabled, time_enabled,
           condition_based_default, custom_condition_reminder_enabled, tracked, interval_source,
           longer_than_recommended_confirmed, reason, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          row.id,
          row.vehicle_id,
          row.profile_id,
          row.component_id,
          row.action,
          row.profile_recommended_interval_km,
          row.user_interval_km,
          row.effective_interval_km,
          row.original_interval_km ?? row.profile_recommended_interval_km,
          row.original_interval_months ?? null,
          row.custom_interval_km ?? row.user_interval_km,
          row.custom_interval_months ?? null,
          row.effective_interval_months ?? null,
          row.distance_enabled ?? (row.effective_interval_km !== null ? 1 : 0),
          row.time_enabled ?? 0,
          row.condition_based_default ?? 0,
          row.custom_condition_reminder_enabled ?? 0,
          row.tracked ?? null,
          row.interval_source,
          row.longer_than_recommended_confirmed,
          row.reason,
          row.created_at,
          row.updated_at,
        ]
      );
    }

    for (const row of data.maintenance_history_states ?? []) {
      await database.runAsync(
        `INSERT INTO maintenance_history_states (
           vehicle_id, profile_id, component_id, action, history_state, last_service_log_id,
           notes, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          row.vehicle_id,
          row.profile_id,
          row.component_id,
          row.action,
          row.history_state,
          row.last_service_log_id,
          row.notes,
          row.created_at,
          row.updated_at,
        ]
      );
    }

    for (const row of data.odometer_events ?? []) {
      await database.runAsync(
        `INSERT INTO odometer_events (
           id, vehicle_id, event_type, previous_effective_km, new_effective_km,
           previous_displayed_km, new_displayed_km, reason, recorded_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          row.id,
          row.vehicle_id,
          row.event_type,
          row.previous_effective_km,
          row.new_effective_km,
          row.previous_displayed_km,
          row.new_displayed_km,
          row.reason,
          row.recorded_at,
        ]
      );
    }

    for (const row of data.gas_logs) {
      await database.runAsync(
        `INSERT INTO gas_logs (
          id, vehicle_id, liters, cost, odometer_km, station, logged_at, logged_on, is_full_tank
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          row.id,
          row.vehicle_id,
          row.liters,
          row.cost,
          row.odometer_km,
          row.station,
          row.logged_at,
          row.logged_on,
          row.is_full_tank,
        ]
      );
    }

    for (const row of data.inventory_items) {
      await database.runAsync(
        `INSERT INTO inventory_items (id, vehicle_id, name, category, status, quantity, last_replaced_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [row.id, row.vehicle_id, row.name, row.category, row.status, row.quantity, row.last_replaced_at]
      );
    }

    for (const row of data.documents_vault) {
      await database.runAsync(
        `INSERT INTO documents_vault (id, vehicle_id, title, image_uri, expiry_date, added_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [row.id, row.vehicle_id, row.title, row.image_uri, row.expiry_date, row.added_at]
      );
    }

    for (const row of data.pre_ride_checks) {
      await database.runAsync(
        `INSERT INTO pre_ride_checks (
          id, vehicle_id, brakes_checked, tires_checked, lights_checked, oil_checked, last_run_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [row.id, row.vehicle_id, row.brakes_checked, row.tires_checked, row.lights_checked, row.oil_checked, row.last_run_at]
      );
    }

    for (const row of data.pre_ride_runs ?? []) {
      await database.runAsync(
        `INSERT INTO pre_ride_runs (
          id, vehicle_id, manual_id, variant_id, completed_at, items_json, completed_count, total_count
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          row.id,
          row.vehicle_id,
          row.manual_id,
          row.variant_id,
          row.completed_at,
          row.items_json,
          row.completed_count,
          row.total_count,
        ]
      );
    }

    await reconcileExplicitServiceBaselines(database);
    const activeId = data.active_vehicle_id ?? data.vehicle_profiles[0]?.id ?? 1;
    await setActiveVehicleIdForDb(database, activeId);
    await database.execAsync('COMMIT;');
    await ensureDefaultVehicle(database);
  } catch (error) {
    await database.execAsync('ROLLBACK;').catch(() => undefined);
    throw error;
  }
}
