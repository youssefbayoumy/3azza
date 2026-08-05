import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { beforeEach, describe, it } from 'node:test';
import {
  updateVehicleScooterIdentityInTransaction,
  type VehicleScooterSqlValue,
  type VehicleScooterTransactionExecutor,
} from './vehicleScooterTransactions';

function executorFor(database: DatabaseSync): VehicleScooterTransactionExecutor {
  return {
    async getFirstAsync<T>(source: string, params: VehicleScooterSqlValue[]): Promise<T | null> {
      return (database.prepare(source).get(...params) as T | undefined) ?? null;
    },
    async runAsync(source: string, params: VehicleScooterSqlValue[]) {
      const result = database.prepare(source).run(...params);
      return { changes: Number(result.changes), lastInsertRowId: Number(result.lastInsertRowid) };
    },
  };
}

async function inTransaction(database: DatabaseSync, task: () => Promise<void>) {
  database.exec('BEGIN');
  try {
    await task();
    database.exec('COMMIT');
  } catch (error) {
    database.exec('ROLLBACK');
    throw error;
  }
}

describe('vehicle scooter identity transaction', () => {
  let database: DatabaseSync;
  let executor: VehicleScooterTransactionExecutor;

  beforeEach(() => {
    database = new DatabaseSync(':memory:');
    database.exec(`
      CREATE TABLE vehicle_profile (
        id INTEGER PRIMARY KEY,
        scooter_brand_id TEXT,
        scooter_model_id TEXT,
        scooter_version_id TEXT,
        scooter_variant_id TEXT,
        maintenance_history_level TEXT NOT NULL DEFAULT 'not_asked',
        service_history_setup_completed INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE service_intervals (
        id INTEGER PRIMARY KEY,
        vehicle_id INTEGER NOT NULL,
        last_service_odometer_km INTEGER NOT NULL,
        user_interval_km INTEGER,
        user_override_active INTEGER NOT NULL,
        source_manual_id TEXT,
        is_applicable INTEGER NOT NULL
      );
      CREATE TABLE service_logs (id INTEGER PRIMARY KEY, vehicle_id INTEGER NOT NULL, title TEXT NOT NULL);
      INSERT INTO vehicle_profile VALUES
        (1, 'sym', 'first-model', 'first-version', 'first-variant', 'detailed_records', 1),
        (2, 'sym', 'old-model', 'old-version', 'old-variant', 'recent_memory', 1);
      INSERT INTO service_intervals VALUES
        (1, 1, 1111, 700, 1, 'first-manual', 1),
        (2, 2, 2222, 750, 1, 'old-manual', 1);
      INSERT INTO service_logs VALUES (1, 1, 'First history'), (2, 2, 'Target history');
    `);
    executor = executorFor(database);
  });

  const selection = {
    brandId: 'sym',
    modelId: 'sym:joymax-z',
    versionId: 'sym:joymax-z:2021-present',
    variantId: 'joymax-z-250',
  };

  it('updates only the intended vehicle while preserving service history, baselines, and overrides', async () => {
    await inTransaction(database, () => updateVehicleScooterIdentityInTransaction(
      executor,
      2,
      selection,
      async () => {
        await executor.runAsync(
          'UPDATE service_intervals SET source_manual_id = ?, is_applicable = 1 WHERE vehicle_id = ?',
          ['joymax-manual', 2]
        );
      }
    ));

    const first = database.prepare('SELECT * FROM vehicle_profile WHERE id = 1').get() as Record<string, unknown>;
    const target = database.prepare('SELECT * FROM vehicle_profile WHERE id = 2').get() as Record<string, unknown>;
    const targetInterval = database.prepare('SELECT * FROM service_intervals WHERE vehicle_id = 2').get() as Record<string, unknown>;
    assert.equal(first.scooter_model_id, 'first-model');
    assert.equal(target.scooter_model_id, selection.modelId);
    assert.equal(target.scooter_variant_id, selection.variantId);
    assert.equal(target.maintenance_history_level, 'not_asked');
    assert.equal(target.service_history_setup_completed, 0);
    assert.equal(targetInterval.last_service_odometer_km, 2222);
    assert.equal(targetInterval.user_interval_km, 750);
    assert.equal(targetInterval.user_override_active, 1);
    assert.equal(targetInterval.source_manual_id, 'joymax-manual');
    assert.equal((database.prepare('SELECT COUNT(*) AS count FROM service_logs').get() as { count: number }).count, 2);
  });

  it('does not reset completed history when the exact scooter identity is unchanged', async () => {
    const sameSelection = {
      brandId: 'sym',
      modelId: 'old-model',
      versionId: 'old-version',
      variantId: 'old-variant',
    };
    await inTransaction(database, () => updateVehicleScooterIdentityInTransaction(
      executor,
      2,
      sameSelection,
      async () => undefined
    ));
    const target = database.prepare(
      `SELECT maintenance_history_level AS level,
              service_history_setup_completed AS completed
       FROM vehicle_profile WHERE id = 2`
    ).get() as { level: string; completed: number };
    assert.equal(target.level, 'recent_memory');
    assert.equal(target.completed, 1);
  });

  it('rolls back identity and maintenance together when reapplication fails', async () => {
    await assert.rejects(
      inTransaction(database, () => updateVehicleScooterIdentityInTransaction(
        executor,
        2,
        selection,
        async () => {
          await executor.runAsync('UPDATE service_intervals SET source_manual_id = ? WHERE vehicle_id = ?', ['partial', 2]);
          throw new Error('injected maintenance failure');
        }
      )),
      /injected maintenance failure/
    );

    const target = database.prepare('SELECT * FROM vehicle_profile WHERE id = 2').get() as Record<string, unknown>;
    const interval = database.prepare('SELECT * FROM service_intervals WHERE vehicle_id = 2').get() as Record<string, unknown>;
    assert.equal(target.scooter_model_id, 'old-model');
    assert.equal(target.scooter_variant_id, 'old-variant');
    assert.equal(interval.source_manual_id, 'old-manual');
    assert.equal(interval.last_service_odometer_km, 2222);
  });
});
