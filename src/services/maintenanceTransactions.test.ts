import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { beforeEach, describe, it } from 'node:test';
import {
  completeServiceHistorySetupInTransaction,
  deleteServiceLogInTransaction,
  insertServiceCompletionInTransaction,
  type MaintenanceSqlValue,
  type MaintenanceTransactionExecutor,
  type ServiceCompletionTransactionInput,
} from './maintenanceTransactions';

function createExecutor(database: DatabaseSync): MaintenanceTransactionExecutor {
  return {
    async getFirstAsync<T>(source: string, params: MaintenanceSqlValue[]): Promise<T | null> {
      return (database.prepare(source).get(...params) as T | undefined) ?? null;
    },
    async runAsync(source: string, params: MaintenanceSqlValue[]) {
      const result = database.prepare(source).run(...params);
      return {
        changes: Number(result.changes),
        lastInsertRowId: Number(result.lastInsertRowid),
      };
    },
  };
}

async function inTransaction<T>(database: DatabaseSync, task: () => Promise<T>): Promise<T> {
  database.exec('BEGIN');
  try {
    const result = await task();
    database.exec('COMMIT');
    return result;
  } catch (error) {
    database.exec('ROLLBACK');
    throw error;
  }
}

function completion(
  mileage: number,
  serviceIntervalId: number | null = 1,
  setsOdometerBaseline = true
): ServiceCompletionTransactionInput {
  return {
    serviceIntervalId,
    title: serviceIntervalId === null ? 'Custom repair' : 'Oil Change',
    date: '2026-07-19',
    mileage,
    category: 'engine',
    notes: '',
    cost: null,
    setsOdometerBaseline,
  };
}

