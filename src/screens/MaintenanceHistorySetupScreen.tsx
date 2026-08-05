import React, { useCallback, useState } from 'react';
import { Alert, Text, TouchableOpacity, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import MaintenanceHistoryOnboarding from '../components/MaintenanceHistoryOnboarding';
import AppIconButton from '../components/ui/AppIconButton';
import AppScreen from '../components/ui/AppScreen';
import AppTopBar from '../components/ui/AppTopBar';
import ScreenLoadState from '../components/ui/ScreenLoadState';
import useFocusedLoader from '../hooks/useFocusedLoader';
import type { MainStackNavigationProp } from '../navigation/types';
import { getVehicleProfile } from '../services/database';
import {
  saveMaintenanceHistorySetup,
  skipMaintenanceHistorySetup,
} from '../services/maintenanceHistoryOnboarding';
import { syncMaintenanceNotifications } from '../services/notifications';
import { useAppStore } from '../store/useAppStore';
import { isMaintenanceProfileSelectable } from '../maintenance/profiles';

export default function MaintenanceHistorySetupScreen() {
  const navigation = useNavigation<MainStackNavigationProp>();
  const maintenanceReminders = useAppStore((state) => state.maintenanceReminders);
  const [odometerKm, setOdometerKm] = useState<number | null>(null);
  const [hasSupportedProfile, setHasSupportedProfile] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async (isCurrent: () => boolean) => {
    const vehicle = await getVehicleProfile();
    if (!vehicle) throw new Error('The active vehicle could not be found.');
    if (isCurrent()) {
      setOdometerKm(vehicle.current_mileage);
      setHasSupportedProfile(isMaintenanceProfileSelectable({
        brandId: vehicle.scooter_brand_id,
        modelId: vehicle.scooter_model_id,
        versionId: vehicle.scooter_version_id,
        variantId: vehicle.scooter_variant_id,
      }));
    }
  }, []);
  const { error, loading, reload } = useFocusedLoader(
    load,
    'Maintenance history setup could not be loaded.',
    'Failed to load maintenance history setup:'
  );

  const finish = async (operation: () => Promise<void>) => {
    setSaving(true);
    try {
      await operation();
      await syncMaintenanceNotifications(maintenanceReminders);
      navigation.goBack();
    } catch (saveError) {
      Alert.alert(
        'History setup not saved',
        saveError instanceof Error ? saveError.message : 'Your existing records were not changed.'
      );
    } finally {
      setSaving(false);
    }
  };

  if (loading || error || odometerKm === null || hasSupportedProfile === null) {
    return (
      <ScreenLoadState
        error={error}
        loading={loading}
        onBack={() => navigation.goBack()}
        onRetry={reload}
        title="MAINTENANCE HISTORY"
      />
    );
  }

  if (!hasSupportedProfile) {
    return (
      <AppScreen edges={['top', 'bottom', 'left', 'right']}>
        <AppTopBar
          leading={<AppIconButton accessibilityLabel="Go back" icon="arrow-back" onPress={() => navigation.goBack()} />}
          tone="subtle"
        >
          <Text className="font-headline text-sm font-bold text-on-surface">Maintenance history</Text>
        </AppTopBar>
        <View className="flex-1 px-6 pt-10">
          <View className="rounded-2xl border border-amber-500/35 bg-amber-500/10 p-5">
            <MaterialIcons color="#f59e0b" name="info-outline" size={26} />
            <Text accessibilityRole="header" className="font-headline text-xl font-bold text-on-surface mt-4">
              Exact history setup is unavailable
            </Text>
            <Text className="font-body text-sm text-on-surface-variant mt-2 leading-6">
              This guided setup is available only for a supported exact scooter. You can still review existing records or add other workshop and repair work.
            </Text>
            <TouchableOpacity
              accessibilityLabel="Open maintenance history"
              accessibilityRole="button"
              className="min-h-12 rounded-xl bg-primary items-center justify-center px-4 mt-5"
              onPress={() => navigation.replace('ServiceLogs')}
            >
              <Text className="font-label text-sm font-bold text-on-primary">Open maintenance history</Text>
            </TouchableOpacity>
          </View>
        </View>
      </AppScreen>
    );
  }

  return (
    <AppScreen edges={['top', 'bottom', 'left', 'right']}>
      <AppTopBar
        leading={<AppIconButton accessibilityLabel="Go back" icon="arrow-back" onPress={() => navigation.goBack()} />}
        tone="subtle"
      >
        <Text className="font-headline text-sm font-bold text-on-surface">Maintenance history</Text>
      </AppTopBar>
      <MaintenanceHistoryOnboarding
        currentOdometerKm={odometerKm}
        onComplete={(draft) => finish(() => saveMaintenanceHistorySetup(draft))}
        onSkip={() => finish(skipMaintenanceHistorySetup)}
        saving={saving}
      />
    </AppScreen>
  );
}
