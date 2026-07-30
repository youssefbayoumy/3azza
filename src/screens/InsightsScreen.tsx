import React, { useCallback, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, useWindowDimensions } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import {
  getInsightsRecordSummary,
  getServiceIntervals,
  getVehicleProfile,
} from '../services/database';
import { computePredictedOdometer, countServiceWarnings } from '../utils/maintenance';
import { toIsoDate } from '../utils/dates';
import type { MainStackNavigationProp } from '../navigation/types';
import AppIconButton from '../components/ui/AppIconButton';
import AppTopBar from '../components/ui/AppTopBar';
import AppScreen from '../components/ui/AppScreen';
import ScreenLoadState from '../components/ui/ScreenLoadState';
import useFocusedLoader from '../hooks/useFocusedLoader';

const AMBER = '#FFB100';

type InsightState = {
  totalFuelCost: number;
  totalMaintenanceCost: number;
  totalSpend: number;
  costPerKm: number | null;
  gasLogCount: number;
  serviceLogCount: number;
  inventoryCount: number;
  serviceWarningCount: number;
  expiringDocumentCount: number;
  monthFuelCost: number;
  monthMaintenanceCost: number;
};

const emptyInsights: InsightState = {
  totalFuelCost: 0,
  totalMaintenanceCost: 0,
  totalSpend: 0,
  costPerKm: null,
  gasLogCount: 0,
  serviceLogCount: 0,
  inventoryCount: 0,
  serviceWarningCount: 0,
  expiringDocumentCount: 0,
  monthFuelCost: 0,
  monthMaintenanceCost: 0,
};

function monthKey(value: string): string {
  return value.slice(0, 7);
}

