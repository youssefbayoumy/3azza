import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { describe, it } from 'node:test';
import {
  applyMaintenanceStorageMigration,
  type MaintenanceStorageMigrationExecutor,
} from './maintenanceStorageMigration';

function executor(database: DatabaseSync): MaintenanceStorageMigrationExecutor {
  return {
    async execAsync(source) {
      database.exec(source);
    },
    async getAllAsync<T>(source: string): Promise<T[]> {
      return database.prepare(source).all() as T[];
    },
  };
}

function createV14Database(): DatabaseSync {
  const database = new DatabaseSync(':memory:');
  database.exec(`
    CREATE TABLE vehicle_profile (
      id INTEGER PRIMARY KEY,
      current_mileage INTEGER NOT NULL,
      service_history_setup_completed INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE service_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      vehicle_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      date TEXT NOT NULL,
      mileage INTEGER NOT NULL,
      category TEXT NOT NULL,
      notes TEXT NOT NULL,
      cost REAL,
      service_type TEXT,
      sets_odometer_baseline INTEGER NOT NULL DEFAULT 0,
      maintenance_rule_id TEXT,
      maintenance_component_id TEXT,
      maintenance_action TEXT,
      maintenance_profile_id TEXT,
      maintenance_profile_version TEXT,
      inspection_result TEXT,
      maintenance_migration_status TEXT NOT NULL DEFAULT 'legacy_needs_confirmation'
    );
    INSERT INTO vehicle_profile (id, current_mileage) VALUES (1, 12000);
    INSERT INTO service_logs (
      vehicle_id, title, date, mileage, category, notes, sets_odometer_baseline,
      maintenance_rule_id, maintenance_component_id, maintenance_action,
      maintenance_profile_id, maintenance_profile_version, maintenance_migration_status
    ) VALUES (
      1, 'Engine oil', '2026-07-20', 11000, 'engine', '', 1,
      'engine-oil-replace', 'engine-oil', 'replace', 'sym-st-200', '2026.1', 'exact'
    );
    INSERT INTO service_logs (
      vehicle_id, title, date, mileage, category, notes, sets_odometer_baseline,
      service_type, maintenance_migration_status
    ) VALUES (
      1, 'Oil maybe', '2026-06-01', 10000, 'general', 'legacy label', 1,
      'Oil Change', 'legacy_needs_confirmation'
    );
    CREATE TABLE maintenance_preferences (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      vehicle_id INTEGER NOT NULL,
      component_id TEXT NOT NULL,
      action TEXT NOT NULL,
      profile_recommended_interval_km INTEGER,
      user_interval_km INTEGER,
      effective_interval_km INTEGER,
      interval_source TEXT NOT NULL,
      longer_than_recommended_confirmed INTEGER NOT NULL,
      reason TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(vehicle_id, component_id, action)
    );
    INSERT INTO maintenance_preferences VALUES (
      1, 1, 'engine-oil', 'replace', 1000, 800, 800, 'user_custom', 0,
      NULL, '2026-07-01T00:00:00.000Z', '2026-07-01T00:00:00.000Z'
    );
    CREATE TABLE maintenance_history_states (
      vehicle_id INTEGER NOT NULL,
      component_id TEXT NOT NULL,
      action TEXT NOT NULL,
      history_state TEXT NOT NULL,
      last_service_log_id INTEGER,
      notes TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY(vehicle_id, component_id, action)
    );
    INSERT INTO maintenance_history_states VALUES (
      1, 'engine-oil', 'replace', 'confirmed', 1, NULL,
      '2026-07-01T00:00:00.000Z', '2026-07-01T00:00:00.000Z'
    );
  `);
  return database;
}

