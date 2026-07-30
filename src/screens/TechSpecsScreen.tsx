import React, { useCallback, useMemo, useState } from 'react';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';
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
import { selectionFromProfile } from '../catalog/scooterCatalog';
import OnlineManualAction from '../components/OnlineManualAction';
import SourceProvenance from '../components/SourceProvenance';
import {
  formatKnowledgeValue,
  getApplicableBreakInGuidance,
  getApplicableFluids,
  getApplicableIndicators,
  getApplicableSpecifications,
  getApplicableTroubleshooting,
  getConflictsForContext,
  getModelProfileForVehicle,
  getSelectedVariant,
} from '../modelData/modelKnowledge';
import type { ApplicableSpecification, KnowledgeRecord, ModelKnowledgeProfile } from '../modelData/types';

type SectionKey = 'specs' | 'fluids' | 'indicators' | 'troubleshooting' | 'break-in' | 'data-notes';

const SECTIONS: { key: SectionKey; label: string }[] = [
  { key: 'specs', label: 'Specs' },
  { key: 'fluids', label: 'Fluids & tires' },
  { key: 'indicators', label: 'Indicators' },
  { key: 'troubleshooting', label: 'Troubleshooting' },
  { key: 'break-in', label: 'Break-in' },
  { key: 'data-notes', label: 'Conflicts & missing' },
];

function RecordCard({ modelProfile, record }: { modelProfile: ModelKnowledgeProfile; record: KnowledgeRecord }) {
  return (
    <View className="bg-surface-container-lowest border border-outline-variant/15 rounded-xl p-5 mb-3">
      <Text className="font-headline text-base font-bold text-on-surface">{record.subject.replaceAll('_', ' ')}</Text>
      <Text className="font-body text-sm text-on-surface-variant leading-5 mt-2">{formatKnowledgeValue(record.value)}</Text>
      <SourceProvenance compact pages={record.pages} profile={modelProfile} />
    </View>
  );
}

function SpecificationCard({ item, modelProfile }: { item: ApplicableSpecification; modelProfile: ModelKnowledgeProfile }) {
  return (
    <View className="bg-surface-container-lowest border border-outline-variant/15 rounded-xl p-5 mb-3">
      <View className="flex-row items-start justify-between gap-3">
        <Text className="font-label text-xs font-bold uppercase tracking-wider text-primary flex-1">{item.label}</Text>
        {item.variantLabel ? (
          <Text className="font-label text-[10px] text-secondary uppercase tracking-wider max-w-[45%] text-right">
            {item.variantLabel}
          </Text>
        ) : null}
      </View>
      <Text className="font-headline text-base font-bold text-on-surface mt-2">{formatKnowledgeValue(item.value)}</Text>
      <SourceProvenance compact pages={item.pages} profile={modelProfile} />
    </View>
  );
}