describe('transactional maintenance mutations', () => {
  let database: DatabaseSync;
  let executor: MaintenanceTransactionExecutor;

  beforeEach(() => {
    database = new DatabaseSync(':memory:');
    database.exec(`
      CREATE TABLE vehicle_profile (
        id INTEGER PRIMARY KEY,
        current_mileage INTEGER NOT NULL DEFAULT 10000,
        service_history_setup_completed INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE service_intervals (
        id INTEGER PRIMARY KEY,
        vehicle_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        last_service_odometer_km INTEGER NOT NULL DEFAULT 0,
        has_known_odometer_baseline INTEGER NOT NULL DEFAULT 0
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
        sets_odometer_baseline INTEGER NOT NULL DEFAULT 1
      );
      INSERT INTO service_intervals (id, vehicle_id, name) VALUES
        (1, 1, 'Oil Change'),
        (2, 2, 'Oil Change');
      INSERT INTO vehicle_profile (id) VALUES (1), (2);
    `);
    executor = createExecutor(database);
  });

  it('records tracked and untracked work without conflating their baselines', async () => {
    await inTransaction(database, () => insertServiceCompletionInTransaction(executor, 1, completion(5000)));
    await inTransaction(database, () => insertServiceCompletionInTransaction(executor, 1, completion(5100, null)));

    const baseline = database.prepare('SELECT last_service_odometer_km AS km FROM service_intervals WHERE id = 1').get() as { km: number };
    const logs = database.prepare('SELECT service_type FROM service_logs ORDER BY id').all() as { service_type: string | null }[];
    assert.equal(baseline.km, 5000);
    assert.deepEqual(logs.map((log) => log.service_type), ['Oil Change', null]);
  });

  it('rejects a service odometer above the confirmed vehicle reading before insert', async () => {
    await assert.rejects(
      inTransaction(database, () => insertServiceCompletionInTransaction(executor, 1, completion(10001))),
      /Update the vehicle odometer first/
    );
    assert.equal(
      (database.prepare('SELECT COUNT(*) AS count FROM service_logs').get() as { count: number }).count,
      0
    );
  });

  it('keeps the maximum baseline for historical and duplicate-mileage entries', async () => {
    for (const mileage of [5000, 4000, 5000]) {
      await inTransaction(database, () => insertServiceCompletionInTransaction(executor, 1, completion(mileage)));
    }

    const baseline = database.prepare('SELECT last_service_odometer_km AS km FROM service_intervals WHERE id = 1').get() as { km: number };
    assert.equal(baseline.km, 5000);
  });

  it('stores date-only history without starting an odometer counter', async () => {
    await inTransaction(
      database,
      () => insertServiceCompletionInTransaction(executor, 1, completion(0, 1, false))
    );

    const interval = database.prepare(
      'SELECT last_service_odometer_km AS km, has_known_odometer_baseline AS known FROM service_intervals WHERE id = 1'
    ).get() as { km: number; known: number };
    const log = database.prepare(
      'SELECT mileage, sets_odometer_baseline AS setsBaseline FROM service_logs'
    ).get() as { mileage: number; setsBaseline: number };
    assert.equal(interval.km, 0);
    assert.equal(interval.known, 0);
    assert.equal(log.mileage, 0);
    assert.equal(log.setsBaseline, 0);
  });

  it('distinguishes a known zero-kilometre baseline from unknown', async () => {
    await inTransaction(
      database,
      () => insertServiceCompletionInTransaction(executor, 1, completion(0, 1, true))
    );

    const interval = database.prepare(
      'SELECT last_service_odometer_km AS km, has_known_odometer_baseline AS known FROM service_intervals WHERE id = 1'
    ).get() as { km: number; known: number };
    assert.equal(interval.km, 0);
    assert.equal(interval.known, 1);
  });

  it('deleting date-only history preserves an existing odometer baseline', async () => {
    await inTransaction(database, () => insertServiceCompletionInTransaction(executor, 1, completion(5000)));
    await inTransaction(
      database,
      () => insertServiceCompletionInTransaction(executor, 1, completion(0, 1, false))
    );
    const dateOnlyLog = database.prepare(
      'SELECT id FROM service_logs WHERE sets_odometer_baseline = 0'
    ).get() as { id: number };

    await inTransaction(
      database,
      () => deleteServiceLogInTransaction(executor, 1, dateOnlyLog.id)
    );
    const interval = database.prepare(
      'SELECT last_service_odometer_km AS km, has_known_odometer_baseline AS known FROM service_intervals WHERE id = 1'
    ).get() as { km: number; known: number };
    assert.equal(interval.km, 5000);
    assert.equal(interval.known, 1);
  });

  it('commits setup history and the per-vehicle completion flag together', async () => {
    await inTransaction(
      database,
      () => completeServiceHistorySetupInTransaction(
        executor,
        1,
        [completion(5000), completion(0, 1, false)]
      )
    );

    assert.equal(
      (database.prepare('SELECT service_history_setup_completed AS complete FROM vehicle_profile WHERE id = 1').get() as { complete: number }).complete,
      1
    );
    assert.equal(
      (database.prepare('SELECT COUNT(*) AS count FROM service_logs WHERE vehicle_id = 1').get() as { count: number }).count,
      2
    );
  });

  it('rolls back all wizard entries and completion when one interval is invalid', async () => {
    await assert.rejects(
      inTransaction(
        database,
        () => completeServiceHistorySetupInTransaction(
          executor,
          1,
          [completion(5000), completion(6000, 2)]
        )
      ),
      /does not belong/
    );

    assert.equal(
      (database.prepare('SELECT service_history_setup_completed AS complete FROM vehicle_profile WHERE id = 1').get() as { complete: number }).complete,
      0
    );
    assert.equal(
      (database.prepare('SELECT COUNT(*) AS count FROM service_logs').get() as { count: number }).count,
      0
    );
  });

  it('rolls back from duplicate, latest, and only linked logs deterministically', async () => {
    for (const mileage of [4000, 5000, 5000]) {
      await inTransaction(database, () => insertServiceCompletionInTransaction(executor, 1, completion(mileage)));
    }

    const ids = database.prepare('SELECT id FROM service_logs ORDER BY id').all() as { id: number }[];
    await inTransaction(database, () => deleteServiceLogInTransaction(executor, 1, ids[2].id));
    assert.equal((database.prepare('SELECT last_service_odometer_km AS km FROM service_intervals WHERE id = 1').get() as { km: number }).km, 5000);

    await inTransaction(database, () => deleteServiceLogInTransaction(executor, 1, ids[1].id));
    assert.equal((database.prepare('SELECT last_service_odometer_km AS km FROM service_intervals WHERE id = 1').get() as { km: number }).km, 4000);

    await inTransaction(database, () => deleteServiceLogInTransaction(executor, 1, ids[0].id));
    assert.equal((database.prepare('SELECT last_service_odometer_km AS km FROM service_intervals WHERE id = 1').get() as { km: number }).km, 0);
    assert.equal((database.prepare('SELECT has_known_odometer_baseline AS known FROM service_intervals WHERE id = 1').get() as { known: number }).known, 0);
  });

  it('rejects an interval from another vehicle and rolls back the insert', async () => {
    await assert.rejects(
      inTransaction(database, () => insertServiceCompletionInTransaction(executor, 1, completion(5000, 2))),
      /does not belong/
    );
    assert.equal((database.prepare('SELECT COUNT(*) AS count FROM service_logs').get() as { count: number }).count, 0);
    assert.equal((database.prepare('SELECT last_service_odometer_km AS km FROM service_intervals WHERE id = 2').get() as { km: number }).km, 0);
  });

  it('rolls back both records if baseline recomputation fails after an insert', async () => {
    const failingExecutor: MaintenanceTransactionExecutor = {
      ...executor,
      async runAsync(source, params) {
        if (source.includes('UPDATE service_intervals')) throw new Error('injected update failure');
        return executor.runAsync(source, params);
      },
    };

    await assert.rejects(
      inTransaction(database, () => insertServiceCompletionInTransaction(failingExecutor, 1, completion(5000))),
      /injected update failure/
    );
    assert.equal((database.prepare('SELECT COUNT(*) AS count FROM service_logs').get() as { count: number }).count, 0);
    assert.equal((database.prepare('SELECT last_service_odometer_km AS km FROM service_intervals WHERE id = 1').get() as { km: number }).km, 0);
  });

  it('rolls back deletion when its baseline recomputation fails', async () => {
    await inTransaction(database, () => insertServiceCompletionInTransaction(executor, 1, completion(5000)));
    const log = database.prepare('SELECT id FROM service_logs').get() as { id: number };
    const failingExecutor: MaintenanceTransactionExecutor = {
      ...executor,
      async runAsync(source, params) {
        if (source.includes('UPDATE service_intervals')) throw new Error('injected delete failure');
        return executor.runAsync(source, params);
      },
    };

    await assert.rejects(
      inTransaction(database, () => deleteServiceLogInTransaction(failingExecutor, 1, log.id)),
      /injected delete failure/
    );
    assert.equal((database.prepare('SELECT COUNT(*) AS count FROM service_logs').get() as { count: number }).count, 1);
    assert.equal((database.prepare('SELECT last_service_odometer_km AS km FROM service_intervals WHERE id = 1').get() as { km: number }).km, 5000);
  });

  it('deletes an unmatched legacy tracked log without touching another vehicle', async () => {
    const result = database.prepare(
      `INSERT INTO service_logs (vehicle_id, title, date, mileage, category, notes, cost, service_type)
       VALUES (1, 'Legacy', '2026-07-19', 3000, 'general', '', NULL, 'Removed interval')`
    ).run();

    const deleted = await inTransaction(
      database,
      () => deleteServiceLogInTransaction(executor, 1, Number(result.lastInsertRowid))
    );
    assert.equal(deleted, true);
    assert.equal((database.prepare('SELECT COUNT(*) AS count FROM service_logs').get() as { count: number }).count, 0);
    assert.equal((database.prepare('SELECT last_service_odometer_km AS km FROM service_intervals WHERE id = 2').get() as { km: number }).km, 0);
  });
});
