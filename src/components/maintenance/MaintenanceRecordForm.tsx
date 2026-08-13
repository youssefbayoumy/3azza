import React, { useEffect, useMemo, useState } from 'react';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import ProtectedModal from '../ProtectedModal';
import AppBottomSheet from '../ui/AppBottomSheet';
import AppDateField from '../ui/AppDateField';
import AppPrimaryButton from '../ui/AppPrimaryButton';
import AppTextField from '../ui/AppTextField';
import { isPastOrTodayIsoDate, toIsoDate } from '../../utils/dates';
import { parseDecimalNumberInput, parseWholeNumberInput } from '../../utils/recordValidation';
import type { InspectionResult, MaintenanceAction } from '../../maintenance/types';
import { formatNumber, useTranslation, type TranslationKey } from '../../i18n';

export type MaintenanceRecordActionOption = {
  ruleId: string;
  componentId: string;
  action: MaintenanceAction;
  label: string;
  requiresConditionResult?: boolean;
};

export type MaintenanceRecordDraft = {
  title: string;
  serviceDate: string | null;
  mileageKm: number | null;
  selectedActions: MaintenanceRecordActionOption[];
  conditionResults: Partial<Record<string, InspectionResult>>;
  cost: number | null;
  notes: string;
  serviceProvider: string;
  oilBrand: string;
  oilType: 'mineral' | 'semi_synthetic' | 'synthetic' | 'other' | null;
  oilViscosity: string;
  mechanicRecommendation: string;
};

export type MaintenanceRecordFormInitialValue = Partial<MaintenanceRecordDraft>;

type Props = {
  visible: boolean;
  currentOdometerKm: number;
  actionOptions: MaintenanceRecordActionOption[];
  initialValue?: MaintenanceRecordFormInitialValue;
  allowMultipleActions?: boolean;
  actionsLocked?: boolean;
  advisoryText?: string;
  saving?: boolean;
  submitLabel?: string;
  title?: string;
  onClose: () => void;
  onSubmit: (draft: MaintenanceRecordDraft) => Promise<void> | void;
};

const CONDITION_RESULTS: { value: InspectionResult; labelKey: TranslationKey }[] = [
  { value: 'healthy', labelKey: 'record.healthy' },
  { value: 'cleaning_needed', labelKey: 'record.cleaningNeeded' },
  { value: 'monitor', labelKey: 'record.monitor' },
  { value: 'service_soon', labelKey: 'record.serviceSoon' },
  { value: 'replace_soon', labelKey: 'record.replaceSoon' },
  { value: 'replace_now', labelKey: 'record.replaceNow' },
  { value: 'unable_to_inspect', labelKey: 'record.unableInspect' },
];

const OIL_TYPES: { value: NonNullable<MaintenanceRecordDraft['oilType']>; labelKey: TranslationKey }[] = [
  { value: 'mineral', labelKey: 'record.mineral' },
  { value: 'semi_synthetic', labelKey: 'record.semiSynthetic' },
  { value: 'synthetic', labelKey: 'record.synthetic' },
  { value: 'other', labelKey: 'record.other' },
];

function defaultSelectedActions(
  options: MaintenanceRecordActionOption[],
  initialValue?: MaintenanceRecordFormInitialValue
): MaintenanceRecordActionOption[] {
  if (initialValue?.selectedActions) return initialValue.selectedActions;
  return options.length === 1 ? options : [];
}

