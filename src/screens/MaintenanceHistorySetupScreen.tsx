import React, { useCallback, useState } from 'react';
import { Alert, Text, TouchableOpacity, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import MaintenanceHistoryOnboarding from '../components/maintenance/MaintenanceHistoryOnboarding';
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
} from '../services/maintenance/maintenanceHistoryOnboarding';
import { syncMaintenanceNotifications } from '../services/notifications';
import { useAppStore } from '../store/useAppStore';
import {
  getMaintenanceProfileForSelection,
  isMaintenanceProfileSelectable,
} from '../maintenance/profiles';
import { localizeErrorMessage, useTranslation } from '../i18n';
import { selectionFromProfile } from '../catalog/scooterCatalog';
import {
  maintenanceHistoryBaselineKeysForProfile,
  type MaintenanceHistoryBaselineKey,
} from '../services/maintenance/maintenanceHistoryPlan';

export default function MaintenanceHistorySetupScreen() {
  const { isRTL, t } = useTranslation();
  const navigation = useNavigation<MainStackNavigationProp>();
  const maintenanceReminders = useAppStore((state) => state.maintenanceReminders);
  const [odometerKm, setOdometerKm] = useState<number | null>(null);
  const [hasSupportedProfile, setHasSupportedProfile] = useState<boolean | null>(null);
  const [baselineKeys, setBaselineKeys] = useState<MaintenanceHistoryBaselineKey[]>(['general_inspection']);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async (isCurrent: () => boolean) => {
    const vehicle = await getVehicleProfile();
    if (!vehicle) throw new Error(t('history.activeVehicleMissing'));
    if (isCurrent()) {
      const selection = selectionFromProfile(vehicle);
      const profile = getMaintenanceProfileForSelection(selection);
      setOdometerKm(vehicle.current_mileage);
      setHasSupportedProfile(isMaintenanceProfileSelectable(selection));
      if (profile) setBaselineKeys(maintenanceHistoryBaselineKeysForProfile(profile));
    }
  }, [t]);
  const { error, loading, reload } = useFocusedLoader(
    load,
    t('history.setupLoadError'),
    t('history.setupLoadLog')
  );

  const finish = async (operation: () => Promise<void>) => {
    setSaving(true);
    try {
      await operation();
      await syncMaintenanceNotifications(maintenanceReminders);
      navigation.goBack();
    } catch (saveError) {
      Alert.alert(
        t('history.setupSaveFailed'),
        localizeErrorMessage(saveError, t('history.existingUnchanged'))
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
        title={t('history.screenTitle')}
      />
    );
  }

  if (!hasSupportedProfile) {
    return (
      <AppScreen edges={['top', 'bottom', 'left', 'right']}>
        <AppTopBar
          leading={<AppIconButton accessibilityLabel={t('common.back')} icon={isRTL ? 'arrow-forward' : 'arrow-back'} onPress={() => navigation.goBack()} />}
          tone="subtle"
        >
          <Text className="font-headline text-sm font-bold text-on-surface">{t('history.screenTitle')}</Text>
        </AppTopBar>
        <View className="flex-1 px-6 pt-10">
          <View className="rounded-2xl border border-amber-500/35 bg-amber-500/10 p-5">
            <MaterialIcons color="#f59e0b" name="info-outline" size={26} />
            <Text accessibilityRole="header" className="font-headline text-xl font-bold text-on-surface mt-4">
              {t('history.unavailable')}
            </Text>
            <Text className="font-body text-sm text-on-surface-variant mt-2 leading-6">
              {t('history.unavailableBody')}
            </Text>
            <TouchableOpacity
              accessibilityLabel={t('history.open')}
              accessibilityRole="button"
              className="min-h-12 rounded-xl bg-primary items-center justify-center px-4 mt-5"
              onPress={() => navigation.replace('ServiceLogs')}
            >
              <Text className="font-label text-sm font-bold text-on-primary">{t('history.open')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </AppScreen>
    );
  }

  return (
    <AppScreen edges={['top', 'bottom', 'left', 'right']}>
      <AppTopBar
        leading={<AppIconButton accessibilityLabel={t('common.back')} icon={isRTL ? 'arrow-forward' : 'arrow-back'} onPress={() => navigation.goBack()} />}
        tone="subtle"
      >
        <Text className="font-headline text-sm font-bold text-on-surface">{t('history.screenTitle')}</Text>
      </AppTopBar>
      <MaintenanceHistoryOnboarding
        baselineKeys={baselineKeys}
        currentOdometerKm={odometerKm}
        onComplete={(draft) => finish(() => saveMaintenanceHistorySetup(draft))}
        onSkip={() => finish(skipMaintenanceHistorySetup)}
        saving={saving}
      />
    </AppScreen>
  );
}
