export type MaintenanceRecordBackAction = 'dismiss-keyboard' | 'close-form';

/** Keeps Android Back from discarding an in-progress maintenance form while an input is focused. */
export function resolveMaintenanceRecordBackAction(keyboardVisible: boolean): MaintenanceRecordBackAction {
  return keyboardVisible ? 'dismiss-keyboard' : 'close-form';
}
