import React, { useCallback, useMemo, useState } from 'react';
import { Alert, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import ActiveVehicleChip from '../components/ActiveVehicleChip';
import MaintenanceRecordForm, {
  type MaintenanceRecordActionOption,
  type MaintenanceRecordDraft,
  type MaintenanceRecordFormInitialValue,
} from '../components/MaintenanceRecordForm';
import AppIconButton from '../components/ui/AppIconButton';
import AppListContinuation from '../components/ui/AppListContinuation';
import AppScreen from '../components/ui/AppScreen';
import AppTopBar from '../components/ui/AppTopBar';
import ScreenLoadState from '../components/ui/ScreenLoadState';
import useFocusedLoader from '../hooks/useFocusedLoader';
import useIncrementalRecordLimit from '../hooks/useIncrementalRecordLimit';
import {
  maintenanceComponentGroup,
  naturalMaintenanceActionLabel,
} from '../maintenance/presentation';
import { getMaintenanceProfileForSelection } from '../maintenance/profiles';
import type { InspectionResult, MaintenanceAction, ScooterMaintenanceProfile } from '../maintenance/types';
import type { ServiceLogsNavigationProp } from '../navigation/types';
import {
  createMaintenanceRecord,
  deleteMaintenanceRecord,
  getServiceLogs,
  getVehicleProfile,
  MaintenanceDuplicateError,
  updateMaintenanceRecord,
  type CreateMaintenanceRecordInput,
  type MaintenanceRecordActionInput,
} from '../services/database';
import { syncMaintenanceNotifications } from '../services/notifications';
import { useAppStore } from '../store/useAppStore';
import type { ServiceLog, VehicleProfile } from '../types/database.types';

const CURATED_RULE_IDS = [
  'engine-oil.replace.recurring-1000km',
  'transmission-oil.replace.recurring-5000km-5mo',
  'air-cleaner-element.inspect.recurring-1000km-1mo',
  'air-cleaner-element.clean.if-needed',
  'air-cleaner-element.replace.if-necessary',
  'brake-pads.inspect.recurring-1000km-1mo',
  'tires.inspect.recurring-1000km-1mo',
  'drive-belt-rollers.inspect.recurring-6000km-6mo',
  'general-fasteners.inspect.recurring-1000km-1mo',
] as const;

const GENERAL_INSPECTION_OPTION: MaintenanceRecordActionOption = {
  ruleId: 'general-workshop-inspection',
  componentId: 'general-workshop-inspection',
  action: 'inspect',
  label: 'General workshop inspection',
};

type TimelineGroup = {
  key: string;
  rows: ServiceLog[];
  primary: ServiceLog;
};

type EditorState = {
  mode: 'maintenance' | 'other';
  group: TimelineGroup | null;
} | null;

function groupLogs(logs: ServiceLog[]): TimelineGroup[] {
  const groups = new Map<string, TimelineGroup>();
  for (const log of logs) {
    const key = log.service_package_id ? `package:${log.service_package_id}` : `record:${log.id}`;
    const existing = groups.get(key);
    if (existing) existing.rows.push(log);
    else groups.set(key, { key, rows: [log], primary: log });
  }
  return [...groups.values()];
}

function looksInternal(value: string): boolean {
  return /\.pdf\b|\bpage\s*\d+|profile[_ -]?version|release[_ -]?candidate|manual[_ -]?id|(?:^|\s)[a-z0-9]+(?:-[a-z0-9]+){1,}\.(?:inspect|replace|clean|adjust|test|tighten|lubricate)\./i.test(value);
}

function safeStoredText(value: string | null | undefined, fallback: string): string {
  const text = value?.trim();
  return !text || looksInternal(text) ? fallback : text;
}

function logActionLabel(log: ServiceLog): string {
  if (!log.maintenance_component_id || !log.maintenance_action) {
    return safeStoredText(log.title, 'Older maintenance record');
  }
  const component = maintenanceComponentGroup(log.maintenance_component_id);
  const action = naturalMaintenanceActionLabel({
    componentId: log.maintenance_component_id,
    action: log.maintenance_action as MaintenanceAction,
  });
  if (component.key === 'engine-oil' || component.key === 'gear-oil' || component.key === 'air-filter') return action;
  return `${component.label} - ${action.toLowerCase()}`;
}

function displayTitle(group: TimelineGroup): string {
  if (group.primary.service_package_title) {
    return safeStoredText(group.primary.service_package_title, 'Workshop maintenance');
  }
  return logActionLabel(group.primary);
}

function affectedActionLabels(group: TimelineGroup): string[] {
  return [...new Set(group.rows.map(logActionLabel))];
}

function editAdvisory(group: TimelineGroup): string {
  const actions = affectedActionLabels(group);
  const scope = actions.length > 1
    ? `Changes apply to all ${actions.length} actions in this package.`
    : 'Changes apply to this maintenance action.';
  return `${scope} Changing its actions, date, or mileage may recalculate maintenance reminders.`;
}

function optionForRule(
  profile: ScooterMaintenanceProfile,
  ruleId: string
): MaintenanceRecordActionOption | null {
  const rule = profile.rules.find((candidate) => candidate.id === ruleId && candidate.applicable);
  if (!rule) return null;
  return {
    ruleId: rule.id,
    componentId: rule.componentId,
    action: rule.action,
    label: naturalMaintenanceActionLabel({ componentId: rule.componentId, action: rule.action }),
    requiresConditionResult: Boolean(rule.conditionFollowUp),
  };
}

function curatedActionOptions(profile: ScooterMaintenanceProfile | null): MaintenanceRecordActionOption[] {
  if (!profile) return [GENERAL_INSPECTION_OPTION];
  return [
    ...CURATED_RULE_IDS.map((ruleId) => optionForRule(profile, ruleId)).filter(
      (option): option is MaintenanceRecordActionOption => option !== null
    ),
    GENERAL_INSPECTION_OPTION,
  ];
}

function optionForStoredLog(
  log: ServiceLog,
  profile: ScooterMaintenanceProfile | null
): MaintenanceRecordActionOption | null {
  if (!log.maintenance_component_id || !log.maintenance_action) return null;
  if (
    log.maintenance_component_id === GENERAL_INSPECTION_OPTION.componentId
    && log.maintenance_action === GENERAL_INSPECTION_OPTION.action
  ) return GENERAL_INSPECTION_OPTION;
  if (log.maintenance_rule_id && profile) {
    const profileOption = optionForRule(profile, log.maintenance_rule_id);
    if (profileOption) return profileOption;
  }
  return {
    ruleId: log.maintenance_rule_id ?? `stored:${log.maintenance_component_id}:${log.maintenance_action}`,
    componentId: log.maintenance_component_id,
    action: log.maintenance_action as MaintenanceAction,
    label: logActionLabel(log),
    requiresConditionResult: log.inspection_result !== null && log.inspection_result !== undefined,
  };
}

function editorOptions(
  editor: EditorState,
  profile: ScooterMaintenanceProfile | null,
  baseOptions: MaintenanceRecordActionOption[]
): MaintenanceRecordActionOption[] {
  if (!editor || editor.mode === 'other') return [];
  const current = editor.group?.rows
    .map((row) => optionForStoredLog(row, profile))
    .filter((option): option is MaintenanceRecordActionOption => option !== null) ?? [];
  return [...new Map([...baseOptions, ...current].map((option) => [option.ruleId, option])).values()];
}

function initialValueForEditor(editor: EditorState, options: MaintenanceRecordActionOption[]): MaintenanceRecordFormInitialValue | undefined {
  if (!editor?.group) return undefined;
  const { primary, rows } = editor.group;
  const selectedIds = new Set(rows.map((row) =>
    row.maintenance_rule_id ?? (row.maintenance_component_id && row.maintenance_action
      ? `stored:${row.maintenance_component_id}:${row.maintenance_action}`
      : '')
  ));
  if (rows.some((row) => row.maintenance_component_id === 'general-workshop-inspection' && row.maintenance_action === 'inspect')) {
    selectedIds.add(GENERAL_INSPECTION_OPTION.ruleId);
  }
  const conditionResults: Partial<Record<string, InspectionResult>> = {};
  for (const row of rows) {
    const id = row.maintenance_rule_id ?? (row.maintenance_component_id && row.maintenance_action
      ? `stored:${row.maintenance_component_id}:${row.maintenance_action}`
      : '');
    if (id && row.inspection_result) conditionResults[id] = row.inspection_result as InspectionResult;
  }
  return {
    title: displayTitle(editor.group),
    serviceDate: primary.maintenance_date_confidence === 'unknown' ? null : primary.date,
    mileageKm: primary.maintenance_mileage_confidence === 'unknown' ? null : primary.mileage,
    selectedActions: options.filter((option) => selectedIds.has(option.ruleId)),
    conditionResults,
    cost: primary.cost,
    notes: primary.maintenance_migration_status === 'legacy_unmapped' ? '' : primary.notes,
    serviceProvider: primary.service_provider ?? '',
    oilBrand: primary.oil_brand ?? '',
    oilType: primary.oil_type as MaintenanceRecordFormInitialValue['oilType'],
    oilViscosity: primary.oil_viscosity ?? '',
    mechanicRecommendation: primary.oil_notes ?? '',
  };
}

function actionInput(
  option: MaintenanceRecordActionOption,
  draft: MaintenanceRecordDraft,
  profile: ScooterMaintenanceProfile | null
): MaintenanceRecordActionInput {
  const rule = profile?.rules.find((candidate) => candidate.id === option.ruleId);
  const inspectionResult = draft.conditionResults[option.ruleId] ?? null;
  if (rule) return {
    ruleId: rule.id,
    action: rule.action,
    title: option.label,
    inspectionResult,
  };
  return {
    ruleId: null,
    componentId: option.componentId,
    action: option.action,
    title: option.label,
    category: option.componentId === 'general-workshop-inspection'
      ? 'general_safety_inspections'
      : 'general',
    inspectionResult,
  };
}

function recordInput(
  draft: MaintenanceRecordDraft,
  mode: 'maintenance' | 'other',
  profile: ScooterMaintenanceProfile | null,
  allowDuplicate = false
): CreateMaintenanceRecordInput {
  const common = {
    serviceDate: draft.serviceDate,
    mileageKm: draft.mileageKm,
    dateConfidence: draft.serviceDate === null ? 'unknown' as const : 'confirmed' as const,
    mileageConfidence: draft.mileageKm === null ? 'unknown' as const : 'confirmed' as const,
    notes: draft.notes,
    cost: draft.cost,
    serviceProvider: draft.serviceProvider,
    oil: {
      brand: draft.oilBrand,
      type: draft.oilType,
      viscosity: draft.oilViscosity,
      notes: draft.mechanicRecommendation,
    },
    allowDuplicate,
  };
  if (mode === 'other') return {
    ...common,
    actions: [],
    otherWork: { title: draft.title, category: 'other_work' },
    recordSource: 'manual_entry',
  };
  return {
    ...common,
    actions: draft.selectedActions.map((option) => actionInput(option, draft, profile)),
    packageTitle: draft.selectedActions.length > 1 ? draft.title : null,
    recordSource: draft.selectedActions.length > 1 ? 'service_package' : 'manual_entry',
  };
}

export default function ServiceLogsScreen() {
  const navigation = useNavigation<ServiceLogsNavigationProp>();
  const maintenanceReminders = useAppStore((state) => state.maintenanceReminders);
  const [logs, setLogs] = useState<ServiceLog[]>([]);
  const [vehicle, setVehicle] = useState<VehicleProfile | null>(null);
  const [profile, setProfile] = useState<ScooterMaintenanceProfile | null>(null);
  const [editor, setEditor] = useState<EditorState>(null);
  const [saving, setSaving] = useState(false);
  const groups = useMemo(() => groupLogs(logs), [logs]);
  const { canLoadOlder, limit, loadOlder } = useIncrementalRecordLimit(groups.length);

  const load = useCallback(async (isCurrent: () => boolean) => {
    const [records, activeVehicle] = await Promise.all([getServiceLogs({ limit }), getVehicleProfile()]);
    if (!activeVehicle) throw new Error('The active vehicle could not be found.');
    if (!isCurrent()) return;
    setLogs(records);
    setVehicle(activeVehicle);
    setProfile(getMaintenanceProfileForSelection({
      brandId: activeVehicle.scooter_brand_id,
      modelId: activeVehicle.scooter_model_id,
      versionId: activeVehicle.scooter_version_id,
      variantId: activeVehicle.scooter_variant_id,
    }));
  }, [limit]);
  const { error, loading, reload } = useFocusedLoader(
    load,
    'Maintenance history could not be loaded. Your records were not changed.',
    'Failed to load maintenance history:'
  );

  const baseOptions = useMemo(() => curatedActionOptions(profile), [profile]);
  const options = useMemo(() => editorOptions(editor, profile, baseOptions), [baseOptions, editor, profile]);
  const initialValue = useMemo(() => initialValueForEditor(editor, options), [editor, options]);

  const closeEditor = () => {
    if (!saving) setEditor(null);
  };

  const persist = async (draft: MaintenanceRecordDraft, allowDuplicate = false) => {
    if (!editor) return;
    setSaving(true);
    const input = recordInput(draft, editor.mode, profile, allowDuplicate);
    try {
      if (editor.group) await updateMaintenanceRecord(editor.group.primary.id, input);
      else await createMaintenanceRecord(input);
      setEditor(null);
      await reload();
      await syncMaintenanceNotifications(maintenanceReminders);
    } catch (saveError) {
      if (saveError instanceof MaintenanceDuplicateError && !allowDuplicate) {
        Alert.alert(
          'Possible duplicate',
          'A record for the same action, date, and mileage already exists. Save another copy only if both records are intentional.',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Save anyway', onPress: () => void persist(draft, true) },
          ]
        );
      } else {
        Alert.alert(
          'Maintenance not saved',
          saveError instanceof Error ? saveError.message : 'Your existing records were not changed.'
        );
      }
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = (group: TimelineGroup) => {
    const actions = affectedActionLabels(group);
    const affected = actions.length === 1
      ? `Action: ${actions[0]}.`
      : `Actions: ${actions.join(', ')}.`;
    Alert.alert(
      'Delete maintenance record?',
      `Delete "${displayTitle(group)}"?\n\n${affected}\n\nMaintenance reminders for these actions will be recalculated.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteMaintenanceRecord(group.primary.id);
              await reload();
              await syncMaintenanceNotifications(maintenanceReminders);
            } catch (deleteError) {
              Alert.alert('Record not deleted', deleteError instanceof Error ? deleteError.message : 'Try again.');
            }
          },
        },
      ]
    );
  };

  if (loading || error || !vehicle) {
    return <ScreenLoadState error={error} loading={loading} onBack={() => navigation.goBack()} onRetry={reload} title="MAINTENANCE HISTORY" />;
  }

  return (
    <AppScreen edges={['top', 'bottom', 'left', 'right']}>
      <AppTopBar
        leading={<AppIconButton accessibilityLabel="Go back" icon="arrow-back" onPress={() => navigation.goBack()} />}
        tone="subtle"
      >
        <Text className="font-headline text-sm font-bold text-on-surface">Maintenance history</Text>
      </AppTopBar>

      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 24, paddingBottom: 36 }}>
        <ActiveVehicleChip />
        <Text accessibilityRole="header" className="font-headline text-3xl font-bold text-on-surface mt-3">Maintenance history</Text>
        <Text className="font-body text-sm text-on-surface-variant mt-2">
          {groups.length === 0 ? 'No maintenance recorded yet.' : `Latest maintenance record: ${displayTitle(groups[0])}`}
        </Text>

        <View className="flex-row gap-3 mt-6">
          <TouchableOpacity
            accessibilityRole="button"
            className="min-h-12 flex-1 rounded-xl bg-primary items-center justify-center px-3"
            onPress={() => setEditor({ mode: 'maintenance', group: null })}
          >
            <Text className="font-label text-sm font-bold text-on-primary">Add maintenance</Text>
          </TouchableOpacity>
          <TouchableOpacity
            accessibilityRole="button"
            className="min-h-12 flex-1 rounded-xl border border-outline-variant/30 bg-surface-container-low items-center justify-center px-3"
            onPress={() => setEditor({ mode: 'other', group: null })}
          >
            <Text className="font-label text-sm font-bold text-on-surface">Other work</Text>
          </TouchableOpacity>
        </View>

        <View className="gap-3 mt-7">
          {groups.map((group) => {
            const primary = group.primary;
            const isLegacy = primary.maintenance_migration_status === 'legacy_unmapped'
              || primary.maintenance_migration_status === 'legacy_needs_confirmation';
            const safeNotes = isLegacy ? '' : safeStoredText(primary.notes, '');
            return (
              <View key={group.key} className="rounded-2xl border border-outline-variant/20 bg-surface-container-low p-4">
                <View className="flex-row items-start gap-3">
                  <View className="w-11 h-11 rounded-xl bg-primary/10 items-center justify-center">
                    <MaterialIcons color="#a9c7ff" name="build-circle" size={23} />
                  </View>
                  <View className="flex-1">
                    <Text className="font-headline text-base font-bold text-on-surface">{displayTitle(group)}</Text>
                    <Text className="font-body text-xs text-on-surface-variant mt-1">
                      {primary.maintenance_date_confidence === 'unknown' || !primary.date ? 'Date unknown' : primary.date}
                      {' - '}
                      {primary.maintenance_mileage_confidence === 'unknown' || primary.sets_odometer_baseline === 0
                        ? 'Mileage unknown'
                        : `${primary.mileage.toLocaleString()} km`}
                    </Text>
                  </View>
                </View>

                {group.rows.length > 1 ? (
                  <View className="mt-3 gap-1.5">
                    {group.rows.map((row) => (
                      <View key={row.id} className="flex-row items-center gap-2">
                        <MaterialIcons color="#8e9196" name="check" size={15} />
                        <Text className="font-body text-xs text-on-surface-variant flex-1">{logActionLabel(row)}</Text>
                      </View>
                    ))}
                  </View>
                ) : null}

                {primary.service_provider ? <Text className="font-body text-xs text-on-surface-variant mt-3">Workshop: {primary.service_provider}</Text> : null}
                {safeNotes ? <Text className="font-body text-xs text-on-surface-variant mt-2">{safeNotes}</Text> : null}
                {primary.cost !== null ? <Text className="font-label text-xs text-primary mt-2">{primary.cost.toLocaleString()} EGP</Text> : null}

                <View className="flex-row gap-2 mt-4">
                  <TouchableOpacity
                    accessibilityLabel={`Edit ${displayTitle(group)}`}
                    accessibilityRole="button"
                    className="min-h-11 flex-1 rounded-lg bg-surface-container-high items-center justify-center"
                    onPress={() => setEditor({ mode: primary.maintenance_component_id || primary.maintenance_rule_id ? 'maintenance' : 'other', group })}
                  >
                    <Text className="font-label text-xs font-bold text-on-surface">Edit</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    accessibilityLabel={`Delete ${displayTitle(group)}`}
                    accessibilityRole="button"
                    className="min-h-11 flex-1 rounded-lg border border-error/30 items-center justify-center"
                    onPress={() => confirmDelete(group)}
                  >
                    <Text className="font-label text-xs font-bold text-error">Delete</Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          })}
        </View>
        <AppListContinuation onPress={loadOlder} visible={canLoadOlder} />
      </ScrollView>

      <MaintenanceRecordForm
        actionOptions={options}
        advisoryText={editor?.group ? editAdvisory(editor.group) : undefined}
        allowMultipleActions={editor?.mode === 'maintenance'}
        currentOdometerKm={vehicle.current_mileage}
        initialValue={initialValue}
        onClose={closeEditor}
        onSubmit={persist}
        saving={saving}
        submitLabel={editor?.group ? 'Save changes' : editor?.mode === 'other' ? 'Save other work' : 'Save maintenance'}
        title={editor?.group ? 'Edit maintenance record' : editor?.mode === 'other' ? 'Other work' : 'Add maintenance'}
        visible={editor !== null}
      />
    </AppScreen>
  );
}
