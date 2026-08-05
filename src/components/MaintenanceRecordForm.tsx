import React, { useEffect, useMemo, useState } from 'react';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import ProtectedModal from './ProtectedModal';
import AppBottomSheet from './ui/AppBottomSheet';
import AppPrimaryButton from './ui/AppPrimaryButton';
import AppTextField from './ui/AppTextField';
import { isPastOrTodayIsoDate, toIsoDate } from '../utils/dates';
import { parseDecimalNumberInput, parseWholeNumberInput } from '../utils/recordValidation';
import type { InspectionResult, MaintenanceAction } from '../maintenance/types';

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

const CONDITION_RESULTS: { value: InspectionResult; label: string }[] = [
  { value: 'healthy', label: 'Healthy' },
  { value: 'cleaning_needed', label: 'Cleaning needed' },
  { value: 'monitor', label: 'Monitor' },
  { value: 'service_soon', label: 'Service soon' },
  { value: 'replace_soon', label: 'Replace soon' },
  { value: 'replace_now', label: 'Replace now' },
  { value: 'unable_to_inspect', label: 'Unable to inspect' },
];

const OIL_TYPES: { value: NonNullable<MaintenanceRecordDraft['oilType']>; label: string }[] = [
  { value: 'mineral', label: 'Mineral' },
  { value: 'semi_synthetic', label: 'Semi-synthetic' },
  { value: 'synthetic', label: 'Synthetic' },
  { value: 'other', label: 'Other' },
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
  submitLabel = 'Save maintenance',
  title: formTitle = 'Maintenance record',
  visible,
}: Props) {
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
    if (!trimmedTitle) nextErrors.title = 'Enter a useful record title.';
    if (selectedActions.length === 0 && actionOptions.length > 0) {
      nextErrors.actions = 'Select at least one completed action.';
    }

    let mileageKm: number | null = null;
    if (!mileageUnknown) {
      const result = parseWholeNumberInput(mileage, { label: 'Mileage when performed', min: 0 });
      if (!result.ok) nextErrors.mileage = result.message;
      else if (result.value > currentOdometerKm) {
        nextErrors.mileage = `Mileage cannot exceed the current odometer (${currentOdometerKm.toLocaleString()} km).`;
      } else mileageKm = result.value;
    }

    let serviceDate: string | null = null;
    if (!dateUnknown) {
      if (!isPastOrTodayIsoDate(date)) nextErrors.date = 'Enter a real date on or before today (YYYY-MM-DD).';
      else serviceDate = date;
    }

    if (mileageUnknown && dateUnknown) {
      nextErrors.mileage = 'Keep either the mileage or date so this record can be placed in history.';
      nextErrors.date = 'Keep either the date or mileage so this record can be placed in history.';
    }

    let parsedCost: number | null = null;
    if (cost.trim()) {
      const result = parseDecimalNumberInput(cost, { label: 'Cost', min: 0 });
      if (!result.ok) nextErrors.cost = result.message;
      else parsedCost = result.value;
    }

    for (const option of selectedActions) {
      if (option.requiresConditionResult && !conditionResults[option.ruleId]) {
        nextErrors[`condition:${option.ruleId}`] = `Select the result for ${option.label}.`;
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
                    {allowMultipleActions ? 'Actions completed' : 'Component and action'}
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
                label="Record title"
                onChangeText={setRecordTitle}
                placeholder={allowMultipleActions ? 'e.g. 10,000 km workshop service' : 'e.g. Engine oil change'}
                value={recordTitle}
              />

              <View>
                <View className="flex-row items-center justify-between mb-2">
                  <Text className="font-label text-xs uppercase font-bold text-on-surface-variant/60 tracking-widest">Mileage when performed</Text>
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
                    <Text className="font-body text-xs text-primary">Unknown</Text>
                  </TouchableOpacity>
                </View>
                <AppTextField
                  containerClassName="-mt-2"
                  editable={!mileageUnknown}
                  error={errors.mileage}
                  keyboardType="number-pad"
                  label=""
                  onChangeText={setMileage}
                  placeholder={currentOdometerKm.toLocaleString()}
                  value={mileage}
                />
                <Text className="font-body text-xs text-on-surface-variant mt-2">Current odometer: {currentOdometerKm.toLocaleString()} km</Text>
              </View>

              <View>
                <View className="flex-row items-center justify-between mb-2">
                  <Text className="font-label text-xs uppercase font-bold text-on-surface-variant/60 tracking-widest">Date when performed</Text>
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
                    <Text className="font-body text-xs text-primary">Unknown</Text>
                  </TouchableOpacity>
                </View>
                <AppTextField
                  autoCapitalize="none"
                  containerClassName="-mt-2"
                  editable={!dateUnknown}
                  error={errors.date}
                  label=""
                  onChangeText={setDate}
                  placeholder="YYYY-MM-DD"
                  value={date}
                />
              </View>

              {selectedActions.filter((option) => option.requiresConditionResult).map((option) => (
                <View key={`condition:${option.ruleId}`}>
                  <Text className="font-label text-xs uppercase font-bold text-on-surface-variant/60 tracking-widest mb-2">
                    {option.label} result
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
                          <Text className={`font-body text-xs ${selected ? 'text-primary' : 'text-on-surface-variant'}`}>{result.label}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                  {errors[`condition:${option.ruleId}`] ? (
                    <Text className="text-error font-body text-xs mt-2">{errors[`condition:${option.ruleId}`]}</Text>
                  ) : null}
                </View>
              ))}

              <AppTextField label="Workshop or service provider (optional)" onChangeText={setServiceProvider} value={serviceProvider} />
              <AppTextField error={errors.cost} keyboardType="decimal-pad" label="Cost in EGP (optional)" onChangeText={setCost} value={cost} />
              <AppTextField label="Notes (optional)" multiline onChangeText={setNotes} style={{ minHeight: 84, textAlignVertical: 'top' }} value={notes} />

              {containsOilReplacement ? (
                <View className="rounded-xl border border-outline-variant/20 bg-surface-container-low p-4 gap-4">
                  <View>
                    <Text className="font-headline text-base font-bold text-on-surface">Oil details (optional)</Text>
                    <Text className="font-body text-xs text-on-surface-variant mt-1">Oil details do not change your reminder interval.</Text>
                  </View>
                  <AppTextField label="Oil brand" onChangeText={setOilBrand} value={oilBrand} />
                  <View>
                    <Text className="font-label text-xs uppercase font-bold text-on-surface-variant/60 tracking-widest mb-2">Oil type</Text>
                    <View className="flex-row flex-wrap gap-2">
                      {OIL_TYPES.map((option) => (
                        <TouchableOpacity
                          key={option.value}
                          accessibilityRole="radio"
                          accessibilityState={{ checked: oilType === option.value }}
                          className={`min-h-11 justify-center rounded-lg border px-3 ${oilType === option.value ? 'border-primary bg-primary/15' : 'border-outline-variant/20 bg-surface-container-high'}`}
                          onPress={() => setOilType((current) => current === option.value ? null : option.value)}
                        >
                          <Text className={`font-body text-xs ${oilType === option.value ? 'text-primary' : 'text-on-surface-variant'}`}>{option.label}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>
                  <AppTextField autoCapitalize="characters" label="Viscosity" onChangeText={setOilViscosity} placeholder="e.g. 10W-40" value={oilViscosity} />
                  <AppTextField label="Mechanic recommendation" multiline onChangeText={setMechanicRecommendation} value={mechanicRecommendation} />
                </View>
              ) : null}

              <AppPrimaryButton disabled={saving} label={submitLabel} loading={saving} onPress={() => void submit()} />
            </View>
          </ScrollView>
        </AppBottomSheet>
      </View>
    </ProtectedModal>
  );
}
