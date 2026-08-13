import type { ScooterSelection } from '../catalog/scooterCatalog';
import {
  serializeVehicleCapabilities,
  VEHICLE_CAPABILITIES_SCHEMA_VERSION,
} from '../catalog/vehicleCapabilities';

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
    vehicle_selection_mode: 'catalog' | 'custom_brand';
    custom_brand_name: string | null;
    custom_model_name: string | null;
    vehicle_capabilities_version: number;
    vehicle_capabilities_json: string;
  }>(
    `SELECT scooter_brand_id, scooter_model_id, scooter_version_id, scooter_variant_id,
            vehicle_selection_mode, custom_brand_name, custom_model_name,
            vehicle_capabilities_version, vehicle_capabilities_json
     FROM vehicle_profile WHERE id = ?`,
    [vehicleId]
  );
  if (!previous) throw new Error('Vehicle does not exist.');
  const capabilitiesJson = serializeVehicleCapabilities(selection.capabilities);
  const changed = previous.scooter_brand_id !== selection.brandId
    || previous.scooter_model_id !== selection.modelId
    || previous.scooter_version_id !== selection.versionId
    || previous.scooter_variant_id !== (selection.variantId ?? null)
    || previous.vehicle_selection_mode !== (selection.selectionMode ?? 'catalog')
    || previous.custom_brand_name !== (selection.customBrandName?.trim() || null)
    || previous.custom_model_name !== (selection.customModelName?.trim() || null)
    || previous.vehicle_capabilities_version !== VEHICLE_CAPABILITIES_SCHEMA_VERSION
    || previous.vehicle_capabilities_json !== capabilitiesJson;
  const result = await transaction.runAsync(
    `UPDATE vehicle_profile
     SET scooter_brand_id = ?, scooter_model_id = ?, scooter_version_id = ?, scooter_variant_id = ?,
         vehicle_selection_mode = ?, custom_brand_name = ?, custom_model_name = ?,
         vehicle_capabilities_version = ?, vehicle_capabilities_json = ?
     WHERE id = ?`,
    [
      selection.brandId,
      selection.modelId,
      selection.versionId,
      selection.variantId ?? null,
      selection.selectionMode ?? 'catalog',
      selection.customBrandName?.trim() || null,
      selection.customModelName?.trim() || null,
      VEHICLE_CAPABILITIES_SCHEMA_VERSION,
      capabilitiesJson,
      vehicleId,
    ]
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
