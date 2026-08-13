import React, { useMemo, useState } from 'react';
import { AccessibilityInfo, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import AppDateField from '../ui/AppDateField';
import AppPrimaryButton from '../ui/AppPrimaryButton';
import AppTextField from '../ui/AppTextField';
import { isPastOrTodayIsoDate, toIsoDate } from '../../utils/dates';
import { parseWholeNumberInput } from '../../utils/recordValidation';
import { formatNumber, useTranslation, type TranslationKey } from '../../i18n';

export type MaintenanceHistoryLevel =
  | 'detailed_records'
  | 'recent_memory'
  | 'little_or_none'
  | 'skipped';

export type HistoryBaselineChoice = 'exact' | 'unknown' | 'never_done' | 'not_applicable';

export type MaintenanceHistoryBaselineKey =
  | 'engine_oil'
  | 'transmission_oil'
  | 'air_filter'
  | 'general_inspection';

export type MaintenanceHistoryBaselineDraft = {
  key: MaintenanceHistoryBaselineKey;
  choice: HistoryBaselineChoice;
  mileageKm: number | null;
  serviceDate: string | null;
  airFilterAction?: 'clean' | 'replace';
};

export type MaintenanceHistorySetupDraft = {
  level: MaintenanceHistoryLevel;
  baselines: MaintenanceHistoryBaselineDraft[];
  knownIssues: string;
};

type Props = {
  currentOdometerKm: number;
  baselineKeys?: MaintenanceHistoryBaselineKey[];
  saving?: boolean;
  onComplete: (draft: MaintenanceHistorySetupDraft) => Promise<void> | void;
  onSkip: () => Promise<void> | void;
};

type BaselineState = {
  choice: HistoryBaselineChoice;
  mileage: string;
  date: string;
  airFilterAction: 'clean' | 'replace';
};

const KNOWLEDGE_OPTIONS: { value: MaintenanceHistoryLevel; labelKey: TranslationKey; detailKey: TranslationKey }[] = [
  { value: 'detailed_records', labelKey: 'history.knowledgeDetailed', detailKey: 'history.knowledgeDetailedBody' },
  { value: 'recent_memory', labelKey: 'history.knowledgeRecent', detailKey: 'history.knowledgeRecentBody' },
  { value: 'little_or_none', labelKey: 'history.knowledgeLittle', detailKey: 'history.knowledgeLittleBody' },
];

const BASELINES: { key: MaintenanceHistoryBaselineKey; labelKey: TranslationKey }[] = [
  { key: 'engine_oil', labelKey: 'history.engineOil' },
  { key: 'transmission_oil', labelKey: 'history.gearOil' },
  { key: 'air_filter', labelKey: 'history.airFilter' },
  { key: 'general_inspection', labelKey: 'history.generalInspection' },
];
const ALL_BASELINE_KEYS = BASELINES.map(({ key }) => key);

const CHOICES: { value: HistoryBaselineChoice; labelKey: TranslationKey }[] = [
  { value: 'exact', labelKey: 'history.exact' },
  { value: 'unknown', labelKey: 'history.unknown' },
  { value: 'never_done', labelKey: 'history.never' },
  { value: 'not_applicable', labelKey: 'history.notApplicable' },
];

function createBaselineState(currentOdometerKm: number): Record<MaintenanceHistoryBaselineKey, BaselineState> {
  const today = toIsoDate(new Date());
  return Object.fromEntries(BASELINES.map(({ key }) => [key, {
    choice: 'unknown',
    mileage: String(currentOdometerKm),
    date: today,
    airFilterAction: 'clean',
  }])) as Record<MaintenanceHistoryBaselineKey, BaselineState>;
}

export default function MaintenanceHistoryOnboarding({
  baselineKeys = ALL_BASELINE_KEYS,
  currentOdometerKm,
  onComplete,
  onSkip,
  saving = false,
}: Props) {
  const { locale, t, tp } = useTranslation();
  const [stage, setStage] = useState<'knowledge' | 'baselines'>('knowledge');
  const [level, setLevel] = useState<MaintenanceHistoryLevel | null>(null);
  const [baselineState, setBaselineState] = useState(() => createBaselineState(currentOdometerKm));
  const [knownIssues, setKnownIssues] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const activeBaselines = useMemo(
    () => BASELINES.filter((baseline) => baselineKeys.includes(baseline.key)),
    [baselineKeys]
  );

  const exactCount = useMemo(
    () => activeBaselines.filter(({ key }) => baselineState[key].choice === 'exact').length,
    [activeBaselines, baselineState]
  );

  const updateBaseline = (key: MaintenanceHistoryBaselineKey, partial: Partial<BaselineState>) => {
    setBaselineState((current) => ({ ...current, [key]: { ...current[key], ...partial } }));
    setErrors((current) => ({ ...current, [key]: '' }));
  };

  const continueFromKnowledge = async () => {
    if (!level) {
      const message = t('history.chooseKnowledge');
      setErrors({ level: message });
      AccessibilityInfo.announceForAccessibility(message);
      return;
    }
    if (level === 'little_or_none') {
      await onComplete({
        level,
        baselines: activeBaselines.map(({ key }) => ({ key, choice: 'unknown', mileageKm: null, serviceDate: null })),
        knownIssues: knownIssues.trim(),
      });
      return;
    }
    setStage('baselines');
    AccessibilityInfo.announceForAccessibility(t('history.addAnnouncement'));
  };

  const submitBaselines = async () => {
    if (!level) return;
    const nextErrors: Record<string, string> = {};
    const drafts = activeBaselines.map(({ key }) => {
      const state = baselineState[key];
      if (state.choice !== 'exact') {
        return { key, choice: state.choice, mileageKm: null, serviceDate: null } as MaintenanceHistoryBaselineDraft;
      }
      const baselineErrors: string[] = [];
      const mileageResult = parseWholeNumberInput(state.mileage, { label: t('history.historicalMileage'), min: 0 });
      if (!mileageResult.ok) baselineErrors.push(mileageResult.message);
      else if (mileageResult.value > currentOdometerKm) {
        baselineErrors.push(t('history.mileageMax', { km: formatNumber(currentOdometerKm, locale) }));
      }
      if (!isPastOrTodayIsoDate(state.date)) baselineErrors.push(t('history.dateInvalid'));
      if (baselineErrors.length > 0) nextErrors[key] = baselineErrors.join(' ');
      return {
        key,
        choice: state.choice,
        mileageKm: mileageResult.ok ? mileageResult.value : null,
        serviceDate: isPastOrTodayIsoDate(state.date) ? state.date : null,
        airFilterAction: key === 'air_filter' ? state.airFilterAction : undefined,
      } as MaintenanceHistoryBaselineDraft;
    });

    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      AccessibilityInfo.announceForAccessibility(
        t('history.reviewFields', { errors: Object.values(nextErrors).join(' ') })
      );
      return;
    }
    await onComplete({ level, baselines: drafts, knownIssues: knownIssues.trim() });
  };

  return (
    <View className="flex-1 bg-background">
      <ScrollView
        contentContainerStyle={{ flexGrow: 1, paddingHorizontal: 24, paddingTop: 28, paddingBottom: 36 }}
        keyboardShouldPersistTaps="handled"
      >
        <View className="w-full max-w-xl self-center">
          <View className="w-14 h-14 rounded-2xl bg-primary/10 border border-primary/20 items-center justify-center">
            <MaterialIcons color="#a9c7ff" name="history" size={28} />
          </View>

          {stage === 'knowledge' ? (
            <>
              <Text accessibilityLiveRegion="polite" accessibilityRole="header" className="font-headline text-3xl font-bold text-on-surface mt-6">
                {t('history.knowledgeTitle')}
              </Text>
              <Text className="font-body text-sm text-on-surface-variant mt-3 leading-6">
                {t('history.knowledgeBody')}
              </Text>

              <View className="gap-3 mt-7">
                {KNOWLEDGE_OPTIONS.map((option) => {
                  const selected = level === option.value;
                  const label = t(option.labelKey);
                  const detail = t(option.detailKey);
                  return (
                    <TouchableOpacity
                      key={option.value}
                      accessibilityLabel={`${label}. ${detail}`}
                      accessibilityRole="radio"
                      accessibilityState={{ checked: selected }}
                      className={`min-h-16 rounded-xl border px-4 py-4 flex-row items-start gap-3 ${selected ? 'border-primary bg-primary/15' : 'border-outline-variant/20 bg-surface-container-low'}`}
                      onPress={() => {
                        setLevel(option.value);
                        setErrors({});
                      }}
                    >
                      <MaterialIcons color={selected ? '#a9c7ff' : '#8e9196'} name={selected ? 'radio-button-checked' : 'radio-button-unchecked'} size={22} />
                      <View className="flex-1">
                        <Text className="font-headline text-base font-bold text-on-surface">{label}</Text>
                        <Text className="font-body text-xs text-on-surface-variant mt-1 leading-5">{detail}</Text>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
              {errors.level ? (
                <Text accessibilityLiveRegion="assertive" accessibilityRole="alert" className="text-error font-body text-xs mt-2">
                  {errors.level}
                </Text>
              ) : null}

              {level === 'little_or_none' ? (
                <AppTextField
                  containerClassName="mt-5"
                  label={t('history.knownIssues')}
                  multiline
                  onChangeText={setKnownIssues}
                  style={{ minHeight: 96, textAlignVertical: 'top' }}
                  value={knownIssues}
                />
              ) : null}

              <AppPrimaryButton className="mt-7" label={level === 'little_or_none' ? t('history.continue') : t('history.next')} loading={saving} onPress={() => void continueFromKnowledge()} />
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityState={{ disabled: saving }}
                className="min-h-12 items-center justify-center mt-2"
                disabled={saving}
                onPress={() => void onSkip()}
              >
                <Text className="font-label text-sm font-bold text-on-surface-variant">{t('history.skip')}</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <Text accessibilityLiveRegion="polite" accessibilityRole="header" className="font-headline text-3xl font-bold text-on-surface mt-6">{t('history.addTitle')}</Text>
              <Text className="font-body text-sm text-on-surface-variant mt-3 leading-6">
                {t('history.addBody')}
              </Text>

              <View className="gap-4 mt-7">
                {activeBaselines.map((baseline) => {
                  const state = baselineState[baseline.key];
                  const baselineLabel = t(baseline.labelKey);
                  return (
                    <View key={baseline.key} className="rounded-xl border border-outline-variant/20 bg-surface-container-low p-4">
                      <Text className="font-headline text-base font-bold text-on-surface">{baselineLabel}</Text>
                      {baseline.key === 'air_filter' ? (
                        <View className="flex-row gap-2 mt-3">
                          {(['clean', 'replace'] as const).map((action) => (
                            <TouchableOpacity
                              key={action}
                              accessibilityLabel={t('history.optionA11y', { label: baselineLabel, choice: action === 'clean' ? t('history.cleaned') : t('history.replaced') })}
                              accessibilityRole="radio"
                              accessibilityState={{ checked: state.airFilterAction === action }}
                              className={`min-h-11 flex-1 items-center justify-center rounded-lg border ${state.airFilterAction === action ? 'border-primary bg-primary/15' : 'border-outline-variant/20'}`}
                              onPress={() => updateBaseline(baseline.key, { airFilterAction: action })}
                            >
                              <Text className={`font-body text-xs ${state.airFilterAction === action ? 'text-primary' : 'text-on-surface-variant'}`}>{action === 'clean' ? t('history.cleaned') : t('history.replaced')}</Text>
                            </TouchableOpacity>
                          ))}
                        </View>
                      ) : null}
                      <View className="flex-row flex-wrap gap-2 mt-3">
                        {CHOICES.map((choice) => {
                          const selected = state.choice === choice.value;
                          const choiceLabel = t(choice.labelKey);
                          return (
                            <TouchableOpacity
                              key={choice.value}
                              accessibilityLabel={t('history.optionA11y', { label: baselineLabel, choice: choiceLabel })}
                              accessibilityRole="radio"
                              accessibilityState={{ checked: selected }}
                              className={`min-h-11 justify-center rounded-lg border px-3 ${selected ? 'border-primary bg-primary/15' : 'border-outline-variant/20 bg-surface-container-high'}`}
                              onPress={() => updateBaseline(baseline.key, { choice: choice.value })}
                            >
                              <Text className={`font-body text-xs ${selected ? 'text-primary' : 'text-on-surface-variant'}`}>{choiceLabel}</Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                      {state.choice === 'exact' ? (
                        <View className="flex-row gap-3 mt-4">
                          <AppTextField
                            accessibilityLabel={t('history.mileageA11y', { label: baselineLabel })}
                            containerClassName="flex-1"
                            keyboardType="number-pad"
                            label={t('history.mileage')}
                            onChangeText={(value) => updateBaseline(baseline.key, { mileage: value })}
                            value={state.mileage}
                          />
                          <AppDateField
                            accessibilityLabel={t('history.dateA11y', { label: baselineLabel })}
                            containerClassName="flex-1"
                            label={t('history.date')}
                            maximumDate={new Date()}
                            onChange={(value) => updateBaseline(baseline.key, { date: value })}
                            value={state.date}
                          />
                        </View>
                      ) : null}
                      {errors[baseline.key] ? (
                        <Text accessibilityLiveRegion="assertive" accessibilityRole="alert" className="text-error font-body text-xs mt-2">
                          {errors[baseline.key]}
                        </Text>
                      ) : null}
                    </View>
                  );
                })}
              </View>

              <AppTextField
                containerClassName="mt-5"
                label={t('history.knownIssues')}
                multiline
                onChangeText={setKnownIssues}
                style={{ minHeight: 96, textAlignVertical: 'top' }}
                value={knownIssues}
              />

              <Text className="font-body text-xs text-on-surface-variant mt-4">{tp('history.exactReady', exactCount)}</Text>
              <AppPrimaryButton className="mt-4" label={t('history.finish')} loading={saving} onPress={() => void submitBaselines()} />
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityState={{ disabled: saving }}
                className="min-h-12 items-center justify-center mt-2"
                disabled={saving}
                onPress={() => {
                  setStage('knowledge');
                  AccessibilityInfo.announceForAccessibility(t('history.knowledgeTitle'));
                }}
              >
                <Text className="font-label text-sm font-bold text-on-surface-variant">{t('history.back')}</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </ScrollView>
    </View>
  );
}
