import { useState } from 'react';
import { Text, TextInput, TouchableOpacity, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import {
  isCustomBrandSelection,
  otherBrandOption,
  scooterCatalog,
} from '../../catalog/scooterCatalog';
import {
  answerIdentificationQuestion,
  changeGuidedCatalogSelection,
  changeGuidedCustomIdentity,
  changeGuidedVehicleCapability,
  getDraftCandidates,
  getNextIdentificationQuestion,
  isGuidedSelectionConfirmable,
  markIdentificationUnsure,
  type GuidedScooterSelectionDraft,
} from '../../catalog/guidedScooterIdentification';
import {
  formatIdentificationFeatureValue,
  type IdentificationFeatureKey,
} from '../../modelData/variantIdentification';
import type { VariantIdentificationProfile } from '../../modelData/types';
import { getSelectableMaintenanceProfiles } from '../../maintenance/profiles';
import { useTranslation } from '../../i18n';
import {
  ABS_VALUES,
  BRAKE_SYSTEM_VALUES,
  COOLING_VALUES,
  FINAL_DRIVE_VALUES,
  normalizeVehicleCapabilities,
  POWERTRAIN_VALUES,
  TRANSMISSION_VALUES,
  WHEEL_TYPE_VALUES,
  type VehicleCapabilities,
  type VehicleCapabilityKey,
} from '../../catalog/vehicleCapabilities';

type CatalogSelectionKey = 'brandId' | 'modelId' | 'versionId';

const CAPABILITY_FIELDS = [
  { key: 'powertrain', labelKey: 'scooter.capabilityPowertrain', values: POWERTRAIN_VALUES },
  { key: 'transmission', labelKey: 'scooter.capabilityTransmission', values: TRANSMISSION_VALUES },
  { key: 'finalDrive', labelKey: 'scooter.capabilityFinalDrive', values: FINAL_DRIVE_VALUES },
  { key: 'cooling', labelKey: 'scooter.capabilityCooling', values: COOLING_VALUES },
  { key: 'brakeSystem', labelKey: 'scooter.capabilityBrakes', values: BRAKE_SYSTEM_VALUES },
  { key: 'abs', labelKey: 'scooter.capabilityAbs', values: ABS_VALUES },
  { key: 'wheelType', labelKey: 'scooter.capabilityWheels', values: WHEEL_TYPE_VALUES },
] as const;

const CAPABILITY_VALUE_KEYS = {
  unknown: 'scooter.capabilityUnknown',
  four_stroke: 'scooter.capabilityFourStroke',
  two_stroke: 'scooter.capabilityTwoStroke',
  electric: 'scooter.capabilityElectric',
  cvt: 'scooter.capabilityCvt',
  manual: 'scooter.capabilityManual',
  automatic_other: 'scooter.capabilityAutomaticOther',
  chain: 'scooter.capabilityChain',
  belt: 'scooter.capabilityBelt',
  shaft: 'scooter.capabilityShaft',
  integrated: 'scooter.capabilityIntegrated',
  air: 'scooter.capabilityAirCooled',
  liquid: 'scooter.capabilityLiquidCooled',
  disc: 'scooter.capabilityDisc',
  drum: 'scooter.capabilityDrum',
  mixed: 'scooter.capabilityMixed',
  yes: 'scooter.capabilityYes',
  no: 'scooter.capabilityNo',
  cast: 'scooter.capabilityCast',
  spoke: 'scooter.capabilitySpoke',
} as const;

const FEATURE_LABEL_KEYS = {
  displacementCc: 'scooter.displacement',
  coolingSystem: 'scooter.cooling',
  fuelSystem: 'scooter.fuelSystem',
} as const;

type Props = {
  value: GuidedScooterSelectionDraft;
  onChange: (draft: GuidedScooterSelectionDraft) => void;
  showErrors?: boolean;
};

function CandidateSummary({ candidate }: { candidate: VariantIdentificationProfile }) {
  const { t, tp } = useTranslation();
  const featureLabel = (key: Exclude<IdentificationFeatureKey, 'modelCode'>) => t(FEATURE_LABEL_KEYS[key]);
  const confirmed = (['displacementCc', 'coolingSystem', 'fuelSystem'] as const)
    .flatMap((key) => {
      const feature = candidate[key];
      return feature.status === 'confirmed' && feature.value !== null
        ? [`${featureLabel(key)}: ${formatIdentificationFeatureValue(key, feature.value)}`]
        : [];
    });
  const unavailable = (['displacementCc', 'coolingSystem', 'fuelSystem'] as const)
    .filter((key) => candidate[key].status !== 'confirmed').length;

  return (
    <View className="px-4 py-3 border-b border-outline-variant/10">
      <Text className="font-body text-sm font-bold text-on-surface">
        {candidate.variantName ?? t('scooter.noSeparateVariant')}
      </Text>
      {confirmed.length > 0 ? (
        <Text className="font-body text-xs text-on-surface-variant mt-1 leading-5">{confirmed.join(' - ')}</Text>
      ) : null}
      {unavailable > 0 ? (
        <Text className="font-body text-xs text-on-surface-variant/70 mt-1">
          {tp('scooter.detailsUnavailable', unavailable)}
        </Text>
      ) : null}
    </View>
  );
}

function ConfirmationCard({
  brandName,
  candidate,
  modelName,
  years,
}: {
  brandName: string;
  candidate: VariantIdentificationProfile;
  modelName: string;
  years: string;
}) {
  const { t } = useTranslation();
  const featureLabel = (key: Exclude<IdentificationFeatureKey, 'modelCode'>) => t(FEATURE_LABEL_KEYS[key]);
  const variant = candidate.variantName ?? t('scooter.noSeparateVariant');
  return (
    <View
      accessibilityLabel={t('scooter.confirmA11y', { brand: brandName, model: modelName, years, variant })}
      className="rounded-xl border border-primary/40 bg-primary/10 p-4"
    >
      <View className="flex-row items-center gap-2 mb-3">
        <MaterialIcons name="fact-check" size={21} color="#a9c7ff" />
        <Text accessibilityRole="header" className="font-headline text-base font-bold text-primary">{t('scooter.confirmTitle')}</Text>
      </View>
      <Text className="font-headline text-lg font-bold text-on-surface">{brandName} {modelName}</Text>
      <Text className="font-body text-sm text-on-surface-variant mt-1">{t('scooter.modelYears', { years })}</Text>
      <Text className="font-body text-sm text-on-surface mt-2">
        {t('scooter.exactVariant', { variant })}
      </Text>
      <View className="mt-3 gap-2">
        {(['displacementCc', 'coolingSystem', 'fuelSystem'] as const).map((key) => {
          const feature = candidate[key];
          const value = feature.status === 'confirmed' && feature.value !== null
            ? formatIdentificationFeatureValue(key, feature.value)
            : t('scooter.notAvailable');
          return (
            <Text key={key} className="font-body text-xs text-on-surface-variant leading-5">
              {featureLabel(key)}: {value}
            </Text>
          );
        })}
      </View>
      <Text className="font-body text-xs text-on-surface-variant/80 mt-4 leading-5">
        {t('scooter.reviewIdentity')}
      </Text>
    </View>
  );
}

export default function ScooterSelectionFields({ onChange, showErrors = false, value }: Props) {
  const { t, tp } = useTranslation();
  const [openField, setOpenField] = useState<CatalogSelectionKey | null>(null);
  const [openCapability, setOpenCapability] = useState<VehicleCapabilityKey | null>(null);
  const selection = value.selection;
  const capabilities = normalizeVehicleCapabilities(selection.capabilities);
  const customBrand = isCustomBrandSelection(selection);
  const brand = customBrand
    ? otherBrandOption
    : scooterCatalog.manufacturers.find((item) => item.id === selection.brandId);
  const model = brand?.models.find((item) => item.id === selection.modelId);
  const version = model?.versions.find((item) => item.id === selection.versionId);
  const candidates = getDraftCandidates(value);
  const question = getNextIdentificationQuestion(value);
  const confirmable = isGuidedSelectionConfirmable(value);
  const confirmedCandidate = candidates.length === 1 ? candidates[0] : null;
  const selectableProfiles = getSelectableMaintenanceProfiles();
  const selectableVersionIds = new Set(selectableProfiles.map((item) => item.catalogSelection.versionId));
  const availableBrands = [...scooterCatalog.manufacturers.filter((item) =>
    item.models.some((candidateModel) => candidateModel.versions.some((candidateVersion) =>
      selectableVersionIds.has(candidateVersion.id)
    ))
  ), otherBrandOption];
  const availableModels = (brand?.models ?? []).filter((item) =>
    item.versions.some((candidateVersion) => selectableVersionIds.has(candidateVersion.id))
  );
  const availableVersions = (model?.versions ?? []).filter((item) => selectableVersionIds.has(item.id));

  const catalogFields = [
    {
      key: 'brandId' as const,
      label: t('scooter.brand'),
      placeholder: t('scooter.selectBrand'),
      disabled: false,
      selectedName: customBrand ? t('scooter.otherBrand') : brand?.name,
      options: availableBrands,
    },
    {
      key: 'modelId' as const,
      label: t('scooter.modelFamily'),
      placeholder: brand ? t('scooter.selectModel') : t('scooter.selectBrandFirst'),
      disabled: !brand,
      selectedName: model?.name,
      options: availableModels,
    },
    {
      key: 'versionId' as const,
      label: t('scooter.manualYears'),
      placeholder: model ? t('scooter.selectYears') : t('scooter.selectModelFirst'),
      disabled: !model,
      selectedName: version?.name,
      options: availableVersions,
    },
  ];
  const fields = customBrand ? catalogFields.slice(0, 1) : catalogFields;

  const select = (key: CatalogSelectionKey, id: string) => {
    onChange(changeGuidedCatalogSelection(value, key, id));
    setOpenField(null);
  };

  const selectCapability = (
    key: VehicleCapabilityKey,
    nextValue: VehicleCapabilities[VehicleCapabilityKey]
  ) => {
    onChange(changeGuidedVehicleCapability(value, key, nextValue));
    setOpenCapability(null);
  };

  return (
    <View className="gap-4">
      {fields.map((field, index) => {
        const missing = showErrors && !selection[field.key];
        return (
          <View key={field.key}>
            <View className="flex-row items-center gap-3 mb-2">
              <View className="w-7 h-7 rounded-full bg-primary/15 items-center justify-center">
                <Text className="font-label text-xs font-bold text-primary">{index + 1}</Text>
              </View>
              <Text className="font-label text-xs uppercase font-bold text-on-surface-variant tracking-widest">
                {field.label}
              </Text>
            </View>
            <TouchableOpacity
              accessibilityLabel={t('scooter.fieldA11y', { label: field.label, value: field.selectedName ?? field.placeholder })}
              accessibilityRole="button"
              accessibilityState={{ disabled: field.disabled, expanded: openField === field.key }}
              className={`min-h-14 px-4 py-3 rounded-xl border flex-row items-center justify-between ${
                missing ? 'border-error bg-error/5' : 'border-outline-variant/30 bg-surface-container-high'
              } ${field.disabled ? 'opacity-45' : ''}`}
              disabled={field.disabled}
              onPress={() => setOpenField((current) => current === field.key ? null : field.key)}
            >
              <Text className={`font-body text-base flex-1 ${field.selectedName ? 'text-on-surface' : 'text-on-surface-variant'}`}>
                {field.selectedName ?? field.placeholder}
              </Text>
              <MaterialIcons name={openField === field.key ? 'expand-less' : 'expand-more'} size={22} color="#a9c7ff" />
            </TouchableOpacity>
            {missing ? <Text className="text-error font-body text-xs mt-1">{t('scooter.required', { label: field.label })}</Text> : null}
            {openField === field.key ? (
              <View className="mt-2 rounded-xl overflow-hidden border border-outline-variant/20 bg-surface-container-lowest">
                {field.options.map((option) => (
                  <TouchableOpacity
                    key={option.id}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: selection[field.key] === option.id }}
                    className="min-h-12 px-4 py-3 border-b border-outline-variant/10 flex-row items-center justify-between"
                    onPress={() => select(field.key, option.id)}
                  >
                    <Text className="font-body text-sm text-on-surface flex-1">
                      {option.id === otherBrandOption.id ? t('scooter.otherBrand') : option.name}
                    </Text>
                    {selection[field.key] === option.id ? <MaterialIcons name="check" size={18} color="#a9c7ff" /> : null}
                  </TouchableOpacity>
                ))}
              </View>
            ) : null}
          </View>
        );
      })}

      {customBrand ? (
        <View className="gap-4">
          <View>
            <Text className="font-label text-xs uppercase font-bold text-on-surface-variant tracking-widest mb-2">
              {t('scooter.customBrandName')}
            </Text>
            <TextInput
              accessibilityLabel={t('scooter.customBrandName')}
              autoCapitalize="words"
              className={`min-h-14 px-4 py-3 rounded-xl border bg-surface-container-high text-on-surface font-body text-base ${
                showErrors && !selection.customBrandName?.trim() ? 'border-error' : 'border-outline-variant/30'
              }`}
              maxLength={80}
              onChangeText={(text) => onChange(changeGuidedCustomIdentity(value, 'customBrandName', text))}
              placeholder={t('scooter.customBrandPlaceholder')}
              placeholderTextColor="#8e9196"
              value={selection.customBrandName ?? ''}
            />
            {showErrors && !selection.customBrandName?.trim() ? (
              <Text className="text-error font-body text-xs mt-1">
                {t('scooter.required', { label: t('scooter.customBrandName') })}
              </Text>
            ) : null}
          </View>

          <View>
            <Text className="font-label text-xs uppercase font-bold text-on-surface-variant tracking-widest mb-2">
              {t('scooter.customModelName')}
            </Text>
            <TextInput
              accessibilityLabel={t('scooter.customModelName')}
              autoCapitalize="words"
              className={`min-h-14 px-4 py-3 rounded-xl border bg-surface-container-high text-on-surface font-body text-base ${
                showErrors && !selection.customModelName?.trim() ? 'border-error' : 'border-outline-variant/30'
              }`}
              maxLength={80}
              onChangeText={(text) => onChange(changeGuidedCustomIdentity(value, 'customModelName', text))}
              placeholder={t('scooter.customModelPlaceholder')}
              placeholderTextColor="#8e9196"
              value={selection.customModelName ?? ''}
            />
            {showErrors && !selection.customModelName?.trim() ? (
              <Text className="text-error font-body text-xs mt-1">
                {t('scooter.required', { label: t('scooter.customModelName') })}
              </Text>
            ) : null}
          </View>

          <View className="rounded-xl border border-outline-variant/25 bg-surface-container-high/50 p-4">
            <View className="flex-row items-center gap-2">
              <MaterialIcons name="tune" size={20} color="#a9c7ff" />
              <Text accessibilityRole="header" className="font-headline text-base font-bold text-on-surface">
                {t('scooter.vehicleSystemsTitle')}
              </Text>
            </View>
            <Text className="font-body text-sm text-on-surface-variant mt-2 mb-4 leading-6">
              {t('scooter.vehicleSystemsBody')}
            </Text>
            <View className="gap-3">
              {CAPABILITY_FIELDS.map((field) => {
                const selectedValue = capabilities[field.key];
                const expanded = openCapability === field.key;
                return (
                  <View key={field.key}>
                    <Text className="font-label text-xs font-bold text-on-surface-variant mb-1.5">
                      {t(field.labelKey)}
                    </Text>
                    <TouchableOpacity
                      accessibilityRole="button"
                      accessibilityState={{ expanded }}
                      className="min-h-12 px-4 py-3 rounded-lg border border-outline-variant/25 bg-surface-container-lowest flex-row items-center justify-between"
                      onPress={() => {
                        setOpenField(null);
                        setOpenCapability((current) => current === field.key ? null : field.key);
                      }}
                    >
                      <Text className="font-body text-sm text-on-surface flex-1">
                        {t(CAPABILITY_VALUE_KEYS[selectedValue])}
                      </Text>
                      <MaterialIcons name={expanded ? 'expand-less' : 'expand-more'} size={20} color="#a9c7ff" />
                    </TouchableOpacity>
                    {expanded ? (
                      <View className="mt-2 rounded-lg overflow-hidden border border-outline-variant/20 bg-surface-container-lowest">
                        {field.values.map((option) => (
                          <TouchableOpacity
                            key={option}
                            accessibilityRole="radio"
                            accessibilityState={{ checked: selectedValue === option }}
                            className="min-h-11 px-4 py-2.5 border-b border-outline-variant/10 flex-row items-center justify-between"
                            onPress={() => selectCapability(field.key, option)}
                          >
                            <Text className="font-body text-sm text-on-surface flex-1">
                              {t(CAPABILITY_VALUE_KEYS[option])}
                            </Text>
                            {selectedValue === option ? <MaterialIcons name="check" size={18} color="#a9c7ff" /> : null}
                          </TouchableOpacity>
                        ))}
                      </View>
                    ) : null}
                  </View>
                );
              })}
            </View>
          </View>

          <View className="rounded-xl border border-amber-500/35 bg-amber-500/10 p-4">
            <View className="flex-row items-center gap-2">
              <MaterialIcons name="info-outline" size={20} color="#f59e0b" />
              <Text accessibilityRole="header" className="font-headline text-base font-bold text-on-surface">
                {t('scooter.basicTrackingTitle')}
              </Text>
            </View>
            <Text className="font-body text-sm text-on-surface-variant mt-2 leading-6">
              {t('scooter.basicTrackingBody')}
            </Text>
            {selection.customBrandName?.trim() && selection.customModelName?.trim() ? (
              <Text className="font-headline text-base font-bold text-primary mt-3">
                {selection.customBrandName.trim()} {selection.customModelName.trim()}
              </Text>
            ) : null}
          </View>
        </View>
      ) : null}

      {version ? (
        <View className="gap-4">
          <View
            accessibilityLiveRegion="polite"
            className={`rounded-xl border p-4 ${candidates.length === 0 ? 'border-error/50 bg-error/5' : 'border-outline-variant/20 bg-surface-container-high/50'}`}
          >
            <Text accessibilityRole="header" className="font-headline text-base font-bold text-on-surface">
              {candidates.length === 0
                ? t('scooter.noMatch')
                : tp('scooter.candidate', candidates.length)}
            </Text>
            <Text className="font-body text-xs text-on-surface-variant mt-1 leading-5">
              {candidates.length === 0
                ? t('scooter.noMatchBody')
                : t('scooter.candidatesBody')}
            </Text>
            {candidates.length > 0 ? (
              <View className="mt-3 rounded-lg overflow-hidden border border-outline-variant/15">
                {candidates.map((candidate) => <CandidateSummary key={candidate.variantId ?? candidate.manualId} candidate={candidate} />)}
              </View>
            ) : null}
          </View>

          {question ? (
            <View className="rounded-xl border border-primary/25 bg-surface-container-high p-4">
              <Text accessibilityRole="header" className="font-label text-xs uppercase font-bold text-primary tracking-widest">
                {t('scooter.nextQuestion')}
              </Text>
              <Text className="font-headline text-lg font-bold text-on-surface mt-2">{question.prompt}</Text>
              <Text className="font-body text-xs text-on-surface-variant mt-2 leading-5">{question.help}</Text>
              <View className="mt-4 gap-2">
                {question.options.map((option) => (
                  <TouchableOpacity
                    key={option.value}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: value.answers[question.key] === option.value }}
                    accessibilityLabel={tp('scooter.wouldRemain', option.remainingCandidateCount, { label: option.label })}
                    className="min-h-12 px-4 py-3 rounded-lg border border-outline-variant/25 bg-surface-container-lowest flex-row items-center justify-between gap-3"
                    onPress={() => onChange(answerIdentificationQuestion(value, question.key, option.value))}
                  >
                    <Text className="font-body text-sm text-on-surface flex-1">{option.label}</Text>
                    <Text className="font-label text-xs text-on-surface-variant">{t('scooter.left', { count: option.remainingCandidateCount })}</Text>
                  </TouchableOpacity>
                ))}
                <TouchableOpacity
                  accessibilityRole="button"
                  className="min-h-12 px-4 py-3 rounded-lg border border-primary/30 items-center justify-center"
                  onPress={() => onChange(markIdentificationUnsure(value, question.key))}
                >
                  <Text className="font-label text-sm font-bold text-primary">{t('scooter.unsure')}</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : null}

          {!question && candidates.length > 1 ? (
            <View accessibilityLiveRegion="polite" className="rounded-xl border border-outline-variant/30 bg-surface-container-high p-4">
              <Text accessibilityRole="header" className="font-headline text-base font-bold text-on-surface">{t('scooter.moreNeeded')}</Text>
              <Text className="font-body text-sm text-on-surface-variant mt-2 leading-5">
                {t('scooter.moreNeededBody')}
              </Text>
            </View>
          ) : null}

          {confirmedCandidate && confirmable && brand && model ? (
            <ConfirmationCard
              brandName={brand.name}
              candidate={confirmedCandidate}
              modelName={model.name}
              years={version.name}
            />
          ) : null}

          {showErrors && !confirmable ? (
            <Text accessibilityLiveRegion="polite" className="text-error font-body text-xs">
              {t('scooter.confirmRequired')}
            </Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}
