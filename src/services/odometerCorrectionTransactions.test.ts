import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { describe, it } from 'node:test';
import { CURRENT_SCHEMA_SQL } from './databaseSchema';
import type {
  MaintenanceRecordSqlValue,
  MaintenanceRecordTransactionExecutor,
} from './maintenance/maintenanceRecordTransactions';
import {
  correctOdometerReadingInTransaction,
  getOdometerCorrectionFloorInTransaction,
} from './odometerCorrectionTransactions';

const TIMESTAMP = '2026-08-01T10:00:00.000Z';

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

function createDatabase(currentMileage = 10000): DatabaseSync {
  const database = new DatabaseSync(':memory:');
  database.exec(CURRENT_SCHEMA_SQL);
  database.prepare(
    'INSERT INTO vehicle_profile (id, name, current_mileage) VALUES (1, ?, ?), (2, ?, ?)'
  ).run('Primary', currentMileage, 'Other', 7777);
  return database;
}

async function inTransaction<T>(database: DatabaseSync, task: () => Promise<T>): Promise<T> {
  database.exec('BEGIN IMMEDIATE;');
  try {
    const result = await task();
    database.exec('COMMIT;');
    return result;
  } catch (error) {
    database.exec('ROLLBACK;');
    throw error;
  }
}

function count(database: DatabaseSync, table: string): number {
  return Number((database.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get() as { count: number }).count);
}

