import type { ScooterSelection } from '../catalog/scooterCatalog';

export type VehicleScooterSqlValue = string | number | null;

export type VehicleScooterTransactionExecutor = {
  getFirstAsync<T>(source: string, params: VehicleScooterSqlValue[]): Promise<T | null>;
  runAsync(
    source: string,
    params: VehicleScooterSqlValue[]
  ): Promise<{ changes: number; lastInsertRowId: number }>;
};

export async function updateVehicleScooterIdentityInTransaction(
  transaction: VehicleScooterTransactionExecutor,
  vehicleId: number,
  selection: ScooterSelection,
  reapplyMaintenance: () => Promise<void>
): Promise<void> {
  const previous = await transaction.getFirstAsync<{
    scooter_brand_id: string | null;
    scooter_model_id: string | null;
    scooter_version_id: string | null;
    scooter_variant_id: string | null;
  }>(
    `SELECT scooter_brand_id, scooter_model_id, scooter_version_id, scooter_variant_id
     FROM vehicle_profile WHERE id = ?`,
    [vehicleId]
  );
  if (!previous) throw new Error('Vehicle does not exist.');
  const changed = previous.scooter_brand_id !== selection.brandId
    || previous.scooter_model_id !== selection.modelId
    || previous.scooter_version_id !== selection.versionId
    || previous.scooter_variant_id !== (selection.variantId ?? null);
  const result = await transaction.runAsync(
    `UPDATE vehicle_profile
     SET scooter_brand_id = ?, scooter_model_id = ?, scooter_version_id = ?, scooter_variant_id = ?
     WHERE id = ?`,
    [selection.brandId, selection.modelId, selection.versionId, selection.variantId ?? null, vehicleId]
  );
  if (result.changes !== 1) throw new Error('Vehicle does not exist.');
  if (changed) {
    await transaction.runAsync(
      `UPDATE vehicle_profile
       SET maintenance_history_level = 'not_asked', service_history_setup_completed = 0
       WHERE id = ?`,
      [vehicleId]
    );
  }
  await reapplyMaintenance();
}
