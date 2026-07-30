import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { describe, it } from 'node:test';
import { GAS_LOG_METRICS_QUERY, getRecordListBounds } from './recordList';

describe('bounded record queries', () => {
  it('keeps list limits and offsets within safe integer bounds', () => {
    assert.deepEqual(getRecordListBounds(), { clause: '', values: [] });
    assert.deepEqual(getRecordListBounds({ limit: 100, offset: 200 }), {
      clause: ' LIMIT ? OFFSET ?',
      values: [100, 200],
    });
    assert.deepEqual(getRecordListBounds({ limit: 50_000, offset: -5 }), {
      clause: ' LIMIT ? OFFSET ?',
      values: [1000, 0],
    });
    assert.deepEqual(getRecordListBounds({ limit: Number.NaN, offset: Number.POSITIVE_INFINITY }), {
      clause: ' LIMIT ? OFFSET ?',
      values: [100, 0],
    });
  });

  it('aggregates exact fuel totals and complete full-tank segments', () => {
    const database = new DatabaseSync(':memory:');
    database.exec(`
      CREATE TABLE gas_logs (
        id INTEGER PRIMARY KEY,
        vehicle_id INTEGER NOT NULL,
        liters REAL NOT NULL,
        cost REAL NOT NULL,
        odometer_km INTEGER NOT NULL,
        logged_on TEXT NOT NULL,
        is_full_tank INTEGER NOT NULL
      );
      INSERT INTO gas_logs VALUES
        (1, 7, 5, 10, 100, '2026-01-01', 1),
        (2, 7, 2, 20, 150, '2026-01-02', 0),
        (3, 7, 4, 30, 200, '2026-01-03', 1),
        (4, 7, 1, 40, 230, '2026-01-04', 0),
        (5, 7, 4, 50, 300, '2026-01-05', 1),
        (6, 8, 99, 99, 999, '2026-01-06', 1);
    `);

    const row = database.prepare(GAS_LOG_METRICS_QUERY).get(7) as Record<string, number>;
    assert.equal(row.record_count, 5);
    assert.equal(row.total_liters, 16);
    assert.equal(row.total_cost, 150);
    assert.equal(row.segment_count, 2);
    assert.ok(Math.abs(row.average_km_per_liter - (200 / 11)) < 0.000001);
    assert.equal(row.latest_km_per_liter, 20);
    database.close();
  });
});