describe('transactional odometer correction', () => {
  it('corrects downward, preserves every record, and atomically creates one audit event', async () => {
    const database = createDatabase();
    try {
      database.prepare(
        `INSERT INTO service_logs (
          id, vehicle_id, title, date, mileage, category, notes, sets_odometer_baseline
        ) VALUES (11, 1, 'Oil change', '2026-07-01', 8000, 'engine', 'preserve me', 1)`
      ).run();
      database.prepare(
        `INSERT INTO gas_logs (
          id, vehicle_id, liters, cost, odometer_km, logged_on, is_full_tank
        ) VALUES (12, 1, 5, 100, 8500, '2026-07-10', 1)`
      ).run();
      database.prepare(
        `INSERT INTO service_intervals (
          id, vehicle_id, name, interval_km, last_service_odometer_km, type,
          has_known_odometer_baseline
        ) VALUES (13, 1, 'Legacy interval', 1000, 9000, 'replace', 1)`
      ).run();
      const recordsBefore = {
        service: database.prepare('SELECT * FROM service_logs WHERE id = 11').get(),
        fuel: database.prepare('SELECT * FROM gas_logs WHERE id = 12').get(),
        interval: database.prepare('SELECT * FROM service_intervals WHERE id = 13').get(),
      };

      assert.equal(await getOdometerCorrectionFloorInTransaction(executor(database), 1), 9000);
      const audit = await inTransaction(database, () => correctOdometerReadingInTransaction(
        executor(database),
        1,
        { correctedMileageKm: 9500, reason: '  Accidental extra digit  ' },
        TIMESTAMP
      ));

      assert.equal(audit.vehicle_id, 1);
      assert.equal(audit.event_type, 'correction');
      assert.equal(audit.previous_effective_km, 10000);
      assert.equal(audit.new_effective_km, 9500);
      assert.equal(audit.previous_displayed_km, 10000);
      assert.equal(audit.new_displayed_km, 9500);
      assert.equal(audit.reason, 'Accidental extra digit');
      assert.equal(audit.recorded_at, TIMESTAMP);
      assert.equal(
        (database.prepare('SELECT current_mileage FROM vehicle_profile WHERE id = 1').get() as {
          current_mileage: number;
        }).current_mileage,
        9500
      );
      assert.equal(
        (database.prepare('SELECT current_mileage FROM vehicle_profile WHERE id = 2').get() as {
          current_mileage: number;
        }).current_mileage,
        7777
      );
      assert.deepEqual(database.prepare('SELECT * FROM service_logs WHERE id = 11').get(), recordsBefore.service);
      assert.deepEqual(database.prepare('SELECT * FROM gas_logs WHERE id = 12').get(), recordsBefore.fuel);
      assert.deepEqual(database.prepare('SELECT * FROM service_intervals WHERE id = 13').get(), recordsBefore.interval);
      assert.equal(count(database, 'odometer_events'), 1);
      assert.equal(count(database, 'odometer_correction_authorizations'), 0);
    } finally {
      database.close();
    }
  });

  it('requires a non-empty reason and a strictly lower whole-number reading', async () => {
    const database = createDatabase();
    try {
      for (const input of [
        { correctedMileageKm: 9500, reason: '   ' },
        { correctedMileageKm: 10000, reason: 'Same value' },
        { correctedMileageKm: 10001, reason: 'Increase' },
        { correctedMileageKm: 9500.5, reason: 'Fraction' },
        { correctedMileageKm: -1, reason: 'Negative' },
      ]) {
        await assert.rejects(
          inTransaction(database, () => correctOdometerReadingInTransaction(
            executor(database), 1, input, TIMESTAMP
          ))
        );
      }
      assert.equal(
        (database.prepare('SELECT current_mileage FROM vehicle_profile WHERE id = 1').get() as {
          current_mileage: number;
        }).current_mileage,
        10000
      );
      assert.equal(count(database, 'odometer_events'), 0);
      assert.equal(count(database, 'odometer_correction_authorizations'), 0);
    } finally {
      database.close();
    }
  });

  it('rejects values below service, fuel, or known interval baselines', async () => {
    const scenarios = [
      `INSERT INTO service_logs (
        vehicle_id, title, date, mileage, category, notes, sets_odometer_baseline
      ) VALUES (1, 'Confirmed service', '2026-07-01', 9800, 'engine', '', 1)`,
      `INSERT INTO gas_logs (
        vehicle_id, liters, cost, odometer_km, logged_on, is_full_tank
      ) VALUES (1, 5, 100, 9800, '2026-07-01', 1)`,
      `INSERT INTO service_intervals (
        vehicle_id, name, interval_km, last_service_odometer_km, type,
        has_known_odometer_baseline
      ) VALUES (1, 'Confirmed interval', 1000, 9800, 'replace', 1)`,
    ];
    for (const setup of scenarios) {
      const database = createDatabase();
      try {
        database.exec(setup);
        assert.equal(await getOdometerCorrectionFloorInTransaction(executor(database), 1), 9800);
        await assert.rejects(
          inTransaction(database, () => correctOdometerReadingInTransaction(
            executor(database),
            1,
            { correctedMileageKm: 9799, reason: 'Reading was entered incorrectly' },
            TIMESTAMP
          )),
          /confirmed 9,800 km baseline/i
        );
        assert.equal(count(database, 'odometer_events'), 0);
        const boundary = await inTransaction(database, () => correctOdometerReadingInTransaction(
          executor(database),
          1,
          { correctedMileageKm: 9800, reason: 'Correct to the confirmed baseline' },
          TIMESTAMP
        ));
        assert.equal(boundary.new_effective_km, 9800);
        assert.equal(count(database, 'odometer_events'), 1);
      } finally {
        database.close();
      }
    }
  });

  it('keeps ordinary vehicle updates forward-only before and after a correction', async () => {
    const database = createDatabase();
    try {
      assert.throws(
        () => database.prepare('UPDATE vehicle_profile SET current_mileage = 9500 WHERE id = 1').run(),
        /cannot move backwards/i
      );
      await inTransaction(database, () => correctOdometerReadingInTransaction(
        executor(database),
        1,
        { correctedMileageKm: 9500, reason: 'Correcting a setup typo' },
        TIMESTAMP
      ));
      assert.throws(
        () => database.prepare('UPDATE vehicle_profile SET current_mileage = 9400 WHERE id = 1').run(),
        /cannot move backwards/i
      );
      assert.equal(count(database, 'odometer_events'), 1);
      assert.equal(count(database, 'odometer_correction_authorizations'), 0);
    } finally {
      database.close();
    }
  });

  it('rolls back the mileage, authorization, and audit together on transaction failure', async () => {
    const database = createDatabase();
    try {
      await assert.rejects(inTransaction(database, async () => {
        await correctOdometerReadingInTransaction(
          executor(database),
          1,
          { correctedMileageKm: 9500, reason: 'Correcting a setup typo' },
          TIMESTAMP
        );
        throw new Error('injected failure after correction');
      }), /injected failure/);
      assert.equal(
        (database.prepare('SELECT current_mileage FROM vehicle_profile WHERE id = 1').get() as {
          current_mileage: number;
        }).current_mileage,
        10000
      );
      assert.equal(count(database, 'odometer_events'), 0);
      assert.equal(count(database, 'odometer_correction_authorizations'), 0);
    } finally {
      database.close();
    }
  });
});
