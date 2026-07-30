import { NavigationContainer } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import { useFonts, SpaceGrotesk_400Regular, SpaceGrotesk_500Medium, SpaceGrotesk_700Bold } from '@expo-google-fonts/space-grotesk';
import { Manrope_400Regular, Manrope_600SemiBold, Manrope_700Bold } from '@expo-google-fonts/manrope';
import { PlusJakartaSans_400Regular, PlusJakartaSans_600SemiBold, PlusJakartaSans_700Bold, PlusJakartaSans_800ExtraBold } from '@expo-google-fonts/plus-jakarta-sans';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useRef, useState } from 'react';
import './global.css';
import RootNavigator from './src/navigation/RootNavigator';
import { View, LogBox, Pressable, StyleSheet, Text } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { getVehicleProfile, initDatabase, setActiveVehicleId } from './src/services/database';
import { selectionFromProfile } from './src/catalog/scooterCatalog';
import { useAppStore } from './src/store/useAppStore';
import {
  configureNotificationBehavior,
  subscribeToNotificationIntents,
  syncBackupReminder,
  syncMaintenanceNotifications,
  type ReceivedNotificationIntent,
} from './src/services/notifications';
import { navigateToNotificationIntent, navigationRef } from './src/navigation/navigationRef';

// Ignore noisy Reanimated strict mode warnings from third-party libraries (e.g., bottom-tabs)
LogBox.ignoreLogs([
  '[Reanimated] Reading from `value`',
  '[Reanimated] Writing to `value`',
]);

SplashScreen.preventAutoHideAsync();
configureNotificationBehavior();

type DatabaseStartupState = 'initializing' | 'ready' | 'error';

