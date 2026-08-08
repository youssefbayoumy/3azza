import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, Text, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import Svg, { Circle, Defs, LinearGradient, Stop } from 'react-native-svg';
import { getLatestPreRideRun, getVehicleProfile, recordPreRideRun } from '../services/database';
import type { VehicleProfile } from '../types/database.types';
import type { PreRideNavigationProp } from '../navigation/types';
import ActiveVehicleChip from '../components/ActiveVehicleChip';
import AppIconButton from '../components/ui/AppIconButton';
import AppTopBar from '../components/ui/AppTopBar';
import AppScreen from '../components/ui/AppScreen';
import ScreenLoadState from '../components/ui/ScreenLoadState';
import useFocusedLoader from '../hooks/useFocusedLoader';
import {
  formatKnowledgeValue,
  getApplicablePreRideItems,
  getModelProfileForVehicle,
  getSelectedVariant,
} from '../modelData/modelKnowledge';
import type { KnowledgeRecord } from '../modelData/types';
import { formatNumber, useTranslation } from '../i18n';

function recordTitle(record: KnowledgeRecord): string {
  const attributes = record.attributes;
  for (const key of ['item', 'component', 'check', 'title', 'name']) {
    if (typeof attributes[key] === 'string') return String(attributes[key]);
  }
  return record.subject.replaceAll('_', ' ');
}

