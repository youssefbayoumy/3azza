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

type CustomizationRoute = RouteProp<MainStackParamList, 'MaintenanceReminderCustomization'>;

function actionLabel(rule: MaintenanceRule): string {
  if (rule.action === 'condition_check') return 'Condition check';
  if (rule.action === 'initial_service') return 'Initial service';
  return `${rule.action.charAt(0).toUpperCase()}${rule.action.slice(1)}`;
}

function scheduleText(distanceKm: number | null, timeMonths: number | null): string {
  const parts: string[] = [];
  if (distanceKm !== null) parts.push(`every ${distanceKm.toLocaleString()} km`);
  if (timeMonths !== null) parts.push(`every ${timeMonths.toLocaleString()} ${timeMonths === 1 ? 'month' : 'months'}`);
  return parts.length > 0 ? parts.join(' or ') : 'no fixed interval';
}

function positiveWholeNumber(value: string, label: string): number {
  const normalized = value.trim();
  if (!/^\d+$/.test(normalized)) throw new Error(`${label} must be a positive whole number.`);
  const parsed = Number(normalized);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`${label} must be within supported storage limits.`);
  }
  return parsed;
}

export default function MaintenanceReminderCustomizationScreen() {
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
      throw new Error('This maintenance action is not available for the active vehicle.');
    }
    const initialActionableUntilKm = selectedRule.schedule.initialActionableUntilKm
      ?? profile.initialServicePolicy?.actionableUntilKm
      ?? 1000;
    if (
      selectedRule.schedule.type === 'one_time_initial'
      && vehicleData.current_mileage > initialActionableUntilKm
    ) {
      throw new Error('Past break-in milestones are historical records and cannot be customized into recurring reminders.');
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
  }, [route.params.ruleId]);

  const { error, loading, reload } = useFocusedLoader(
    loadData,
    'Reminder settings could not be loaded. Your maintenance records were not changed.',
    'Failed to load maintenance reminder settings:'
  );
  const original = useMemo(() => rule ? originalScheduleForRule(rule) : null, [rule]);
  const isConditionBased = original?.conditionBased ?? false;
  const controlsVisible = reminderEnabled && (!isConditionBased || conditionReminderEnabled);

  const currentSetting = useMemo(() => {
    if (!preference || preference.interval_source === 'profile_default') {
      return isConditionBased ? 'Condition-based replacement' : 'Using the original schedule';
    }
    if (!reminderEnabled) return 'Reminder disabled by you';
    const distance = preference.distance_enabled === 1 ? preference.effective_interval_km : null;
    const months = preference.time_enabled === 1 ? preference.effective_interval_months ?? null : null;
    if (isConditionBased && preference.custom_condition_reminder_enabled === 1) {
      return `User-created reminder: ${scheduleText(distance, months)}`;
    }
    return `Custom reminder set by you: ${scheduleText(distance, months)}`;
  }, [isConditionBased, preference, reminderEnabled]);

  const persist = useCallback(async (confirmLonger: boolean) => {
    if (!rule || !original || saving) return;
    setValidationError('');
    setSavedMessage('');
    try {
      const useDistance = reminderEnabled && controlsVisible && distanceEnabled;
      const useTime = reminderEnabled && controlsVisible && timeEnabled;
      const customKm = useDistance ? positiveWholeNumber(distanceValue, 'Distance interval') : null;
      const customMonths = useTime ? positiveWholeNumber(timeValue, 'Time interval') : null;
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
        setSavedMessage('Original schedule restored.');
        await reload();
        return;
      }

      const longer = (original.intervalKm !== null && customKm !== null && customKm > original.intervalKm)
        || (original.intervalMonths !== null && customMonths !== null && customMonths > original.intervalMonths);
      const extreme = customKm === 1 || (customKm ?? 0) >= 20000 || (customMonths ?? 0) >= 120;
      if (!confirmLonger && (longer || extreme || (!reminderEnabled && rule.safetyCritical))) {
        const title = !reminderEnabled && rule.safetyCritical
          ? 'Disable safety reminder?'
          : extreme ? 'Extreme custom reminder' : 'Longer custom reminder';
        const message = !reminderEnabled && rule.safetyCritical
          ? 'This is a safety-critical maintenance action. Disabling its reminder may increase wear or risk. Continue?'
          : extreme
            ? 'This is an extreme custom setting. It may produce very frequent reminders or substantially delay maintenance. Continue with your custom setting?'
            : 'This interval is longer than the original schedule for this scooter. Delayed maintenance may increase wear or risk. Continue with your custom setting?';
        Alert.alert(title, message, [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Continue', style: 'destructive', onPress: () => void persist(true) },
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
        ? 'Reminder disabled by you.'
        : isConditionBased ? 'User-created reminder saved.' : 'Custom reminder saved.');
      await reload();
    } catch (caught) {
      setValidationError(caught instanceof Error ? caught.message : 'The custom reminder was not saved.');
    } finally {
      setSaving(false);
    }
  }, [conditionReminderEnabled, controlsVisible, distanceEnabled, distanceValue, isConditionBased, original, reason, reload, reminderEnabled, remindersEnabled, rule, saving, timeEnabled, timeValue]);

  const restore = useCallback(async () => {
    if (!rule || saving) return;
    setSaving(true);
    setValidationError('');
    try {
      await restoreMaintenancePreference(rule.componentId, rule.action);
      await syncMaintenanceNotifications(remindersEnabled);
      setSavedMessage('Original schedule restored.');
      await reload();
    } catch (caught) {
      setValidationError(caught instanceof Error ? caught.message : 'The original schedule was not restored.');
    } finally {
      setSaving(false);
    }
  }, [reload, remindersEnabled, rule, saving]);

  if (loading || error || !vehicle || !rule || !original) {
    return (
      <ScreenLoadState
        error={error}
        loading={loading}
        onBack={() => navigation.goBack()}
        onRetry={reload}
        title="CUSTOMIZE REMINDER"
      />
    );
  }

  return (
    <AppScreen>
      <AppTopBar leading={<AppIconButton accessibilityLabel="Go back" icon="arrow-back" onPress={() => navigation.goBack()} />}>
        <Text className="font-headline uppercase tracking-widest text-sm text-primary">CUSTOMIZE REMINDER</Text>
      </AppTopBar>
      <ScrollView className="flex-1" contentContainerStyle={{ padding: 20, paddingBottom: 48 }} keyboardShouldPersistTaps="handled">
        <Text accessibilityRole="header" className="font-headline text-2xl font-bold text-on-surface">{rule.label}</Text>
        <Text className="font-body text-sm text-on-surface-variant mt-1">{actionLabel(rule)} · {vehicle.name}</Text>

        <View className="rounded-xl border border-outline-variant/20 bg-surface-container-low p-4 mt-6 gap-3">
          <View>
            <Text className="font-label text-xs uppercase tracking-widest text-on-surface-variant">Original schedule</Text>
            <Text className="font-headline text-base font-bold text-primary mt-1">
              {isConditionBased ? 'Condition-based replacement' : scheduleText(original.intervalKm, original.intervalMonths)}
            </Text>
          </View>
          <View>
            <Text className="font-label text-xs uppercase tracking-widest text-on-surface-variant">Your schedule</Text>
            <Text className="font-body text-sm text-on-surface mt-1">{currentSetting}</Text>
          </View>
        </View>

        <View className="rounded-xl border border-outline-variant/20 bg-surface-container-lowest p-4 mt-5">
          <View className="flex-row items-center justify-between gap-4">
            <View className="flex-1">
              <Text className="font-headline text-base font-bold text-on-surface">Reminder enabled</Text>
              <Text className="font-body text-xs text-on-surface-variant mt-1">Turn off to hide due and overdue alerts for this action only.</Text>
            </View>
            <Switch accessibilityLabel="Reminder enabled" value={reminderEnabled} onValueChange={setReminderEnabled} />
          </View>

          {reminderEnabled && isConditionBased ? (
            <View className="border-t border-outline-variant/15 mt-4 pt-4">
              <View className="flex-row items-center justify-between gap-4">
                <View className="flex-1">
                  <Text className="font-headline text-sm font-bold text-on-surface">Add a personal reminder</Text>
                  <Text className="font-body text-xs text-on-surface-variant mt-1">This stays a user-created reminder, not a predicted replacement need.</Text>
                </View>
                <Switch accessibilityLabel="Add a personal condition reminder" value={conditionReminderEnabled} onValueChange={setConditionReminderEnabled} />
              </View>
            </View>
          ) : null}

          {controlsVisible ? (
            <View className="border-t border-outline-variant/15 mt-4 pt-4 gap-5">
              <View>
                <View className="flex-row items-center justify-between gap-4 mb-3">
                  <Text className="font-headline text-sm font-bold text-on-surface">Distance reminder</Text>
                  <Switch accessibilityLabel="Distance reminder" value={distanceEnabled} onValueChange={setDistanceEnabled} />
                </View>
                <AppTextField
                  editable={distanceEnabled}
                  keyboardType="number-pad"
                  label="Distance interval (km)"
                  onChangeText={setDistanceValue}
                  placeholder="Enter kilometres"
                  value={distanceValue}
                />
              </View>

              <View>
                <View className="flex-row items-center justify-between gap-4 mb-3">
                  <Text className="font-headline text-sm font-bold text-on-surface">Time reminder</Text>
                  <Switch accessibilityLabel="Time reminder" value={timeEnabled} onValueChange={setTimeEnabled} />
                </View>
                <AppTextField
                  editable={timeEnabled}
                  keyboardType="number-pad"
                  label="Time interval (months)"
                  onChangeText={setTimeValue}
                  placeholder="Enter months"
                  value={timeValue}
                />
              </View>
            </View>
          ) : null}
        </View>

        <AppTextField
          containerClassName="mt-5"
          label="Reason or note (optional)"
          multiline
          onChangeText={setReason}
          placeholder="e.g. Workshop recommendation"
          value={reason}
        />

        {validationError ? <Text accessibilityLiveRegion="polite" className="font-body text-sm text-error mt-4">{validationError}</Text> : null}
        {savedMessage ? <Text accessibilityLiveRegion="polite" className="font-body text-sm text-primary mt-4">{savedMessage}</Text> : null}

        <AppPrimaryButton className="mt-6" label="Save custom reminder" loading={saving} onPress={() => void persist(false)} />
        <TouchableOpacity
          accessibilityRole="button"
          className="min-h-12 mt-3 rounded-xl border border-primary/30 items-center justify-center px-4"
          disabled={saving}
          onPress={() => void restore()}
        >
          <Text className="font-label text-sm font-bold text-primary">Restore original schedule</Text>
        </TouchableOpacity>
        <Text className="font-body text-xs text-on-surface-variant mt-4 leading-5">
          Changing this reminder preserves all maintenance records and recalculates only this vehicle’s matching action from its latest confirmed history.
        </Text>
      </ScrollView>
    </AppScreen>
  );
}
