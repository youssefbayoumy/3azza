import {
  isScooterSelectionComplete,
  resolveScooterSelection,
  type ScooterSelection,
} from '../catalog/scooterCatalog';
import { parseWholeNumberInput } from '../utils/recordValidation';

export type VehicleCreationFields = {
  name: string;
  mileage: string;
  dailyAverage: string;
  selection: Partial<ScooterSelection>;
};

export type VehicleCreationLabels = {
  startingOdometer: string;
  dailyAverage: string;
};

export type PreparedVehicleCreation = {
  name: string;
  currentMileage: number;
  dailyAverageKm: number;
  selection: ScooterSelection;
};

/** Returns the exact payload accepted by vehicle persistence, or null while the draft is incomplete. */
export function prepareVehicleCreation(
  fields: VehicleCreationFields,
  labels: VehicleCreationLabels
): PreparedVehicleCreation | null {
  const name = fields.name.trim();
  const mileage = parseWholeNumberInput(fields.mileage, { label: labels.startingOdometer });
  const dailyAverage = parseWholeNumberInput(fields.dailyAverage, { label: labels.dailyAverage });
  const selection = resolveScooterSelection(fields.selection);

  if (!name || !mileage.ok || !dailyAverage.ok || !selection || !isScooterSelectionComplete(selection)) {
    return null;
  }

  return {
    name,
    currentMileage: mileage.value,
    dailyAverageKm: dailyAverage.value,
    selection,
  };
}

/** Keeps a single vehicle-creation request in flight, including before React renders the busy state. */
export function createVehicleCreationGuard() {
  let creating = false;

  return {
    tryStart(): boolean {
      if (creating) return false;
      creating = true;
      return true;
    },
    finish(): void {
      creating = false;
    },
    isCreating(): boolean {
      return creating;
    },
  };
}
