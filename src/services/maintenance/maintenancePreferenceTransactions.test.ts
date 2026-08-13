import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { beforeEach, describe, it } from 'node:test';
import { CURRENT_SCHEMA_SQL } from '../databaseSchema';
import type {
  MaintenanceRecordSqlValue,
  MaintenanceRecordTransactionExecutor,
} from './maintenanceRecordTransactions';
import {
  restoreMaintenancePreferenceInTransaction,
  type SetMaintenancePreferenceInput,
  setMaintenancePreferenceInTransaction,
} from './maintenancePreferenceTransactions';

function executor(database: DatabaseSync): MaintenanceRecordTransactionExecutor {
  return {
    async getFirstAsync<T>(source: string, params: MaintenanceRecordSqlValue[]): Promise<T | null> {
      return (database.prepare(source).get(...params) as T | undefined) ?? null;
    },
    async getAllAsync<T>(source: string, params: MaintenanceRecordSqlValue[]): Promise<T[]> {
      return database.prepare(source).all(...params) as T[];
    },
    async runAsync(source: string, params: MaintenanceRecordSqlValue[]) {
      const result = database.prepare(source).run(...params);
      return { changes: Number(result.changes), lastInsertRowId: Number(result.lastInsertRowid) };
    },
  };
}

function input(
  overrides: Partial<SetMaintenancePreferenceInput> = {}
): SetMaintenancePreferenceInput {
  return {
    componentId: 'engine-oil',
    action: 'replace',
    originalIntervalKm: 1000,
    originalIntervalMonths: 1,
    customIntervalKm: 700,
    customIntervalMonths: null,
    distanceEnabled: true,
    timeEnabled: false,
    conditionBasedDefault: false,
    customConditionReminderEnabled: false,
    ...overrides,
  };
}