export default function App() {
  const [fontsLoaded, fontError] = useFonts({
    SpaceGrotesk: SpaceGrotesk_400Regular,
    SpaceGrotesk_400Regular,
    SpaceGrotesk_500Medium,
    SpaceGrotesk_700Bold,
    Manrope: Manrope_400Regular,
    Manrope_400Regular,
    Manrope_600SemiBold,
    Manrope_700Bold,
    PlusJakartaSans: PlusJakartaSans_400Regular,
    PlusJakartaSans_400Regular,
    PlusJakartaSans_600SemiBold,
    PlusJakartaSans_700Bold,
    PlusJakartaSans_800ExtraBold,
  });

  const [databaseState, setDatabaseState] = useState<DatabaseStartupState>('initializing');
  const [databaseRetry, setDatabaseRetry] = useState(0);
  const [storeReady, setStoreReady] = useState(false);
  const [navigationReady, setNavigationReady] = useState(false);
  const [pendingNotification, setPendingNotification] = useState<ReceivedNotificationIntent | null>(null);
  const processedNotificationResponses = useRef(new Set<string>());
  const maintenanceReminders = useAppStore((s) => s.maintenanceReminders);
  const backupReminder = useAppStore((s) => s.backupReminder);
  const isAuthenticated = useAppStore((s) => s.isAuthenticated);

  // Wait for Zustand to rehydrate from SecureStore
  useEffect(() => {
    const unsub = useAppStore.persist.onFinishHydration(() => setStoreReady(true));
    setStoreReady(useAppStore.persist.hasHydrated());
    return unsub;
  }, []);

  // Initialise the SQLite database (creates tables on first launch)
  useEffect(() => {
    if (!storeReady) return;
    let cancelled = false;
    setDatabaseState('initializing');
    initDatabase()
      .then(async () => {
        const profile = await getVehicleProfile();
        const setupComplete = profile?.has_completed_setup === 1 && selectionFromProfile(profile) !== null;
        useAppStore.getState().setVehicleSetupComplete(setupComplete);
        if (!cancelled) setDatabaseState('ready');
      })
      .catch((err) => {
        console.info('Database initialization blocked:', err);
        if (!cancelled) setDatabaseState('error');
      });

    return () => {
      cancelled = true;
    };
  }, [databaseRetry, storeReady]);

  useEffect(() => {
    if ((fontsLoaded || fontError) && databaseState !== 'initializing' && storeReady) {
      SplashScreen.hideAsync();
    }
  }, [databaseState, fontsLoaded, fontError, storeReady]);

  useEffect(() => {
    if (databaseState !== 'ready' || !storeReady) return;

    syncMaintenanceNotifications(maintenanceReminders).catch((err) => {
      console.error('Failed to sync maintenance notifications:', err);
    });
    syncBackupReminder(backupReminder).catch((err) => {
      console.error('Failed to sync backup reminder:', err);
    });
  }, [backupReminder, databaseState, maintenanceReminders, storeReady]);

  useEffect(() => subscribeToNotificationIntents((received) => {
    if (processedNotificationResponses.current.has(received.fingerprint)) return;
    setPendingNotification((current) => current?.fingerprint === received.fingerprint ? current : received);
  }), []);

  useEffect(() => {
    if (
      databaseState !== 'ready'
      || !storeReady
      || !navigationReady
      || !isAuthenticated
      || !pendingNotification
    ) {
      return;
    }

    let cancelled = false;
    const routeNotification = async () => {
      try {
        if (pendingNotification.intent.vehicleId !== null) {
          await setActiveVehicleId(pendingNotification.intent.vehicleId);
        }
        if (cancelled) return;

        if (!navigateToNotificationIntent(pendingNotification.intent)) return;
        processedNotificationResponses.current.add(pendingNotification.fingerprint);
        if (processedNotificationResponses.current.size > 100) {
          processedNotificationResponses.current.clear();
          processedNotificationResponses.current.add(pendingNotification.fingerprint);
        }
        setPendingNotification(null);

        if (pendingNotification.intent.vehicleId !== null) {
          syncMaintenanceNotifications(maintenanceReminders).catch((error) => {
            console.info('Notification vehicle reminder refresh failed:', error);
          });
        }
      } catch (error) {
        console.info('Notification destination is no longer available:', error);
        if (!cancelled) {
          processedNotificationResponses.current.add(pendingNotification.fingerprint);
          setPendingNotification(null);
        }
      }
    };

    routeNotification();
    return () => {
      cancelled = true;
    };
  }, [
    databaseState,
    isAuthenticated,
    maintenanceReminders,
    navigationReady,
    pendingNotification,
    storeReady,
  ]);

  if ((!fontsLoaded && !fontError) || databaseState === 'initializing' || !storeReady) {
    return null;
  }

  if (databaseState === 'error') {
    return (
      <SafeAreaProvider>
        <SafeAreaView edges={['top', 'bottom', 'left', 'right']} style={styles.recoveryScreen}>
          <StatusBar style="light" backgroundColor="#081421" translucent={false} />
          <Text accessibilityRole="header" style={styles.recoveryTitle}>Local records unavailable</Text>
          <Text style={styles.recoveryMessage}>
            3azza could not safely open its local database. Your records were not loaded or changed.
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Retry opening local records"
            onPress={() => setDatabaseRetry((attempt) => attempt + 1)}
            style={({ pressed }) => [styles.retryButton, pressed && styles.retryButtonPressed]}
          >
            <Text style={styles.retryButtonText}>RETRY</Text>
          </Pressable>
        </SafeAreaView>
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
      <View style={{ flex: 1, backgroundColor: '#081421' }}>
        <StatusBar style="light" backgroundColor="#081421" translucent={false} />
        <NavigationContainer ref={navigationRef} onReady={() => setNavigationReady(true)}>
          <RootNavigator />
        </NavigationContainer>
      </View>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  recoveryScreen: {
    alignItems: 'center',
    backgroundColor: '#081421',
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  recoveryTitle: {
    color: '#F5F7FA',
    fontFamily: 'SpaceGrotesk_700Bold',
    fontSize: 28,
    textAlign: 'center',
  },
  recoveryMessage: {
    color: '#AAB7C4',
    fontFamily: 'Manrope_400Regular',
    fontSize: 16,
    lineHeight: 24,
    marginTop: 16,
    maxWidth: 440,
    textAlign: 'center',
  },
  retryButton: {
    alignItems: 'center',
    backgroundColor: '#2ED3B7',
    borderRadius: 12,
    marginTop: 28,
    minWidth: 180,
    paddingHorizontal: 28,
    paddingVertical: 15,
  },
  retryButtonPressed: {
    opacity: 0.8,
  },
  retryButtonText: {
    color: '#081421',
    fontFamily: 'SpaceGrotesk_700Bold',
    fontSize: 15,
    letterSpacing: 1,
  },
});
