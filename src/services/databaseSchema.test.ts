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
      assert.equal(CURRENT_SCHEMA_VERSION, 17);
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
        'maintenance_history_level',
        'tank_capacity_liters',
        'scooter_brand_id',
        'scooter_model_id',
        'scooter_version_id',
        'scooter_variant_id',
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

      const intervalColumns = new Set(database.prepare('PRAGMA table_info(service_intervals)').all()
        .map((column) => (column as { name: string }).name));
      for (const name of [
        'canonical_task_id',
        'recommended_interval_km',
        'recommended_interval_months',
        'user_interval_km',
        'user_override_active',
        'recommendation_origin',
        'source_manual_id',
        'source_pages_json',
        'is_applicable',
      ]) assert.equal(intervalColumns.has(name), true, `${name} should exist`);

      const serviceLogColumns = new Set(database.prepare('PRAGMA table_info(service_logs)').all()
        .map((column) => (column as { name: string }).name));
      for (const name of [
        'maintenance_rule_id',
        'maintenance_component_id',
        'maintenance_action',
        'maintenance_profile_id',
        'maintenance_profile_version',
        'inspection_result',
        'maintenance_migration_status',
        'maintenance_mileage_confidence',
        'maintenance_date_confidence',
        'maintenance_record_source',
        'service_provider',
        'service_package_id',
        'service_package_title',
        'oil_brand',
        'oil_type',
        'oil_viscosity',
        'oil_notes',
        'duplicate_confirmed',
        'created_at',
        'updated_at',
      ]) assert.equal(serviceLogColumns.has(name), true, `${name} should exist`);

      for (const table of [
        'maintenance_preferences',
        'maintenance_history_states',
        'odometer_events',
        'odometer_correction_authorizations',
      ]) {
        assert.equal(
          (database.prepare(
            "SELECT COUNT(*) AS count FROM sqlite_master WHERE type = 'table' AND name = ?"
          ).get(table) as { count: number }).count,
          1,
          `${table} should exist`
        );
      }

      const preferenceColumns = new Set(database.prepare('PRAGMA table_info(maintenance_preferences)').all()
        .map((column) => (column as { name: string }).name));
      for (const name of [
        'original_interval_km',
        'original_interval_months',
        'custom_interval_km',
        'custom_interval_months',
        'effective_interval_months',
        'distance_enabled',
        'time_enabled',
        'condition_based_default',
        'custom_condition_reminder_enabled',
      ]) assert.equal(preferenceColumns.has(name), true, `${name} should exist`);

      database.prepare(
        `INSERT INTO pre_ride_runs (
          vehicle_id, manual_id, variant_id, completed_at, items_json, completed_count, total_count
        ) VALUES (1, 'manual-a', 'variant-a', '2026-07-30T08:00:00Z', '[]', 0, 3)`
      ).run();
      assert.throws(() => database.prepare(
        `INSERT INTO odometer_events (
          vehicle_id, event_type, previous_effective_km, new_effective_km,
          previous_displayed_km, new_displayed_km, reason
        ) VALUES (1, 'instrument_cluster_replacement', 1000, 1000, 1000, -1, 'Cluster replaced')`
      ).run(), /Odometer event is invalid/);
      assert.throws(() => database.prepare(
        `INSERT INTO odometer_events (
          vehicle_id, event_type, previous_effective_km, new_effective_km,
          previous_displayed_km, new_displayed_km, reason
        ) VALUES (1, 'correction', 1000, 1000, 1000, 1000, 'Not downward')`
      ).run(), /Odometer event is invalid/);
      const run = database.prepare('SELECT manual_id, variant_id, total_count FROM pre_ride_runs').get() as {
        manual_id: string;
        variant_id: string;
        total_count: number;
      };
      assert.equal(run.manual_id, 'manual-a');
      assert.equal(run.variant_id, 'variant-a');
      assert.equal(run.total_count, 3);
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
        `INSERT INTO service_logs (
          vehicle_id, title, date, mileage, category, notes, sets_odometer_baseline,
          maintenance_mileage_confidence, maintenance_date_confidence,
          maintenance_record_source, maintenance_migration_status
        ) VALUES (1, 'Estimated history', '2026-07-25', 900, 'engine', '', 0,
          'estimated', 'confirmed', 'history_onboarding', 'confirmed')`
      ).run();

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
        'idx_pre_ride_runs_vehicle_date',
        'idx_service_intervals_vehicle_task',
        'idx_service_logs_vehicle_maintenance_rule',
        'idx_service_logs_vehicle_package',
        'idx_service_logs_vehicle_component_action',
        'idx_maintenance_preferences_vehicle',
        'idx_maintenance_history_states_vehicle',
        'idx_odometer_events_vehicle_date',
      ]) {
        assert.equal(indexNames.has(name), true, `${name} should exist`);
      }
    } finally {
      database.close();
    }
  });
});
