import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { describe, it } from 'node:test';
import { CURRENT_SCHEMA_SQL } from './databaseSchema';
import { applyOdometerCorrectionMigration } from './odometerCorrectionMigration';

describe('odometer correction storage migration', () => {
  it('upgrades the rollback trigger idempotently without changing existing records', async () => {
    const database = new DatabaseSync(':memory:');
    try {
      database.exec(CURRENT_SCHEMA_SQL);
      database.prepare(
        "INSERT INTO vehicle_profile (id, name, current_mileage) VALUES (1, 'Primary', 10000)"
      ).run();
      database.prepare(
        `INSERT INTO service_logs (
          id, vehicle_id, title, date, mileage, category, notes, sets_odometer_baseline
        ) VALUES (5, 1, 'Existing service', '2026-07-01', 9000, 'engine', 'keep', 1)`
      ).run();
      database.prepare(
        `INSERT INTO odometer_events (
          id, vehicle_id, event_type, previous_effective_km, new_effective_km,
          previous_displayed_km, new_displayed_km, reason
        ) VALUES (7, 1, 'confirmed_reading', 9000, 10000, 9000, 10000, 'Existing reading')`
      ).run();

      // Recreate the v15 rollback shape, which had no authorization capability.
      database.exec(`
        DROP TRIGGER record_authorized_odometer_correction;
        DROP TRIGGER prevent_vehicle_odometer_rollback;
        DROP TABLE odometer_correction_authorizations;
        CREATE TRIGGER prevent_vehicle_odometer_rollback
        BEFORE UPDATE OF current_mileage ON vehicle_profile
        WHEN NEW.current_mileage < OLD.current_mileage
        BEGIN
          SELECT RAISE(ABORT, 'Odometer reading cannot move backwards');
        END;
      `);

      const adapter = {
        async execAsync(source: string) {
          database.exec(source);
        },
      };
      await applyOdometerCorrectionMigration(adapter);
      database.prepare(
        `INSERT INTO odometer_correction_authorizations (
          vehicle_id, previous_effective_km, new_effective_km, reason, authorized_at
        ) VALUES (1, 10000, 9500, 'stale development row', '2026-08-01T00:00:00.000Z')`
      ).run();
      await applyOdometerCorrectionMigration(adapter);

      assert.equal(
        (database.prepare(
          "SELECT COUNT(*) AS count FROM sqlite_master WHERE type = 'table' AND name = 'odometer_correction_authorizations'"
        ).get() as { count: number }).count,
        1
      );
      assert.equal(
        (database.prepare('SELECT COUNT(*) AS count FROM odometer_correction_authorizations').get() as {
          count: number;
        }).count,
        0
      );
      assert.equal(
        (database.prepare('SELECT notes FROM service_logs WHERE id = 5').get() as { notes: string }).notes,
        'keep'
      );
      assert.equal(
        (database.prepare('SELECT reason FROM odometer_events WHERE id = 7').get() as { reason: string }).reason,
        'Existing reading'
      );
      assert.throws(
        () => database.prepare('UPDATE vehicle_profile SET current_mileage = 9500 WHERE id = 1').run(),
        /cannot move backwards/i
      );
    } finally {
      database.close();
    }
  });
});
