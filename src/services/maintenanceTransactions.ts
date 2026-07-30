import { validateRecordedOdometer } from '../utils/recordValidation';

export type MaintenanceSqlValue = string | number | null;

export type MaintenanceTransactionExecutor = {
  getFirstAsync<T>(source: string, params: MaintenanceSqlValue[]): Promise<T | null>;
  runAsync(
    source: string,
    params: MaintenanceSqlValue[]
  ): Promise<{ changes: number; lastInsertRowId: number }>;
};

export type ServiceCompletionTransactionInput = {
  serviceIntervalId: number | null;
  title: string;
  date: string;
  mileage: number;
  category: string;
  notes: string;
  cost: number | null;
  setsOdometerBaseline: boolean;
};

export async function insertServiceCompletionInTransaction(
  transaction: MaintenanceTransactionExecutor,
  vehicleId: number,
  log: ServiceCompletionTransactionInput
): Promise<void> {
  const vehicle = await transaction.getFirstAsync<{ current_mileage: number }>(
    'SELECT current_mileage FROM vehicle_profile WHERE id = ?',
    [vehicleId]
  );
  if (!vehicle) throw new Error('The active vehicle no longer exists.');

  const mileageMessage = validateRecordedOdometer(log.mileage, vehicle.current_mileage);
  if (mileageMessage) throw new Error(mileageMessage);
  if (!log.setsOdometerBaseline && log.mileage !== 0) {
    throw new Error('Date-only service history must not contain an odometer reading.');
  }

  let serviceType: string | null = null;
  if (log.serviceIntervalId !== null) {
    const interval = await transaction.getFirstAsync<{ name: string }>(
      'SELECT name FROM service_intervals WHERE id = ? AND vehicle_id = ?',
      [log.serviceIntervalId, vehicleId]
    );
    if (!interval) {
      throw new Error('The selected maintenance interval does not belong to the active vehicle.');
    }
    serviceType = interval.name;
  }

  await transaction.runAsync(
    `INSERT INTO service_logs (
       vehicle_id, title, date, mileage, category, notes, cost, service_type, sets_odometer_baseline
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      vehicleId,
      log.title,
      log.date,
      log.mileage,
      log.category,
      log.notes,
      log.cost,
      serviceType,
      log.setsOdometerBaseline ? 1 : 0,
    ]
  );

  if (!serviceType) return;

  await transaction.runAsync(
    `UPDATE service_intervals
     SET last_service_odometer_km = COALESCE((
       SELECT MAX(mileage) FROM service_logs
       WHERE vehicle_id = ? AND service_type = ? AND sets_odometer_baseline = 1
     ), 0),
     last_service_date = (
       SELECT MAX(date) FROM service_logs
       WHERE vehicle_id = ? AND service_type = ?
     ),
     has_known_odometer_baseline = CASE WHEN EXISTS (
       SELECT 1 FROM service_logs
       WHERE vehicle_id = ? AND service_type = ? AND sets_odometer_baseline = 1
     ) THEN 1 ELSE 0 END
     WHERE id = ? AND vehicle_id = ?`,
    [
      vehicleId,
      serviceType,
      vehicleId,
      serviceType,
      vehicleId,
      serviceType,
      log.serviceIntervalId,
      vehicleId,
    ]
  );
}

export async function completeServiceHistorySetupInTransaction(
  transaction: MaintenanceTransactionExecutor,
  vehicleId: number,
  entries: ServiceCompletionTransactionInput[]
): Promise<void> {
  for (const entry of entries) {
    await insertServiceCompletionInTransaction(transaction, vehicleId, entry);
  }

  const result = await transaction.runAsync(
    'UPDATE vehicle_profile SET service_history_setup_completed = 1 WHERE id = ?',
    [vehicleId]
  );
  if (result.changes !== 1) {
    throw new Error('The active vehicle no longer exists.');
  }
}

export async function deleteServiceLogInTransaction(
  transaction: MaintenanceTransactionExecutor,
  vehicleId: number,
  logId: number
): Promise<boolean> {
  const log = await transaction.getFirstAsync<{ id: number; service_type: string | null }>(
    'SELECT id, service_type FROM service_logs WHERE id = ? AND vehicle_id = ?',
    [logId, vehicleId]
  );
  if (!log) return false;

  await transaction.runAsync(
    'DELETE FROM service_logs WHERE id = ? AND vehicle_id = ?',
    [logId, vehicleId]
  );

  if (log.service_type) {
    await transaction.runAsync(
      `UPDATE service_intervals
       SET last_service_odometer_km = COALESCE((
         SELECT MAX(mileage) FROM service_logs
         WHERE vehicle_id = ? AND service_type = ? AND sets_odometer_baseline = 1
       ), 0),
       last_service_date = (
         SELECT MAX(date) FROM service_logs
         WHERE vehicle_id = ? AND service_type = ?
       ),
       has_known_odometer_baseline = CASE WHEN EXISTS (
         SELECT 1 FROM service_logs
         WHERE vehicle_id = ? AND service_type = ? AND sets_odometer_baseline = 1
       ) THEN 1 ELSE 0 END
       WHERE vehicle_id = ? AND name = ?`,
      [
        vehicleId,
        log.service_type,
        vehicleId,
        log.service_type,
        vehicleId,
        log.service_type,
        vehicleId,
        log.service_type,
      ]
    );
  }

  return true;
}
