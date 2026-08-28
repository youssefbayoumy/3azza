import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import {
  getDocuments,
  getMaintenanceEvents,
  getMaintenanceHistoryStates,
  getMaintenancePreferences,
  getVehicleProfile,
} from './database';
import { buildDomainMaintenanceReminderPlan, MAINTENANCE_REMINDER_IDS } from '../utils/reminderPlan';
import {
  classifyNotificationPermission,
  getNotificationResponseFingerprint,
  parseNotificationIntent,
  type NotificationIntent,
} from '../utils/notificationRouting';
import { getMaintenanceProfileForSelection } from '../maintenance/profiles';
import { isTaskTracked } from '../maintenance/scheduler';
import { maintenancePreferencesForScheduler } from '../maintenance/storageProjection';
import { t } from '../i18n/core';
import { selectionFromProfile } from '../catalog/scooterCatalog';
import { projectVehicleMaintenance } from '../maintenance/lifecycle';

const CHANNEL_ID = '3azza-maintenance';
const BACKUP_ID = '3azza-backup-weekly';

export type NotificationSyncResult = {
  granted: boolean;
  scheduled: number;
  unsupported: boolean;
  failed: boolean;
  blocked: boolean;
};

let maintenanceSyncQueue: Promise<void> = Promise.resolve();
let backupSyncQueue: Promise<void> = Promise.resolve();

export function configureNotificationBehavior(): void {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });
}

async function ensureNotificationChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;

  await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
    name: t('notifications.channel'),
    importance: Notifications.AndroidImportance.DEFAULT,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: '#a9c7ff',
  });
}

async function ensurePermissions(): Promise<{ granted: boolean; blocked: boolean }> {
  if (Platform.OS === 'web') return { granted: false, blocked: false };

  const current = await Notifications.getPermissionsAsync();
  const currentState = classifyNotificationPermission(current);
  if (currentState === 'granted') return { granted: true, blocked: false };
  if (currentState === 'blocked') return { granted: false, blocked: true };

  await Notifications.requestPermissionsAsync();
  // Android can return the prompt's transitional permission result before it
  // persists a second denial as "don't ask again". Re-read the OS state so
  // blocked users receive the Settings recovery action immediately.
  const updated = await Notifications.getPermissionsAsync();
  const requestedState = classifyNotificationPermission(updated);
  return {
    granted: requestedState === 'granted',
    blocked: requestedState === 'blocked',
  };
}

async function cancelKnownNotifications(ids: string[]): Promise<void> {
  await Promise.all(ids.map((id) => Notifications.cancelScheduledNotificationAsync(id).catch(() => undefined)));
}

async function reconcileMaintenanceNotifications(enabled: boolean): Promise<NotificationSyncResult> {
  const knownIds = Object.values(MAINTENANCE_REMINDER_IDS);
  await cancelKnownNotifications(knownIds);

  if (!enabled) return { granted: false, scheduled: 0, unsupported: false, failed: false, blocked: false };
  if (Platform.OS === 'web') return { granted: false, scheduled: 0, unsupported: true, failed: false, blocked: false };

  try {
    const permission = await ensurePermissions();
    if (!permission.granted) {
      return { granted: false, scheduled: 0, unsupported: false, failed: false, blocked: permission.blocked };
    }

    await ensureNotificationChannel();

    // Expo SQLite uses one shared connection. Keep these reads ordered so a UI
    // refresh cannot collide with statement finalization during reconciliation.
    const profile = await getVehicleProfile();
    const events = await getMaintenanceEvents();
    const documents = await getDocuments();
    const preferences = await getMaintenancePreferences();
    const historyStates = await getMaintenanceHistoryStates();
    const domainProfile = getMaintenanceProfileForSelection(
      profile ? selectionFromProfile(profile) : null
    );
    const schedulerPreferences = maintenancePreferencesForScheduler(preferences);
    const maintenancePlan = profile && domainProfile ? projectVehicleMaintenance({
      vehicle: profile,
      profile: domainProfile,
      now: new Date(),
      events,
      preferences,
      historyStates,
    }) : null;
    const tasks = (maintenancePlan?.tasks ?? []).filter((task) => isTaskTracked(task, {
      preferences: schedulerPreferences,
      events,
      vehicleId: profile?.id,
      defaultTrackedRuleIds: domainProfile?.defaultTrackedRuleIds,
    }));
    const checkpoint = maintenancePlan?.firstServiceCheckpoint ?? null;
    const checkpointDue = checkpoint?.status === 'overdue' || checkpoint?.status === 'due' ? 1 : 0;
    const plan = buildDomainMaintenanceReminderPlan(tasks, documents, new Date(), checkpointDue);
    for (const reminder of plan) {
      await Notifications.scheduleNotificationAsync({
        identifier: reminder.identifier,
        content: {
          title: reminder.title,
          body: reminder.body,
          data: { route: reminder.route, vehicleId: profile?.id ?? null },
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DAILY,
          channelId: CHANNEL_ID,
          hour: reminder.hour,
          minute: reminder.minute,
        },
      });
    }

    return { granted: true, scheduled: plan.length, unsupported: false, failed: false, blocked: false };
  } catch (error) {
    await cancelKnownNotifications(knownIds);
    console.info('Maintenance reminder reconciliation failed:', error);
    return { granted: false, scheduled: 0, unsupported: false, failed: true, blocked: false };
  }
}

