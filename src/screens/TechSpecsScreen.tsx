import React, { useCallback, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { MainStackNavigationProp } from '../navigation/types';
import { getVehicleProfile } from '../services/database';
import type { VehicleProfile } from '../types/database.types';
import AppIconButton from '../components/ui/AppIconButton';
import AppTopBar from '../components/ui/AppTopBar';
import AppScreen from '../components/ui/AppScreen';
import ScreenLoadState from '../components/ui/ScreenLoadState';
import useFocusedLoader from '../hooks/useFocusedLoader';
import { formatScooterSelection, selectionFromProfile } from '../catalog/scooterCatalog';
import OnlineManualAction from '../components/OnlineManualAction';

const UNSOURCED_SPEC_ITEMS = [
  {
    icon: 'hardware',
    title: 'Torque values',
    detail: 'Use the exact fastener values and conditions in the manufacturer service manual.',
  },
  {
    icon: 'tire-repair',
    title: 'Tire pressure',
    detail: 'Use the vehicle placard or owner manual for the fitted tires and expected load.',
  },
  {
    icon: 'oil-barrel',
    title: 'Oil grade and capacity',
    detail: 'Use the viscosity, specification, and quantity listed for the exact engine.',
  },
] as const;

export default function TechSpecsScreen() {
  const navigation = useNavigation<MainStackNavigationProp>();
  const [profile, setProfile] = useState<VehicleProfile | null>(null);

  const loadProfile = useCallback(async (isCurrent: () => boolean) => {
    const vehicle = await getVehicleProfile();
    if (isCurrent()) setProfile(vehicle);
  }, []);
  const { error: loadError, loading, reload } = useFocusedLoader(
    loadProfile,
    'The active vehicle reference could not be loaded. No specifications are being inferred.',
    'Failed to load vehicle reference:'
  );

  if (loading || loadError) {
    return <ScreenLoadState error={loadError} loading={loading} onBack={() => navigation.goBack()} onRetry={reload} title="VEHICLE_REFERENCE" />;
  }

  const scooter = profile ? selectionFromProfile(profile) : null;

  return (
    <AppScreen edges={['top', 'bottom', 'left', 'right']}>
      <AppTopBar
        tone="elevated"
        leading={<AppIconButton icon="arrow-back" className="-ml-2" onPress={() => navigation.goBack()} accessibilityRole="button" accessibilityLabel="Go back" />}
        trailing={<Text className="text-secondary font-black tracking-tighter text-2xl italic">3AZZA</Text>}
      >
        <Text className="font-headline uppercase tracking-wider text-sm font-bold text-primary" numberOfLines={1}>VEHICLE REFERENCE</Text>
      </AppTopBar>

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 32, paddingBottom: 32 }}
      >
        <View className="mb-8">
          <Text className="font-label text-xs text-primary uppercase tracking-[0.25em] font-bold mb-2">{profile?.name ?? 'Active vehicle'}</Text>
          <Text className="font-headline text-4xl font-bold text-on-surface tracking-tight">No verified specs saved</Text>
          <Text className="font-body text-sm text-on-surface-variant leading-6 mt-4">
            {scooter
              ? `${formatScooterSelection(scooter)} is the active scooter reference. Structured safety-critical values have not been imported from its manual yet.`
              : 'Choose a brand, model, and version in Vehicle Settings before using scooter-specific information.'}
          </Text>
        </View>

        <View className="bg-error/10 border border-error/30 rounded-xl p-5 mb-8 flex-row gap-4">
          <MaterialIcons name="warning-amber" size={26} color="#ffb4ab" />
          <View className="flex-1">
            <Text className="font-headline text-base font-bold text-error mb-2">Check an authoritative source</Text>
            <Text className="font-body text-sm text-on-surface-variant leading-5">
              Use the manufacturer manual or a qualified mechanic before high-risk work. Generic torque, pressure, and oil values can be unsafe.
            </Text>
          </View>
        </View>

        <View className="gap-4">
          {UNSOURCED_SPEC_ITEMS.map((item) => (
            <View key={item.title} className="bg-surface-container-lowest border border-outline-variant/15 rounded-xl p-5 flex-row gap-4">
              <View className="w-11 h-11 rounded-lg bg-primary/10 items-center justify-center">
                <MaterialIcons name={item.icon} size={22} color="#a9c7ff" />
              </View>
              <View className="flex-1">
                <View className="flex-row items-center justify-between gap-3 mb-2">
                  <Text className="font-headline text-base font-bold text-on-surface flex-1">{item.title}</Text>
                  <Text className="font-label text-xs uppercase tracking-wider text-secondary">Not set</Text>
                </View>
                <Text className="font-body text-xs text-on-surface-variant leading-5">{item.detail}</Text>
              </View>
            </View>
          ))}
        </View>

        <View className="bg-primary/10 border border-primary/20 rounded-xl p-5 mt-8">
          <Text className="font-headline text-sm font-bold text-primary uppercase tracking-wider mb-2">Why values are hidden</Text>
          <Text className="font-body text-sm text-on-surface-variant leading-5">
            {scooter
              ? `Selected source: ${scooter.version.manualFileName}. Future specifications, manuals, parts, and reminders should resolve through this same selection.`
              : 'Specifications only appear after they are tied to the active vehicle and a visible source.'}
          </Text>
          <OnlineManualAction selection={scooter} />
        </View>
      </ScrollView>
    </AppScreen>
  );
}
