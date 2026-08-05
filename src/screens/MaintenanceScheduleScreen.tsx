import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { TabParamList, VitalsNavigationProp } from '../navigation/types';
import MaintenanceRecordForm, {
  type MaintenanceRecordActionOption,
  type MaintenanceRecordDraft,
} from '../components/MaintenanceRecordForm';
import MaintenanceActionMenu from '../components/MaintenanceActionMenu';
import MaintenanceActionRow from '../components/MaintenanceActionRow';
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
  projectMaintenanceTasks,
} from '../maintenance/scheduler';
import {
  maintenanceComponentGroup,
  maintenanceGroupSummary,
  maintenanceNearestActionSummary,
  naturalMaintenanceActionLabel,
  naturalRecordActionLabel,
} from '../maintenance/presentation';
import {
  maintenanceHistoryByAction,
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

type SectionId = 'scheduled' | 'checks' | 'wear';

type ComponentGroup = {
  id: string;
  label: string;
  description: string;
  icon: keyof typeof MaterialIcons.glyphMap;
  section: SectionId;
};

const COMPONENT_GROUPS: ComponentGroup[] = [
  {
    id: 'engine-oil',
    label: 'Engine oil',
    description: 'Oil level, condition, replacement, and records',
    icon: 'opacity',
    section: 'scheduled',
  },
  {
    id: 'gear-oil',
    label: 'Gear oil',
    description: 'Replacement and transmission leakage checks',
    icon: 'settings',
    section: 'scheduled',
  },
  {
    id: 'air-filter',
    label: 'Air filter',
    description: 'Inspection, cleaning, and paper-element replacement',
    icon: 'air',
    section: 'scheduled',
  },
  {
    id: 'spark-plug',
    label: 'Spark plug',
    description: 'Inspection and replacement',
    icon: 'bolt',
    section: 'scheduled',
  },
  {
    id: 'cvt',
    label: 'CVT / drive belt',
    description: 'Drive belt, rollers, and clutch inspection',
    icon: 'settings-input-component',
    section: 'scheduled',
  },
  {
    id: 'fuel-pump-filter',
    label: 'Fuel-pump filter',
    description: 'Scheduled filter replacement',
    icon: 'filter-alt',
    section: 'scheduled',
  },
  {
    id: 'cooling-system',
    label: 'Cooling system',
    description: 'Coolant replacement and leakage inspection',
    icon: 'ac-unit',
    section: 'scheduled',
  },
  {
    id: 'brakes',
    label: 'Brakes',
    description: 'Inspection and latest known condition',
    icon: 'do-not-disturb-on',
    section: 'wear',
  },
  {
    id: 'tires',
    label: 'Tires',
    description: 'Pressure, wear, damage, and latest condition',
    icon: 'trip-origin',
    section: 'wear',
  },
  {
    id: 'battery',
    label: 'Battery',
    description: 'Inspection, testing, condition, and replacement',
    icon: 'battery-charging-full',
    section: 'wear',
  },
  {
    id: 'steering',
    label: 'Steering',
    description: 'Steering bearing and handle checks',
    icon: 'device-hub',
    section: 'checks',
  },
  {
    id: 'suspension',
    label: 'Suspension',
    description: 'Shock absorber and suspension inspection',
    icon: 'device-hub',
    section: 'checks',
  },
  {
    id: 'nuts-and-bolts',
    label: 'Nuts and bolts',
    description: 'Engine and general fastener checks',
    icon: 'build',
    section: 'checks',
  },
  {
    id: 'main-side-stands',
    label: 'Main and side stands',
    description: 'Inspection and lubrication',
    icon: 'two-wheeler',
    section: 'checks',
  },
  {
    id: 'general-workshop-inspection',
    label: 'General workshop inspection',
    description: 'Engine, fuel, electrical, controls, stands, and emissions',
    icon: 'fact-check',
    section: 'checks',
  },
];

function groupForTask(task: MaintenanceTaskProjection): ComponentGroup {
  const definition = maintenanceComponentGroup(task.componentId);
  return COMPONENT_GROUPS.find((group) => group.id === definition.key)
    ?? COMPONENT_GROUPS.find((group) => group.id === 'general-workshop-inspection')!;
}

function groupTasks(
  group: ComponentGroup,
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
  if (task.reminderDisabled) return { label: 'Disabled by you', color: 'text-secondary', background: 'bg-secondary/15' };
  if (task.conditionResult === 'cleaning_needed') return { label: 'Cleaning needed', color: 'text-amber-400', background: 'bg-amber-500/15' };
  if (task.conditionResult === 'healthy' && task.status === 'upcoming') return { label: 'Healthy', color: 'text-primary', background: 'bg-primary/15' };
  if (task.status === 'overdue') return { label: 'Overdue', color: 'text-error', background: 'bg-error/15' };
  if (task.status === 'due') return { label: 'Due now', color: 'text-error', background: 'bg-error/15' };
  if (task.status === 'due_soon') return { label: 'Due soon', color: 'text-amber-400', background: 'bg-amber-500/15' };
  if (task.status === 'condition_attention') {
    if (task.conditionResult === 'replace_now') return { label: 'Replace now', color: 'text-error', background: 'bg-error/15' };
    if (task.conditionResult === 'replace_soon') return { label: 'Replace soon', color: 'text-amber-400', background: 'bg-amber-500/15' };
    if (task.conditionResult === 'service_soon') return { label: 'Service soon', color: 'text-amber-400', background: 'bg-amber-500/15' };
    return { label: 'Needs attention', color: 'text-amber-400', background: 'bg-amber-500/15' };
  }
  if (task.status === 'history_unknown_recommend_service') return { label: 'Last change unknown', color: 'text-secondary', background: 'bg-secondary/15' };
  if (task.status === 'history_unknown_request_record' || task.status === 'unknown') return { label: 'Last check unknown', color: 'text-secondary', background: 'bg-secondary/15' };
  if (task.status === 'historical_unverified') return { label: 'Past milestone', color: 'text-secondary', background: 'bg-secondary/15' };
  if (task.status === 'not_applicable') return { label: 'Not applicable', color: 'text-secondary', background: 'bg-secondary/15' };
  if (task.status === 'no_fixed_interval' || task.status === 'informational') return { label: 'By condition', color: 'text-secondary', background: 'bg-secondary/15' };
  return { label: 'Upcoming', color: 'text-primary', background: 'bg-primary/15' };
}

function taskTiming(task: MaintenanceTaskProjection): string {
  if (task.reminderDisabled) return 'Reminder disabled by you. The original schedule and history are preserved.';
  if (task.status === 'history_unknown_recommend_service') {
    return 'Last change unknown. Enter previous maintenance or consider servicing it now.';
  }
  if (task.status === 'history_unknown_request_record' || task.status === 'unknown') {
    return 'Last check unknown. Consider having it inspected.';
  }
  if (task.status === 'historical_unverified') {
    return 'This scooter was added after the initial-service stage.';
  }
  if (task.status === 'not_applicable') return 'Marked as not applicable in maintenance history.';
  if (task.status === 'condition_attention') return task.title;
  if (task.remainingKm !== null) {
    if (task.remainingKm < 0) return `${Math.abs(task.remainingKm).toLocaleString()} km overdue`;
    if (task.remainingKm === 0) return `Due at ${task.dueAtKm?.toLocaleString()} km`;
    return `${task.remainingKm.toLocaleString()} km remaining`;
  }
  if (task.remainingDays !== null) {
    if (task.remainingDays < 0) return `${Math.abs(task.remainingDays)} days overdue`;
    if (task.remainingDays === 0) return 'Due today';
    return `${task.remainingDays} days remaining`;
  }
  if (task.status === 'no_fixed_interval' || task.status === 'informational') {
    return 'Service based on inspection and condition.';
  }
  return task.title;
}

function representativeForGroup(
  group: ComponentGroup,
  tasks: MaintenanceTaskProjection[]
): MaintenanceTaskProjection | null {
  const sorted = [...tasks].sort(compareMaintenanceTaskPriority);
  if (group.id === 'engine-oil' || group.id === 'gear-oil') {
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
    ? 'A matching maintenance record already exists for this action, date, and mileage.'
    : `${count} matching maintenance records already exist for these actions, date, and mileage.`;
}

export default function MaintenanceScheduleScreen() {
  const navigation = useNavigation<VitalsNavigationProp>();
  const route = useRoute<RouteProp<TabParamList, 'Maintenance'>>();
  const remindersEnabled = useAppStore((state) => state.maintenanceReminders);
  const [vehicle, setVehicle] = useState<VehicleProfile | null>(null);
  const [maintenanceProfile, setMaintenanceProfile] = useState<ScooterMaintenanceProfile | null>(null);
  const [tasks, setTasks] = useState<MaintenanceTaskProjection[]>([]);
  const [trackedKeys, setTrackedKeys] = useState<Set<string>>(new Set());
  const [expandedGroupId, setExpandedGroupId] = useState<string | null>(null);
  const [menuTask, setMenuTask] = useState<MaintenanceTaskProjection | null>(null);
  const [recordingTask, setRecordingTask] = useState<MaintenanceTaskProjection | null>(null);
  const [saving, setSaving] = useState(false);

  const loadData = useCallback(async (isCurrent: () => boolean) => {
    const [profileData, events, preferences, historyStates] = await Promise.all([
      getVehicleProfile(),
      getMaintenanceEvents(),
      getMaintenancePreferences(),
      getMaintenanceHistoryStates(),
    ]);
    if (!isCurrent()) return;
    setVehicle(profileData);
    const domainProfile = getMaintenanceProfileForSelection(profileData ? {
      brandId: profileData.scooter_brand_id,
      modelId: profileData.scooter_model_id,
      versionId: profileData.scooter_version_id,
      variantId: profileData.scooter_variant_id,
    } : null);
    setMaintenanceProfile(domainProfile);
    if (!profileData || !domainProfile) {
      setTasks([]);
      return;
    }
    const schedulerPreferences = maintenancePreferencesForScheduler(preferences);
    const projected = projectMaintenanceTasks({
      profile: domainProfile,
      currentOdometerKm: profileData.current_mileage,
      vehicleId: profileData.id,
      now: new Date(),
      events,
      preferences: schedulerPreferences,
      historyByAction: maintenanceHistoryByAction(historyStates),
      defaultHistoryKnowledge: 'unknown',
      vehicleInServiceDate: profileData.created_at.slice(0, 10),
    });
    setTasks(projected);
    const trackingContext = { preferences: schedulerPreferences, events, vehicleId: profileData.id };
    setTrackedKeys(new Set(
      projected.filter((task) => isTaskTracked(task, trackingContext)).map((task) => task.key)
    ));
  }, []);

  const { error: loadError, loading, reload } = useFocusedLoader(
    loadData,
    'The maintenance plan could not be loaded. Your records were not changed.',
    'Failed to load maintenance:'
  );

  useEffect(() => {
    const openRuleId = route.params?.openRuleId;
    if (!openRuleId) return;
    const task = tasks.find((candidate) => candidate.ruleId === openRuleId);
    if (!task || task.status === 'historical_unverified') return;
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
        Alert.alert('Matching record found', duplicate, [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Save anyway',
            onPress: () => void persistRecord(task, draft, true),
          },
        ]);
        return;
      }
      console.error('Failed to record maintenance:', error);
      Alert.alert('Not saved', error instanceof Error ? error.message : 'The maintenance record was not changed.');
    } finally {
      setSaving(false);
    }
  }, [reload, remindersEnabled, saving, vehicle]);

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
              await reload();
              await syncMaintenanceNotifications(remindersEnabled);
            } catch (error) {
              Alert.alert('Not restored', error instanceof Error ? error.message : 'The original schedule was not restored.');
            }
          })(),
        },
      ]
    );
  }, [reload, remindersEnabled]);

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
      Alert.alert('Not added', error instanceof Error ? error.message : 'The service could not be added.');
    }
  }, [reload, remindersEnabled]);

  const stopTrackingTask = useCallback((task: MaintenanceTaskProjection) => {
    Alert.alert(
      'Stop tracking?',
      `${naturalMaintenanceActionLabel(task)} will be hidden from your plan and reminders. Your history is kept, and you can add it back anytime.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Stop tracking',
          style: 'destructive',
          onPress: () => void (async () => {
            try {
              setMenuTask(null);
              await setMaintenanceTracked(task.componentId, task.action, false);
              await reload();
              await syncMaintenanceNotifications(remindersEnabled);
            } catch (error) {
              Alert.alert('Not changed', error instanceof Error ? error.message : 'Tracking was not changed.');
            }
          })(),
        },
      ]
    );
  }, [reload, remindersEnabled]);

  if (loading || loadError || !vehicle) {
    return (
      <ScreenLoadState
        error={loadError ?? (!loading ? 'The active vehicle is unavailable.' : null)}
        loading={loading}
        onRetry={reload}
        title="MAINTENANCE"
      />
    );
  }

  const scooterSelection = selectionFromProfile(vehicle);
  const selectable = Boolean(maintenanceProfile);
  const setupNeeded = selectable && (
    vehicle.maintenance_history_level === undefined
    || vehicle.maintenance_history_level === 'not_asked'
    || vehicle.maintenance_history_level === 'skipped'
  );
  const trackedTasks = tasks.filter((task) => trackedKeys.has(task.key));
  const untrackedTasks = tasks.filter((task) =>
    !trackedKeys.has(task.key)
    && task.status !== 'historical_unverified'
    && task.status !== 'not_applicable'
  );
  const dueNow = deduplicateByGroup(trackedTasks.filter(isDueNow));
  const comingUp = deduplicateByGroup(trackedTasks.filter(isComingUp));
  const activeInitialTasks = trackedTasks.filter((task) =>
    task.isOneTime
    && task.status !== 'historical_unverified'
    && task.status !== 'not_applicable'
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
            <Text className="font-headline text-sm font-bold text-on-surface flex-1">{group.label}</Text>
            <Text className={`font-label text-[11px] font-bold ${status.color}`}>{status.label}</Text>
          </View>
          <Text className="font-body text-xs text-on-surface-variant mt-1" numberOfLines={2}>{taskTiming(task)}</Text>
        </View>
        <MaterialIcons name="chevron-right" size={21} color="#8e9196" />
      </TouchableOpacity>
    );
  };

  const renderComponentRow = (group: ComponentGroup, section: SectionId) => {
    const visibleTasks = groupTasks(group, trackedTasks).filter((task) =>
      task.status !== 'historical_unverified' && task.status !== 'not_applicable'
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
          <MaterialIcons name={group.id === 'engine-oil' || !expanded ? 'chevron-right' : 'expand-less'} size={22} color="#8e9196" />
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
    const groups = COMPONENT_GROUPS.filter((group) => group.section === id && groupTasks(group, trackedTasks).some((task) =>
      task.status !== 'historical_unverified' && task.status !== 'not_applicable'
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
        trailing={<AppIconButton accessibilityLabel="Open maintenance history" icon="history" onPress={() => navigation.navigate('ServiceLogs')} />}
      >
        <Text className="font-headline uppercase tracking-widest text-sm font-bold text-[#C0C0C0]">MAINTENANCE</Text>
      </AppTopBar>

      <ScrollView className="flex-1" contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 20, paddingBottom: 40 }}>
        <View className="px-1">
          <Text accessibilityRole="header" className="font-headline text-2xl font-bold text-on-surface">Maintenance plan</Text>
          <Text className="font-body text-xs text-on-surface-variant mt-2">
            {scooterSelection ? formatScooterSelection(scooterSelection) : 'Select your exact scooter to see its maintenance plan'}
          </Text>
          <Text className="font-body text-sm text-secondary mt-1">{vehicle.current_mileage.toLocaleString()} km</Text>
        </View>

        {!selectable ? (
          <View className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-5 mt-6">
            <MaterialIcons name="two-wheeler" size={24} color="#f59e0b" />
            <Text className="font-headline text-lg font-bold text-on-surface mt-3">Select a supported scooter</Text>
            <Text className="font-body text-sm text-on-surface-variant mt-2 leading-6">
              Choose the exact scooter version in Vehicle Settings to load its maintenance plan.
            </Text>
            <TouchableOpacity className="mt-4 min-h-12 rounded-lg bg-primary items-center justify-center px-4" onPress={() => navigation.navigate('VehicleSettings')}>
              <Text className="font-label font-bold text-on-primary">Open Vehicle Settings</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            {dueNow.length > 0 ? (
              <View className="mt-7">
                <Text className="font-label text-xs font-bold uppercase tracking-[0.16em] text-error mb-3">Due now</Text>
                <View className="gap-2">{dueNow.map(renderPriorityRow)}</View>
              </View>
            ) : null}

            {comingUp.length > 0 ? (
              <View className="mt-7">
                <Text className="font-label text-xs font-bold uppercase tracking-[0.16em] text-amber-400 mb-3">Coming up</Text>
                <View className="gap-2">{comingUp.map(renderPriorityRow)}</View>
              </View>
            ) : null}

            {activeInitialTasks.length > 0 ? (
              <Text className="font-body text-xs text-secondary mt-6 px-1">
                Relevant break-in actions are shown inside their component details.
              </Text>
            ) : null}

            {renderSection('scheduled', 'Scheduled maintenance')}
            {renderSection('wear', 'Wear and condition')}
            {renderSection('checks', 'General checks')}

            {untrackedTasks.length > 0 ? (
              <View className="mt-7">
                <Text className="font-label text-xs font-bold uppercase tracking-[0.16em] text-secondary mb-1">Track more services</Text>
                <Text className="font-body text-xs text-on-surface-variant mb-3">Add only what you maintain — the rest stays out of your plan. Logging a record adds its service automatically.</Text>
                <View className="gap-2">
                  {COMPONENT_GROUPS.filter((group) => groupTasks(group, untrackedTasks).length > 0).map((group) => (
                    <View key={group.id} className="min-h-16 rounded-xl border border-outline-variant/15 bg-surface-container-lowest px-4 py-3 flex-row items-center gap-3">
                      <View className="w-10 h-10 rounded-lg bg-surface-container-high items-center justify-center">
                        <MaterialIcons name={group.icon} size={20} color="#8e9196" />
                      </View>
                      <View className="flex-1 min-w-0">
                        <Text className="font-headline text-sm font-bold text-on-surface">{group.label}</Text>
                        <Text className="font-body text-xs text-on-surface-variant mt-1">Not tracked</Text>
                      </View>
                      <TouchableOpacity
                        accessibilityRole="button"
                        accessibilityLabel={`Track ${group.label}`}
                        className="min-h-10 rounded-lg bg-primary/15 border border-primary/30 px-3 flex-row items-center gap-1"
                        onPress={() => void trackTasks(groupTasks(group, untrackedTasks))}
                      >
                        <MaterialIcons name="add" size={16} color="#a9c7ff" />
                        <Text className="font-label text-xs font-bold text-primary">Track</Text>
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
              </View>
            ) : null}

            <View className="mt-7">
              <Text className="font-label text-xs font-bold uppercase tracking-[0.16em] text-secondary mb-3">Maintenance history</Text>
              <TouchableOpacity
                accessibilityRole="button"
                className="min-h-16 rounded-xl border border-outline-variant/15 bg-surface-container-lowest px-4 py-3 flex-row items-center gap-3"
                onPress={() => navigation.navigate('ServiceLogs')}
              >
                <View className="w-10 h-10 rounded-lg bg-primary/10 items-center justify-center">
                  <MaterialIcons name="history" size={21} color="#a9c7ff" />
                </View>
                <View className="flex-1">
                  <Text className="font-headline text-sm font-bold text-on-surface">View maintenance history</Text>
                  <Text className="font-body text-xs text-on-surface-variant mt-1">Review, edit, or delete saved maintenance.</Text>
                </View>
                <MaterialIcons name="chevron-right" size={22} color="#8e9196" />
              </TouchableOpacity>
            </View>

            {setupNeeded ? (
              <TouchableOpacity
                accessibilityRole="button"
                className="mt-7 min-h-20 rounded-xl border border-primary/30 bg-primary/10 p-4 flex-row items-center gap-3"
                onPress={() => navigation.navigate('MaintenanceHistorySetup')}
              >
                <MaterialIcons name="playlist-add-check" size={22} color="#a9c7ff" />
                <View className="flex-1">
                  <Text className="font-headline text-sm font-bold text-on-surface">Finish setting up your maintenance history</Text>
                  <Text className="font-body text-xs text-on-surface-variant mt-1">A few useful records make due dates more accurate.</Text>
                </View>
                <MaterialIcons name="chevron-right" size={22} color="#a9c7ff" />
              </TouchableOpacity>
            ) : null}
          </>
        )}
      </ScrollView>

      <MaintenanceRecordForm
        actionOptions={recordOption}
        actionsLocked
        currentOdometerKm={vehicle.current_mileage}
        initialValue={recordingTask && recordOption[0] ? {
          selectedActions: recordOption,
          title: recordOption[0].label,
        } : undefined}
        onClose={() => !saving && setRecordingTask(null)}
        onSubmit={(draft) => recordingTask ? persistRecord(recordingTask, draft) : undefined}
        saving={saving}
        submitLabel="Save maintenance"
        title={recordingTask ? naturalRecordActionLabel(recordingTask) : 'Maintenance record'}
        visible={recordingTask !== null}
      />
      <MaintenanceActionMenu
        onClose={() => setMenuTask(null)}
        onCustomize={(task) => navigation.navigate('MaintenanceReminderCustomization', { ruleId: task.ruleId })}
        onHistory={() => navigation.navigate('ServiceLogs')}
        onRecord={setRecordingTask}
        onRestore={restoreOriginalSchedule}
        onStopTracking={stopTrackingTask}
        task={menuTask}
      />
    </AppScreen>
  );
}
