import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { beforeEach, describe, it } from 'node:test';
import { CURRENT_SCHEMA_SQL } from '../databaseSchema';
import {
  setMaintenanceHistoryLevelInTransaction,
  setMaintenanceHistoryStateInTransaction,
} from './maintenanceHistoryTransactions';
import type {
  MaintenanceRecordSqlValue,
  MaintenanceRecordTransactionExecutor,
} from './maintenanceRecordTransactions';

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

describe('maintenance onboarding history state', () => {
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

  it('keeps skipped setup incomplete while completed history levels dismiss the setup reminder', async () => {
    await setMaintenanceHistoryLevelInTransaction(transaction, 1, 'skipped');
    let row = database.prepare(
      `SELECT maintenance_history_level AS level, service_history_setup_completed AS completed
       FROM vehicle_profile WHERE id = 1`
    ).get() as { level: string; completed: number };
    assert.deepEqual({ ...row }, { level: 'skipped', completed: 0 });

    await setMaintenanceHistoryLevelInTransaction(transaction, 1, 'little_or_none');
    row = database.prepare(
      `SELECT maintenance_history_level AS level, service_history_setup_completed AS completed
       FROM vehicle_profile WHERE id = 1`
    ).get() as { level: string; completed: number };
    assert.deepEqual({ ...row }, { level: 'little_or_none', completed: 1 });
  });

  it('stores unknown/never-done states per vehicle and verifies linked record identity', async () => {
    const unknown = await setMaintenanceHistoryStateInTransaction(
      transaction,
      1,
      'profile-a',
      { componentId: 'engine-oil', action: 'replace', state: 'unknown', notes: 'Not sure' },
      '2026-08-01T08:00:00.000Z'
    );
    assert.equal(unknown.vehicle_id, 1);
    assert.equal(unknown.history_state, 'unknown');
    await setMaintenanceHistoryStateInTransaction(
      transaction,
      1,
      'profile-b',
      { componentId: 'engine-oil', action: 'replace', state: 'never_done' },
      '2026-08-01T08:30:00.000Z'
    );
    assert.deepEqual(
      (database.prepare(
        `SELECT profile_id AS profileId, history_state AS state
         FROM maintenance_history_states WHERE vehicle_id = 1 ORDER BY profile_id`
      ).all() as { profileId: string; state: string }[]).map((row) => [row.profileId, row.state]),
      [['profile-a', 'unknown'], ['profile-b', 'never_done']]
    );

    database.prepare(
      `INSERT INTO service_logs (
        vehicle_id, title, date, mileage, category, notes, sets_odometer_baseline,
        maintenance_component_id, maintenance_action, maintenance_migration_status,
        maintenance_profile_id, maintenance_profile_version,
        maintenance_mileage_confidence, maintenance_date_confidence, maintenance_record_source
      ) VALUES (1, 'Engine oil', '2026-07-20', 11000, 'engine', '', 1,
        'engine-oil', 'replace', 'confirmed', 'profile-a', '2026.1',
        'confirmed', 'confirmed', 'manual_entry')`
    ).run();
    const logId = Number(database.prepare('SELECT id FROM service_logs').get()?.id);
    const confirmed = await setMaintenanceHistoryStateInTransaction(
      transaction,
      1,
      'profile-a',
      { componentId: 'engine-oil', action: 'replace', state: 'confirmed', lastServiceLogId: logId },
      '2026-08-01T09:00:00.000Z'
    );
    assert.equal(confirmed.last_service_log_id, logId);

    await assert.rejects(
      setMaintenanceHistoryStateInTransaction(
        transaction,
        2,
        'profile-a',
        { componentId: 'engine-oil', action: 'replace', state: 'confirmed', lastServiceLogId: logId },
        '2026-08-01T09:00:00.000Z'
      ),
      /does not match this vehicle/
    );
  });
});
