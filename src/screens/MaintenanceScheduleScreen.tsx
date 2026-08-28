import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { TabParamList, VitalsNavigationProp } from '../navigation/types';
import MaintenanceRecordForm, {
  type MaintenanceRecordActionOption,
  type MaintenanceRecordDraft,
} from '../components/maintenance/MaintenanceRecordForm';
import MaintenanceActionMenu from '../components/maintenance/MaintenanceActionMenu';
import MaintenanceActionRow from '../components/maintenance/MaintenanceActionRow';
import InitialServiceCheckpointCard from '../components/maintenance/InitialServiceCheckpointCard';
import AppIconButton from '../components/ui/AppIconButton';
import AppScreen from '../components/ui/AppScreen';
import AppTopBar from '../components/ui/AppTopBar';
import ScreenLoadState from '../components/ui/ScreenLoadState';
import useFocusedLoader from '../hooks/useFocusedLoader';
import { formatScooterSelection, selectionFromProfile } from '../catalog/scooterCatalog';
import { getMaintenanceProfileForSelection } from '../maintenance/profiles';
import {
  compareMaintenanceTaskPriority,
  isTaskTracked,
} from '../maintenance/scheduler';
import {
  maintenanceComponentGroup,
  maintenanceGroupSummary,
  maintenanceNearestActionSummary,
  naturalMaintenanceActionLabel,
  naturalRecordActionLabel,
} from '../maintenance/presentation';
import {
  maintenancePreferencesForScheduler,
} from '../maintenance/storageProjection';
import type {
  MaintenanceTaskProjection,
  ScooterMaintenanceProfile,
} from '../maintenance/types';
import {
  createMaintenanceRecord,
  getMaintenanceEvents,
  getMaintenanceHistoryStates,
  getMaintenancePreferences,
  getVehicleProfile,
  restoreMaintenancePreference,
  setMaintenanceTracked,
} from '../services/database';
import type { VehicleProfile } from '../types/database.types';
import { syncMaintenanceNotifications } from '../services/notifications';
import { useAppStore } from '../store/useAppStore';
import { formatKilometres, formatNumber, localizeErrorMessage, t, useTranslation } from '../i18n';
import type { InitialServiceCheckpoint } from '../maintenance/initialServiceCheckpoint';
import { projectVehicleMaintenance } from '../maintenance/lifecycle';

type SectionId = 'scheduled' | 'checks' | 'wear';

type ComponentGroup = {
  id: string;
  label: string;
  icon: keyof typeof MaterialIcons.glyphMap;
  section: SectionId;
};

const COMPONENT_ICONS: Record<string, keyof typeof MaterialIcons.glyphMap> = {
  'engine-oil': 'opacity',
  'oil-filter-screen': 'filter-alt',
  'transmission-oil': 'settings',
  transmission: 'settings',
  'air-cleaner-element': 'air',
  'air-cleaner-system': 'air',
  'spark-plug': 'bolt',
  'drive-belt-rollers': 'settings-input-component',
  'drive-chain-sprockets': 'link',
  'clutch-disk': 'settings-input-component',
  'fuel-pump-filter': 'filter-alt',
  'cooling-system': 'ac-unit',
  coolant: 'ac-unit',
  'brake-pads': 'do-not-disturb-on',
  'brake-fluid': 'do-not-disturb-on',
  'brake-system': 'do-not-disturb-on',
  tires: 'trip-origin',
  battery: 'battery-charging-full',
  'steering-bearing-handles': 'device-hub',
  'shock-absorbers': 'device-hub',
  suspension: 'device-hub',
  'main-side-stands': 'two-wheeler',
  'general-workshop-inspection': 'fact-check',
};

function groupForTask(task: MaintenanceTaskProjection): ComponentGroup {
  const definition = maintenanceComponentGroup(task.componentId);
  const groupSection = definition.section.key === 'scheduled-maintenance'
    ? 'scheduled'
    : definition.section.key === 'wear-and-condition' ? 'wear' : 'checks';
  return {
    id: definition.key,
    label: definition.label,
    icon: COMPONENT_ICONS[definition.key] ?? 'build',
    section: groupSection,
  };
}

function groupTasks(
  group: Pick<ComponentGroup, 'id'>,
  tasks: MaintenanceTaskProjection[]
): MaintenanceTaskProjection[] {
  return tasks.filter((task) => groupForTask(task).id === group.id);
}

