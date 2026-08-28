import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { describe, it } from 'node:test';
import { applyMaintenanceLifecycleMigration } from './maintenanceLifecycleMigration';

function adapter(database: DatabaseSync) {
  return {
    async execAsync(sql: string) { database.exec(sql); },
    async getAllAsync<T>(sql: string) { return database.prepare(sql).all() as T[]; },
  };
}

describe('maintenance lifecycle migration', () => {
  it('preserves records and preferences while leaving legacy ownership unknown', async () => {
    const database = new DatabaseSync(':memory:');
    try {
      database.exec(`
        CREATE TABLE vehicle_profile (id INTEGER PRIMARY KEY, name TEXT NOT NULL);
        CREATE TABLE service_logs (id INTEGER PRIMARY KEY, vehicle_id INTEGER NOT NULL, mileage INTEGER NOT NULL);
        CREATE TABLE maintenance_preferences (id INTEGER PRIMARY KEY, vehicle_id INTEGER NOT NULL, custom_interval_km INTEGER);
        INSERT INTO vehicle_profile VALUES (1, 'Legacy scooter');
        INSERT INTO service_logs VALUES (7, 1, 12000);
        INSERT INTO maintenance_preferences VALUES (9, 1, 750);
      `);

      await applyMaintenanceLifecycleMigration(adapter(database));
      await applyMaintenanceLifecycleMigration(adapter(database));

      const vehicle = database.prepare(
        'SELECT purchase_condition, maintenance_started_at FROM vehicle_profile WHERE id = 1'
      ).get() as { purchase_condition: string; maintenance_started_at: string | null };
      assert.equal(vehicle.purchase_condition, 'unknown');
      assert.equal(vehicle.maintenance_started_at, null);
      assert.equal((database.prepare('SELECT COUNT(*) AS count FROM service_logs').get() as { count: number }).count, 1);
      assert.equal((database.prepare('SELECT custom_interval_km FROM maintenance_preferences').get() as { custom_interval_km: number }).custom_interval_km, 750);
      assert.throws(() => database.prepare(
        "UPDATE vehicle_profile SET purchase_condition = 'guessed' WHERE id = 1"
      ).run(), /Vehicle purchase condition is invalid/);
    } finally {
      database.close();
    }
  });
});