export function syncMaintenanceNotifications(enabled: boolean): Promise<NotificationSyncResult> {
  const result = maintenanceSyncQueue.then(() => reconcileMaintenanceNotifications(enabled));
  maintenanceSyncQueue = result.then(() => undefined, () => undefined);
  return result;
}

async function reconcileBackupReminder(enabled: boolean): Promise<NotificationSyncResult> {
  await cancelKnownNotifications([BACKUP_ID]);

  if (!enabled) return { granted: false, scheduled: 0, unsupported: false, failed: false, blocked: false };
  if (Platform.OS === 'web') return { granted: false, scheduled: 0, unsupported: true, failed: false, blocked: false };

  try {
    const permission = await ensurePermissions();
    if (!permission.granted) {
      return { granted: false, scheduled: 0, unsupported: false, failed: false, blocked: permission.blocked };
    }

    await ensureNotificationChannel();

    await Notifications.scheduleNotificationAsync({
      identifier: BACKUP_ID,
      content: {
        title: t('notifications.backupTitle'),
        body: t('notifications.backupBody'),
        data: { route: 'VehicleSettings' },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
        channelId: CHANNEL_ID,
        weekday: 6,
        hour: 12,
        minute: 0,
      },
    });

    return { granted: true, scheduled: 1, unsupported: false, failed: false, blocked: false };
  } catch (error) {
    await cancelKnownNotifications([BACKUP_ID]);
    console.info('Backup reminder reconciliation failed:', error);
    return { granted: false, scheduled: 0, unsupported: false, failed: true, blocked: false };
  }
}

export function syncBackupReminder(enabled: boolean): Promise<NotificationSyncResult> {
  const result = backupSyncQueue.then(() => reconcileBackupReminder(enabled));
  backupSyncQueue = result.then(() => undefined, () => undefined);
  return result;
}

export async function scheduleTestNotification(): Promise<{
  granted: boolean;
  unsupported: boolean;
  blocked: boolean;
  failed: boolean;
}> {
  if (Platform.OS === 'web') return { granted: false, unsupported: true, blocked: false, failed: false };

  try {
    const permission = await ensurePermissions();
    if (!permission.granted) {
      return { granted: false, unsupported: false, blocked: permission.blocked, failed: false };
    }

    await ensureNotificationChannel();
    await Notifications.scheduleNotificationAsync({
      content: {
        title: t('notifications.testTitle'),
        body: t('notifications.testBody'),
        data: { route: 'VehicleSettings' },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
        channelId: CHANNEL_ID,
        seconds: 3,
      },
    });

    return { granted: true, unsupported: false, blocked: false, failed: false };
  } catch (error) {
    console.info('Test notification scheduling failed:', error);
    return { granted: false, unsupported: false, blocked: false, failed: true };
  }
}

export type ReceivedNotificationIntent = {
  fingerprint: string;
  intent: NotificationIntent;
};

function toReceivedNotificationIntent(
  response: Notifications.NotificationResponse
): ReceivedNotificationIntent | null {
  const intent = parseNotificationIntent(response.notification.request.content.data);
  if (!intent) return null;

  return {
    intent,
    fingerprint: getNotificationResponseFingerprint(
      response.notification.request.identifier,
      response.notification.date,
      response.actionIdentifier
    ),
  };
}

/** Delivers warm and cold notification responses through one typed subscription. */
export function subscribeToNotificationIntents(
  listener: (received: ReceivedNotificationIntent) => void
): () => void {
  let active = true;
  const deliver = (response: Notifications.NotificationResponse | null) => {
    if (!active || !response) return;
    const received = toReceivedNotificationIntent(response);
    if (received) listener(received);
    Notifications.clearLastNotificationResponseAsync().catch(() => undefined);
  };

  const subscription = Notifications.addNotificationResponseReceivedListener(deliver);
  Notifications.getLastNotificationResponseAsync()
    .then(deliver)
    .catch((error) => console.info('Cold notification response could not be read:', error));

  return () => {
    active = false;
    subscription.remove();
  };
}