function deduplicateByGroup(tasks: MaintenanceTaskProjection[], limit?: number) {
  const seen = new Set<string>();
  const result: { group: ComponentGroup; task: MaintenanceTaskProjection }[] = [];
  for (const task of [...tasks].sort(compareMaintenanceTaskPriority)) {
    const group = groupForTask(task);
    if (seen.has(group.id)) continue;
    seen.add(group.id);
    result.push({ group, task });
    if (limit !== undefined && result.length >= limit) break;
  }
  return result;
}

function sectionForTask(task: MaintenanceTaskProjection): SectionId | null {
  return groupForTask(task).section;
}

function isDueNow(task: MaintenanceTaskProjection): boolean {
  return task.status === 'overdue'
    || task.status === 'due'
    || task.status === 'condition_attention';
}

function isComingUp(task: MaintenanceTaskProjection): boolean {
  return task.status === 'due_soon';
}

function statusPresentation(task: MaintenanceTaskProjection): {
  label: string;
  color: string;
  background: string;
} {
  if (task.reminderDisabled) return { label: t('oil.disabled'), color: 'text-secondary', background: 'bg-secondary/15' };
  if (task.conditionResult === 'cleaning_needed') return { label: t('maintenance.statusCleaning'), color: 'text-amber-400', background: 'bg-amber-500/15' };
  if (task.conditionResult === 'healthy' && task.status === 'ok') return { label: t('record.healthy'), color: 'text-primary', background: 'bg-primary/15' };
  if (task.status === 'overdue') return { label: t('maintenance.overdue'), color: 'text-error', background: 'bg-error/15' };
  if (task.status === 'due') return { label: t('maintenance.dueNow'), color: 'text-error', background: 'bg-error/15' };
  if (task.status === 'due_soon') return { label: t('maintenance.dueSoon'), color: 'text-amber-400', background: 'bg-amber-500/15' };
  if (task.status === 'condition_attention') {
    if (task.conditionResult === 'replace_now') return { label: t('maintenance.statusReplaceNow'), color: 'text-error', background: 'bg-error/15' };
    if (task.conditionResult === 'replace_soon') return { label: t('maintenance.statusReplaceSoon'), color: 'text-amber-400', background: 'bg-amber-500/15' };
    if (task.conditionResult === 'service_soon') return { label: t('maintenance.statusServiceSoon'), color: 'text-amber-400', background: 'bg-amber-500/15' };
    return { label: t('maintenance.needsAttention'), color: 'text-amber-400', background: 'bg-amber-500/15' };
  }
  if (task.status === 'unknown_history') return { label: t('maintenance.statusHistory'), color: 'text-secondary', background: 'bg-secondary/15' };
  if (task.status === 'not_applicable') return { label: t('maintenance.statusNotApplicable'), color: 'text-secondary', background: 'bg-secondary/15' };
  if (task.status === 'no_fixed_interval') return { label: t('maintenance.noFixedInterval'), color: 'text-secondary', background: 'bg-secondary/15' };
  return { label: t('maintenance.upcoming'), color: 'text-primary', background: 'bg-primary/15' };
}

function taskTiming(task: MaintenanceTaskProjection): string {
  if (task.reminderDisabled) return t('plan.disabledTiming');
  if (task.status === 'unknown_history') {
    return t('oil.historyUnknownBody');
  }
  if (task.status === 'not_applicable') return t('plan.notApplicableBody');
  if (task.status === 'condition_attention') return statusPresentation(task).label;
  if (task.remainingKm !== null) {
    if (task.remainingKm < 0) return t('maintenance.overdueKm', { km: formatNumber(Math.abs(task.remainingKm)) });
    if (task.remainingKm === 0) return t('plan.dueAt', { km: formatNumber(task.dueAtKm ?? 0) });
    return t('maintenance.kmRemaining', { km: formatNumber(task.remainingKm) });
  }
  if (task.remainingDays !== null) {
    if (task.remainingDays < 0) return t('dashboard.daysOverdue', { days: formatNumber(Math.abs(task.remainingDays)) });
    if (task.remainingDays === 0) return t('dashboard.statusDueToday');
    return t('maintenance.daysRemaining', { days: formatNumber(task.remainingDays) });
  }
  if (task.status === 'no_fixed_interval') {
    return t('plan.serviceCondition');
  }
  return naturalMaintenanceActionLabel(task);
}

