import React, { useCallback, useMemo, useState } from 'react';
import { Alert, ScrollView, Switch, Text, TouchableOpacity, View } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { MainStackNavigationProp, MainStackParamList } from '../navigation/types';
import type { MaintenancePreference, VehicleProfile } from '../types/database.types';
import type { MaintenanceRule } from '../maintenance/types';
import { getMaintenanceProfileForSelection } from '../maintenance/profiles';
import { originalScheduleForRule } from '../maintenance/scheduler';
import {
  getMaintenancePreferences,
  getVehicleProfile,
  restoreMaintenancePreference,
  setMaintenancePreference,
} from '../services/database';
import { syncMaintenanceNotifications } from '../services/notifications';
import { useAppStore } from '../store/useAppStore';
import useFocusedLoader from '../hooks/useFocusedLoader';
import AppIconButton from '../components/ui/AppIconButton';
import AppPrimaryButton from '../components/ui/AppPrimaryButton';
import AppScreen from '../components/ui/AppScreen';
import AppTextField from '../components/ui/AppTextField';
import AppTopBar from '../components/ui/AppTopBar';
import ScreenLoadState from '../components/ui/ScreenLoadState';
import { formatNumber, localizeErrorMessage, t, tp, useTranslation, vehicleDisplayName } from '../i18n';
import { maintenanceComponentGroup, naturalMaintenanceActionLabel } from '../maintenance/presentation';

type CustomizationRoute = RouteProp<MainStackParamList, 'MaintenanceReminderCustomization'>;

function scheduleText(distanceKm: number | null, timeMonths: number | null): string {
  const parts: string[] = [];
  if (distanceKm !== null) parts.push(t('reminder.everyDistance', { km: formatNumber(distanceKm) }));
  if (timeMonths !== null) parts.push(tp('reminder.everyTime', timeMonths));
  return parts.length === 2 ? t('reminder.or', { first: parts[0], second: parts[1] }) : parts[0] ?? t('reminder.noFixed');
}

function positiveWholeNumber(value: string, label: string): number {
  const normalized = value.trim();
  if (!/^\d+$/.test(normalized)) throw new Error(t('reminder.positiveWhole', { label }));
  const parsed = Number(normalized);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(t('reminder.storageLimit', { label }));
  }
  return parsed;
}