export default function MaintenanceRecordForm({
  actionOptions,
  actionsLocked = false,
  advisoryText,
  allowMultipleActions = false,
  currentOdometerKm,
  initialValue,
  onClose,
  onSubmit,
  saving = false,
  submitLabel,
  title: formTitleProp,
  visible,
}: Props) {
  const { locale, t } = useTranslation();
  const formTitle = formTitleProp ?? t('record.formTitle');
  const resolvedSubmitLabel = submitLabel ?? t('record.saveMaintenance');
  const [recordTitle, setRecordTitle] = useState('');
  const [mileage, setMileage] = useState(String(currentOdometerKm));
  const [mileageUnknown, setMileageUnknown] = useState(false);
  const [date, setDate] = useState(toIsoDate(new Date()));
  const [dateUnknown, setDateUnknown] = useState(false);
  const [selectedActions, setSelectedActions] = useState<MaintenanceRecordActionOption[]>([]);
  const [conditionResults, setConditionResults] = useState<Partial<Record<string, InspectionResult>>>({});
  const [cost, setCost] = useState('');
  const [notes, setNotes] = useState('');
  const [serviceProvider, setServiceProvider] = useState('');
  const [oilBrand, setOilBrand] = useState('');
  const [oilType, setOilType] = useState<MaintenanceRecordDraft['oilType']>(null);
  const [oilViscosity, setOilViscosity] = useState('');
  const [mechanicRecommendation, setMechanicRecommendation] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!visible) return;
    const initialMileage = initialValue?.mileageKm;
    const initialDate = initialValue?.serviceDate;
    const initialActions = defaultSelectedActions(actionOptions, initialValue);
    setRecordTitle(initialValue?.title ?? (initialActions.length === 1 ? initialActions[0].label : ''));
    setMileage(String(initialMileage ?? currentOdometerKm));
    setMileageUnknown(initialMileage === null);
    setDate(initialDate ?? toIsoDate(new Date()));
    setDateUnknown(initialDate === null);
    setSelectedActions(initialActions);
    setConditionResults(initialValue?.conditionResults ?? {});
    setCost(initialValue?.cost === null || initialValue?.cost === undefined ? '' : String(initialValue.cost));
    setNotes(initialValue?.notes ?? '');
    setServiceProvider(initialValue?.serviceProvider ?? '');
    setOilBrand(initialValue?.oilBrand ?? '');
    setOilType(initialValue?.oilType ?? null);
    setOilViscosity(initialValue?.oilViscosity ?? '');
    setMechanicRecommendation(initialValue?.mechanicRecommendation ?? '');
    setErrors({});
  }, [actionOptions, currentOdometerKm, initialValue, visible]);

  const containsOilReplacement = useMemo(() => selectedActions.some(
    (option) => option.componentId === 'engine-oil' && option.action === 'replace'
  ), [selectedActions]);

  const toggleAction = (option: MaintenanceRecordActionOption) => {
    if (actionsLocked) return;
    setSelectedActions((current) => {
      if (!allowMultipleActions) return current.some((item) => item.ruleId === option.ruleId) ? [] : [option];
      return current.some((item) => item.ruleId === option.ruleId)
        ? current.filter((item) => item.ruleId !== option.ruleId)
        : [...current, option];
    });
    setErrors((current) => ({ ...current, actions: '' }));
  };

  const validate = (): MaintenanceRecordDraft | null => {
    const nextErrors: Record<string, string> = {};
    const trimmedTitle = recordTitle.trim();
    if (!trimmedTitle) nextErrors.title = t('record.titleRequired');
    if (selectedActions.length === 0 && actionOptions.length > 0) {
      nextErrors.actions = t('record.actionRequired');
    }

    let mileageKm: number | null = null;
    if (!mileageUnknown) {
      const result = parseWholeNumberInput(mileage, { label: t('record.mileageWhenPerformed'), min: 0 });
      if (!result.ok) nextErrors.mileage = result.message;
      else if (result.value > currentOdometerKm) {
        nextErrors.mileage = t('record.mileageMax', { km: formatNumber(currentOdometerKm, locale) });
      } else mileageKm = result.value;
    }

    let serviceDate: string | null = null;
    if (!dateUnknown) {
      if (!isPastOrTodayIsoDate(date)) nextErrors.date = t('record.dateInvalid');
      else serviceDate = date;
    }

    if (mileageUnknown && dateUnknown) {
      nextErrors.mileage = t('record.keepMileage');
      nextErrors.date = t('record.keepDate');
    }

    let parsedCost: number | null = null;
    if (cost.trim()) {
      const result = parseDecimalNumberInput(cost, { label: t('record.cost'), min: 0 });
      if (!result.ok) nextErrors.cost = result.message;
      else parsedCost = result.value;
    }

    for (const option of selectedActions) {
      if (option.requiresConditionResult && !conditionResults[option.ruleId]) {
        nextErrors[`condition:${option.ruleId}`] = t('record.resultRequired', { label: option.label });
      }
    }

    setErrors(nextErrors);
    if (Object.values(nextErrors).some(Boolean)) return null;
    return {
      title: trimmedTitle,
      serviceDate,
      mileageKm,
      selectedActions,
      conditionResults,
      cost: parsedCost,
      notes: notes.trim(),
      serviceProvider: serviceProvider.trim(),
      oilBrand: oilBrand.trim(),
      oilType,
      oilViscosity: oilViscosity.trim(),
      mechanicRecommendation: mechanicRecommendation.trim(),
    };
  };

  const submit = async () => {
    const draft = validate();
    if (draft) await onSubmit(draft);
  };

  return (
    <ProtectedModal
      accessibilityLabel={formTitle}
      animationType="slide"
      onRequestClose={onClose}
      transparent
      visible={visible}
    >
      <View className="flex-1 bg-black/70">
        <AppBottomSheet closeDisabled={saving} onClose={onClose} title={formTitle}>
          <ScrollView
            contentContainerStyle={{ paddingBottom: 12 }}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View className="gap-5">
              {advisoryText ? (
                <View accessibilityLiveRegion="polite" className="rounded-xl border border-primary/20 bg-primary/10 p-3 flex-row items-start gap-2">
                  <MaterialIcons color="#a9c7ff" name="info-outline" size={19} />
                  <Text className="font-body text-xs text-on-surface-variant leading-5 flex-1">{advisoryText}</Text>
                </View>
              ) : null}
              {actionOptions.length > 0 ? (
                <View>
                  <Text className="font-label text-xs uppercase font-bold text-on-surface-variant/60 tracking-widest mb-2">
                    {allowMultipleActions ? t('record.actionsCompleted') : t('record.componentAction')}
                  </Text>
                  <View className="gap-2">
                    {actionOptions.map((option) => {
                      const selected = selectedActions.some((item) => item.ruleId === option.ruleId);
                      return (
                        <TouchableOpacity
                          key={option.ruleId}
                          accessibilityRole={allowMultipleActions ? 'checkbox' : 'radio'}
                          accessibilityState={{ checked: selected, disabled: actionsLocked }}
                          activeOpacity={actionsLocked ? 1 : 0.8}
                          className={`min-h-12 rounded-xl border px-4 py-3 flex-row items-center gap-3 ${selected ? 'border-primary bg-primary/15' : 'border-outline-variant/20 bg-surface-container-high'}`}
                          disabled={actionsLocked}
                          onPress={() => toggleAction(option)}
                        >
                          <MaterialIcons
                            color={selected ? '#a9c7ff' : '#8e9196'}
                            name={selected ? 'check-box' : allowMultipleActions ? 'check-box-outline-blank' : 'radio-button-unchecked'}
                            size={21}
                          />
                          <Text className={`font-body text-sm flex-1 ${selected ? 'text-on-surface' : 'text-on-surface-variant'}`}>
                            {option.label}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                  {errors.actions ? <Text className="text-error font-body text-xs mt-2">{errors.actions}</Text> : null}
                </View>
              ) : null}

              <AppTextField
                error={errors.title}
                label={t('record.title')}
                onChangeText={setRecordTitle}
                placeholder={allowMultipleActions ? t('record.multiExample') : t('record.singleExample')}
                value={recordTitle}
              />

              <View>
                <View className="flex-row items-center justify-between mb-2">
                  <Text className="font-label text-xs uppercase font-bold text-on-surface-variant/60 tracking-widest">{t('record.mileageWhenPerformed')}</Text>
                  <TouchableOpacity
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: mileageUnknown }}
                    className="min-h-11 px-2 flex-row items-center gap-2"
                    onPress={() => {
                      setMileageUnknown((value) => !value);
                      setErrors((current) => ({ ...current, mileage: '' }));
                    }}
                  >
                    <MaterialIcons color="#a9c7ff" name={mileageUnknown ? 'check-box' : 'check-box-outline-blank'} size={20} />
                    <Text className="font-body text-xs text-primary">{t('common.unknown')}</Text>
                  </TouchableOpacity>
                </View>
                <AppTextField
                  containerClassName="-mt-2"
                  editable={!mileageUnknown}
                  error={errors.mileage}
                  keyboardType="number-pad"
                  label=""
                  onChangeText={setMileage}
                  placeholder={formatNumber(currentOdometerKm, locale)}
                  value={mileage}
                />
                <Text className="font-body text-xs text-on-surface-variant mt-2">{t('record.currentOdometerValue', { km: formatNumber(currentOdometerKm, locale) })}</Text>
              </View>

              <View>
                <View className="flex-row items-center justify-between mb-2">
                  <Text className="font-label text-xs uppercase font-bold text-on-surface-variant/60 tracking-widest">{t('record.dateWhenPerformed')}</Text>
                  <TouchableOpacity
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: dateUnknown }}
                    className="min-h-11 px-2 flex-row items-center gap-2"
                    onPress={() => {
                      setDateUnknown((value) => !value);
                      setErrors((current) => ({ ...current, date: '' }));
                    }}
                  >
                    <MaterialIcons color="#a9c7ff" name={dateUnknown ? 'check-box' : 'check-box-outline-blank'} size={20} />
                    <Text className="font-body text-xs text-primary">{t('common.unknown')}</Text>
                  </TouchableOpacity>
                </View>
                <AppDateField
                  containerClassName="-mt-2"
                  disabled={dateUnknown}
                  error={errors.date}
                  label=""
                  maximumDate={new Date()}
                  onChange={setDate}
                  value={date}
                />
              </View>

              {selectedActions.filter((option) => option.requiresConditionResult).map((option) => (
                <View key={`condition:${option.ruleId}`}>
                  <Text className="font-label text-xs uppercase font-bold text-on-surface-variant/60 tracking-widest mb-2">
                    {t('record.result', { label: option.label })}
                  </Text>
                  <View className="flex-row flex-wrap gap-2">
                    {CONDITION_RESULTS.map((result) => {
                      const selected = conditionResults[option.ruleId] === result.value;
                      return (
                        <TouchableOpacity
                          key={result.value}
                          accessibilityRole="radio"
                          accessibilityState={{ checked: selected }}
                          className={`min-h-11 justify-center rounded-lg border px-3 ${selected ? 'border-primary bg-primary/15' : 'border-outline-variant/20 bg-surface-container-high'}`}
                          onPress={() => {
                            setConditionResults((current) => ({ ...current, [option.ruleId]: result.value }));
                            setErrors((current) => ({ ...current, [`condition:${option.ruleId}`]: '' }));
                          }}
                        >
                          <Text className={`font-body text-xs ${selected ? 'text-primary' : 'text-on-surface-variant'}`}>{t(result.labelKey)}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                  {errors[`condition:${option.ruleId}`] ? (
                    <Text className="text-error font-body text-xs mt-2">{errors[`condition:${option.ruleId}`]}</Text>
                  ) : null}
                </View>
              ))}

              <AppTextField label={t('record.provider')} onChangeText={setServiceProvider} value={serviceProvider} />
              <AppTextField error={errors.cost} keyboardType="decimal-pad" label={t('record.costOptional')} onChangeText={setCost} value={cost} />
              <AppTextField label={t('record.notesOptional')} multiline onChangeText={setNotes} style={{ minHeight: 84, textAlignVertical: 'top' }} value={notes} />

              {containsOilReplacement ? (
                <View className="rounded-xl border border-outline-variant/20 bg-surface-container-low p-4 gap-4">
                  <View>
                    <Text className="font-headline text-base font-bold text-on-surface">{t('record.oilDetailsOptional')}</Text>
                    <Text className="font-body text-xs text-on-surface-variant mt-1">{t('record.oilReminderNotice')}</Text>
                  </View>
                  <AppTextField label={t('record.oilBrand')} onChangeText={setOilBrand} value={oilBrand} />
                  <View>
                    <Text className="font-label text-xs uppercase font-bold text-on-surface-variant/60 tracking-widest mb-2">{t('record.oilType')}</Text>
                    <View className="flex-row flex-wrap gap-2">
                      {OIL_TYPES.map((option) => (
                        <TouchableOpacity
                          key={option.value}
                          accessibilityRole="radio"
                          accessibilityState={{ checked: oilType === option.value }}
                          className={`min-h-11 justify-center rounded-lg border px-3 ${oilType === option.value ? 'border-primary bg-primary/15' : 'border-outline-variant/20 bg-surface-container-high'}`}
                          onPress={() => setOilType((current) => current === option.value ? null : option.value)}
                        >
                          <Text className={`font-body text-xs ${oilType === option.value ? 'text-primary' : 'text-on-surface-variant'}`}>{t(option.labelKey)}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>
                  <AppTextField autoCapitalize="characters" label={t('record.viscosity')} onChangeText={setOilViscosity} placeholder={t('record.viscosityExample')} value={oilViscosity} />
                  <AppTextField label={t('record.mechanicRecommendation')} multiline onChangeText={setMechanicRecommendation} value={mechanicRecommendation} />
                </View>
              ) : null}

              <AppPrimaryButton disabled={saving} label={resolvedSubmitLabel} loading={saving} onPress={() => void submit()} />
            </View>
          </ScrollView>
        </AppBottomSheet>
      </View>
    </ProtectedModal>
  );
}
