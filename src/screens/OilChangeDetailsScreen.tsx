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
import { formatKilometres, formatNumber, localizeErrorMessage, t, useTranslation } from '../i18n';

function statusLabel(task: MaintenanceTaskProjection): string {
  if (task.reminderDisabled) return t('oil.disabled');
  if (task.status === 'overdue') return t('maintenance.overdue');
  if (task.status === 'due') return t('maintenance.dueNow');
  if (task.status === 'due_soon') return t('maintenance.dueSoon');
  if (task.status === 'history_unknown_recommend_service' || task.status === 'unknown') return t('maintenance.statusLastChange');
  if (task.status === 'history_unknown_request_record') return t('oil.lastCheckUnknown');
  if (task.status === 'historical_unverified') return t('oil.pastMilestone');
  if (task.status === 'not_applicable') return t('maintenance.statusNotApplicable');
  if (task.status === 'condition_attention') {
    if (task.conditionResult === 'replace_now') return t('maintenance.statusReplaceNow');
    if (task.conditionResult === 'replace_soon') return t('maintenance.statusReplaceSoon');
    if (task.conditionResult === 'service_soon') return t('maintenance.statusServiceSoon');
    return t('maintenance.needsAttention');
  }
  if (task.status === 'no_fixed_interval' || task.status === 'informational') return t('oil.byCondition');
  return t('maintenance.upcoming');
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
    ? t('oil.duplicateOne')
    : t('oil.duplicateMany', { count });
}

export default function OilChangeDetailsScreen() {
  const { locale, isRTL, t: tr } = useTranslation();
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
    tr('oil.loadError'),
    tr('oil.loadLog')
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
        Alert.alert(tr('oil.matchFound'), duplicate, [
          { text: tr('common.cancel'), style: 'cancel' },
          { text: tr('logs.saveAnyway'), onPress: () => void persistOilRecord(task, draft, true) },
        ]);
        return;
      }
      console.error('Failed to record oil maintenance:', error);
      Alert.alert(tr('oil.notSaved'), localizeErrorMessage(error, tr('oil.notChanged')));
    } finally {
      setSavingRecord(false);
    }
  }, [refreshAfterChange, savingRecord, tr, vehicle]);

  const restoreOriginalSchedule = useCallback((task: MaintenanceTaskProjection) => {
    Alert.alert(
      tr('oil.restoreTitle'),
      tr('oil.restoreBody', { action: naturalMaintenanceActionLabel(task).toLocaleLowerCase() }),
      [
        { text: tr('common.cancel'), style: 'cancel' },
        {
          text: tr('oil.restore'),
          onPress: () => void (async () => {
            try {
              await restoreMaintenancePreference(task.componentId, task.action);
              await refreshAfterChange();
            } catch (error) {
              Alert.alert(tr('oil.notRestored'), localizeErrorMessage(error, tr('oil.notRestoredBody')));
            }
          })(),
        },
      ]
    );
  }, [refreshAfterChange, tr]);

  if (loading || error || !vehicle) {
    return (
      <ScreenLoadState
        error={error ?? (!loading ? tr('oil.vehicleUnavailable') : null)}
        loading={loading}
        onBack={() => navigation.goBack()}
        onRetry={reload}
        title={tr('oil.title')}
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
        leading={<AppIconButton accessibilityLabel={tr('common.back')} icon={isRTL ? 'arrow-forward' : 'arrow-back'} onPress={() => navigation.goBack()} />}
        trailing={<AppIconButton accessibilityLabel={tr('history.open')} icon="history" onPress={() => navigation.navigate('ServiceLogs')} />}
      >
        <Text className="font-headline uppercase tracking-widest text-sm text-primary">{tr('oil.title')}</Text>
      </AppTopBar>

      <ScrollView className="flex-1" contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 20, paddingBottom: 40 }}>
        <Text accessibilityRole="header" className="font-headline text-3xl font-bold text-on-surface">{tr('oil.heading')}</Text>
        <Text className="font-body text-sm text-on-surface-variant mt-2">{tr('oil.currentOdometer', { km: formatNumber(vehicle.current_mileage, locale) })}</Text>

        <View className="rounded-xl border border-primary/25 bg-surface-container-lowest p-5 mt-6">
          <View className="flex-row items-center justify-between gap-3">
            <Text className="font-headline text-lg font-bold text-on-surface">{tr('oil.replacement')}</Text>
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
                  accessibilityLabel={tr('oil.openActions')}
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
            {recurringReplacement ? maintenanceScheduleText(recurringReplacement) : tr('oil.noReminder')}
          </Text>
          {historyUnknown ? (
            <Text className="font-body text-sm text-on-surface-variant mt-3 leading-6">
              {tr('oil.historyUnknownBody')}
            </Text>
          ) : (
            <View className="mt-4 gap-2">
              <View className="flex-row justify-between gap-3">
                <Text className="font-body text-sm text-on-surface-variant">{tr('oil.lastChanged')}</Text>
                <Text className="font-body text-sm font-semibold text-on-surface">{lastChanged === null || lastChanged === undefined ? tr('common.notRecorded') : formatKilometres(lastChanged, locale)}</Text>
              </View>
              <View className="flex-row justify-between gap-3">
                <Text className="font-body text-sm text-on-surface-variant">{tr('oil.nextDue')}</Text>
                <Text className="font-body text-sm font-semibold text-on-surface">{nextDue === null || nextDue === undefined ? tr('oil.addHistory') : formatKilometres(nextDue, locale)}</Text>
              </View>
              <View className="flex-row justify-between gap-3">
                <Text className="font-body text-sm text-on-surface-variant">{tr('oil.remaining')}</Text>
                <Text className={`font-body text-sm font-semibold ${remaining !== null && remaining !== undefined && remaining <= 0 ? 'text-error' : 'text-primary'}`}>
                  {remaining === null || remaining === undefined
                    ? tr('oil.notCalculated')
                    : remaining <= 0
                      ? tr('maintenance.overdueKm', { km: formatNumber(Math.abs(remaining), locale) })
                      : formatKilometres(remaining, locale)}
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
                <Text className="font-label text-sm font-bold text-secondary">{tr('oil.history')}</Text>
              </TouchableOpacity>
            </View>
          ) : null}
        </View>

        {otherOilTasks.length > 0 ? (
          <View className="mt-7">
            <Text className="font-label text-xs uppercase tracking-widest text-secondary mb-3">{tr('oil.additionalChecks')}</Text>
            <View className="rounded-xl border border-outline-variant/15 bg-surface-container-lowest overflow-hidden">
              {otherOilTasks.map((task) => (
                <MaintenanceActionRow key={task.key} onPress={setMenuTask} task={task} />
              ))}
            </View>
          </View>
        ) : null}

        <View className="rounded-xl border border-outline-variant/15 bg-surface-container-lowest p-5 mt-7">
          <Text className="font-headline text-base font-bold text-on-surface">{tr('oil.beforeServicing')}</Text>
          <Text className="font-body text-xs text-on-surface-variant leading-5 mt-2">
            {tr('oil.beforeServicingBody')}
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
        submitLabel={tr('record.saveMaintenance')}
        title={recordingTask ? naturalRecordActionLabel(recordingTask) : tr('oil.recordTitle')}
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
