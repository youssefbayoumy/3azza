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
import OnlineManualAction from '../components/vehicle/OnlineManualAction';
import {
  formatKnowledgeValue,
  getApplicableBreakInGuidance,
  getApplicableFluids,
  getApplicableIndicators,
  getApplicableSpecifications,
  getApplicableTroubleshooting,
  getModelProfileForVehicle,
  getSelectedVariant,
} from '../modelData/modelKnowledge';
import type { ApplicableSpecification, KnowledgeRecord } from '../modelData/types';
import { useTranslation, vehicleDisplayName } from '../i18n';

type SectionKey = 'specs' | 'fluids' | 'indicators' | 'troubleshooting' | 'break-in';

function RecordCard({ record }: { record: KnowledgeRecord }) {
  return (
    <View className="bg-surface-container-lowest border border-outline-variant/15 rounded-xl p-5 mb-3">
      <Text className="font-headline text-base font-bold text-on-surface">{record.subject.replaceAll('_', ' ')}</Text>
      <Text className="font-body text-sm text-on-surface-variant leading-5 mt-2">{formatKnowledgeValue(record.value)}</Text>
    </View>
  );
}

function SpecificationCard({ item }: { item: ApplicableSpecification }) {
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
    </View>
  );
}

export default function TechSpecsScreen() {
  const { isRTL, t } = useTranslation();
  const sections: { key: SectionKey; label: string }[] = [
    { key: 'specs', label: t('reference.specs') }, { key: 'fluids', label: t('reference.fluids') }, { key: 'indicators', label: t('reference.indicators') }, { key: 'troubleshooting', label: t('reference.troubleshooting') }, { key: 'break-in', label: t('reference.breakIn') },
  ];
  const navigation = useNavigation<MainStackNavigationProp>();
  const [profile, setProfile] = useState<VehicleProfile | null>(null);
  const [section, setSection] = useState<SectionKey>('specs');

  const loadProfile = useCallback(async (isCurrent: () => boolean) => {
    const vehicle = await getVehicleProfile();
    if (isCurrent()) setProfile(vehicle);
  }, []);
  const { error: loadError, loading, reload } = useFocusedLoader(
    loadProfile,
    t('reference.loadError'),
    t('reference.loadLog')
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
    return <ScreenLoadState error={loadError} loading={loading} onBack={() => navigation.goBack()} onRetry={reload} title={t('reference.title')} />;
  }

  const renderSelectedSection = () => {
    if (!modelProfile) return null;
    if (section === 'specs') {
      const exact = [...specifications.shared, ...specifications.exactVariant];
      return (
        <>
          {!selectedVariant && modelProfile.requiresVariant ? (
            <View className="bg-tertiary/10 border border-tertiary/30 rounded-xl p-4 mb-4">
              <Text className="font-headline text-sm font-bold text-tertiary">{t('reference.variantRequired')}</Text>
              <Text className="font-body text-xs text-on-surface-variant leading-5 mt-1">
                {t('reference.variantRequiredBody')}
              </Text>
            </View>
          ) : null}
          {exact.map((item) => <SpecificationCard item={item} key={item.id} />)}
          {specifications.variantAlternatives.length > 0 ? (
            <Text className="font-label text-xs font-bold text-secondary uppercase tracking-[0.2em] mt-5 mb-3">{t('reference.variantAlternatives')}</Text>
          ) : null}
          {specifications.variantAlternatives.map((item) => <SpecificationCard item={item} key={item.id} />)}
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
              {t('reference.fluidsWarning')}
            </Text>
          </View>
          {fluidSpecs.map((item) => <SpecificationCard item={item} key={item.id} />)}
          {manualFluids.map((record) => <RecordCard key={record.recordId} record={record} />)}
          {fluidSpecs.length === 0 && manualFluids.length === 0 ? (
            <Text className="font-body text-sm text-on-surface-variant">{t('reference.noValue')}</Text>
          ) : null}
        </>
      );
    }
    if (section === 'indicators') {
      const records = getApplicableIndicators(profile);
      return records.length > 0
        ? records.map((record) => <RecordCard key={record.recordId} record={record} />)
        : <Text className="font-body text-sm text-on-surface-variant">{t('reference.noGuidance')}</Text>;
    }
    if (section === 'troubleshooting') {
      const records = getApplicableTroubleshooting(profile);
      return records.length > 0
        ? records.map((record) => <RecordCard key={record.recordId} record={record} />)
        : <Text className="font-body text-sm text-on-surface-variant">{t('reference.noGuidance')}</Text>;
    }
    if (section === 'break-in') {
      const records = getApplicableBreakInGuidance(profile);
      return records.length > 0
        ? records.map((record) => <RecordCard key={record.recordId} record={record} />)
        : <Text className="font-body text-sm text-on-surface-variant">{t('reference.noBreakIn')}</Text>;
    }
    return null;
  };

  return (
    <AppScreen edges={['top', 'bottom', 'left', 'right']}>
      <AppTopBar
        tone="elevated"
        leading={<AppIconButton icon={isRTL ? 'arrow-forward' : 'arrow-back'} className="-ml-2" onPress={() => navigation.goBack()} accessibilityRole="button" accessibilityLabel={t('common.back')} />}
        trailing={<Text className="text-secondary font-black tracking-tighter text-2xl italic">3AZZA</Text>}
      >
        <Text className="font-headline uppercase tracking-wider text-sm font-bold text-primary" numberOfLines={1}>{t('reference.title')}</Text>
      </AppTopBar>

      <ScrollView className="flex-1" contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 28, paddingBottom: 40 }}>
        {!modelProfile ? (
          <View className="bg-surface-container-lowest border border-outline-variant/15 rounded-xl p-6">
            <Text className="font-headline text-xl font-bold text-on-surface">{t('reference.selectScooter')}</Text>
            <Text className="font-body text-sm text-on-surface-variant leading-6 mt-2">
              {t('reference.selectScooterBody')}
            </Text>
          </View>
        ) : (
          <>
            <Text className="font-label text-xs text-primary uppercase tracking-[0.25em] font-bold">{profile ? vehicleDisplayName(profile.name) : t('reference.activeVehicle')}</Text>
            <Text className="font-headline text-3xl font-bold text-on-surface tracking-tight mt-2">{modelProfile.brandName} {modelProfile.modelName}</Text>
            <Text className="font-body text-sm text-on-surface-variant mt-2">
              {selectedVariant?.name ?? (modelProfile.requiresVariant ? t('reference.exactVariantMissing') : modelProfile.modelName)} · {modelProfile.manualYears}
            </Text>
            <View className="bg-primary/10 border border-primary/20 rounded-xl p-5 mt-5 mb-6">
              <Text className="font-headline text-sm font-bold text-primary">{t('reference.vehicleReference')}</Text>
              {isRTL ? <Text className="font-body text-xs text-on-surface-variant mt-2">{t('common.manualEnglishNotice')}</Text> : null}
              <Text className="font-body text-xs text-on-surface-variant mt-1">{modelProfile.modelName} · {modelProfile.manualYears}</Text>
              <OnlineManualAction selection={scooter} />
            </View>

            <ScrollView horizontal showsHorizontalScrollIndicator={false} className="-mx-1 mb-6" contentContainerStyle={{ paddingHorizontal: 4, gap: 8 }}>
              {sections.map((item) => (
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
