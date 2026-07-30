export const CURRENT_SCHEMA_VERSION = 12;

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
    tank_capacity_liters REAL,
    scooter_brand_id TEXT,
    scooter_model_id TEXT,
    scooter_version_id TEXT
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
    sets_odometer_baseline INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE service_intervals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    vehicle_id INTEGER NOT NULL DEFAULT 1,
    name TEXT NOT NULL,
    interval_km INTEGER,
    last_service_odometer_km INTEGER NOT NULL DEFAULT 0,
    type TEXT NOT NULL,
    has_known_odometer_baseline INTEGER NOT NULL DEFAULT 0,
    UNIQUE(vehicle_id, name)
  );

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

  CREATE TRIGGER prevent_date_only_odometer_insert
  BEFORE INSERT ON service_logs
  WHEN NEW.sets_odometer_baseline = 0 AND NEW.mileage != 0
  BEGIN
    SELECT RAISE(ABORT, 'Date-only service history cannot include an odometer reading');
  END;

  CREATE TRIGGER prevent_date_only_odometer_update
  BEFORE UPDATE OF mileage, sets_odometer_baseline ON service_logs
  WHEN NEW.sets_odometer_baseline = 0 AND NEW.mileage != 0
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
  CREATE INDEX idx_inventory_items_vehicle_name ON inventory_items(vehicle_id, name COLLATE NOCASE);
  CREATE INDEX idx_documents_vault_vehicle_expiry ON documents_vault(vehicle_id, expiry_date, added_at DESC);
  CREATE INDEX idx_service_intervals_vehicle_name ON service_intervals(vehicle_id, name);
  CREATE INDEX idx_vehicle_vitals_vehicle ON vehicle_vitals(vehicle_id);
  CREATE INDEX idx_pre_ride_checks_vehicle ON pre_ride_checks(vehicle_id);
`;