describe('maintenance storage migration', () => {
  it('promotes only exact rows and is safe to run more than once', async () => {
    const database = createV14Database();
    try {
      const migration = executor(database);
      await applyMaintenanceStorageMigration(migration);

      const rows = database.prepare(
        `SELECT id, maintenance_migration_status AS status,
                maintenance_mileage_confidence AS mileageConfidence,
                maintenance_date_confidence AS dateConfidence,
                maintenance_record_source AS source,
                maintenance_rule_id AS ruleId,
                created_at AS createdAt, updated_at AS updatedAt
         FROM service_logs ORDER BY id`
      ).all() as Record<string, string | number | null>[];
      assert.deepEqual(
        rows.map((row) => [row.status, row.mileageConfidence, row.dateConfidence, row.source]),
        [
          ['confirmed', 'confirmed', 'confirmed', 'maintenance_planner'],
          ['legacy_unmapped', 'legacy_unmapped', 'legacy_unmapped', 'legacy'],
        ]
      );
      assert.equal(rows[1].ruleId, null, 'vague legacy label must not be guessed into a rule');
      assert.ok(rows.every((row) => row.createdAt && row.updatedAt));

      database.prepare(
        `INSERT INTO service_logs (
          vehicle_id, title, date, mileage, category, notes, sets_odometer_baseline,
          maintenance_rule_id, maintenance_component_id, maintenance_action,
          maintenance_profile_id, maintenance_profile_version, maintenance_migration_status,
          maintenance_mileage_confidence, maintenance_date_confidence,
          maintenance_record_source, created_at, updated_at
        ) VALUES (
          1, 'Estimated old service', '2026-07-01', 10500, 'engine', '', 0,
          'engine-oil-replace', 'engine-oil', 'replace', 'sym-st-200', '2026.1',
          'confirmed', 'estimated', 'confirmed', 'history_onboarding', ?, ?
        )`
      ).run('2026-08-01T08:00:00.000Z', '2026-08-01T08:00:00.000Z');

      await applyMaintenanceStorageMigration(migration);
      const estimated = database.prepare(
        `SELECT maintenance_mileage_confidence AS confidence,
                maintenance_record_source AS source, created_at AS createdAt
         FROM service_logs WHERE title = 'Estimated old service'`
      ).get() as { confidence: string; source: string; createdAt: string };
      assert.deepEqual({ ...estimated }, {
        confidence: 'estimated',
        source: 'history_onboarding',
        createdAt: '2026-08-01T08:00:00.000Z',
      });

      const tables = new Set(database.prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table'"
      ).all().map((row) => (row as { name: string }).name));
      assert.equal(tables.has('maintenance_preferences'), true);
      assert.equal(tables.has('maintenance_history_states'), true);
      assert.equal(tables.has('odometer_events'), true);
      assert.equal(
        (database.prepare('SELECT profile_id AS profileId FROM maintenance_preferences').get() as {
          profileId: string | null;
        }).profileId,
        null,
        'unscoped legacy override must remain quarantined instead of leaking to the current profile'
      );
      const migratedPreference = database.prepare(
        `SELECT original_interval_km AS originalKm,
                custom_interval_km AS customKm,
                effective_interval_km AS effectiveKm,
                distance_enabled AS distanceEnabled,
                time_enabled AS timeEnabled,
                condition_based_default AS conditionDefault,
                custom_condition_reminder_enabled AS conditionReminder
         FROM maintenance_preferences`
      ).get() as Record<string, number | null>;
      assert.deepEqual({ ...migratedPreference }, {
        originalKm: 1000,
        customKm: 800,
        effectiveKm: 800,
        distanceEnabled: 1,
        timeEnabled: 0,
        conditionDefault: 0,
        conditionReminder: 0,
      });
      const preferenceColumns = new Set(database.prepare(
        'PRAGMA table_info(maintenance_preferences)'
      ).all().map((row) => (row as { name: string }).name));
      for (const name of [
        'original_interval_months',
        'custom_interval_months',
        'effective_interval_months',
      ]) assert.equal(preferenceColumns.has(name), true, `${name} should be migrated`);
      assert.equal(
        (database.prepare('SELECT profile_id AS profileId FROM maintenance_history_states').get() as {
          profileId: string | null;
        }).profileId,
        null
      );
    } finally {
      database.close();
    }
  });
});
