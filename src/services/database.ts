import * as SQLite from 'expo-sqlite';
import type { VehicleProfile, VehicleVitals, GasLog, InventoryItem, DocumentItem, PreRideState } from '../types/database.types';

// ── Database singleton ──
let db: SQLite.SQLiteDatabase | null = null;

async function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (!db) {
    db = await SQLite.openDatabaseAsync('3azza.db');
  }
  return db;
}

// ── Initialisation ──

export async function initDatabase(): Promise<void> {
  const database = await getDb();

  // Handle migration: drop old vehicle_stats table if it exists
  await database.execAsync(`
    DROP TABLE IF EXISTS vehicle_stats;

    CREATE TABLE IF NOT EXISTS vehicle_profile (
      id INTEGER PRIMARY KEY DEFAULT 1,
      current_mileage INTEGER NOT NULL DEFAULT 0,
      total_km_range INTEGER NOT NULL DEFAULT 0,
      has_completed_setup INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      daily_average_km INTEGER NOT NULL DEFAULT 0,
      last_odometer_update_timestamp TEXT,
      CHECK (id = 1) -- Ensures only one row exists
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
      expiry_date TEXT NOT NULL,
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

  // Insert Default Intervals (using INSERT OR IGNORE since name is UNIQUE)
  await database.execAsync(`
    INSERT OR IGNORE INTO service_intervals (name, interval_km, last_service_odometer_km, type) VALUES 
      ('Oil Change', 1000, 0, 'replace'),
      ('Gearbox Oil Change', 3000, 0, 'replace'),
      ('Air Filter', 1000, 0, 'check'),
      ('Brake Pads', 2000, 0, 'check'),
      ('Cleaning', NULL, 0, 'clean'),
      ('CVT & Pull Rollers', 5000, 0, 'check'),
        ('Carburetor', 5000, 0, 'clean');
  `);

  // Handle runtime table migrations safely
  try { await database.execAsync('ALTER TABLE vehicle_profile ADD COLUMN daily_average_km INTEGER NOT NULL DEFAULT 0;'); } catch (e) {}
  try { await database.execAsync('ALTER TABLE vehicle_profile ADD COLUMN last_odometer_update_timestamp TEXT;'); } catch (e) {}
  // Smart-Link migration: add service_type to link logs to tracked intervals
  try { await database.execAsync('ALTER TABLE service_logs ADD COLUMN service_type TEXT;'); } catch (e) {}
}

// ══════════════════════════════════════════════════════════
//  Vehicle Profile
// ══════════════════════════════════════════════════════════

export async function getVehicleProfile(): Promise<VehicleProfile | null> {
  const database = await getDb();
  const row = await database.getFirstAsync<VehicleProfile>(
    'SELECT * FROM vehicle_profile WHERE id = 1'
  );
  return row ?? null;
}

export async function saveVehicleProfile(
  profile: Partial<Omit<VehicleProfile, 'id' | 'created_at'>>
): Promise<void> {
  const database = await getDb();
  const existing = await getVehicleProfile();

  if (!existing) {
    const p = {
      current_mileage: profile.current_mileage ?? 0,
      total_km_range: profile.total_km_range ?? 0,
      has_completed_setup: profile.has_completed_setup ?? 0,
    };
    await database.runAsync(
      `INSERT INTO vehicle_profile (id, current_mileage, total_km_range, has_completed_setup)
       VALUES (1, ?, ?, ?)`,
      [p.current_mileage, p.total_km_range, p.has_completed_setup]
    );
  } else {
    const fields: string[] = [];
    const values: (string | number | null)[] = [];

    if (profile.current_mileage !== undefined) { fields.push('current_mileage = ?'); values.push(profile.current_mileage); }
    if (profile.total_km_range !== undefined) { fields.push('total_km_range = ?'); values.push(profile.total_km_range); }
    if (profile.has_completed_setup !== undefined) { fields.push('has_completed_setup = ?'); values.push(profile.has_completed_setup); }
    if (profile.daily_average_km !== undefined) { fields.push('daily_average_km = ?'); values.push(profile.daily_average_km); }
    if (profile.last_odometer_update_timestamp !== undefined) { fields.push('last_odometer_update_timestamp = ?'); values.push(profile.last_odometer_update_timestamp); }

    if (fields.length > 0) {
      await database.runAsync(
        `UPDATE vehicle_profile SET ${fields.join(', ')} WHERE id = 1`,
        values
      );
    }
  }
}

// ══════════════════════════════════════════════════════════
//  Vehicle Vitals
// ══════════════════════════════════════════════════════════

export async function getVehicleVitals(): Promise<VehicleVitals | null> {
  const database = await getDb();
  const row = await database.getFirstAsync<VehicleVitals>(
    'SELECT * FROM vehicle_vitals WHERE id = 1'
  );
  return row ?? null;
}

export async function saveVehicleVitals(
  vitals: Partial<Omit<VehicleVitals, 'id' | 'updated_at'>>
): Promise<void> {
  const database = await getDb();
  const existing = await getVehicleVitals();

  if (!existing) {
    const v = {
      oil_life_pct: vitals.oil_life_pct ?? 0,
      tire_pressure_psi: vitals.tire_pressure_psi ?? 0,
      battery_health_pct: vitals.battery_health_pct ?? 0,
      coolant_temp_c: vitals.coolant_temp_c ?? 0,
      brake_pad_pct: vitals.brake_pad_pct ?? 0,
    };
    await database.runAsync(
      `INSERT INTO vehicle_vitals (id, oil_life_pct, tire_pressure_psi, battery_health_pct, coolant_temp_c, brake_pad_pct)
       VALUES (1, ?, ?, ?, ?, ?)`,
      [v.oil_life_pct, v.tire_pressure_psi, v.battery_health_pct, v.coolant_temp_c, v.brake_pad_pct]
    );
  } else {
    const fields: string[] = [];
    const values: (string | number)[] = [];

    if (vitals.oil_life_pct !== undefined) { fields.push('oil_life_pct = ?'); values.push(vitals.oil_life_pct); }
    if (vitals.tire_pressure_psi !== undefined) { fields.push('tire_pressure_psi = ?'); values.push(vitals.tire_pressure_psi); }
    if (vitals.battery_health_pct !== undefined) { fields.push('battery_health_pct = ?'); values.push(vitals.battery_health_pct); }
    if (vitals.coolant_temp_c !== undefined) { fields.push('coolant_temp_c = ?'); values.push(vitals.coolant_temp_c); }
    if (vitals.brake_pad_pct !== undefined) { fields.push('brake_pad_pct = ?'); values.push(vitals.brake_pad_pct); }

    if (fields.length > 0) {
      fields.push("updated_at = datetime('now')");
      await database.runAsync(
        `UPDATE vehicle_vitals SET ${fields.join(', ')} WHERE id = 1`,
        values
      );
    }
  }
}

// ══════════════════════════════════════════════════════════
//  Gas Logs
// ══════════════════════════════════════════════════════════

export async function getGasLogs(): Promise<GasLog[]> {
  const database = await getDb();
  return database.getAllAsync<GasLog>(
    'SELECT * FROM gas_logs ORDER BY logged_at DESC'
  );
}

export async function insertGasLog(
  log: Omit<GasLog, 'id' | 'logged_at'>
): Promise<void> {
  const database = await getDb();
  await database.runAsync(
    `INSERT INTO gas_logs (liters, cost, odometer_km, station)
     VALUES (?, ?, ?, ?)`,
    [log.liters, log.cost, log.odometer_km, log.station ?? null]
  );
}

export async function deleteGasLog(id: number): Promise<void> {
  const database = await getDb();
  await database.runAsync('DELETE FROM gas_logs WHERE id = ?', [id]);
}

// ══════════════════════════════════════════════════════════
//  Inventory Items
// ══════════════════════════════════════════════════════════

export async function getInventoryItems(): Promise<InventoryItem[]> {
  const database = await getDb();
  return database.getAllAsync<InventoryItem>(
    'SELECT * FROM inventory_items ORDER BY name ASC'
  );
}

export async function upsertInventoryItem(
  item: Omit<InventoryItem, 'id'>
): Promise<void> {
  const database = await getDb();
  await database.runAsync(
    `INSERT INTO inventory_items (name, category, status, quantity, last_replaced_at)
     VALUES (?, ?, ?, ?, ?)`,
    [item.name, item.category, item.status, item.quantity, item.last_replaced_at ?? null]
  );
}

export async function updateInventoryItem(
  id: number,
  item: Partial<Omit<InventoryItem, 'id'>>
): Promise<void> {
  const database = await getDb();
  const fields: string[] = [];
  const values: (string | number | null)[] = [];

  if (item.name !== undefined) { fields.push('name = ?'); values.push(item.name); }
  if (item.category !== undefined) { fields.push('category = ?'); values.push(item.category); }
  if (item.status !== undefined) { fields.push('status = ?'); values.push(item.status); }
  if (item.quantity !== undefined) { fields.push('quantity = ?'); values.push(item.quantity); }
  if (item.last_replaced_at !== undefined) { fields.push('last_replaced_at = ?'); values.push(item.last_replaced_at); }

  if (fields.length === 0) return;

  values.push(id);
  await database.runAsync(
    `UPDATE inventory_items SET ${fields.join(', ')} WHERE id = ?`,
    values
  );
}

export async function deleteInventoryItem(id: number): Promise<void> {
  const database = await getDb();
  await database.runAsync('DELETE FROM inventory_items WHERE id = ?', [id]);
}

// ── Documents Vault ──

export async function getDocuments(): Promise<DocumentItem[]> {
  const database = await getDb();
  return database.getAllAsync<DocumentItem>(
    'SELECT * FROM documents_vault ORDER BY expiry_date ASC'
  );
}

export async function addDocument(
  doc: Omit<DocumentItem, 'id' | 'added_at'>
): Promise<void> {
  const database = await getDb();
  await database.runAsync(
    `INSERT INTO documents_vault (title, image_uri, expiry_date) VALUES (?, ?, ?)`,
    [doc.title, doc.image_uri, doc.expiry_date]
  );
}

export async function deleteDocument(id: number): Promise<void> {
  const database = await getDb();
  await database.runAsync('DELETE FROM documents_vault WHERE id = ?', [id]);
}

// ── Pre-Ride Checks ──

export async function getPreRideState(): Promise<PreRideState | null> {
  const database = await getDb();
  return database.getFirstAsync<PreRideState>(
    'SELECT * FROM pre_ride_checks WHERE id = 1'
  );
}

export async function savePreRideState(state: Partial<PreRideState>): Promise<void> {
  const database = await getDb();
  
  // Ensure the row exists first
  const existing = await getPreRideState();
  if (!existing) {
    await database.runAsync(
      `INSERT INTO pre_ride_checks (id, brakes_checked, tires_checked, lights_checked, oil_checked, last_run_at) 
       VALUES (1, 0, 0, 0, 0, NULL)`
    );
  }

  const fields: string[] = [];
  const values: (string | number | null)[] = [];

  if (state.brakes_checked !== undefined) { fields.push('brakes_checked = ?'); values.push(state.brakes_checked); }
  if (state.tires_checked !== undefined) { fields.push('tires_checked = ?'); values.push(state.tires_checked); }
  if (state.lights_checked !== undefined) { fields.push('lights_checked = ?'); values.push(state.lights_checked); }
  if (state.oil_checked !== undefined) { fields.push('oil_checked = ?'); values.push(state.oil_checked); }
  if (state.last_run_at !== undefined) { fields.push('last_run_at = ?'); values.push(state.last_run_at); }

  if (fields.length === 0) return;

  values.push(1);
  await database.runAsync(
    `UPDATE pre_ride_checks SET ${fields.join(', ')} WHERE id = ?`,
    values
  );
}

// ── Service Logs ──

export async function getServiceLogs(): Promise<import('../types/database.types').ServiceLog[]> {
  const database = await getDb();
  return database.getAllAsync<import('../types/database.types').ServiceLog>(
    'SELECT * FROM service_logs ORDER BY date DESC'
  );
}

export async function addServiceLog(
  log: Omit<import('../types/database.types').ServiceLog, 'id'>
): Promise<void> {
  const database = await getDb();
  await database.runAsync(
    `INSERT INTO service_logs (title, date, mileage, category, notes, cost, service_type) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [log.title, log.date, log.mileage, log.category, log.notes, log.cost ?? null, log.service_type ?? null]
  );
}

