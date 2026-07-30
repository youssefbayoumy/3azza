import type { ScooterSelection } from '../catalog/scooterCatalog';

export type VehicleScooterSqlValue = string | number | null;

export type VehicleScooterTransactionExecutor = {
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
  const result = await transaction.runAsync(
    `UPDATE vehicle_profile
     SET scooter_brand_id = ?, scooter_model_id = ?, scooter_version_id = ?, scooter_variant_id = ?
     WHERE id = ?`,
    [selection.brandId, selection.modelId, selection.versionId, selection.variantId ?? null, vehicleId]
  );
  if (result.changes !== 1) throw new Error('Vehicle does not exist.');
  await reapplyMaintenance();
}