function representativeForGroup(
  group: ComponentGroup,
  tasks: MaintenanceTaskProjection[]
): MaintenanceTaskProjection | null {
  const sorted = [...tasks].sort(compareMaintenanceTaskPriority);
  if (group.id === 'engine-oil' || group.id === 'transmission-oil') {
    const replacement = sorted.find((task) =>
      task.action === 'replace'
      && !task.isOneTime
      && task.scheduleType !== 'condition_based'
    );
    if (replacement && !sorted.some(isDueNow)) return replacement;
  }
  return sorted[0] ?? null;
}

function duplicateSummary(error: unknown): string | null {
  if (!(error instanceof Error) || error.name !== 'MaintenanceDuplicateError') return null;
  const count = Array.isArray((error as Error & { duplicates?: unknown[] }).duplicates)
    ? (error as Error & { duplicates: unknown[] }).duplicates.length
    : 1;
  return count === 1
    ? t('plan.duplicateOne')
    : t('plan.duplicateMany', { count });
}

export default function MaintenanceScheduleScreen() {
  const { locale, isRTL, t: tr } = useTranslation();
  const navigation = useNavigation<VitalsNavigationProp>();
  const route = useRoute<RouteProp<TabParamList, 'Maintenance'>>();
  const remindersEnabled = useAppStore((state) => state.maintenanceReminders);
  const [vehicle, setVehicle] = useState<VehicleProfile | null>(null);
  const [maintenanceProfile, setMaintenanceProfile] = useState<ScooterMaintenanceProfile | null>(null);
  const [tasks, setTasks] = useState<MaintenanceTaskProjection[]>([]);
  const [initialServiceCheckpoint, setInitialServiceCheckpoint] = useState<InitialServiceCheckpoint | null>(null);
  const [trackedKeys, setTrackedKeys] = useState<Set<string>>(new Set());
  const [expandedGroupId, setExpandedGroupId] = useState<string | null>(null);
  const [menuTask, setMenuTask] = useState<MaintenanceTaskProjection | null>(null);
  const [recordingTask, setRecordingTask] = useState<MaintenanceTaskProjection | null>(null);
  const [recordingMode, setRecordingMode] = useState<'now' | 'previous'>('now');
  const [saving, setSaving] = useState(false);
  const openMaintenanceHistorySetup = () => navigation.navigate('MaintenanceHistorySetup');

  const loadData = useCallback(async (isCurrent: () => boolean) => {
    const [profileData, events, preferences, historyStates] = await Promise.all([
      getVehicleProfile(),
      getMaintenanceEvents(),
      getMaintenancePreferences(),
      getMaintenanceHistoryStates(),
    ]);
    if (!isCurrent()) return;
    setVehicle(profileData);
    const domainProfile = getMaintenanceProfileForSelection(
      profileData ? selectionFromProfile(profileData) : null
    );
    setMaintenanceProfile(domainProfile);
    if (!profileData || !domainProfile) {
      setTasks([]);
      setInitialServiceCheckpoint(null);
      return;
    }
    const schedulerPreferences = maintenancePreferencesForScheduler(preferences);
    const plan = projectVehicleMaintenance({
      vehicle: profileData,
      profile: domainProfile,
      now: new Date(),
      events,
      preferences,
      historyStates,
    });
    setInitialServiceCheckpoint(plan.firstServiceCheckpoint);
    const visibleProjected = plan.tasks;
    setTasks(visibleProjected);
    const trackingContext = { preferences: schedulerPreferences, events, vehicleId: profileData.id };
    setTrackedKeys(new Set(
      visibleProjected.filter((task) => isTaskTracked(task, trackingContext)).map((task) => task.key)
    ));
  }, []);

  const { error: loadError, loading, reload } = useFocusedLoader(
    loadData,
    tr('plan.loadError'),
    tr('plan.loadLog')
  );

  useEffect(() => {
    const openRuleId = route.params?.openRuleId;
    if (!openRuleId) return;
    const task = tasks.find((candidate) => candidate.ruleId === openRuleId);
    if (!task) return;
    const group = groupForTask(task);
    if (group.id !== 'engine-oil') {
      setExpandedGroupId(`${sectionForTask(task) ?? 'checks'}:${group.id}`);
    }
  }, [route.params?.openRuleId, tasks]);

  const ruleById = useMemo(() => new Map(
    (maintenanceProfile?.rules ?? []).map((rule) => [rule.id, rule])
  ), [maintenanceProfile]);

  const recordOption = useMemo<MaintenanceRecordActionOption[]>(() => {
    if (!recordingTask) return [];
    const rule = ruleById.get(recordingTask.ruleId);
    return [{
      ruleId: recordingTask.ruleId,
      componentId: recordingTask.componentId,
      action: recordingTask.action,
      label: naturalMaintenanceActionLabel(recordingTask),
      requiresConditionResult: Boolean(rule?.conditionFollowUp),
    }];
  }, [recordingTask, ruleById]);

  const persistRecord = useCallback(async (
    task: MaintenanceTaskProjection,
    draft: MaintenanceRecordDraft,
    allowDuplicate = false
  ) => {
    if (!vehicle || saving) return;
    setSaving(true);
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
        oil: task.componentId === 'engine-oil' && task.action === 'replace' ? {
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
          category: groupForTask(task).label,
          inspectionResult: draft.conditionResults[action.ruleId] ?? null,
        })),
        allowDuplicate,
      });
      setRecordingTask(null);
      await reload();
      await syncMaintenanceNotifications(remindersEnabled);
    } catch (error) {
      const duplicate = duplicateSummary(error);
      if (duplicate && !allowDuplicate) {
        setSaving(false);
        Alert.alert(tr('oil.matchFound'), duplicate, [
          { text: tr('common.cancel'), style: 'cancel' },
          {
            text: tr('logs.saveAnyway'),
            onPress: () => void persistRecord(task, draft, true),
          },
        ]);
        return;
      }
      console.error('Failed to record maintenance:', error);
      Alert.alert(tr('oil.notSaved'), localizeErrorMessage(error, tr('plan.notChanged')));
    } finally {
      setSaving(false);
    }
  }, [reload, remindersEnabled, saving, tr, vehicle]);

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
              await reload();
              await syncMaintenanceNotifications(remindersEnabled);
            } catch (error) {
              Alert.alert(tr('oil.notRestored'), localizeErrorMessage(error, tr('oil.notRestoredBody')));
            }
          })(),
        },
      ]
    );
  }, [reload, remindersEnabled, tr]);

  const trackTasks = useCallback(async (tasksToTrack: MaintenanceTaskProjection[]) => {
    try {
      const seen = new Set<string>();
      for (const task of tasksToTrack) {
        const key = `${task.componentId}:${task.action}`;
        if (seen.has(key)) continue;
        seen.add(key);
        await setMaintenanceTracked(task.componentId, task.action, true);
      }
      await reload();
      await syncMaintenanceNotifications(remindersEnabled);
    } catch (error) {
      Alert.alert(tr('plan.notAdded'), localizeErrorMessage(error, tr('plan.notAddedBody')));
    }
  }, [reload, remindersEnabled, tr]);

  const stopTrackingTask = useCallback((task: MaintenanceTaskProjection) => {
    Alert.alert(
      tr('plan.stopTitle'),
      tr('plan.stopBody', { action: naturalMaintenanceActionLabel(task) }),
      [
        { text: tr('common.cancel'), style: 'cancel' },
        {
          text: tr('plan.stop'),
          style: 'destructive',
          onPress: () => void (async () => {
            try {
              setMenuTask(null);
              await setMaintenanceTracked(task.componentId, task.action, false);
              await reload();
              await syncMaintenanceNotifications(remindersEnabled);
            } catch (error) {
              Alert.alert(tr('plan.notAdded'), localizeErrorMessage(error, tr('plan.trackingUnchanged')));
            }
          })(),
        },
      ]
    );
  }, [reload, remindersEnabled, tr]);

  if (loading || loadError || !vehicle) {
    return (
      <ScreenLoadState
        error={loadError ?? (!loading ? tr('oil.vehicleUnavailable') : null)}
        loading={loading}
        onRetry={reload}
        title={tr('plan.title')}
      />
    );
  }

  const scooterSelection = selectionFromProfile(vehicle);
  const selectable = Boolean(maintenanceProfile);
  const basicTracking = scooterSelection?.selectionMode === 'custom_brand';
  const trackedTasks = tasks.filter((task) => trackedKeys.has(task.key));
  const untrackedTasks = tasks.filter((task) =>
    !trackedKeys.has(task.key)
    && task.status !== 'not_applicable'
  );
  const trackableGroups = deduplicateByGroup(untrackedTasks).map(({ group }) => group).filter((group) =>
    groupTasks(group, trackedTasks).length === 0
    && groupTasks(group, untrackedTasks).length > 0
  );
  const dueNow = deduplicateByGroup(trackedTasks.filter(isDueNow));
  const comingUp = deduplicateByGroup(trackedTasks.filter(isComingUp));
  const activeInitialTasks = trackedTasks.filter((task) =>
    task.isOneTime && task.status !== 'not_applicable'
  );

  const openGroup = (group: ComponentGroup, section: SectionId) => {
    if (group.id === 'engine-oil') {
      navigation.navigate('OilChangeDetails');
      return;
    }
    const rowKey = `${section}:${group.id}`;
    setExpandedGroupId((current) => current === rowKey ? null : rowKey);
  };

  const renderPriorityRow = ({ group, task }: { group: ComponentGroup; task: MaintenanceTaskProjection }) => {
    const status = statusPresentation(task);
    return (
      <TouchableOpacity
        key={`${group.id}:${task.key}`}
        accessibilityRole="button"
        className="min-h-16 rounded-xl border border-outline-variant/20 bg-surface-container-low px-4 py-3 flex-row items-center gap-3"
        onPress={() => openGroup(group, sectionForTask(task) ?? 'checks')}
      >
        <View className={`w-10 h-10 rounded-lg ${status.background} items-center justify-center`}>
          <MaterialIcons name={group.icon} size={20} color={status.color === 'text-error' ? '#ffb4ab' : status.color === 'text-amber-400' ? '#f59e0b' : '#a9c7ff'} />
        </View>
        <View className="flex-1 min-w-0">
          <View className="flex-row items-center justify-between gap-2">
            <Text className="font-headline text-sm font-bold text-on-surface flex-1">{naturalMaintenanceActionLabel(task)}</Text>
            <Text className={`font-label text-[11px] font-bold ${status.color}`}>{status.label}</Text>
          </View>
          <Text className="font-body text-xs text-on-surface-variant mt-1" numberOfLines={2}>{taskTiming(task)}</Text>
        </View>
        <MaterialIcons name={isRTL ? 'chevron-left' : 'chevron-right'} size={21} color="#8e9196" />
      </TouchableOpacity>
    );
  };

  const renderComponentRow = (group: ComponentGroup, section: SectionId) => {
    const visibleTasks = groupTasks(group, trackedTasks).filter((task) =>
      task.status !== 'not_applicable'
    );
    if (visibleTasks.length === 0) return null;
    const representative = representativeForGroup(group, visibleTasks);
    if (!representative) return null;
    const status = statusPresentation(representative);
    const expanded = expandedGroupId === `${section}:${group.id}`;
    const detail = maintenanceGroupSummary(visibleTasks);
    const nearest = maintenanceNearestActionSummary(visibleTasks);
    return (
      <View key={group.id} className="rounded-xl border border-outline-variant/15 bg-surface-container-lowest overflow-hidden">
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityState={{ expanded }}
          className="min-h-16 px-4 py-3 flex-row items-center gap-3"
          onPress={() => openGroup(group, section)}
        >
          <View className="w-10 h-10 rounded-lg bg-surface-container-high items-center justify-center">
            <MaterialIcons name={group.icon} size={20} color="#a9c7ff" />
          </View>
          <View className="flex-1 min-w-0">
            <View className="flex-row items-center gap-2">
              <Text className="font-headline text-sm font-bold text-on-surface flex-1">{group.label}</Text>
              <Text className={`font-label text-[10px] font-bold ${status.color}`}>{status.label}</Text>
            </View>
            <Text className="font-body text-xs text-on-surface-variant mt-1" numberOfLines={2}>{detail}</Text>
            {nearest ? (
              <Text className="font-label text-[10px] text-secondary mt-1" numberOfLines={1}>{nearest}</Text>
            ) : null}
          </View>
          <MaterialIcons name={group.id === 'engine-oil' || !expanded ? (isRTL ? 'chevron-left' : 'chevron-right') : 'expand-less'} size={22} color="#8e9196" />
        </TouchableOpacity>

        {expanded && group.id !== 'engine-oil' ? (
          <View className="border-t border-outline-variant/15">
            {[...visibleTasks].sort(compareMaintenanceTaskPriority).map((task) => {
              return (
                <MaintenanceActionRow key={task.key} onPress={setMenuTask} task={task} />
              );
            })}
          </View>
        ) : null}
      </View>
    );
  };

  const renderSection = (id: SectionId, title: string) => {
    const groups = deduplicateByGroup(trackedTasks).map(({ group }) => group).filter((group) => group.section === id && groupTasks(group, trackedTasks).some((task) =>
      task.status !== 'not_applicable'
    ));
    if (groups.length === 0) return null;
    return (
      <View className="mt-7">
        <Text className="font-label text-xs font-bold uppercase tracking-[0.16em] text-secondary mb-3">{title}</Text>
        <View className="gap-2">{groups.map((group) => renderComponentRow(group, id))}</View>
      </View>
    );
  };

  return (
    <AppScreen>
      <AppTopBar
        tone="subtle"
        trailing={<AppIconButton accessibilityLabel={tr('history.open')} icon="history" onPress={() => navigation.navigate('ServiceLogs')} />}
      >
        <Text className="font-headline uppercase tracking-widest text-sm font-bold text-[#C0C0C0]">{tr('plan.title')}</Text>
      </AppTopBar>

      <ScrollView className="flex-1" contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 20, paddingBottom: 40 }}>
        <View className="px-1">
          <Text accessibilityRole="header" className="font-headline text-2xl font-bold text-on-surface">{tr('plan.heading')}</Text>
          <Text className="font-body text-xs text-on-surface-variant mt-2">
            {scooterSelection ? formatScooterSelection(scooterSelection) : tr('plan.selectExact')}
          </Text>
          <Text className="font-body text-sm text-secondary mt-1">{formatKilometres(vehicle.current_mileage, locale)}</Text>
        </View>

        {!selectable ? (
          <View className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-5 mt-6">
            <MaterialIcons name="two-wheeler" size={24} color="#f59e0b" />
            <Text className="font-headline text-lg font-bold text-on-surface mt-3">
              {tr(basicTracking ? 'plan.basicTrackingTitle' : 'plan.selectSupported')}
            </Text>
            <Text className="font-body text-sm text-on-surface-variant mt-2 leading-6">
              {tr(basicTracking ? 'plan.basicTrackingBody' : 'plan.selectSupportedBody')}
            </Text>
            <TouchableOpacity
              className="mt-4 min-h-12 rounded-lg bg-primary items-center justify-center px-4"
              onPress={() => navigation.navigate(basicTracking ? 'ServiceLogs' : 'VehicleSettings')}
            >
              <Text className="font-label font-bold text-on-primary">
                {tr(basicTracking ? 'plan.openServiceHistory' : 'plan.openSettings')}
              </Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            {basicTracking ? (
              <View className="rounded-xl border border-primary/30 bg-primary/10 p-4 mt-6 flex-row items-start gap-3">
                <MaterialIcons name="tune" size={22} color="#a9c7ff" />
                <View className="flex-1">
                  <Text className="font-headline text-base font-bold text-on-surface">{tr('plan.basicTrackingTitle')}</Text>
                  <Text className="font-body text-xs text-on-surface-variant mt-1 leading-5">{tr('plan.basicTrackingBody')}</Text>
                </View>
              </View>
            ) : null}
            {initialServiceCheckpoint ? (
              <View className="mt-6">
                <InitialServiceCheckpointCard checkpoint={initialServiceCheckpoint} onPress={openMaintenanceHistorySetup} />
              </View>
            ) : null}
            {dueNow.length > 0 ? (
              <View className="mt-7">
                <Text className="font-label text-xs font-bold uppercase tracking-[0.16em] text-error mb-3">{tr('maintenance.dueNow')}</Text>
                <View className="gap-2">{dueNow.map(renderPriorityRow)}</View>
              </View>
            ) : null}

            {comingUp.length > 0 ? (
              <View className="mt-7">
                <Text className="font-label text-xs font-bold uppercase tracking-[0.16em] text-amber-400 mb-3">{tr('plan.comingUp')}</Text>
                <View className="gap-2">{comingUp.map(renderPriorityRow)}</View>
              </View>
            ) : null}

            {activeInitialTasks.length > 0 ? (
              <Text className="font-body text-xs text-secondary mt-6 px-1">
                {tr('plan.breakInNotice')}
              </Text>
            ) : null}

            {renderSection('scheduled', tr('maintenance.section.scheduled'))}
            {renderSection('wear', tr('maintenance.section.wear'))}
            {renderSection('checks', tr('maintenance.section.checks'))}

            {trackableGroups.length > 0 ? (
              <View className="mt-7">
                <Text className="font-label text-xs font-bold uppercase tracking-[0.16em] text-secondary mb-1">{tr('plan.trackMore')}</Text>
                <Text className="font-body text-xs text-on-surface-variant mb-3">{tr('plan.trackMoreBody')}</Text>
                <View className="gap-2">
                  {trackableGroups.map((group) => (
                    <View key={group.id} className="min-h-16 rounded-xl border border-outline-variant/15 bg-surface-container-lowest px-4 py-3 flex-row items-center gap-3">
                      <View className="w-10 h-10 rounded-lg bg-surface-container-high items-center justify-center">
                        <MaterialIcons name={group.icon} size={20} color="#8e9196" />
                      </View>
                      <View className="flex-1 min-w-0">
                        <Text className="font-headline text-sm font-bold text-on-surface">{group.label}</Text>
                        <Text className="font-body text-xs text-on-surface-variant mt-1">{tr('plan.notTracked')}</Text>
                      </View>
                      <TouchableOpacity
                        accessibilityRole="button"
                        accessibilityLabel={tr('plan.trackA11y', { label: group.label })}
                        className="min-h-10 rounded-lg bg-primary/15 border border-primary/30 px-3 flex-row items-center gap-1"
                        onPress={() => void trackTasks(groupTasks(group, untrackedTasks))}
                      >
                        <MaterialIcons name="add" size={16} color="#a9c7ff" />
                        <Text className="font-label text-xs font-bold text-primary">{tr('plan.track')}</Text>
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
              </View>
            ) : null}

            <View className="mt-7">
              <Text className="font-label text-xs font-bold uppercase tracking-[0.16em] text-secondary mb-3">{tr('history.screenTitle')}</Text>
              <TouchableOpacity
                accessibilityRole="button"
                className="min-h-16 rounded-xl border border-outline-variant/15 bg-surface-container-lowest px-4 py-3 flex-row items-center gap-3"
                onPress={() => navigation.navigate('ServiceLogs')}
              >
                <View className="w-10 h-10 rounded-lg bg-primary/10 items-center justify-center">
                  <MaterialIcons name="history" size={21} color="#a9c7ff" />
                </View>
                <View className="flex-1">
                  <Text className="font-headline text-sm font-bold text-on-surface">{tr('history.open')}</Text>
                  <Text className="font-body text-xs text-on-surface-variant mt-1">{tr('plan.historyBody')}</Text>
                </View>
                <MaterialIcons name={isRTL ? 'chevron-left' : 'chevron-right'} size={22} color="#8e9196" />
              </TouchableOpacity>
            </View>

          </>
        )}
      </ScrollView>

      <MaintenanceRecordForm
        actionOptions={recordOption}
        actionsLocked
        advisoryText={recordingMode === 'previous' ? tr('oil.historyUnknownBody') : undefined}
        currentOdometerKm={vehicle.current_mileage}
        initialValue={recordingTask && recordOption[0] ? {
          selectedActions: recordOption,
          title: recordOption[0].label,
        } : undefined}
        onClose={() => !saving && setRecordingTask(null)}
        onSubmit={(draft) => recordingTask ? persistRecord(recordingTask, draft) : undefined}
        saving={saving}
        submitLabel={tr('record.saveMaintenance')}
        title={recordingTask ? naturalRecordActionLabel(recordingTask) : tr('record.formTitle')}
        visible={recordingTask !== null}
      />
      <MaintenanceActionMenu
        onClose={() => setMenuTask(null)}
        onCustomize={(task) => navigation.navigate('MaintenanceReminderCustomization', { ruleId: task.ruleId })}
        onHistory={() => navigation.navigate('ServiceLogs')}
        onRecord={(task, mode) => {
          setRecordingMode(mode);
          setRecordingTask(task);
        }}
        onRestore={restoreOriginalSchedule}
        onStopTracking={stopTrackingTask}
        task={menuTask}
      />
    </AppScreen>
  );
}
