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

const AMBER = '#FFB100';

const SOURCE_CHECKLIST = [
  'Find the owner or service manual for the exact make, model, and year.',
  'Confirm the oil specification, capacity, filter, and drain procedure.',
  'Confirm every fastener torque and whether the manual specifies wet or dry threads.',
  'Use a qualified mechanic when an authoritative value or procedure is unavailable.',
  'After the work is complete, record the odometer and oil used in Service Logs.',
];

export default function OilChangeDetailsScreen() {
  const navigation = useNavigation<MainStackNavigationProp>();
  const [profile, setProfile] = useState<VehicleProfile | null>(null);
  const [oilInterval, setOilInterval] = useState<ServiceInterval | null>(null);
  const [latestOilLog, setLatestOilLog] = useState<ServiceLog | null>(null);

  const loadData = useCallback(async (isCurrent: () => boolean) => {
    const [profileData, intervalsData, oilLog] = await Promise.all([
      getVehicleProfile(),
      getServiceIntervals(),
      getLatestLogForServiceType('Oil Change'),
    ]);
    if (!isCurrent()) return;
    setProfile(profileData);
    setOilInterval(intervalsData.find((interval) => interval.name === 'Oil Change') ?? null);
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

        <View className="bg-surface-container-lowest border border-outline-variant/15 rounded-xl p-6 mb-8">
          <Text className="font-headline text-lg font-bold text-secondary uppercase tracking-widest mb-2">Safety & Source Check</Text>
          <Text className="font-body text-xs text-on-surface-variant leading-5 mb-5">
            3azza does not provide a universal oil-change procedure. Follow the exact vehicle manual.
          </Text>
          <View className="gap-4">
            {SOURCE_CHECKLIST.map((item, index) => (
              <View key={item} className="flex-row gap-3">
                <View className="w-7 h-7 rounded-full bg-primary/10 items-center justify-center border border-primary/20">
                  <Text className="font-label text-xs text-primary font-bold">{index + 1}</Text>
                </View>
                <Text className="flex-1 font-body text-sm text-on-surface-variant leading-5">{item}</Text>
              </View>
            ))}
          </View>
          <OnlineManualAction selection={profile ? selectionFromProfile(profile) : null} />
        </View>

        <View className="gap-4">
          <View className="bg-surface-container p-4 rounded-xl border-l-2 border-primary/40">
            <Text className="font-label text-xs uppercase tracking-widest text-secondary/60 mb-1">Oil Specification</Text>
            <Text className="font-headline text-xl font-medium text-on-surface">Not set</Text>
            <Text className="font-body text-xs text-on-surface-variant mt-1">Check the exact vehicle manual</Text>
          </View>
          <View className="bg-surface-container p-4 rounded-xl">
            <Text className="font-label text-xs uppercase tracking-widest text-secondary/60 mb-1">Editable Interval</Text>
            <Text className="font-headline text-xl font-medium text-on-surface">{intervalKm !== null ? `${intervalKm.toLocaleString()} KM` : 'Not set'}</Text>
          </View>
        </View>
      </ScrollView>
    </AppScreen>
  );
}