describe('per-vehicle maintenance preferences', () => {
  let database: DatabaseSync;
  let transaction: MaintenanceRecordTransactionExecutor;

  beforeEach(() => {
    database = new DatabaseSync(':memory:');
    database.exec(CURRENT_SCHEMA_SQL);
    database.prepare(
      "INSERT INTO vehicle_profile (id, name, current_mileage) VALUES (1, 'Primary', 12000), (2, 'Other', 5000)"
    ).run();
    transaction = executor(database);
  });

  it('saves an arbitrary shorter distance without mutating another vehicle', async () => {
    const preference = await setMaintenancePreferenceInTransaction(
      transaction,
      1,
      'profile-a',
      input(),
      '2026-08-01T08:00:00.000Z'
    );
    assert.equal(preference.original_interval_km, 1000);
    assert.equal(preference.custom_interval_km, 700);
    assert.equal(preference.effective_interval_km, 700);
    assert.equal(preference.distance_enabled, 1);
    assert.equal(preference.time_enabled, 0);
    assert.equal(preference.interval_source, 'user_custom');
    assert.equal(preference.longer_than_recommended_confirmed, 0);
    assert.equal(
      (database.prepare('SELECT COUNT(*) AS count FROM maintenance_preferences WHERE vehicle_id = 2').get() as {
        count: number;
      }).count,
      0
    );
  });

  it('requires and persists explicit confirmation for a longer distance or time', async () => {
    const longer = input({
      customIntervalKm: 20000,
      customIntervalMonths: 120,
      timeEnabled: true,
      reason: 'Workshop recommendation',
    });
    await assert.rejects(
      setMaintenancePreferenceInTransaction(
        transaction,
        1,
        'profile-a',
        longer,
        '2026-08-01T08:00:00.000Z'
      ),
      /Confirm the risk/
    );
    const preference = await setMaintenancePreferenceInTransaction(
      transaction,
      1,
      'profile-a',
      { ...longer, source: 'workshop_recommendation', confirmLonger: true },
      '2026-08-01T08:05:00.000Z'
    );
    assert.equal(preference.effective_interval_km, 20000);
    assert.equal(preference.effective_interval_months, 120);
    assert.equal(preference.longer_than_recommended_confirmed, 1);
    assert.equal(preference.interval_source, 'workshop_recommendation');
    assert.equal(preference.reason, 'Workshop recommendation');
  });

  it('stores time-only and combined schedules without clamping positive values', async () => {
    const timeOnly = await setMaintenancePreferenceInTransaction(
      transaction,
      1,
      'profile-a',
      input({
        componentId: 'transmission-oil',
        originalIntervalKm: 5000,
        originalIntervalMonths: 5,
        customIntervalKm: null,
        customIntervalMonths: 2,
        distanceEnabled: false,
        timeEnabled: true,
      }),
      '2026-08-01T08:00:00.000Z'
    );
    assert.equal(timeOnly.effective_interval_km, null);
    assert.equal(timeOnly.effective_interval_months, 2);

    const combined = await setMaintenancePreferenceInTransaction(
      transaction,
      1,
      'profile-a',
      input({ customIntervalKm: 1, customIntervalMonths: 1, timeEnabled: true }),
      '2026-08-01T08:05:00.000Z'
    );
    assert.equal(combined.effective_interval_km, 1);
    assert.equal(combined.effective_interval_months, 1);
  });

  it('allows a reminder to be disabled while keeping its original schedule auditable', async () => {
    const preference = await setMaintenancePreferenceInTransaction(
      transaction,
      1,
      'profile-a',
      input({ customIntervalKm: null, distanceEnabled: false }),
      '2026-08-01T08:00:00.000Z'
    );
    assert.equal(preference.original_interval_km, 1000);
    assert.equal(preference.original_interval_months, 1);
    assert.equal(preference.effective_interval_km, null);
    assert.equal(preference.effective_interval_months, null);
  });

  it('supports an optional user-created reminder for a condition-based action', async () => {
    const preference = await setMaintenancePreferenceInTransaction(
      transaction,
      1,
      'profile-a',
      input({
        componentId: 'brake-pads',
        action: 'condition_check',
        originalIntervalKm: null,
        originalIntervalMonths: null,
        customIntervalKm: 2000,
        distanceEnabled: true,
        conditionBasedDefault: true,
        customConditionReminderEnabled: true,
      }),
      '2026-08-01T08:00:00.000Z'
    );
    assert.equal(preference.condition_based_default, 1);
    assert.equal(preference.custom_condition_reminder_enabled, 1);
    assert.equal(preference.effective_interval_km, 2000);
  });

  it('restores the immutable profile default without altering maintenance history', async () => {
    database.prepare(
      `INSERT INTO service_logs (
        vehicle_id, title, date, mileage, category, notes, sets_odometer_baseline,
        maintenance_rule_id, maintenance_component_id, maintenance_action,
        maintenance_profile_id, maintenance_migration_status,
        maintenance_mileage_confidence, maintenance_date_confidence,
        maintenance_record_source
      ) VALUES (1, 'Oil replacement', '2026-08-01T07:00:00.000Z', 11000, 'engine', '', 1,
        'oil-recurring', 'engine-oil', 'replace', 'profile-a', 'confirmed',
        'confirmed', 'confirmed', 'maintenance_planner')`
    ).run();
    await setMaintenancePreferenceInTransaction(
      transaction,
      1,
      'profile-a',
      input(),
      '2026-08-01T08:00:00.000Z'
    );

    const restored = await restoreMaintenancePreferenceInTransaction(
      transaction,
      1,
      'profile-a',
      'engine-oil',
      'replace',
      '2026-08-01T09:00:00.000Z'
    );
    assert.equal(restored, null);
    assert.equal(
      (database.prepare('SELECT COUNT(*) AS count FROM maintenance_preferences').get() as { count: number }).count,
      0
    );
    const history = database.prepare(
      'SELECT mileage, maintenance_rule_id AS ruleId FROM service_logs'
    ).get() as { mileage: number; ruleId: string };
    assert.deepEqual({ ...history }, { mileage: 11000, ruleId: 'oil-recurring' });
  });

  it('isolates the same component action across scooter profiles on one vehicle', async () => {
    await setMaintenancePreferenceInTransaction(
      transaction,
      1,
      'profile-a',
      input({ customIntervalKm: 700 }),
      '2026-08-01T08:00:00.000Z'
    );
    await setMaintenancePreferenceInTransaction(
      transaction,
      1,
      'profile-b',
      input({ customIntervalKm: 777 }),
      '2026-08-01T09:00:00.000Z'
    );

    const rows = database.prepare(
      `SELECT profile_id AS profileId, effective_interval_km AS intervalKm
       FROM maintenance_preferences WHERE vehicle_id = 1 ORDER BY profile_id`
    ).all() as { profileId: string; intervalKm: number }[];
    assert.deepEqual(rows.map((row) => [row.profileId, row.intervalKm]), [
      ['profile-a', 700],
      ['profile-b', 777],
    ]);
  });

  it('rejects zero, negative, and unsafe interval values', async () => {
    for (const customIntervalKm of [0, -1, Number.MAX_SAFE_INTEGER + 1]) {
      await assert.rejects(
        setMaintenancePreferenceInTransaction(
          transaction,
          1,
          'profile-a',
          input({ customIntervalKm }),
          '2026-08-01T08:00:00.000Z'
        ),
        /positive whole number/
      );
    }
  });
});
