import { createNavigationContainerRef } from '@react-navigation/native';
import type { RootStackParamList } from './types';
import type { NotificationIntent } from '../utils/notificationRouting';
import { getNotificationNavigationTarget } from '../utils/notificationRouting';

export const navigationRef = createNavigationContainerRef<RootStackParamList>();

export function navigateToNotificationIntent(intent: NotificationIntent): boolean {
  if (!navigationRef.isReady()) return false;

  const target = getNotificationNavigationTarget(intent);
  if (target.kind === 'tab') {
    navigationRef.navigate('Main', {
      screen: 'Tabs',
      params: { screen: target.screen },
    });
  } else {
    navigationRef.navigate('Main', { screen: target.screen });
  }
  return true;
}
