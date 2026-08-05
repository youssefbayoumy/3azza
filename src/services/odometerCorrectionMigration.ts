import { ODOMETER_CORRECTION_SCHEMA_SQL } from './databaseSchema';

export type OdometerCorrectionMigrationExecutor = {
  execAsync(source: string): Promise<void>;
};

/** Installs (or heals) the guarded, audited downward-correction capability. */
export async function applyOdometerCorrectionMigration(
  database: OdometerCorrectionMigrationExecutor
): Promise<void> {
  await database.execAsync(ODOMETER_CORRECTION_SCHEMA_SQL);
  // Authorization rows are transaction-scoped implementation details. A row
  // surviving from a partially initialized development build must never grant a
  // later ordinary profile save permission to roll the odometer backwards.
  await database.execAsync('DELETE FROM odometer_correction_authorizations;');
}
