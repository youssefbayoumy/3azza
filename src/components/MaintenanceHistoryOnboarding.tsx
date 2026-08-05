import React, { useMemo, useState } from 'react';
import { AccessibilityInfo, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import AppPrimaryButton from './ui/AppPrimaryButton';
import AppTextField from './ui/AppTextField';
import { isPastOrTodayIsoDate, toIsoDate } from '../utils/dates';
import { parseWholeNumberInput } from '../utils/recordValidation';

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

const KNOWLEDGE_OPTIONS: { value: MaintenanceHistoryLevel; label: string; detail: string }[] = [
  { value: 'detailed_records', label: 'I have detailed records', detail: 'Add exact recent maintenance now.' },
  { value: 'recent_memory', label: 'I remember recent maintenance', detail: 'Add only the important work you know.' },
  { value: 'little_or_none', label: 'I have little or no history', detail: 'Continue without made-up dates or mileage.' },
];

const BASELINES: { key: MaintenanceHistoryBaselineKey; label: string }[] = [
  { key: 'engine_oil', label: 'Last engine oil change' },
  { key: 'transmission_oil', label: 'Last gear-oil change' },
  { key: 'air_filter', label: 'Last air-filter service' },
  { key: 'general_inspection', label: 'Last general workshop inspection' },
];

const CHOICES: { value: HistoryBaselineChoice; label: string }[] = [
  { value: 'exact', label: 'Exact record' },
  { value: 'unknown', label: "I don't know" },
  { value: 'never_done', label: 'Never done' },
  { value: 'not_applicable', label: 'Not applicable' },
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
  currentOdometerKm,
  onComplete,
  onSkip,
  saving = false,
}: Props) {
  const [stage, setStage] = useState<'knowledge' | 'baselines'>('knowledge');
  const [level, setLevel] = useState<MaintenanceHistoryLevel | null>(null);
  const [baselineState, setBaselineState] = useState(() => createBaselineState(currentOdometerKm));
  const [knownIssues, setKnownIssues] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const exactCount = useMemo(() => Object.values(baselineState).filter((value) => value.choice === 'exact').length, [baselineState]);

  const updateBaseline = (key: MaintenanceHistoryBaselineKey, partial: Partial<BaselineState>) => {
    setBaselineState((current) => ({ ...current, [key]: { ...current[key], ...partial } }));
    setErrors((current) => ({ ...current, [key]: '' }));
  };

  const continueFromKnowledge = async () => {
    if (!level) {
      const message = 'Choose the option that best matches what you know.';
      setErrors({ level: message });
      AccessibilityInfo.announceForAccessibility(message);
      return;
    }
    if (level === 'little_or_none') {
      await onComplete({
        level,
        baselines: BASELINES.map(({ key }) => ({ key, choice: 'unknown', mileageKm: null, serviceDate: null })),
        knownIssues: knownIssues.trim(),
      });
      return;
    }
    setStage('baselines');
    AccessibilityInfo.announceForAccessibility('Add what you know. Enter only exact maintenance records you know.');
  };

  const submitBaselines = async () => {
    if (!level) return;
    const nextErrors: Record<string, string> = {};
    const drafts = BASELINES.map(({ key }) => {
      const state = baselineState[key];
      if (state.choice !== 'exact') {
        return { key, choice: state.choice, mileageKm: null, serviceDate: null } as MaintenanceHistoryBaselineDraft;
      }
      const baselineErrors: string[] = [];
      const mileageResult = parseWholeNumberInput(state.mileage, { label: 'Historical mileage', min: 0 });
      if (!mileageResult.ok) baselineErrors.push(mileageResult.message);
      else if (mileageResult.value > currentOdometerKm) {
        baselineErrors.push(`Mileage cannot exceed ${currentOdometerKm.toLocaleString()} km.`);
      }
      if (!isPastOrTodayIsoDate(state.date)) baselineErrors.push('Enter a real date on or before today.');
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
        `Please review the maintenance history fields. ${Object.values(nextErrors).join(' ')}`
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
                How much maintenance history do you know?
              </Text>
              <Text className="font-body text-sm text-on-surface-variant mt-3 leading-6">
                This helps 3azza avoid false overdue reminders. You can add or change records later.
              </Text>

              <View className="gap-3 mt-7">
                {KNOWLEDGE_OPTIONS.map((option) => {
                  const selected = level === option.value;
                  return (
                    <TouchableOpacity
                      key={option.value}
                      accessibilityLabel={`${option.label}. ${option.detail}`}
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
                        <Text className="font-headline text-base font-bold text-on-surface">{option.label}</Text>
                        <Text className="font-body text-xs text-on-surface-variant mt-1 leading-5">{option.detail}</Text>
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
                  label="Known brake, tire, battery, engine, or mechanical issues (optional)"
                  multiline
                  onChangeText={setKnownIssues}
                  style={{ minHeight: 96, textAlignVertical: 'top' }}
                  value={knownIssues}
                />
              ) : null}

              <AppPrimaryButton className="mt-7" label={level === 'little_or_none' ? 'Continue' : 'Next'} loading={saving} onPress={() => void continueFromKnowledge()} />
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityState={{ disabled: saving }}
                className="min-h-12 items-center justify-center mt-2"
                disabled={saving}
                onPress={() => void onSkip()}
              >
                <Text className="font-label text-sm font-bold text-on-surface-variant">Skip for now</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <Text accessibilityLiveRegion="polite" accessibilityRole="header" className="font-headline text-3xl font-bold text-on-surface mt-6">Add what you know</Text>
              <Text className="font-body text-sm text-on-surface-variant mt-3 leading-6">
                Only exact entries create a countdown. Unknown answers stay honest and do not block setup.
              </Text>

              <View className="gap-4 mt-7">
                {BASELINES.map((baseline) => {
                  const state = baselineState[baseline.key];
                  return (
                    <View key={baseline.key} className="rounded-xl border border-outline-variant/20 bg-surface-container-low p-4">
                      <Text className="font-headline text-base font-bold text-on-surface">{baseline.label}</Text>
                      {baseline.key === 'air_filter' ? (
                        <View className="flex-row gap-2 mt-3">
                          {(['clean', 'replace'] as const).map((action) => (
                            <TouchableOpacity
                              key={action}
                              accessibilityLabel={`${baseline.label}: ${action === 'clean' ? 'Cleaned' : 'Replaced'}`}
                              accessibilityRole="radio"
                              accessibilityState={{ checked: state.airFilterAction === action }}
                              className={`min-h-11 flex-1 items-center justify-center rounded-lg border ${state.airFilterAction === action ? 'border-primary bg-primary/15' : 'border-outline-variant/20'}`}
                              onPress={() => updateBaseline(baseline.key, { airFilterAction: action })}
                            >
                              <Text className={`font-body text-xs ${state.airFilterAction === action ? 'text-primary' : 'text-on-surface-variant'}`}>{action === 'clean' ? 'Cleaned' : 'Replaced'}</Text>
                            </TouchableOpacity>
                          ))}
                        </View>
                      ) : null}
                      <View className="flex-row flex-wrap gap-2 mt-3">
                        {CHOICES.map((choice) => {
                          const selected = state.choice === choice.value;
                          return (
                            <TouchableOpacity
                              key={choice.value}
                              accessibilityLabel={`${baseline.label}: ${choice.label}`}
                              accessibilityRole="radio"
                              accessibilityState={{ checked: selected }}
                              className={`min-h-11 justify-center rounded-lg border px-3 ${selected ? 'border-primary bg-primary/15' : 'border-outline-variant/20 bg-surface-container-high'}`}
                              onPress={() => updateBaseline(baseline.key, { choice: choice.value })}
                            >
                              <Text className={`font-body text-xs ${selected ? 'text-primary' : 'text-on-surface-variant'}`}>{choice.label}</Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                      {state.choice === 'exact' ? (
                        <View className="flex-row gap-3 mt-4">
                          <AppTextField
                            accessibilityLabel={`${baseline.label} mileage in kilometres`}
                            containerClassName="flex-1"
                            keyboardType="number-pad"
                            label="Mileage"
                            onChangeText={(value) => updateBaseline(baseline.key, { mileage: value })}
                            value={state.mileage}
                          />
                          <AppTextField
                            accessibilityLabel={`${baseline.label} date`}
                            autoCapitalize="none"
                            containerClassName="flex-1"
                            label="Date"
                            onChangeText={(value) => updateBaseline(baseline.key, { date: value })}
                            placeholder="YYYY-MM-DD"
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
                label="Known brake, tire, battery, engine, or mechanical issues (optional)"
                multiline
                onChangeText={setKnownIssues}
                style={{ minHeight: 96, textAlignVertical: 'top' }}
                value={knownIssues}
              />

              <Text className="font-body text-xs text-on-surface-variant mt-4">{exactCount} exact {exactCount === 1 ? 'record' : 'records'} ready to add</Text>
              <AppPrimaryButton className="mt-4" label="Finish setup" loading={saving} onPress={() => void submitBaselines()} />
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityState={{ disabled: saving }}
                className="min-h-12 items-center justify-center mt-2"
                disabled={saving}
                onPress={() => {
                  setStage('knowledge');
                  AccessibilityInfo.announceForAccessibility('How much maintenance history do you know?');
                }}
              >
                <Text className="font-label text-sm font-bold text-on-surface-variant">Back</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </ScrollView>
    </View>
  );
}
