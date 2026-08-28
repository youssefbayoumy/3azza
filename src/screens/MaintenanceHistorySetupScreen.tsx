import React, { useCallback, useRef, useState } from 'react';
import { Alert, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import MaintenanceRecordForm, { type MaintenanceRecordActionOption, type MaintenanceRecordDraft } from '../components/maintenance/MaintenanceRecordForm';
import AppIconButton from '../components/ui/AppIconButton';
import AppScreen from '../components/ui/AppScreen';
import AppTopBar from '../components/ui/AppTopBar';
import ScreenLoadState from '../components/ui/ScreenLoadState';
import useFocusedLoader from '../hooks/useFocusedLoader';
import type { MainStackNavigationProp } from '../navigation/types';
import { getMaintenanceHistoryStates, getVehicleProfile, resolveInitialServiceCheckpoint } from '../services/database';
import { syncMaintenanceNotifications } from '../services/notifications';
import { useAppStore } from '../store/useAppStore';
import { getMaintenanceProfileForSelection, isMaintenanceProfileSelectable } from '../maintenance/profiles';
import { getInitialServiceCheckpoint, type InitialServiceCheckpoint } from '../maintenance/initialServiceCheckpoint';
import { naturalMaintenanceActionLabel } from '../maintenance/presentation';
import type { MaintenanceAction } from '../maintenance/types';
import { formatNumber, localizeErrorMessage, useTranslation, type TranslationKey } from '../i18n';
import { selectionFromProfile } from '../catalog/scooterCatalog';

type RecordMode = 'completed' | 'partial' | null;

const ACTION_GROUPS: { key: TranslationKey; actions: MaintenanceAction[] }[] = [
  { key: 'initialService.groupReplace', actions: ['replace'] },
  { key: 'initialService.groupInspect', actions: ['inspect', 'condition_check', 'test', 'initial_service'] },
  { key: 'initialService.groupAdjust', actions: ['adjust', 'tighten'] },
  { key: 'initialService.groupCare', actions: ['clean', 'lubricate'] },
];

export default function MaintenanceHistorySetupScreen() {
  const { isRTL, locale, t } = useTranslation();
  const navigation = useNavigation<MainStackNavigationProp>();
  const maintenanceReminders = useAppStore((state) => state.maintenanceReminders);
  const [odometerKm, setOdometerKm] = useState<number | null>(null);
  const [hasSupportedProfile, setHasSupportedProfile] = useState<boolean | null>(null);
  const [checkpoint, setCheckpoint] = useState<InitialServiceCheckpoint | null>(null);
  const [recordMode, setRecordMode] = useState<RecordMode>(null);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);

  const load = useCallback(async (isCurrent: () => boolean) => {
    const [vehicle, historyStates] = await Promise.all([getVehicleProfile(), getMaintenanceHistoryStates()]);
    if (!vehicle) throw new Error(t('history.activeVehicleMissing'));
    if (!isCurrent()) return;
    const selection = selectionFromProfile(vehicle);
    const profile = getMaintenanceProfileForSelection(selection);
    setOdometerKm(vehicle.current_mileage);
    setHasSupportedProfile(isMaintenanceProfileSelectable(selection));
    setCheckpoint(profile && vehicle.purchase_condition === 'new'
      ? getInitialServiceCheckpoint({ profile, currentOdometerKm: vehicle.current_mileage, historyStates })
      : null);
  }, [t]);
  const { error, loading, reload } = useFocusedLoader(load, t('history.setupLoadError'), t('history.setupLoadLog'));

  const finish = async (operation: () => Promise<unknown>) => {
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    try {
      await operation();
      await syncMaintenanceNotifications(maintenanceReminders);
      navigation.goBack();
    } catch (saveError) {
      Alert.alert(t('initialService.saveFailed'), localizeErrorMessage(saveError, t('history.existingUnchanged')));
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  const actionOptions: MaintenanceRecordActionOption[] = checkpoint?.actions.map((action) => ({
    ruleId: action.ruleId,
    componentId: action.componentId,
    action: action.action,
    label: naturalMaintenanceActionLabel({ ...action, isOneTime: true }),
    requiresConditionResult: action.requiresConditionResult,
  })) ?? [];

  const persistPackage = async (draft: MaintenanceRecordDraft) => {
    if (!checkpoint) return;
    const resolution = draft.selectedActions.length === checkpoint.actions.length ? 'completed' : 'partial';
    const actionByRule = new Map(checkpoint.actions.map((action) => [action.ruleId, action]));
    await finish(() => resolveInitialServiceCheckpoint({
      resolution,
      record: {
        serviceDate: draft.serviceDate,
        mileageKm: draft.mileageKm,
        dateConfidence: draft.serviceDate === null ? 'unknown' : 'confirmed',
        mileageConfidence: draft.mileageKm === null ? 'unknown' : 'confirmed',
        notes: draft.notes,
        cost: draft.cost,
        serviceProvider: draft.serviceProvider || null,
        packageTitle: t('initialService.packageTitle'),
        oil: draft.selectedActions.some((action) => action.componentId === 'engine-oil' && action.action === 'replace') ? {
          brand: draft.oilBrand || null,
          type: draft.oilType,
          viscosity: draft.oilViscosity || null,
          notes: draft.mechanicRecommendation || null,
        } : undefined,
        actions: draft.selectedActions.map((option) => ({
          ruleId: option.ruleId,
          componentId: option.componentId,
          action: option.action,
          title: option.label,
          category: actionByRule.get(option.ruleId)?.category ?? 'general_safety_inspections',
          inspectionResult: draft.conditionResults[option.ruleId] ?? null,
        })),
      },
    }));
  };

  if (loading || error || odometerKm === null || hasSupportedProfile === null) {
    return <ScreenLoadState error={error} loading={loading} onBack={() => navigation.goBack()} onRetry={reload} title={t('history.screenTitle')} />;
  }

  const topBar = (
    <AppTopBar leading={<AppIconButton accessibilityLabel={t('common.back')} icon={isRTL ? 'arrow-forward' : 'arrow-back'} onPress={() => navigation.goBack()} />} tone="subtle">
      <Text className="font-headline text-sm font-bold text-on-surface">{t('history.screenTitle')}</Text>
    </AppTopBar>
  );

  if (!hasSupportedProfile) {
    return (
      <AppScreen edges={['top', 'bottom', 'left', 'right']}>
        {topBar}
        <View className="flex-1 px-6 pt-10">
          <View className="rounded-2xl border border-amber-500/35 bg-amber-500/10 p-5">
            <MaterialIcons color="#f59e0b" name="info-outline" size={26} />
            <Text accessibilityRole="header" className="font-headline text-xl font-bold text-on-surface mt-4">{t('history.unavailable')}</Text>
            <Text className="font-body text-sm text-on-surface-variant mt-2 leading-6">{t('history.unavailableBody')}</Text>
            <TouchableOpacity accessibilityRole="button" className="min-h-12 rounded-xl bg-primary items-center justify-center px-4 mt-5" onPress={() => navigation.replace('ServiceLogs')}>
              <Text className="font-label text-sm font-bold text-on-primary">{t('history.open')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </AppScreen>
    );
  }

  if (checkpoint) {
    return (
      <AppScreen edges={['top', 'bottom', 'left', 'right']}>
        {topBar}
        <ScrollView className="flex-1" contentContainerStyle={{ padding: 20, paddingBottom: 44 }}>
          <Text accessibilityRole="header" className="font-headline text-2xl font-bold text-on-surface">{t('initialService.questionTitle')}</Text>
          <Text className="font-body text-sm text-on-surface-variant mt-2 leading-6">{t('initialService.questionBody')}</Text>
          <View className="rounded-xl border border-outline-variant/20 bg-surface-container-lowest p-4 mt-6">
            <Text className="font-headline text-base font-bold text-on-surface">{t('initialService.checklistTitle')}</Text>
            <Text className="font-body text-xs text-on-surface-variant mt-1">{t('initialService.checklistBody', { count: formatNumber(checkpoint.actions.length, locale), km: formatNumber(checkpoint.milestoneKm, locale) })}</Text>
            {ACTION_GROUPS.map((group) => {
              const items = actionOptions.filter((option) => group.actions.includes(option.action));
              if (items.length === 0) return null;
              return (
                <View className="mt-4" key={group.key}>
                  <Text className="font-label text-xs font-bold uppercase tracking-wider text-secondary">{t(group.key)}</Text>
                  {items.map((item) => <Text className="font-body text-xs text-on-surface-variant mt-2" key={item.ruleId}>• {item.label}</Text>)}
                </View>
              );
            })}
          </View>
          <View className="gap-3 mt-6">
            {([
              ['completed', 'check-circle', 'initialService.completed', 'initialService.completedBody'],
              ['partial', 'rule', 'initialService.partial', 'initialService.partialBody'],
            ] as const).map(([value, icon, titleKey, bodyKey]) => (
              <TouchableOpacity accessibilityRole="button" className="min-h-20 rounded-xl border border-outline-variant/20 bg-surface-container-lowest p-4 flex-row items-center gap-3" disabled={saving} key={value} onPress={() => {
                setRecordMode(value);
              }}>
                <MaterialIcons color="#a9c7ff" name={icon} size={22} />
                <View className="flex-1">
                  <Text className="font-headline text-sm font-bold text-on-surface">{t(titleKey)}</Text>
                  <Text className="font-body text-xs text-on-surface-variant mt-1 leading-5">{t(bodyKey)}</Text>
                </View>
                <MaterialIcons color="#8e9196" name={isRTL ? 'chevron-left' : 'chevron-right'} size={22} />
              </TouchableOpacity>
            ))}
            <TouchableOpacity accessibilityHint={t('initialService.laterBody')} accessibilityRole="button" className="min-h-12 items-center justify-center" disabled={saving} onPress={() => navigation.goBack()}>
              <Text className="font-label text-sm font-bold text-on-surface-variant">{t('initialService.later')}</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
        <MaintenanceRecordForm actionOptions={actionOptions} allowMultipleActions advisoryText={recordMode === 'partial' ? t('initialService.chooseSome') : t('initialService.completedBody')} currentOdometerKm={odometerKm} initialValue={{ selectedActions: recordMode === 'completed' ? actionOptions : [], title: t('initialService.packageTitle') }} onClose={() => !saving && setRecordMode(null)} onSubmit={persistPackage} saving={saving} submitLabel={t('record.saveMaintenance')} title={t('initialService.packageTitle')} visible={recordMode !== null} />
      </AppScreen>
    );
  }

  return (
    <AppScreen edges={['top', 'bottom', 'left', 'right']}>
      {topBar}
      <View className="flex-1 px-6 pt-10">
        <View className="rounded-2xl border border-primary/30 bg-primary/10 p-5">
          <MaterialIcons color="#a9c7ff" name="check-circle-outline" size={26} />
          <Text accessibilityRole="header" className="font-headline text-xl font-bold text-on-surface mt-4">{t('initialService.startPlanTitle')}</Text>
          <Text className="font-body text-sm text-on-surface-variant mt-2 leading-6">{t('initialService.startPlanBody')}</Text>
          <TouchableOpacity accessibilityRole="button" className="min-h-12 rounded-xl bg-primary items-center justify-center px-4 mt-5" onPress={() => navigation.goBack()}>
            <Text className="font-label text-sm font-bold text-on-primary">{t('common.close')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </AppScreen>
  );
}