export default function InsightsScreen() {
  const navigation = useNavigation<MainStackNavigationProp>();
  const { width: viewportWidth } = useWindowDimensions();
  const stackSummaryCards = viewportWidth < 390;
  const [insights, setInsights] = useState<InsightState>(emptyInsights);

  const loadInsights = useCallback(async (isCurrent: () => boolean) => {
    const now = new Date();
    const expiryCutoff = new Date(now);
    expiryCutoff.setDate(expiryCutoff.getDate() + 30);
    const currentMonth = monthKey(now.toISOString());
    const [recordSummary, intervals, profile] = await Promise.all([
      getInsightsRecordSummary(currentMonth, toIsoDate(expiryCutoff)),
      getServiceIntervals(),
      getVehicleProfile(),
    ]);

    const totalFuelCost = recordSummary.totalFuelCost;
    const totalMaintenanceCost = recordSummary.totalMaintenanceCost;
    const totalSpend = totalFuelCost + totalMaintenanceCost;
    const currentMileage = computePredictedOdometer(profile).mileage;
    const firstKnownMileage = recordSummary.firstKnownMileage ?? currentMileage;
    const distance = Math.max(0, currentMileage - firstKnownMileage);

    if (!isCurrent()) return;
    setInsights({
      totalFuelCost,
      totalMaintenanceCost,
      totalSpend,
      costPerKm: distance > 0 ? totalSpend / distance : null,
      gasLogCount: recordSummary.gasLogCount,
      serviceLogCount: recordSummary.serviceLogCount,
      inventoryCount: recordSummary.inventoryCount,
      serviceWarningCount: countServiceWarnings(intervals, currentMileage),
      expiringDocumentCount: recordSummary.expiringDocumentCount,
      monthFuelCost: recordSummary.monthFuelCost,
      monthMaintenanceCost: recordSummary.monthMaintenanceCost,
    });
  }, []);

  const { error: loadError, loading, reload } = useFocusedLoader(
    loadInsights,
    'Insights could not be calculated from your local records. Your records were not changed.',
    'Failed to load insights:'
  );

  if (loading || loadError) {
    return <ScreenLoadState error={loadError} loading={loading} onBack={() => navigation.goBack()} onRetry={reload} title="INSIGHTS" />;
  }

  const maxMonthSpend = Math.max(insights.monthFuelCost, insights.monthMaintenanceCost, 1);
  const fuelHeight = Math.max(12, (insights.monthFuelCost / maxMonthSpend) * 140);
  const maintenanceHeight = Math.max(12, (insights.monthMaintenanceCost / maxMonthSpend) * 140);

  return (
    <AppScreen edges={['top', 'bottom', 'left', 'right']}>
      <AppTopBar
        align="center"
        tone="subtle"
        leading={<AppIconButton accessibilityLabel="Go back" icon="arrow-back" className="-ml-2" onPress={() => navigation.goBack()} />}
        trailing={<AppIconButton accessibilityLabel="Open vehicle settings" icon="settings" className="-mr-2" onPress={() => navigation.navigate('VehicleSettings')} />}
      >
        <Text className="font-headline uppercase tracking-widest text-2xl text-[#a9c7ff]" numberOfLines={1}>INSIGHTS</Text>
      </AppTopBar>

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 24, paddingBottom: 32 }}
      >
        <View className="mb-10">
          <Text className="font-label text-xs uppercase font-bold tracking-[0.2em] text-secondary opacity-60 mb-1">Recorded Costs</Text>
          <View className="flex-row items-baseline gap-3">
            <Text className="font-headline text-6xl font-bold tracking-tighter text-on-surface" numberOfLines={1} maxFontSizeMultiplier={1.2}>
              {insights.totalSpend.toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </Text>
            <Text className="font-label text-sm text-secondary">EGP</Text>
          </View>
          <Text className="font-body text-xs text-on-surface-variant/70 mt-2">
            {insights.costPerKm === null ? 'Add more odometer-linked logs to calculate cost per KM.' : `${insights.costPerKm.toFixed(2)} EGP per KM`}
          </Text>
          <Text className="font-body text-xs text-on-surface-variant/70 mt-2">
            Totals include only recorded local fuel and service costs. All amounts are entered and shown in EGP.
          </Text>
        </View>

        <View className="bg-surface-container-lowest rounded-xl p-6 border border-outline-variant/10 mb-6">
          <View className="flex-row flex-wrap justify-between items-start gap-3 mb-12">
            <View className="flex-1 min-w-0">
              <Text className="font-headline text-xl font-bold text-secondary uppercase tracking-tight">Costs This Month</Text>
              <Text className="font-label text-xs text-outline uppercase tracking-widest mt-1">Recorded fuel vs maintenance</Text>
            </View>
            <View className="bg-surface-container-high rounded-md px-3 py-1 border border-outline-variant/20">
              <Text className="font-label text-xs font-bold text-primary tracking-tighter uppercase">{monthKey(new Date().toISOString())}</Text>
            </View>
          </View>

          <View className="flex-row items-end justify-between px-4 gap-8" style={{ height: 160 }}>
            <View className="flex-1 flex-col items-center h-full justify-end">
              <View className="w-full bg-secondary rounded-t-md" style={{ height: fuelHeight }} />
              <Text className="font-label text-xs mt-3 font-bold text-secondary uppercase tracking-widest">Fuel</Text>
              <Text className="font-label text-xs text-secondary/50">{insights.monthFuelCost.toLocaleString()} EGP</Text>
            </View>
            <View className="flex-1 flex-col items-center h-full justify-end">
              <View className="w-full rounded-t-md" style={{ height: maintenanceHeight, backgroundColor: AMBER }} />
              <Text className="font-label text-xs mt-3 font-bold uppercase tracking-widest" style={{ color: AMBER }}>Maint</Text>
              <Text className="font-label text-xs text-secondary/50">{insights.monthMaintenanceCost.toLocaleString()} EGP</Text>
            </View>
          </View>
        </View>

        <View className="flex-col gap-5 mb-10">
          <View className="bg-surface-container-high rounded-xl p-6 border-t border-primary/20">
            <Text className="font-label text-xs font-bold text-primary uppercase tracking-widest mb-4">Lifetime Breakdown</Text>
            <View className="gap-4" style={{ flexDirection: stackSummaryCards ? 'column' : 'row' }}>
              <View>
                <Text className="font-label text-xs text-secondary/50 uppercase">Fuel</Text>
                <Text className="font-headline text-2xl font-bold text-on-surface">{insights.totalFuelCost.toLocaleString()} EGP</Text>
              </View>
              <View className={stackSummaryCards ? 'items-start' : 'items-end'}>
                <Text className="font-label text-xs text-secondary/50 uppercase">Maintenance</Text>
                <Text className="font-headline text-2xl font-bold text-on-surface">{insights.totalMaintenanceCost.toLocaleString()} EGP</Text>
              </View>
            </View>
          </View>

          <View className="gap-4" style={{ flexDirection: stackSummaryCards ? 'column' : 'row' }}>
            <TouchableOpacity onPress={() => navigation.navigate('Tabs', { screen: 'Vitals' })} className="flex-1 bg-surface-container-lowest rounded-xl p-5 border border-outline-variant/10">
              <MaterialIcons name="build" size={24} color={insights.serviceWarningCount > 0 ? '#ffb4ab' : '#a9c7ff'} />
              <Text className="font-headline text-3xl font-bold text-on-surface mt-4">{insights.serviceWarningCount}</Text>
              <Text className="font-label text-xs text-secondary/60 uppercase tracking-widest mt-1">Service Attention</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => navigation.navigate('Tabs', { screen: 'Vault' })} className="flex-1 bg-surface-container-lowest rounded-xl p-5 border border-outline-variant/10">
              <MaterialIcons name="folder-special" size={24} color={insights.expiringDocumentCount > 0 ? '#ffb4ab' : '#a9c7ff'} />
              <Text className="font-headline text-3xl font-bold text-on-surface mt-4">{insights.expiringDocumentCount}</Text>
              <Text className="font-label text-xs text-secondary/60 uppercase tracking-widest mt-1">Document Attention</Text>
            </TouchableOpacity>
          </View>

          <View className="gap-4" style={{ flexDirection: stackSummaryCards ? 'column' : 'row' }}>
            <TouchableOpacity onPress={() => navigation.navigate('Tabs', { screen: 'Inventory' })} className="flex-1 bg-surface-container-lowest rounded-xl p-5 border border-outline-variant/10">
              <MaterialIcons name="inventory-2" size={24} color="#a9c7ff" />
              <Text className="font-headline text-3xl font-bold text-on-surface mt-4">{insights.inventoryCount}</Text>
              <Text className="font-label text-xs text-secondary/60 uppercase tracking-widest mt-1">Parts Tracked</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => navigation.navigate('GasLog')} className="flex-1 bg-surface-container-lowest rounded-xl p-5 border border-outline-variant/10">
              <MaterialIcons name="local-gas-station" size={24} color="#a9c7ff" />
              <Text className="font-headline text-3xl font-bold text-on-surface mt-4">{insights.gasLogCount}</Text>
              <Text className="font-label text-xs text-secondary/60 uppercase tracking-widest mt-1">Fuel Logs</Text>
            </TouchableOpacity>
          </View>
          <View>
            <TouchableOpacity onPress={() => navigation.navigate('ServiceLogs')} className="bg-surface-container-lowest rounded-xl p-5 border border-outline-variant/10">
              <MaterialIcons name="build" size={24} color="#a9c7ff" />
              <Text className="font-headline text-3xl font-bold text-on-surface mt-4">{insights.serviceLogCount}</Text>
              <Text className="font-label text-xs text-secondary/60 uppercase tracking-widest mt-1">Service Logs</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </AppScreen>
  );
}
