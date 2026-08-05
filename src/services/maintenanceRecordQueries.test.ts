import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { describe, it } from 'node:test';
import { CURRENT_SCHEMA_SQL } from './databaseSchema';
import {
  buildServiceLogListQuery,
  MAINTENANCE_INSIGHTS_QUERY,
} from './maintenanceRecordQueries';

function databaseWithVehicles(): DatabaseSync {
  const database = new DatabaseSync(':memory:');
  database.exec(CURRENT_SCHEMA_SQL);
  database.prepare(
    "INSERT INTO vehicle_profile (id, name, current_mileage) VALUES (1, 'Primary', 12000), (2, 'Other', 9000)"
  ).run();
  return database;
}

function insertLog(
  database: DatabaseSync,
  values: {
    vehicleId?: number;
    title: string;
    date: string;
    mileage: number;
    cost?: number | null;
    packageId?: string | null;
    baseline?: number;
  }
): number {
  const result = database.prepare(
    `INSERT INTO service_logs (
       vehicle_id, title, date, mileage, category, notes, cost, service_type,
       sets_odometer_baseline, service_package_id
     ) VALUES (?, ?, ?, ?, 'maintenance', '', ?, NULL, ?, ?)`
  ).run(
    values.vehicleId ?? 1,
    values.title,
    values.date,
    values.mileage,
    values.cost ?? null,
    values.baseline ?? 1,
    values.packageId ?? null
  );
  return Number(result.lastInsertRowid);
}

describe('logical maintenance record reads', () => {
  it('never splits a service package at a raw-row page boundary', () => {
    const database = databaseWithVehicles();
    insertLog(database, {
      title: 'Older single',
      date: '2026-07-01',
      mileage: 10000,
    });
    const packageIds = [
      insertLog(database, {
        title: 'Engine oil',
        date: '2026-07-20',
        mileage: 11000,
        packageId: 'workshop-1',
      }),
      insertLog(database, {
        title: 'Air filter',
        date: '2026-07-20',
        mileage: 11000,
        packageId: 'workshop-1',
      }),
      insertLog(database, {
        title: 'Brake inspection',
        date: '2026-07-20',
        mileage: 11000,
        packageId: 'workshop-1',
      }),
    ];
    insertLog(database, {
      vehicleId: 2,
      title: 'Other vehicle',
      date: '2026-07-30',
      mileage: 8000,
      packageId: 'workshop-1',
    });

    const firstPage = buildServiceLogListQuery(1, { limit: 1 });
    const firstRows = database.prepare(firstPage.sql).all(...firstPage.params) as {
      id: number;
      service_package_id: string | null;
    }[];
    assert.equal(firstRows.length, 3);
    assert.deepEqual(firstRows.map((row) => row.id).sort((a, b) => a - b), packageIds);
    assert.ok(firstRows.every((row) => row.service_package_id === 'workshop-1'));

    const secondPage = buildServiceLogListQuery(1, { limit: 1, offset: 1 });
    const secondRows = database.prepare(secondPage.sql).all(...secondPage.params) as {
      title: string;
      service_package_id: string | null;
    }[];
    assert.deepEqual(secondRows.map((row) => row.title), ['Older single']);
    assert.equal(secondRows[0].service_package_id, null);
  });

  it('counts shared package cost once while preserving standalone records', () => {
    const database = databaseWithVehicles();
    insertLog(database, {
      title: 'Engine oil',
      date: '2026-07-20',
      mileage: 11000,
      cost: 300,
      packageId: 'workshop-1',
      baseline: 1,
    });
    insertLog(database, {
      title: 'Air filter',
      date: '2026-07-20',
      mileage: 11000,
      cost: 300,
      packageId: 'workshop-1',
      baseline: 1,
    });
    insertLog(database, {
      title: 'Standalone repair',
      date: '2026-07-25',
      mileage: 11500,
      cost: 50,
      baseline: 1,
    });
    insertLog(database, {
      title: 'Older work',
      date: '2026-06-10',
      mileage: 9000,
      cost: 20,
      baseline: 1,
    });
    insertLog(database, {
      vehicleId: 2,
      title: 'Other vehicle',
      date: '2026-07-25',
      mileage: 8000,
      cost: 999,
      packageId: 'workshop-1',
      baseline: 1,
    });

    const summary = database.prepare(MAINTENANCE_INSIGHTS_QUERY).get(1, '2026-07') as {
      total_cost: number;
      record_count: number;
      month_cost: number;
      first_mileage: number | null;
    };
    assert.deepEqual({ ...summary }, {
      total_cost: 370,
      record_count: 3,
      month_cost: 350,
      first_mileage: 9000,
    });
  });
});
