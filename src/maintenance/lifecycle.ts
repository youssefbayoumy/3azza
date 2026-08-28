import type {
  MaintenanceHistoryState,
  MaintenancePreference,
  VehicleProfile,
} from '../types/database.types';
import { getInitialServiceCheckpoint, type InitialServiceCheckpoint } from './initialServiceCheckpoint';
import { projectMaintenanceTasks } from './scheduler';
import { maintenanceHistoryByAction, maintenancePreferencesForScheduler } from './storageProjection';
import type {
  MaintenanceEvent,
  MaintenanceTaskProjection,
  ScooterMaintenanceProfile,
} from './types';

export type MaintenanceLifecycle = 'break_in' | 'normal';

export type VehicleMaintenancePlan = {
  lifecycle: MaintenanceLifecycle;
  firstServiceCheckpoint: InitialServiceCheckpoint | null;
  tasks: MaintenanceTaskProjection[];
};

function isNewVehicle(vehicle: VehicleProfile): boolean {
  return vehicle.purchase_condition === 'new';
}

export function projectVehicleMaintenance(input: {
  vehicle: VehicleProfile;
  profile: ScooterMaintenanceProfile;
  events: MaintenanceEvent[];
  preferences: MaintenancePreference[];
  historyStates: MaintenanceHistoryState[];
  now: Date;
}): VehicleMaintenancePlan {
  const firstServiceCheckpoint = isNewVehicle(input.vehicle)
    ? getInitialServiceCheckpoint({
        profile: input.profile,
        currentOdometerKm: input.vehicle.current_mileage,
        historyStates: input.historyStates,
      })
    : null;
  const lifecycle: MaintenanceLifecycle = firstServiceCheckpoint ? 'break_in' : 'normal';
  // The break-in package is deliberately separate from recurring maintenance.
  // A new scooter sees regular tasks only after that package is resolved or its
  // explicit actionable window has ended.
  const tasks = lifecycle === 'break_in'
    ? []
    : projectMaintenanceTasks({
        profile: input.profile,
        currentOdometerKm: input.vehicle.current_mileage,
        vehicleId: input.vehicle.id,
        now: input.now,
        events: input.events,
        preferences: maintenancePreferencesForScheduler(input.preferences),
        historyByAction: maintenanceHistoryByAction(input.historyStates, isNewVehicle(input.vehicle)),
        defaultHistoryKnowledge: isNewVehicle(input.vehicle) ? 'known_no_prior_completion' : 'unknown',
        vehicleInServiceDate: isNewVehicle(input.vehicle) ? input.vehicle.maintenance_started_at : null,
      }).filter((task) => !task.isOneTime);

  return { lifecycle, firstServiceCheckpoint, tasks };
}