export async function getServiceLogCount(): Promise<number> {
  const database = await getDb();
  const row = await database.getFirstAsync<{ count: number }>('SELECT COUNT(*) as count FROM service_logs');
  return row?.count ?? 0;
}

/** Returns the most recent service log for a given service interval name (Smart-Link + Unified Model) */
export async function getLatestLogForServiceType(
  serviceTypeName: string
): Promise<import('../types/database.types').ServiceLog | null> {
  const database = await getDb();
  const row = await database.getFirstAsync<import('../types/database.types').ServiceLog>(
    'SELECT * FROM service_logs WHERE service_type = ? ORDER BY mileage DESC, date DESC LIMIT 1',
    [serviceTypeName]
  );
  return row ?? null;
}

/** Resets a service interval's last_service_odometer_km by its name (used by Smart-Link on log save) */
export async function resetIntervalByName(intervalName: string, odometer: number): Promise<void> {
  const database = await getDb();
  await database.runAsync(
    'UPDATE service_intervals SET last_service_odometer_km = ? WHERE name = ?',
    [odometer, intervalName]
  );
}

export async function deleteServiceLog(id: number): Promise<void> {
  const database = await getDb();
  await database.runAsync('DELETE FROM service_logs WHERE id = ?', [id]);
}

// ── Service Intervals ──

export async function getServiceIntervals(): Promise<import('../types/database.types').ServiceInterval[]> {
  const database = await getDb();
  return database.getAllAsync<import('../types/database.types').ServiceInterval>(
    'SELECT * FROM service_intervals ORDER BY id ASC'
  );
}

export async function updateServiceInterval(
  id: number,
  updates: Partial<Omit<import('../types/database.types').ServiceInterval, 'id' | 'name'>>
): Promise<void> {
  const database = await getDb();
  const fields: string[] = [];
  const values: (string | number | null)[] = [];

  if (updates.interval_km !== undefined) { fields.push('interval_km = ?'); values.push(updates.interval_km); }
  if (updates.last_service_odometer_km !== undefined) { fields.push('last_service_odometer_km = ?'); values.push(updates.last_service_odometer_km); }
  if (updates.type !== undefined) { fields.push('type = ?'); values.push(updates.type); }

  if (fields.length === 0) return;

  values.push(id);
  await database.runAsync(
    `UPDATE service_intervals SET ${fields.join(', ')} WHERE id = ?`,
    values
  );
}
