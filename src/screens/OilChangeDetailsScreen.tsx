import React, { useCallback, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import {
  getLatestLogForServiceType,
  getServiceIntervals,
  getVehicleProfile,
} from '../services/database';
import type { MainStackNavigationProp } from '../navigation/types';
import type { ServiceInterval, ServiceLog, VehicleProfile } from '../types/database.types';
import { computePredictedOdometer, getIntervalProgress } from '../utils/maintenance';
import AppIconButton from '../components/ui/AppIconButton';
import AppTopBar from '../components/ui/AppTopBar';
import AppScreen from '../components/ui/AppScreen';
import ScreenLoadState from '../components/ui/ScreenLoadState';
import useFocusedLoader from '../hooks/useFocusedLoader';
import { selectionFromProfile } from '../catalog/scooterCatalog';
import OnlineManualAction from '../components/OnlineManualAction';
import SourceProvenance from '../components/SourceProvenance';
import {
  formatKnowledgeValue,
  getApplicableFluids,
  getApplicableMaintenance,
  getApplicableSpecifications,
  getConflictsForContext,
  getModelProfileForVehicle,
  getSelectedVariant,
} from '../modelData/modelKnowledge';

const AMBER = '#FFB100';

export default function OilChangeDetailsScreen() {
  const navigation = useNavigation<MainStackNavigationProp>();
  const [profile, setProfile] = useState<VehicleProfile | null>(null);
  const [oilInterval, setOilInterval] = useState<ServiceInterval | null>(null);
  const [latestOilLog, setLatestOilLog] = useState<ServiceLog | null>(null);

  const loadData = useCallback(async (isCurrent: () => boolean) => {
    const [profileData, intervalsData] = await Promise.all([
      getVehicleProfile(),
      getServiceIntervals(),
    ]);
    const oil = intervalsData.find((interval) => interval.canonical_task_id === 'engine-oil')
      ?? intervalsData.find((interval) => /engine oil|oil change/i.test(interval.name));
    const oilLog = oil ? await getLatestLogForServiceType(oil.name) : null;
    if (!isCurrent()) return;
    setProfile(profileData);
    setOilInterval(oil ?? null);
    setLatestOilLog(oilLog);
  }, []);

  const { error: loadError, loading, reload } = useFocusedLoader(
    loadData,
    'Oil-change details could not be loaded. Your service records were not changed.',
    'Failed to load oil-change details:'
  );

  if (loading || loadError) {
    return <ScreenLoadState error={loadError} loading={loading} onBack={() => navigation.goBack()} onRetry={reload} title="SERVICE_DETAILS" />;
  }

  const odometer = computePredictedOdometer(profile).mileage;
  const storedBaseline = oilInterval?.last_service_odometer_km ?? 0;
  const lastOilKm = oilInterval?.has_known_odometer_baseline === 1 ? storedBaseline : null;
  const intervalKm = oilInterval?.interval_km ?? null;
  const nextDueKm = lastOilKm !== null && intervalKm !== null ? lastOilKm + intervalKm : null;
  const intervalProgress = oilInterval ? getIntervalProgress(oilInterval, odometer) : null;
  const remainingKm = intervalProgress?.remainingKm ?? null;
  const modelProfile = getModelProfileForVehicle(profile);
  const selectedVariant = getSelectedVariant(profile, modelProfile);
  const manualOilTask = getApplicableMaintenance(profile).find((task) => task.canonicalId === 'engine-oil');
  const oilSpecifications = getApplicableSpecifications(profile);
  const oilFacts = [...oilSpecifications.shared, ...oilSpecifications.exactVariant]
    .filter((item) => /oil|lubric|viscos/i.test(item.label));
  const oilFluidRecords = getApplicableFluids(profile)
    .filter((record) => /oil|lubric|viscos/i.test(`${record.subject} ${formatKnowledgeValue(record.value)}`));
  const oilConflicts = getConflictsForContext(profile).filter((conflict) =>
    /oil|lubric|viscos/i.test(`${conflict.subject} ${formatKnowledgeValue(conflict.value)}`)
  );
  const status = intervalProgress?.status === 'overdue'
    ? 'OVERDUE'
    : intervalProgress?.status === 'due-soon'
      ? 'DUE SOON'
      : intervalProgress?.status === 'optimal'
        ? 'TRACKED'
        : intervalProgress?.status === 'manual'
          ? 'MANUAL'
          : 'NOT SET';

  return (
    <AppScreen edges={['top', 'bottom', 'left', 'right']}>
      <AppTopBar
        leading={<AppIconButton accessibilityLabel="Go back" icon="arrow-back" onPress={() => navigation.goBack()} />}
        trailing={<Text className="text-[#C0C0C0] font-bold tracking-tighter">3AZZA</Text>}
      >
        <Text className="font-headline uppercase tracking-widest text-sm text-[#a9c7ff]" numberOfLines={1}>SERVICE DETAILS</Text>
      </AppTopBar>

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 16, paddingBottom: 32 }}
      >
        <View className="gap-4 border-b border-outline-variant/20 pb-4 mb-8">
          <View>
            <Text className="font-label text-xs uppercase tracking-widest text-secondary mb-1">Maintenance Type</Text>
            <Text className="font-headline text-4xl font-bold tracking-tight text-on-surface uppercase">Oil Change</Text>
            <Text className="font-body text-xs text-secondary/70 mt-2">{profile?.name ?? 'Active vehicle'}</Text>
            {modelProfile ? (
              <Text className="font-body text-xs text-on-surface-variant mt-1">
                {modelProfile.brandName} {modelProfile.modelName} · {selectedVariant?.name ?? (modelProfile.requiresVariant ? 'variant not selected' : modelProfile.manualYears)}
              </Text>
            ) : null}
          </View>
          <View className="items-start">
            <Text className="font-label text-xs uppercase tracking-widest text-secondary mb-1">Status</Text>
            <View className={`px-3 py-1 border rounded-full ${status === 'OVERDUE' ? 'bg-error/10 border-error/40' : 'bg-primary-container border-primary/20'}`}>
              <Text className={`font-label text-xs font-bold ${status === 'OVERDUE' ? 'text-error' : 'text-primary'}`}>{status}</Text>
            </View>
          </View>
        </View>

        <View className="p-4 rounded-xl mb-8" style={{ backgroundColor: AMBER }}>
          <View className="flex-row items-baseline justify-between gap-4 py-2 border-b border-black/10">
            <Text className="font-label text-xs font-extrabold text-[#2f3131] uppercase flex-1">Last Date</Text>
            <Text className="font-headline text-lg font-bold text-[#2f3131] text-right">{latestOilLog?.date ?? 'No log'}</Text>
          </View>
          <View className="flex-row items-baseline justify-between gap-4 py-2 border-b border-black/10">
            <Text className="font-label text-xs font-extrabold text-[#2f3131] uppercase flex-1">Next Due</Text>
            <View className="flex-row items-baseline gap-1">
              <Text className="font-headline text-2xl font-bold text-[#2f3131]">{nextDueKm?.toLocaleString() ?? '—'}</Text>
              {nextDueKm !== null && <Text className="font-label text-xs font-bold text-[#2f3131] opacity-70">KM</Text>}
            </View>
          </View>
          <View className="flex-row items-baseline justify-between gap-4 py-2">
            <Text className="font-label text-xs font-extrabold text-[#2f3131] uppercase flex-1">Remaining</Text>
            <Text className="font-headline text-lg font-bold text-[#2f3131] leading-tight text-right">
              {remainingKm === null
                ? 'Not set'
                : remainingKm <= 0
                  ? `${Math.abs(remainingKm).toLocaleString()} over`
                  : `${remainingKm.toLocaleString()} KM`}
            </Text>
          </View>
        </View>

        <View className="bg-surface-container-low border border-secondary/30 rounded-xl p-6 mb-8">
          <View className="flex-row items-center gap-2 mb-4">
            <MaterialIcons name="description" size={16} color="#c6c6c6" />
            <Text className="font-headline text-sm font-bold tracking-widest text-secondary uppercase">Service Notes</Text>
          </View>
          <Text className="font-body text-on-surface leading-relaxed text-base">
            {latestOilLog?.notes || 'No oil-change notes recorded yet. Add one from Service Logs or mark Oil Change complete in the planner.'}
          </Text>
          <View className="mt-6 pt-4 border-t border-outline-variant/10 flex-row justify-between items-center">
            <Text className="font-label text-xs text-outline uppercase tracking-widest">Last Odometer</Text>
            <Text className="font-label text-xs text-primary uppercase tracking-widest">{lastOilKm !== null ? `${lastOilKm.toLocaleString()} KM` : 'Not set'}</Text>
          </View>
        </View>

        <View className="bg-primary/10 border border-primary/25 rounded-xl p-6 mb-5">
          <Text className="font-label text-xs text-primary uppercase tracking-widest font-bold">3azza application policy</Text>
          <Text className="font-headline text-2xl font-bold text-on-surface mt-2">Recurring every 1,000 km</Text>
          <Text className="font-body text-xs text-on-surface-variant leading-5 mt-2">
            This approved recommendation controls reminders. It does not remove an earlier break-in service or a shorter applicable elapsed-time or severe-use rule.
          </Text>
          {modelProfile && manualOilTask ? <SourceProvenance origin="3azza_policy" pages={manualOilTask.pages} profile={modelProfile} /> : null}
        </View>

        {manualOilTask && modelProfile ? (
          <View className="bg-surface-container-lowest border border-outline-variant/15 rounded-xl p-6 mb-5">
            <Text className="font-headline text-lg font-bold text-on-surface">Manual timing retained for audit</Text>
            {manualOilTask.initialDistanceKm.length > 0 ? (
              <Text className="font-body text-sm text-on-surface-variant leading-5 mt-2">
                Initial milestones: {manualOilTask.initialDistanceKm.map((value) => `${value.toLocaleString()} km`).join(', ')}
              </Text>
            ) : null}
            {manualOilTask.manualIntervalMonths ? (
              <Text className="font-body text-sm text-on-surface-variant leading-5 mt-2">
                Elapsed-time rule: every {manualOilTask.manualIntervalMonths} month{manualOilTask.manualIntervalMonths === 1 ? '' : 's'}, whichever comes first with distance.
              </Text>
            ) : null}
            {manualOilTask.guidance.map((guidance) => (
              <View key={guidance.recordId} className="mt-3">
                <Text className="font-body text-xs text-on-surface-variant leading-5">{formatKnowledgeValue(guidance.value)}</Text>
                <SourceProvenance compact pages={guidance.pages} profile={modelProfile} />
              </View>
            ))}
          </View>
        ) : null}

        {oilConflicts.length > 0 && modelProfile ? (
          <View className="bg-error/10 border border-error/35 rounded-xl p-6 mb-5">
            <Text className="font-headline text-lg font-bold text-error">Manual conflict</Text>
            <Text className="font-body text-xs text-on-surface-variant leading-5 mt-1">No conflicted capacity, specification, torque, or procedure is selected automatically.</Text>
            {oilConflicts.map((conflict) => (
              <View key={conflict.recordId} className="mt-4">
                <Text className="font-label text-xs font-bold text-on-surface uppercase">{conflict.subject.replaceAll('_', ' ')}</Text>
                {conflict.alternatives.map((alternative, index) => (
                  <View key={`${conflict.recordId}:${index}`} className="mt-2">
                    <Text className="font-body text-sm text-on-surface-variant">{formatKnowledgeValue(alternative.value)}</Text>
                    <SourceProvenance compact origin="conflict" pages={alternative.pages} profile={modelProfile} />
                  </View>
                ))}
              </View>
            ))}
          </View>
        ) : null}

        <View className="bg-surface-container-lowest border border-outline-variant/15 rounded-xl p-6 mb-8">
          <Text className="font-headline text-lg font-bold text-secondary uppercase tracking-widest">Exact-manual oil reference</Text>
          <Text className="font-body text-xs text-on-surface-variant leading-5 mt-2">
            Values appear only when present in this selected manual. Confirm workshop-critical details before service; 3azza does not infer missing capacities, viscosity, torque, filter, reset, or drain steps.
          </Text>
          <OnlineManualAction selection={profile ? selectionFromProfile(profile) : null} />
        </View>

        <View className="gap-4">
          {modelProfile && oilFacts.map((item) => (
            <View key={item.id} className="bg-surface-container p-4 rounded-xl border-l-2 border-primary/40">
              <Text className="font-label text-xs uppercase tracking-widest text-muted mb-1">{item.label}</Text>
              <Text className="font-headline text-lg font-medium text-on-surface">{formatKnowledgeValue(item.value)}</Text>
              {item.variantLabel ? <Text className="font-body text-xs text-tertiary mt-1">Applies to: {item.variantLabel}</Text> : null}
              <SourceProvenance compact pages={item.pages} profile={modelProfile} />
            </View>
          ))}
          {modelProfile && oilFluidRecords.map((record) => (
            <View key={record.recordId} className="bg-surface-container p-4 rounded-xl border-l-2 border-primary/40">
              <Text className="font-label text-xs uppercase tracking-widest text-muted mb-1">{record.subject.replaceAll('_', ' ')}</Text>
              <Text className="font-body text-sm text-on-surface-variant leading-5">{formatKnowledgeValue(record.value)}</Text>
              <SourceProvenance compact pages={record.pages} profile={modelProfile} />
            </View>
          ))}
          {modelProfile && oilFacts.length === 0 && oilFluidRecords.length === 0 ? (
            <View className="bg-surface-container p-4 rounded-xl border-l-2 border-secondary/40">
              <Text className="font-label text-xs uppercase tracking-widest text-muted mb-1">Oil specification / capacity</Text>
              <Text className="font-headline text-base font-medium text-on-surface">Not specified in this manual.</Text>
            </View>
          ) : null}
          <View className="bg-surface-container p-4 rounded-xl">
            <Text className="font-label text-xs uppercase tracking-widest text-muted mb-1">Planner interval {oilInterval?.recommendation_origin === 'user_override' ? '· User override' : ''}</Text>
            <Text className="font-headline text-xl font-medium text-on-surface">{intervalKm !== null ? `${intervalKm.toLocaleString()} KM` : 'Not set'}</Text>
          </View>
        </View>
      </ScrollView>
    </AppScreen>
  );
}
