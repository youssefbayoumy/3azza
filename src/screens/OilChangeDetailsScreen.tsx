import React, { useCallback, useMemo, useState } from 'react';
import { Alert, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { MainStackNavigationProp } from '../navigation/types';
import type { VehicleProfile } from '../types/database.types';
import MaintenanceRecordForm, {
  type MaintenanceRecordActionOption,
  type MaintenanceRecordDraft,
} from '../components/MaintenanceRecordForm';
import MaintenanceActionMenu from '../components/MaintenanceActionMenu';
import MaintenanceActionRow from '../components/MaintenanceActionRow';
import AppIconButton from '../components/ui/AppIconButton';
import AppTopBar from '../components/ui/AppTopBar';
import AppScreen from '../components/ui/AppScreen';
import ScreenLoadState from '../components/ui/ScreenLoadState';
import useFocusedLoader from '../hooks/useFocusedLoader';
import {
  createMaintenanceRecord,
  getMaintenanceEvents,
  getMaintenanceHistoryStates,
  getMaintenancePreferences,
  getVehicleProfile,
  restoreMaintenancePreference,
} from '../services/database';
import { getMaintenanceProfileForSelection } from '../maintenance/profiles';
import { projectMaintenanceTasks } from '../maintenance/scheduler';
import {
  maintenanceHistoryByAction,
  maintenancePreferencesForScheduler,
} from '../maintenance/storageProjection';
import type {
  MaintenanceTaskProjection,
  ScooterMaintenanceProfile,
} from '../maintenance/types';
import {
  maintenanceOverrideBadge,
  maintenanceScheduleText,
  naturalMaintenanceActionLabel,
  naturalRecordActionLabel,
} from '../maintenance/presentation';
import { syncMaintenanceNotifications } from '../services/notifications';
import { useAppStore } from '../store/useAppStore';

function statusLabel(task: MaintenanceTaskProjection): string {
  if (task.reminderDisabled) return 'Disabled by you';
  if (task.status === 'overdue') return 'Overdue';
  if (task.status === 'due') return 'Due now';
  if (task.status === 'due_soon') return 'Due soon';
  if (task.status === 'history_unknown_recommend_service' || task.status === 'unknown') return 'Last change unknown';
  if (task.status === 'history_unknown_request_record') return 'Last check unknown';
  if (task.status === 'historical_unverified') return 'Past milestone';
  if (task.status === 'not_applicable') return 'Not applicable';
  if (task.status === 'condition_attention') {
    if (task.conditionResult === 'replace_now') return 'Replace now';
    if (task.conditionResult === 'replace_soon') return 'Replace soon';
    if (task.conditionResult === 'service_soon') return 'Service soon';
    return 'Needs attention';
  }
  if (task.status === 'no_fixed_interval' || task.status === 'informational') return 'By condition';
  return 'Upcoming';
}

function statusColor(task: MaintenanceTaskProjection): string {
  if (task.status === 'overdue' || task.status === 'due' || task.conditionResult === 'replace_now') return 'text-error';
  if (task.status === 'due_soon' || task.status === 'condition_attention') return 'text-amber-400';
  return 'text-primary';
}

function duplicateSummary(error: unknown): string | null {
  if (!(error instanceof Error) || error.name !== 'MaintenanceDuplicateError') return null;
  const count = Array.isArray((error as Error & { duplicates?: unknown[] }).duplicates)
    ? (error as Error & { duplicates: unknown[] }).duplicates.length
    : 1;
  return count === 1
    ? 'A matching oil-maintenance record already exists for this date and mileage.'
    : `${count} matching oil-maintenance records already exist for this date and mileage.`;
}

export default function OilChangeDetailsScreen() {
  const navigation = useNavigation<MainStackNavigationProp>();
  const remindersEnabled = useAppStore((state) => state.maintenanceReminders);
  const [vehicle, setVehicle] = useState<VehicleProfile | null>(null);
  const [profile, setProfile] = useState<ScooterMaintenanceProfile | null>(null);
  const [oilTasks, setOilTasks] = useState<MaintenanceTaskProjection[]>([]);
  const [menuTask, setMenuTask] = useState<MaintenanceTaskProjection | null>(null);
  const [recordingTask, setRecordingTask] = useState<MaintenanceTaskProjection | null>(null);
  const [savingRecord, setSavingRecord] = useState(false);

  const loadData = useCallback(async (isCurrent: () => boolean) => {
    const [vehicleData, events, preferences, historyStates] = await Promise.all([
      getVehicleProfile(),
      getMaintenanceEvents(),
      getMaintenancePreferences(),
      getMaintenanceHistoryStates(),
    ]);
    const domainProfile = getMaintenanceProfileForSelection(vehicleData ? {
      brandId: vehicleData.scooter_brand_id,
      modelId: vehicleData.scooter_model_id,
      versionId: vehicleData.scooter_version_id,
      variantId: vehicleData.scooter_variant_id,
    } : null);
    if (!isCurrent()) return;
    setVehicle(vehicleData);
    setProfile(domainProfile);
    setOilTasks(vehicleData && domainProfile ? projectMaintenanceTasks({
      profile: domainProfile,
      currentOdometerKm: vehicleData.current_mileage,
      vehicleId: vehicleData.id,
      now: new Date(),
      events,
      preferences: maintenancePreferencesForScheduler(preferences),
      historyByAction: maintenanceHistoryByAction(historyStates),
      defaultHistoryKnowledge: 'unknown',
      vehicleInServiceDate: vehicleData.created_at.slice(0, 10),
    }).filter((task) => task.componentId === 'engine-oil' || task.componentId === 'oil-filter-screen') : []);
  }, []);

  const { error, loading, reload } = useFocusedLoader(
    loadData,
    'Oil-change details could not be loaded. Your records were not changed.',
    'Failed to load oil-change details:'
  );

  const recurringReplacement = oilTasks.find((task) =>
    task.action === 'replace'
    && !task.isOneTime
    && task.scheduleType === 'recurring_distance'
  ) ?? null;

  const ruleById = useMemo(() => new Map(
    (profile?.rules ?? []).map((rule) => [rule.id, rule])
  ), [profile]);

  const recordOption = useMemo<MaintenanceRecordActionOption[]>(() => {
    if (!recordingTask) return [];
    return [{
      ruleId: recordingTask.ruleId,
      componentId: recordingTask.componentId,
      action: recordingTask.action,
      label: naturalMaintenanceActionLabel(recordingTask),
      requiresConditionResult: Boolean(ruleById.get(recordingTask.ruleId)?.conditionFollowUp),
    }];
  }, [recordingTask, ruleById]);

  const refreshAfterChange = useCallback(async () => {
    await reload();
    await syncMaintenanceNotifications(remindersEnabled);
  }, [reload, remindersEnabled]);

  const persistRecord = useCallback(async function persistOilRecord(
    task: MaintenanceTaskProjection,
    draft: MaintenanceRecordDraft,
    allowDuplicate = false
  ) {
    if (!vehicle || savingRecord) return;
    setSavingRecord(true);
    try {
      await createMaintenanceRecord({
        serviceDate: draft.serviceDate,
        mileageKm: draft.mileageKm,
        dateConfidence: draft.serviceDate === null ? 'unknown' : 'confirmed',
        mileageConfidence: draft.mileageKm === null ? 'unknown' : 'confirmed',
        notes: draft.notes,
        cost: draft.cost,
        serviceProvider: draft.serviceProvider || null,
        recordSource: 'maintenance_planner',
        oil: task.action === 'replace' ? {
          brand: draft.oilBrand || null,
          type: draft.oilType,
          viscosity: draft.oilViscosity || null,
          notes: draft.mechanicRecommendation || null,
        } : undefined,
        actions: draft.selectedActions.map((action) => ({
          ruleId: action.ruleId,
          componentId: action.componentId,
          action: action.action,
          title: draft.title,
          category: 'Engine oil',
          inspectionResult: draft.conditionResults[action.ruleId] ?? null,
        })),
        allowDuplicate,
      });
      setRecordingTask(null);
      await refreshAfterChange();
    } catch (error) {
      const duplicate = duplicateSummary(error);
      if (duplicate && !allowDuplicate) {
        setSavingRecord(false);
        Alert.alert('Matching record found', duplicate, [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Save anyway', onPress: () => void persistOilRecord(task, draft, true) },
        ]);
        return;
      }
      console.error('Failed to record oil maintenance:', error);
      Alert.alert('Not saved', error instanceof Error ? error.message : 'The oil-maintenance record was not changed.');
    } finally {
      setSavingRecord(false);
    }
  }, [refreshAfterChange, savingRecord, vehicle]);

  const restoreOriginalSchedule = useCallback((task: MaintenanceTaskProjection) => {
    Alert.alert(
      'Restore original schedule?',
      `This removes only your reminder override for ${naturalMaintenanceActionLabel(task).toLowerCase()}. Maintenance history is preserved.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Restore',
          onPress: () => void (async () => {
            try {
              await restoreMaintenancePreference(task.componentId, task.action);
              await refreshAfterChange();
            } catch (error) {
              Alert.alert('Not restored', error instanceof Error ? error.message : 'The original schedule was not restored.');
            }
          })(),
        },
      ]
    );
  }, [refreshAfterChange]);

  if (loading || error || !vehicle) {
    return (
      <ScreenLoadState
        error={error ?? (!loading ? 'The active vehicle is unavailable.' : null)}
        loading={loading}
        onBack={() => navigation.goBack()}
        onRetry={reload}
        title="ENGINE OIL"
      />
    );
  }

  const lastChanged = recurringReplacement?.lastPerformedAtKm;
  const nextDue = recurringReplacement?.dueAtKm;
  const remaining = recurringReplacement?.remainingKm;
  const historyUnknown = recurringReplacement?.status === 'history_unknown_recommend_service'
    || recurringReplacement?.status === 'unknown';
  const otherOilTasks = oilTasks.filter((task) =>
    task.key !== recurringReplacement?.key
    && task.status !== 'historical_unverified'
  );

  return (
    <AppScreen>
      <AppTopBar
        leading={<AppIconButton accessibilityLabel="Go back" icon="arrow-back" onPress={() => navigation.goBack()} />}
        trailing={<AppIconButton accessibilityLabel="Open maintenance history" icon="history" onPress={() => navigation.navigate('ServiceLogs')} />}
      >
        <Text className="font-headline uppercase tracking-widest text-sm text-primary">ENGINE OIL</Text>
      </AppTopBar>

      <ScrollView className="flex-1" contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 20, paddingBottom: 40 }}>
        <Text accessibilityRole="header" className="font-headline text-3xl font-bold text-on-surface">Engine oil</Text>
        <Text className="font-body text-sm text-on-surface-variant mt-2">Current odometer: {vehicle.current_mileage.toLocaleString()} km</Text>

        <View className="rounded-xl border border-primary/25 bg-surface-container-lowest p-5 mt-6">
          <View className="flex-row items-center justify-between gap-3">
            <Text className="font-headline text-lg font-bold text-on-surface">Oil replacement</Text>
            <View className="flex-row items-center gap-2">
              {recurringReplacement && maintenanceOverrideBadge(recurringReplacement) ? (
                <View className="rounded-full bg-primary/12 px-2 py-1">
                  <Text className="font-label text-[9px] font-bold text-primary">{maintenanceOverrideBadge(recurringReplacement)}</Text>
                </View>
              ) : null}
              {recurringReplacement ? (
                <Text className={`font-label text-xs font-bold ${statusColor(recurringReplacement)}`}>
                  {statusLabel(recurringReplacement)}
                </Text>
              ) : null}
              {recurringReplacement ? (
                <TouchableOpacity
                  accessibilityLabel="Open oil change actions"
                  accessibilityRole="button"
                  className="h-11 w-11 items-center justify-center rounded-lg"
                  onPress={() => setMenuTask(recurringReplacement)}
                >
                  <Text className="font-headline text-xl text-secondary">⋮</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          </View>
          <Text className="font-headline text-2xl font-bold text-primary mt-4">
            {recurringReplacement ? maintenanceScheduleText(recurringReplacement) : 'No fixed reminder'}
          </Text>
          {historyUnknown ? (
            <Text className="font-body text-sm text-on-surface-variant mt-3 leading-6">
              Last change unknown. Enter previous maintenance or consider servicing it now.
            </Text>
          ) : (
            <View className="mt-4 gap-2">
              <View className="flex-row justify-between gap-3">
                <Text className="font-body text-sm text-on-surface-variant">Last changed</Text>
                <Text className="font-body text-sm font-semibold text-on-surface">{lastChanged === null || lastChanged === undefined ? 'Not recorded' : `${lastChanged.toLocaleString()} km`}</Text>
              </View>
              <View className="flex-row justify-between gap-3">
                <Text className="font-body text-sm text-on-surface-variant">Next due</Text>
                <Text className="font-body text-sm font-semibold text-on-surface">{nextDue === null || nextDue === undefined ? 'Add history to calculate' : `${nextDue.toLocaleString()} km`}</Text>
              </View>
              <View className="flex-row justify-between gap-3">
                <Text className="font-body text-sm text-on-surface-variant">Remaining</Text>
                <Text className={`font-body text-sm font-semibold ${remaining !== null && remaining !== undefined && remaining <= 0 ? 'text-error' : 'text-primary'}`}>
                  {remaining === null || remaining === undefined
                    ? 'Not calculated'
                    : remaining <= 0
                      ? `${Math.abs(remaining).toLocaleString()} km overdue`
                      : `${remaining.toLocaleString()} km`}
                </Text>
              </View>
            </View>
          )}

          {recurringReplacement ? (
            <View className="flex-row gap-2 mt-5">
              <TouchableOpacity
                accessibilityRole="button"
                className="min-h-12 flex-1 min-w-40 rounded-lg bg-primary items-center justify-center px-4"
                onPress={() => setRecordingTask(recurringReplacement)}
              >
                <Text className="font-label text-sm font-bold text-on-primary">{naturalRecordActionLabel(recurringReplacement)}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                accessibilityRole="button"
                className="min-h-12 rounded-lg border border-outline-variant/25 items-center justify-center px-4"
                onPress={() => navigation.navigate('ServiceLogs')}
              >
                <Text className="font-label text-sm font-bold text-secondary">History</Text>
              </TouchableOpacity>
            </View>
          ) : null}
        </View>

        {otherOilTasks.length > 0 ? (
          <View className="mt-7">
            <Text className="font-label text-xs uppercase tracking-widest text-secondary mb-3">Additional oil checks</Text>
            <View className="rounded-xl border border-outline-variant/15 bg-surface-container-lowest overflow-hidden">
              {otherOilTasks.map((task) => (
                <MaintenanceActionRow key={task.key} onPress={setMenuTask} task={task} />
              ))}
            </View>
          </View>
        ) : null}

        <View className="rounded-xl border border-outline-variant/15 bg-surface-container-lowest p-5 mt-7">
          <Text className="font-headline text-base font-bold text-on-surface">Before servicing</Text>
          <Text className="font-body text-xs text-on-surface-variant leading-5 mt-2">
            Use the oil specification for your exact scooter and ask a qualified workshop when the procedure is outside your experience. You can save brand, type, viscosity, provider, cost, and mechanic notes with each oil change.
          </Text>
        </View>
      </ScrollView>

      <MaintenanceRecordForm
        actionOptions={recordOption}
        actionsLocked
        currentOdometerKm={vehicle.current_mileage}
        initialValue={recordingTask && recordOption[0] ? {
          selectedActions: recordOption,
          title: recordOption[0].label,
        } : undefined}
        onClose={() => !savingRecord && setRecordingTask(null)}
        onSubmit={(draft) => recordingTask ? persistRecord(recordingTask, draft) : undefined}
        saving={savingRecord}
        submitLabel="Save maintenance"
        title={recordingTask ? naturalRecordActionLabel(recordingTask) : 'Engine-oil record'}
        visible={recordingTask !== null}
      />
      <MaintenanceActionMenu
        onClose={() => setMenuTask(null)}
        onCustomize={(task) => navigation.navigate('MaintenanceReminderCustomization', { ruleId: task.ruleId })}
        onHistory={() => navigation.navigate('ServiceLogs')}
        onRecord={setRecordingTask}
        onRestore={restoreOriginalSchedule}
        task={menuTask}
      />
    </AppScreen>
  );
}