export default function TechSpecsScreen() {
  const navigation = useNavigation<MainStackNavigationProp>();
  const [profile, setProfile] = useState<VehicleProfile | null>(null);
  const [section, setSection] = useState<SectionKey>('specs');

  const loadProfile = useCallback(async (isCurrent: () => boolean) => {
    const vehicle = await getVehicleProfile();
    if (isCurrent()) setProfile(vehicle);
  }, []);
  const { error: loadError, loading, reload } = useFocusedLoader(
    loadProfile,
    'The active vehicle reference could not be loaded. No specifications are being inferred.',
    'Failed to load vehicle reference:'
  );

  const modelProfile = getModelProfileForVehicle(profile);
  const selectedVariant = getSelectedVariant(profile, modelProfile);
  const scooter = profile ? selectionFromProfile(profile) : null;
  const specifications = useMemo(() => getApplicableSpecifications(profile), [profile]);
  const fluidSpecs = useMemo(() => {
    const fluids = getApplicableSpecifications(profile, 'fluids');
    const tires = getApplicableSpecifications(profile, 'tires');
    return [...fluids.shared, ...fluids.exactVariant, ...fluids.variantAlternatives, ...tires.shared, ...tires.exactVariant, ...tires.variantAlternatives];
  }, [profile]);

  if (loading || loadError) {
    return <ScreenLoadState error={loadError} loading={loading} onBack={() => navigation.goBack()} onRetry={reload} title="VEHICLE_REFERENCE" />;
  }

  const renderSelectedSection = () => {
    if (!modelProfile) return null;
    if (section === 'specs') {
      const exact = [...specifications.shared, ...specifications.exactVariant];
      return (
        <>
          {!selectedVariant && modelProfile.requiresVariant ? (
            <View className="bg-tertiary/10 border border-tertiary/30 rounded-xl p-4 mb-4">
              <Text className="font-headline text-sm font-bold text-tertiary">Select the exact variant for one definitive value</Text>
              <Text className="font-body text-xs text-on-surface-variant leading-5 mt-1">
                Shared facts are shown first. Variant-specific facts remain grouped and labelled below; 3azza will not choose an engine code automatically.
              </Text>
            </View>
          ) : null}
          {exact.map((item) => <SpecificationCard item={item} key={item.id} modelProfile={modelProfile} />)}
          {specifications.variantAlternatives.length > 0 ? (
            <Text className="font-label text-xs font-bold text-secondary uppercase tracking-[0.2em] mt-5 mb-3">Variant alternatives</Text>
          ) : null}
          {specifications.variantAlternatives.map((item) => <SpecificationCard item={item} key={item.id} modelProfile={modelProfile} />)}
        </>
      );
    }
    if (section === 'fluids') {
      const manualFluids = getApplicableFluids(profile);
      return (
        <>
          <View className="bg-error/10 border border-error/30 rounded-xl p-4 mb-4 flex-row gap-3">
            <MaterialIcons name="warning-amber" size={22} color="#ffb4ab" />
            <Text className="font-body text-xs text-on-surface-variant leading-5 flex-1">
              Confirm workshop-critical capacities, pressures, grades, and tightening values against the scooter placard or a qualified SYM technician before service.
            </Text>
          </View>
          {fluidSpecs.map((item) => <SpecificationCard item={item} key={item.id} modelProfile={modelProfile} />)}
          {manualFluids.map((record) => <RecordCard key={record.recordId} modelProfile={modelProfile} record={record} />)}
          {fluidSpecs.length === 0 && manualFluids.length === 0 ? (
            <Text className="font-body text-sm text-on-surface-variant">Not specified in this manual.</Text>
          ) : null}
        </>
      );
    }
    if (section === 'indicators') {
      const records = getApplicableIndicators(profile);
      return records.length > 0
        ? records.map((record) => <RecordCard key={record.recordId} modelProfile={modelProfile} record={record} />)
        : <Text className="font-body text-sm text-on-surface-variant">Not specified in this manual.</Text>;
    }
    if (section === 'troubleshooting') {
      const records = getApplicableTroubleshooting(profile);
      return records.length > 0
        ? records.map((record) => <RecordCard key={record.recordId} modelProfile={modelProfile} record={record} />)
        : <Text className="font-body text-sm text-on-surface-variant">Not specified in this manual.</Text>;
    }
    if (section === 'break-in') {
      const records = getApplicableBreakInGuidance(profile);
      return records.length > 0
        ? records.map((record) => <RecordCard key={record.recordId} modelProfile={modelProfile} record={record} />)
        : <Text className="font-body text-sm text-on-surface-variant">Not specified in this manual.</Text>;
    }

    const missing = modelProfile.records.filter((record) => record.section === 'missing_data');
    const conflicts = getConflictsForContext(profile);
    return (
      <>
        <Text className="font-label text-xs font-bold text-error uppercase tracking-[0.2em] mb-3">Manual conflicts</Text>
        {conflicts.map((conflict) => (
          <View key={conflict.recordId} className="bg-error/10 border border-error/30 rounded-xl p-5 mb-3">
            <Text className="font-headline text-base font-bold text-error">Manual conflict · {conflict.subject.replaceAll('_', ' ')}</Text>
            {conflict.alternatives.length > 0
              ? conflict.alternatives.map((alternative, index) => (
                <View className="mt-3" key={`${conflict.recordId}:${index}`}>
                  <Text className="font-label text-xs font-bold text-on-surface">{alternative.label.replaceAll('_', ' ')}</Text>
                  <Text className="font-body text-sm text-on-surface-variant mt-1">{formatKnowledgeValue(alternative.value)}</Text>
                  <SourceProvenance compact origin="conflict" pages={alternative.pages} profile={modelProfile} />
                </View>
              ))
              : <Text className="font-body text-sm text-on-surface-variant mt-2">{formatKnowledgeValue(conflict.value)}</Text>}
          </View>
        ))}
        <Text className="font-label text-xs font-bold text-secondary uppercase tracking-[0.2em] mt-5 mb-3">Not specified</Text>
        {missing.map((record) => (
          <View key={record.recordId} className="bg-surface-container-lowest border border-outline-variant/15 rounded-xl p-4 mb-3">
            <Text className="font-headline text-sm font-bold text-on-surface">{record.subject.replaceAll('_', ' ')}</Text>
            <Text className="font-body text-xs text-on-surface-variant mt-1">Not specified in this manual.</Text>
            <SourceProvenance compact origin="missing" pages={record.pages} profile={modelProfile} />
          </View>
        ))}
      </>
    );
  };

  return (
    <AppScreen edges={['top', 'bottom', 'left', 'right']}>
      <AppTopBar
        tone="elevated"
        leading={<AppIconButton icon="arrow-back" className="-ml-2" onPress={() => navigation.goBack()} accessibilityRole="button" accessibilityLabel="Go back" />}
        trailing={<Text className="text-secondary font-black tracking-tighter text-2xl italic">3AZZA</Text>}
      >
        <Text className="font-headline uppercase tracking-wider text-sm font-bold text-primary" numberOfLines={1}>MODEL REFERENCE</Text>
      </AppTopBar>

      <ScrollView className="flex-1" contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 28, paddingBottom: 40 }}>
        {!modelProfile ? (
          <View className="bg-surface-container-lowest border border-outline-variant/15 rounded-xl p-6">
            <Text className="font-headline text-xl font-bold text-on-surface">Select a supported scooter</Text>
            <Text className="font-body text-sm text-on-surface-variant leading-6 mt-2">
              Choose its brand, model, manual version, and any required engine code in Vehicle Settings. No fleet-wide values will be substituted.
            </Text>
          </View>
        ) : (
          <>
            <Text className="font-label text-xs text-primary uppercase tracking-[0.25em] font-bold">{profile?.name ?? 'Active vehicle'}</Text>
            <Text className="font-headline text-3xl font-bold text-on-surface tracking-tight mt-2">{modelProfile.brandName} {modelProfile.modelName}</Text>
            <Text className="font-body text-sm text-on-surface-variant mt-2">
              {selectedVariant?.name ?? (modelProfile.requiresVariant ? 'Exact variant not selected' : modelProfile.manualVersion)} · {modelProfile.manualYears}
            </Text>
            <View className="bg-primary/10 border border-primary/20 rounded-xl p-5 mt-5 mb-6">
              <Text className="font-headline text-sm font-bold text-primary">Selected owner manual</Text>
              <Text className="font-body text-xs text-on-surface-variant mt-1">{modelProfile.modelName} · {modelProfile.manualYears} · {modelProfile.pageCount} PDF pages</Text>
              <OnlineManualAction selection={scooter} />
            </View>

            <ScrollView horizontal showsHorizontalScrollIndicator={false} className="-mx-1 mb-6" contentContainerStyle={{ paddingHorizontal: 4, gap: 8 }}>
              {SECTIONS.map((item) => (
                <TouchableOpacity
                  accessibilityRole="tab"
                  accessibilityState={{ selected: section === item.key }}
                  className={`px-4 py-3 rounded-full border ${section === item.key ? 'bg-primary border-primary' : 'bg-surface-container-high border-outline-variant/20'}`}
                  key={item.key}
                  onPress={() => setSection(item.key)}
                >
                  <Text className={`font-label text-xs font-bold ${section === item.key ? 'text-on-primary' : 'text-on-surface-variant'}`}>{item.label}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            {renderSelectedSection()}
          </>
        )}
      </ScrollView>
    </AppScreen>
  );
}