export default function PreRideCheckScreen() {
  const { isRTL, locale, t } = useTranslation();
  const navigation = useNavigation<PreRideNavigationProp>();
  const { width: viewportWidth } = useWindowDimensions();
  const [profile, setProfile] = useState<VehicleProfile | null>(null);
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);

  const loadState = useCallback(async (isCurrent: () => boolean) => {
    const [vehicle, latestRun] = await Promise.all([getVehicleProfile(), getLatestPreRideRun()]);
    if (!isCurrent()) return;
    setProfile(vehicle);
    const model = getModelProfileForVehicle(vehicle);
    const variant = getSelectedVariant(vehicle, model);
    const today = new Date().toISOString().slice(0, 10);
    if (
      latestRun
      && model
      && latestRun.manual_id === model.manualId
      && latestRun.variant_id === (variant?.id ?? null)
      && latestRun.completed_at.slice(0, 10) === today
    ) {
      const items = JSON.parse(latestRun.items_json) as { recordId: string; checked: boolean }[];
      setChecked(Object.fromEntries(items.map((item) => [item.recordId, item.checked])));
    } else {
      setChecked({});
    }
  }, []);

  const { error: loadError, loading, reload } = useFocusedLoader(
    loadState,
    t('preRide.loadError'),
    t('preRide.loadLog')
  );

  const modelProfile = getModelProfileForVehicle(profile);
  const selectedVariant = getSelectedVariant(profile, modelProfile);
  const items = useMemo(() => getApplicablePreRideItems(profile), [profile]);
  const completedChecks = items.filter((item) => checked[item.recordId]).length;
  const readiness = items.length > 0 ? Math.round((completedChecks / items.length) * 100) : 0;
  const gaugeSize = Math.min(Math.max(viewportWidth - 48, 180), 320);
  const radius = 45;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (readiness / 100) * circumference;

  const performSave = async () => {
    if (!modelProfile || items.length === 0) return;
    setSaving(true);
    try {
      await recordPreRideRun({
        manualId: modelProfile.manualId,
        variantId: selectedVariant?.id ?? null,
        items: items.map((item) => ({
          recordId: item.recordId,
          subject: recordTitle(item),
          checked: Boolean(checked[item.recordId]),
        })),
      });
      Alert.alert(t('preRide.savedTitle'), t('preRide.savedBody', { completed: completedChecks, total: items.length }), [
        { text: t('language.ok'), onPress: () => navigation.goBack() },
      ]);
    } catch (error) {
      console.error('Failed to save pre-ride check:', error);
      Alert.alert(t('preRide.saveFailedTitle'), t('preRide.saveFailedBody'));
    } finally {
      setSaving(false);
    }
  };

  const handleSave = () => {
    if (completedChecks < items.length) {
      Alert.alert(
        t('preRide.incompleteTitle'),
        t('preRide.incompleteBody', { completed: completedChecks, total: items.length }),
        [{ text: t('common.cancel'), style: 'cancel' }, { text: t('preRide.saveAnyway'), onPress: performSave }]
      );
      return;
    }
    void performSave();
  };

  if (loading || loadError) {
    return <ScreenLoadState error={loadError} loading={loading} onBack={() => navigation.goBack()} onRetry={reload} title={t('preRide.title')} />;
  }

  return (
    <AppScreen edges={['top', 'bottom', 'left', 'right']}>
      <AppTopBar
        tone="subtle"
        className="z-50"
        leading={<AppIconButton accessibilityLabel={t('common.back')} icon={isRTL ? 'arrow-forward' : 'arrow-back'} onPress={() => navigation.goBack()} />}
      >
        <Text className="font-headline uppercase tracking-widest text-sm font-bold text-[#a9c7ff]" numberOfLines={1}>{t('preRide.title')}</Text>
      </AppTopBar>

      <ScrollView className="flex-1" contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 28, paddingBottom: 32 }}>
        <ActiveVehicleChip />
        {!modelProfile ? (
          <View className="bg-surface-container-lowest border border-outline-variant/15 rounded-xl p-6 mt-5">
            <Text className="font-headline text-xl font-bold text-on-surface">{t('preRide.manualRequired')}</Text>
            <Text className="font-body text-sm text-on-surface-variant leading-6 mt-2">{t('preRide.manualRequiredBody')}</Text>
          </View>
        ) : (
          <>
            <View className="bg-surface-container-lowest border border-primary/20 rounded-xl p-4 mt-4 mb-5">
              <Text className="font-label text-xs font-bold text-primary uppercase tracking-wider">{t('preRide.checklistSource')}</Text>
              <Text className="font-headline text-base font-bold text-on-surface mt-1">{modelProfile.modelName} · {selectedVariant?.name ?? modelProfile.manualYears}</Text>
              <Text className="font-body text-xs text-on-surface-variant mt-1">{t('preRide.sourceBody')}</Text>
              {isRTL ? <Text className="font-body text-xs text-on-surface-variant mt-2">{t('common.manualEnglishNotice')}</Text> : null}
            </View>

            <View className="relative mx-auto mb-8 items-center justify-center" style={{ height: gaugeSize, width: gaugeSize }}>
              <Svg width={gaugeSize} height={gaugeSize} viewBox="0 0 100 100" style={{ position: 'absolute', top: 0, left: 0, transform: [{ rotate: '-90deg' }] }}>
                <Defs>
                  <LinearGradient id="gaugeGradient" x1="0%" x2="100%" y1="0%" y2="0%">
                    <Stop offset="0%" stopColor="#a9c7ff" />
                    <Stop offset="100%" stopColor="#418df5" />
                  </LinearGradient>
                </Defs>
                <Circle cx="50" cy="50" r="45" fill="none" stroke="#2a3644" strokeWidth="6" />
                <Circle cx="50" cy="50" r="45" fill="none" stroke="url(#gaugeGradient)" strokeWidth="6" strokeLinecap="round" strokeDasharray={`${circumference} ${circumference}`} strokeDashoffset={strokeDashoffset} />
              </Svg>
              <View className="items-center z-10">
                <Text className="font-label text-xs uppercase tracking-widest text-secondary/60">{t('preRide.checksCompleted')}</Text>
                <Text className="font-headline text-5xl font-bold tracking-tighter text-secondary mt-1">{formatNumber(readiness, locale)}%</Text>
                <Text className="font-label text-xs uppercase font-bold text-primary mt-2">{t('preRide.completedCount', { completed: completedChecks, total: items.length })}</Text>
              </View>
            </View>

            {items.length === 0 ? (
              <View className="bg-surface-container-lowest border border-outline-variant/15 rounded-xl p-5">
                <Text className="font-headline text-base font-bold text-on-surface">{t('preRide.noChecklist')}</Text>
              </View>
            ) : items.map((item) => {
              const isChecked = Boolean(checked[item.recordId]);
              return (
                <TouchableOpacity
                  accessibilityLabel={`${recordTitle(item)}: ${isChecked ? t('preRide.checked') : t('preRide.notChecked')}`}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: isChecked }}
                  className={`rounded-xl p-5 border-l-4 mb-4 ${isChecked ? 'bg-surface-container-high border-emerald-500' : 'bg-surface-container-low border-transparent'}`}
                  key={item.recordId}
                  onPress={() => setChecked((current) => ({ ...current, [item.recordId]: !isChecked }))}
                >
                  <View className="flex-row items-start gap-4">
                    <View className="w-11 h-11 rounded-lg bg-surface-container-highest items-center justify-center">
                      <MaterialIcons name={isChecked ? 'check-circle' : 'fact-check'} size={23} color={isChecked ? '#10b981' : '#c6c6c6'} />
                    </View>
                    <View className="flex-1">
                      <Text className="font-headline text-sm font-bold text-on-surface capitalize">{recordTitle(item)}</Text>
                      <Text className="font-body text-xs text-on-surface-variant leading-5 mt-1">{formatKnowledgeValue(item.value)}</Text>
                    </View>
                  </View>
                </TouchableOpacity>
              );
            })}

            {items.length > 0 ? (
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityState={{ disabled: saving, busy: saving }}
                className={`h-16 rounded-xl mt-4 flex-row items-center justify-center gap-3 ${readiness === 100 ? 'bg-emerald-600' : 'bg-secondary'}`}
                disabled={saving}
                onPress={handleSave}
              >
                {saving ? <ActivityIndicator color="#030f1c" /> : <MaterialIcons name="save" size={24} color="#030f1c" />}
                <Text className="text-[#030f1c] font-headline font-bold uppercase tracking-[0.16em]">{saving ? t('preRide.saving') : t('preRide.saveCheck')}</Text>
              </TouchableOpacity>
            ) : null}
          </>
        )}
      </ScrollView>
    </AppScreen>
  );
}
