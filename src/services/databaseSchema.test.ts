import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { describe, it } from 'node:test';
import { CURRENT_SCHEMA_SQL, CURRENT_SCHEMA_VERSION } from './databaseSchema';

function createCurrentDatabase(): DatabaseSync {
  const database = new DatabaseSync(':memory:');
  database.exec(CURRENT_SCHEMA_SQL);
  return database;
}

describe('fresh-install database schema', () => {
  it('creates the current multi-vehicle tables directly', () => {
    const database = createCurrentDatabase();
    try {
      assert.equal(CURRENT_SCHEMA_VERSION, 12);
      const profileColumns = database.prepare('PRAGMA table_info(vehicle_profile)').all()
        .map((column) => (column as { name: string }).name);
      const expectedProfileColumns = [
        'id',
        'name',
        'current_mileage',
        'total_km_range',
        'has_completed_setup',
        'created_at',
        'daily_average_km',
        'last_odometer_update_timestamp',
        'service_history_setup_completed',
        'tank_capacity_liters',
        'scooter_brand_id',
        'scooter_model_id',
        'scooter_version_id',
      ];
      assert.deepEqual(profileColumns, expectedProfileColumns);

      const first = database.prepare("INSERT INTO vehicle_profile (name, current_mileage) VALUES ('First', 1000)").run();
      const second = database.prepare("INSERT INTO vehicle_profile (name, current_mileage) VALUES ('Second', 2000)").run();
      assert.equal(Number(first.lastInsertRowid), 1);
      assert.equal(Number(second.lastInsertRowid), 2);

      database.prepare(
        "INSERT INTO service_intervals (vehicle_id, name, interval_km, type) VALUES (?, 'Oil Change', 1000, 'replace')"
      ).run(1);
      database.prepare(
        "INSERT INTO service_intervals (vehicle_id, name, interval_km, type) VALUES (?, 'Oil Change', 1000, 'replace')"
      ).run(2);
      assert.throws(() => database.prepare(
        "INSERT INTO service_intervals (vehicle_id, name, interval_km, type) VALUES (?, 'Oil Change', 1000, 'replace')"
      ).run(2));
    } finally {
      database.close();
    }
  });

  it('installs every launch-critical integrity guard and storage index', () => {
    const database = createCurrentDatabase();
    try {
      database.prepare("INSERT INTO vehicle_profile (name, current_mileage) VALUES ('Primary', 1000)").run();

      assert.throws(() => database.prepare(
        "INSERT INTO inventory_items (vehicle_id, name, quantity) VALUES (1, 'Oil', -1)"
      ).run(), /Inventory quantity/);
      assert.throws(() => database.prepare(
        `INSERT INTO vehicle_vitals (
          vehicle_id, oil_life_pct, tire_pressure_psi, battery_health_pct, coolant_temp_c, brake_pad_pct
        ) VALUES (1, 150, 30, 100, 90, 80)`
      ).run(), /outside their valid ranges/);
      assert.throws(() => database.prepare(
        `INSERT INTO service_logs (
          vehicle_id, title, date, mileage, category, notes, sets_odometer_baseline
        ) VALUES (1, 'Oil', '2026-07-25', 1001, 'engine', '', 1)`
      ).run(), /cannot exceed confirmed vehicle odometer/);
      assert.throws(() => database.prepare(
        `INSERT INTO service_logs (
          vehicle_id, title, date, mileage, category, notes, sets_odometer_baseline
        ) VALUES (1, 'History', '2026-07-25', 1, 'engine', '', 0)`
      ).run(), /Date-only service history/);

      database.prepare(
        `INSERT INTO gas_logs (
          vehicle_id, liters, cost, odometer_km, logged_on, is_full_tank
        ) VALUES (1, 5, 100, 1000, '2026-07-25', 1)`
      ).run();
      assert.throws(() => database.prepare('UPDATE vehicle_profile SET current_mileage = 999 WHERE id = 1').run(), /cannot move backwards/);

      const indexNames = new Set(
        database.prepare("SELECT name FROM sqlite_master WHERE type = 'index'").all()
          .map((row) => (row as { name: string }).name)
      );
      for (const name of [
        'idx_gas_logs_vehicle_date',
        'idx_service_logs_vehicle_date',
        'idx_inventory_items_vehicle_name',
        'idx_documents_vault_vehicle_expiry',
        'idx_service_intervals_vehicle_name',
        'idx_vehicle_vitals_vehicle',
        'idx_pre_ride_checks_vehicle',
      ]) {
        assert.equal(indexNames.has(name), true, `${name} should exist`);
      }
    } finally {
      database.close();
    }
  });
});
