// `Vitals` is accepted only so notifications scheduled by older app versions
// still open the renamed Maintenance tab after an in-place update.
export const NOTIFICATION_ROUTES = ['PreRideCheck', 'Maintenance', 'Vitals', 'Vault', 'VehicleSettings'] as const;

export type NotificationRoute = (typeof NOTIFICATION_ROUTES)[number];

export type NotificationIntent = {
  route: NotificationRoute;
  vehicleId: number | null;
};

export type NotificationNavigationTarget =
  | { kind: 'stack'; screen: 'PreRideCheck' | 'VehicleSettings' }
  | { kind: 'tab'; screen: 'Maintenance' | 'Vault' };

export type NotificationPermissionState = 'granted' | 'requestable' | 'blocked';

export function classifyNotificationPermission(status: unknown): NotificationPermissionState {
  if (!status || typeof status !== 'object') return 'blocked';

  const value = status as { granted?: boolean; status?: string; canAskAgain?: boolean };
  if (value.granted === true || value.status === 'granted') return 'granted';
  return value.canAskAgain === true ? 'requestable' : 'blocked';
}

export function parseNotificationIntent(data: unknown): NotificationIntent | null {
  if (!data || typeof data !== 'object') return null;

  const candidate = data as { route?: unknown; vehicleId?: unknown };
  if (typeof candidate.route !== 'string' || !NOTIFICATION_ROUTES.includes(candidate.route as NotificationRoute)) {
    return null;
  }

  const numericVehicleId = typeof candidate.vehicleId === 'string'
    ? Number(candidate.vehicleId)
    : candidate.vehicleId;
  const vehicleId = Number.isSafeInteger(numericVehicleId) && Number(numericVehicleId) > 0
    ? Number(numericVehicleId)
    : null;

  return { route: candidate.route as NotificationRoute, vehicleId };
}

export function getNotificationNavigationTarget(intent: NotificationIntent): NotificationNavigationTarget {
  if (intent.route === 'Vitals' || intent.route === 'Maintenance') {
    return { kind: 'tab', screen: 'Maintenance' };
  }
  if (intent.route === 'Vault') {
    return { kind: 'tab', screen: 'Vault' };
  }

  return { kind: 'stack', screen: intent.route };
}

export function getNotificationResponseFingerprint(
  identifier: string,
  deliveredAt: number,
  actionIdentifier: string
): string {
  return `${identifier}:${deliveredAt}:${actionIdentifier}`;
}
