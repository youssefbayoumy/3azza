export type MaintenanceLifecycleMigrationDatabase = {
  execAsync(sql: string): Promise<unknown>;
  getAllAsync<T>(sql: string): Promise<T[]>;
};

export const VEHICLE_PURCHASE_CONDITION_GUARDS_SQL = `
  DROP TRIGGER IF EXISTS prevent_invalid_purchase_condition_insert;
  DROP TRIGGER IF EXISTS prevent_invalid_purchase_condition_update;

  CREATE TRIGGER prevent_invalid_purchase_condition_insert
  BEFORE INSERT ON vehicle_profile
  WHEN NEW.purchase_condition NOT IN ('new', 'used', 'unknown')
  BEGIN
    SELECT RAISE(ABORT, 'Vehicle purchase condition is invalid');
  END;

  CREATE TRIGGER prevent_invalid_purchase_condition_update
  BEFORE UPDATE OF purchase_condition ON vehicle_profile
  WHEN NEW.purchase_condition NOT IN ('new', 'used', 'unknown')
  BEGIN
    SELECT RAISE(ABORT, 'Vehicle purchase condition is invalid');
  END;
`;

/**
 * Adds the lifecycle fields without attempting to infer whether an existing
 * scooter was bought new or used. Existing maintenance records, history rows,
 * and per-action preferences are deliberately left untouched.
 */
export async function applyMaintenanceLifecycleMigration(
  database: MaintenanceLifecycleMigrationDatabase
): Promise<void> {
  const columns = new Set((await database.getAllAsync<{ name: string }>(
    'PRAGMA table_info(vehicle_profile)'
  )).map((column) => column.name));

  if (!columns.has('purchase_condition')) {
    await database.execAsync(
      "ALTER TABLE vehicle_profile ADD COLUMN purchase_condition TEXT NOT NULL DEFAULT 'unknown';"
    );
  }
  if (!columns.has('maintenance_started_at')) {
    await database.execAsync('ALTER TABLE vehicle_profile ADD COLUMN maintenance_started_at TEXT;');
  }

  await database.execAsync(VEHICLE_PURCHASE_CONDITION_GUARDS_SQL);
}