export default function MaintenanceReminderCustomizationScreen() {
  const { isRTL, t: tr } = useTranslation();
  const navigation = useNavigation<MainStackNavigationProp>();
  const route = useRoute<CustomizationRoute>();
  const remindersEnabled = useAppStore((state) => state.maintenanceReminders);
  const [vehicle, setVehicle] = useState<VehicleProfile | null>(null);
  const [rule, setRule] = useState<MaintenanceRule | null>(null);
  const [preference, setPreference] = useState<MaintenancePreference | null>(null);
  const [reminderEnabled, setReminderEnabled] = useState(true);
  const [distanceEnabled, setDistanceEnabled] = useState(false);
  const [timeEnabled, setTimeEnabled] = useState(false);
  const [conditionReminderEnabled, setConditionReminderEnabled] = useState(false);
  const [distanceValue, setDistanceValue] = useState('');
  const [timeValue, setTimeValue] = useState('');
  const [reason, setReason] = useState('');
  const [validationError, setValidationError] = useState('');
  const [savedMessage, setSavedMessage] = useState('');
  const [saving, setSaving] = useState(false);

  const loadData = useCallback(async (isCurrent: () => boolean) => {
    const [vehicleData, preferences] = await Promise.all([
      getVehicleProfile(),
      getMaintenancePreferences(),
    ]);
    const profile = getMaintenanceProfileForSelection(vehicleData ? {
      brandId: vehicleData.scooter_brand_id,
      modelId: vehicleData.scooter_model_id,
      versionId: vehicleData.scooter_version_id,
      variantId: vehicleData.scooter_variant_id,
    } : null);
    const selectedRule = profile?.rules.find((candidate) => candidate.id === route.params.ruleId) ?? null;
    if (!vehicleData || !profile || !selectedRule) {
      throw new Error(tr('reminder.unavailable'));
    }
    const initialActionableUntilKm = selectedRule.schedule.initialActionableUntilKm
      ?? profile.initialServicePolicy?.actionableUntilKm
      ?? 1000;
    if (
      selectedRule.schedule.type === 'one_time_initial'
      && vehicleData.current_mileage > initialActionableUntilKm
    ) {
      throw new Error(tr('reminder.pastCannotCustomize'));
    }
    const row = preferences.find((candidate) =>
      candidate.component_id === selectedRule.componentId
      && candidate.action === selectedRule.action
      && candidate.profile_id === profile.id
    ) ?? null;
    if (!isCurrent()) return;
    const original = originalScheduleForRule(selectedRule);
    const hasCustom = row?.interval_source !== undefined && row.interval_source !== 'profile_default';
    const rowDistanceEnabled = row?.distance_enabled === 1;
    const rowTimeEnabled = row?.time_enabled === 1;
    const rowConditionReminder = row?.custom_condition_reminder_enabled === 1;
    const disabled = hasCustom && !rowDistanceEnabled && !rowTimeEnabled && !rowConditionReminder;
    setVehicle(vehicleData);
    setRule(selectedRule);
    setPreference(row);
    setReminderEnabled(!disabled);
    setDistanceEnabled(hasCustom ? rowDistanceEnabled : original.intervalKm !== null);
    setTimeEnabled(hasCustom ? rowTimeEnabled : original.intervalMonths !== null);
    setConditionReminderEnabled(hasCustom ? rowConditionReminder : false);
    setDistanceValue(String(row?.custom_interval_km ?? original.intervalKm ?? ''));
    setTimeValue(String(row?.custom_interval_months ?? original.intervalMonths ?? ''));
    setReason(row?.reason ?? '');
  }, [route.params.ruleId, tr]);

  const { error, loading, reload } = useFocusedLoader(
    loadData,
    tr('reminder.loadError'),
    tr('reminder.loadLog')
  );
  const original = useMemo(() => rule ? originalScheduleForRule(rule) : null, [rule]);
  const isConditionBased = original?.conditionBased ?? false;
  const controlsVisible = reminderEnabled && (!isConditionBased || conditionReminderEnabled);

  const currentSetting = useMemo(() => {
    if (!preference || preference.interval_source === 'profile_default') {
      return isConditionBased ? tr('reminder.conditionReplacement') : tr('reminder.usingOriginal');
    }
    if (!reminderEnabled) return tr('reminder.disabledByYou');
    const distance = preference.distance_enabled === 1 ? preference.effective_interval_km : null;
    const months = preference.time_enabled === 1 ? preference.effective_interval_months ?? null : null;
    if (isConditionBased && preference.custom_condition_reminder_enabled === 1) {
      return tr('reminder.userCreated', { schedule: scheduleText(distance, months) });
    }
    return tr('reminder.customByYou', { schedule: scheduleText(distance, months) });
  }, [isConditionBased, preference, reminderEnabled, tr]);

  const persist = useCallback(async (confirmLonger: boolean) => {
    if (!rule || !original || saving) return;
    setValidationError('');
    setSavedMessage('');
    try {
      const useDistance = reminderEnabled && controlsVisible && distanceEnabled;
      const useTime = reminderEnabled && controlsVisible && timeEnabled;
      const customKm = useDistance ? positiveWholeNumber(distanceValue, tr('reminder.distanceInterval')) : null;
      const customMonths = useTime ? positiveWholeNumber(timeValue, tr('reminder.timeInterval')) : null;
      const isDefault = reminderEnabled
        && (!isConditionBased || !conditionReminderEnabled)
        && useDistance === (original.intervalKm !== null)
        && useTime === (original.intervalMonths !== null)
        && customKm === original.intervalKm
        && customMonths === original.intervalMonths
        && !reason.trim();

      if (isDefault) {
        setSaving(true);
        await restoreMaintenancePreference(rule.componentId, rule.action);
        await syncMaintenanceNotifications(remindersEnabled);
        setSavedMessage(tr('reminder.originalRestored'));
        await reload();
        return;
      }

      const longer = (original.intervalKm !== null && customKm !== null && customKm > original.intervalKm)
        || (original.intervalMonths !== null && customMonths !== null && customMonths > original.intervalMonths);
      const extreme = customKm === 1 || (customKm ?? 0) >= 20000 || (customMonths ?? 0) >= 120;
      if (!confirmLonger && (longer || extreme || (!reminderEnabled && rule.safetyCritical))) {
        const title = !reminderEnabled && rule.safetyCritical
          ? tr('reminder.disableSafetyTitle')
          : extreme ? tr('reminder.extremeTitle') : tr('reminder.longerTitle');
        const message = !reminderEnabled && rule.safetyCritical
          ? tr('reminder.disableSafetyBody')
          : extreme
            ? tr('reminder.extremeBody')
            : tr('reminder.longerBody');
        Alert.alert(title, message, [
          { text: tr('common.cancel'), style: 'cancel' },
          { text: tr('history.continue'), style: 'destructive', onPress: () => void persist(true) },
        ]);
        return;
      }

      setSaving(true);
      await setMaintenancePreference({
        componentId: rule.componentId,
        action: rule.action,
        originalIntervalKm: original.intervalKm,
        originalIntervalMonths: original.intervalMonths,
        customIntervalKm: customKm,
        customIntervalMonths: customMonths,
        distanceEnabled: useDistance,
        timeEnabled: useTime,
        conditionBasedDefault: isConditionBased,
        customConditionReminderEnabled: isConditionBased && conditionReminderEnabled,
        confirmLonger: confirmLonger || !longer,
        reason: reason.trim() || null,
      });
      await syncMaintenanceNotifications(remindersEnabled);
      setSavedMessage(!reminderEnabled
        ? tr('reminder.savedDisabled')
        : isConditionBased ? tr('reminder.savedUser') : tr('reminder.savedCustom'));
      await reload();
    } catch (caught) {
      setValidationError(localizeErrorMessage(caught, tr('reminder.saveFailed')));
    } finally {
      setSaving(false);
    }
  }, [conditionReminderEnabled, controlsVisible, distanceEnabled, distanceValue, isConditionBased, original, reason, reload, reminderEnabled, remindersEnabled, rule, saving, timeEnabled, timeValue, tr]);

  const restore = useCallback(async () => {
    if (!rule || saving) return;
    setSaving(true);
    setValidationError('');
    try {
      await restoreMaintenancePreference(rule.componentId, rule.action);
      await syncMaintenanceNotifications(remindersEnabled);
      setSavedMessage(tr('reminder.originalRestored'));
      await reload();
    } catch (caught) {
      setValidationError(localizeErrorMessage(caught, tr('reminder.restoreFailed')));
    } finally {
      setSaving(false);
    }
  }, [reload, remindersEnabled, rule, saving, tr]);

  if (loading || error || !vehicle || !rule || !original) {
    return (
      <ScreenLoadState
        error={error}
        loading={loading}
        onBack={() => navigation.goBack()}
        onRetry={reload}
        title={tr('reminder.title')}
      />
    );
  }

  return (
    <AppScreen>
      <AppTopBar leading={<AppIconButton accessibilityLabel={tr('common.back')} icon={isRTL ? 'arrow-forward' : 'arrow-back'} onPress={() => navigation.goBack()} />}>
        <Text className="font-headline uppercase tracking-widest text-sm text-primary">{tr('reminder.title')}</Text>
      </AppTopBar>
      <ScrollView className="flex-1" contentContainerStyle={{ padding: 20, paddingBottom: 48 }} keyboardShouldPersistTaps="handled">
        <Text accessibilityRole="header" className="font-headline text-2xl font-bold text-on-surface">{maintenanceComponentGroup(rule.componentId).label}</Text>
        <Text className="font-body text-sm text-on-surface-variant mt-1">{naturalMaintenanceActionLabel({ componentId: rule.componentId, action: rule.action })} · {vehicleDisplayName(vehicle.name)}</Text>

        <View className="rounded-xl border border-outline-variant/20 bg-surface-container-low p-4 mt-6 gap-3">
          <View>
            <Text className="font-label text-xs uppercase tracking-widest text-on-surface-variant">{tr('reminder.originalSchedule')}</Text>
            <Text className="font-headline text-base font-bold text-primary mt-1">
              {isConditionBased ? tr('reminder.conditionReplacement') : scheduleText(original.intervalKm, original.intervalMonths)}
            </Text>
          </View>
          <View>
            <Text className="font-label text-xs uppercase tracking-widest text-on-surface-variant">{tr('reminder.yourSchedule')}</Text>
            <Text className="font-body text-sm text-on-surface mt-1">{currentSetting}</Text>
          </View>
        </View>

        <View className="rounded-xl border border-outline-variant/20 bg-surface-container-lowest p-4 mt-5">
          <View className="flex-row items-center justify-between gap-4">
            <View className="flex-1">
              <Text className="font-headline text-base font-bold text-on-surface">{tr('reminder.enabled')}</Text>
              <Text className="font-body text-xs text-on-surface-variant mt-1">{tr('reminder.enabledBody')}</Text>
            </View>
            <Switch accessibilityLabel={tr('reminder.enabled')} value={reminderEnabled} onValueChange={setReminderEnabled} />
          </View>

          {reminderEnabled && isConditionBased ? (
            <View className="border-t border-outline-variant/15 mt-4 pt-4">
              <View className="flex-row items-center justify-between gap-4">
                <View className="flex-1">
                  <Text className="font-headline text-sm font-bold text-on-surface">{tr('reminder.personal')}</Text>
                  <Text className="font-body text-xs text-on-surface-variant mt-1">{tr('reminder.personalBody')}</Text>
                </View>
                <Switch accessibilityLabel={tr('reminder.personalA11y')} value={conditionReminderEnabled} onValueChange={setConditionReminderEnabled} />
              </View>
            </View>
          ) : null}

          {controlsVisible ? (
            <View className="border-t border-outline-variant/15 mt-4 pt-4 gap-5">
              <View>
                <View className="flex-row items-center justify-between gap-4 mb-3">
                  <Text className="font-headline text-sm font-bold text-on-surface">{tr('reminder.distance')}</Text>
                  <Switch accessibilityLabel={tr('reminder.distance')} value={distanceEnabled} onValueChange={setDistanceEnabled} />
                </View>
                <AppTextField
                  editable={distanceEnabled}
                  keyboardType="number-pad"
                  label={tr('reminder.distanceLabel')}
                  onChangeText={setDistanceValue}
                  placeholder={tr('reminder.distancePlaceholder')}
                  value={distanceValue}
                />
              </View>

              <View>
                <View className="flex-row items-center justify-between gap-4 mb-3">
                  <Text className="font-headline text-sm font-bold text-on-surface">{tr('reminder.time')}</Text>
                  <Switch accessibilityLabel={tr('reminder.time')} value={timeEnabled} onValueChange={setTimeEnabled} />
                </View>
                <AppTextField
                  editable={timeEnabled}
                  keyboardType="number-pad"
                  label={tr('reminder.timeLabel')}
                  onChangeText={setTimeValue}
                  placeholder={tr('reminder.timePlaceholder')}
                  value={timeValue}
                />
              </View>
            </View>
          ) : null}
        </View>

        <AppTextField
          containerClassName="mt-5"
          label={tr('reminder.reason')}
          multiline
          onChangeText={setReason}
          placeholder={tr('reminder.reasonPlaceholder')}
          value={reason}
        />

        {validationError ? <Text accessibilityLiveRegion="polite" className="font-body text-sm text-error mt-4">{validationError}</Text> : null}
        {savedMessage ? <Text accessibilityLiveRegion="polite" className="font-body text-sm text-primary mt-4">{savedMessage}</Text> : null}

        <AppPrimaryButton className="mt-6" label={tr('reminder.save')} loading={saving} onPress={() => void persist(false)} />
        <TouchableOpacity
          accessibilityRole="button"
          className="min-h-12 mt-3 rounded-xl border border-primary/30 items-center justify-center px-4"
          disabled={saving}
          onPress={() => void restore()}
        >
          <Text className="font-label text-sm font-bold text-primary">{tr('maintenance.restoreSchedule')}</Text>
        </TouchableOpacity>
        <Text className="font-body text-xs text-on-surface-variant mt-4 leading-5">
          {tr('reminder.preserveNotice')}
        </Text>
      </ScrollView>
    </AppScreen>
  );
}
