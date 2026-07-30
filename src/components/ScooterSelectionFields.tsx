import { useState } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { scooterCatalog } from '../catalog/scooterCatalog';
import {
  answerIdentificationQuestion,
  changeGuidedCatalogSelection,
  getDraftCandidates,
  getNextIdentificationQuestion,
  isGuidedSelectionConfirmable,
  markIdentificationUnsure,
  type GuidedScooterSelectionDraft,
} from '../catalog/guidedScooterIdentification';
import {
  formatIdentificationFeatureValue,
  identificationFeatureStatusLabel,
  type IdentificationFeatureKey,
} from '../modelData/variantIdentification';
import type { VariantIdentificationProfile } from '../modelData/types';

type CatalogSelectionKey = 'brandId' | 'modelId' | 'versionId';

type Props = {
  value: GuidedScooterSelectionDraft;
  onChange: (draft: GuidedScooterSelectionDraft) => void;
  showErrors?: boolean;
};

const FEATURE_LABELS: Record<Exclude<IdentificationFeatureKey, 'modelCode'>, string> = {
  displacementCc: 'Displacement',
  coolingSystem: 'Cooling',
  fuelSystem: 'Fuel system',
};

function CandidateSummary({ candidate }: { candidate: VariantIdentificationProfile }) {
  const confirmed = (['displacementCc', 'coolingSystem', 'fuelSystem'] as const)
    .flatMap((key) => {
      const feature = candidate[key];
      return feature.status === 'confirmed' && feature.value !== null
        ? [`${FEATURE_LABELS[key]}: ${formatIdentificationFeatureValue(key, feature.value)}`]
        : [];
    });
  const unavailable = (['displacementCc', 'coolingSystem', 'fuelSystem'] as const)
    .filter((key) => candidate[key].status !== 'confirmed').length;

  return (
    <View className="px-4 py-3 border-b border-outline-variant/10">
      <Text className="font-body text-sm font-bold text-on-surface">
        {candidate.variantName ?? 'No separate exact variant required'}
      </Text>
      {confirmed.length > 0 ? (
        <Text className="font-body text-xs text-on-surface-variant mt-1 leading-5">{confirmed.join(' · ')}</Text>
      ) : null}
      {unavailable > 0 ? (
        <Text className="font-body text-xs text-on-surface-variant/70 mt-1">
          {unavailable} identifying feature{unavailable === 1 ? '' : 's'} missing or conflicted in this manual.
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
  return (
    <View
      accessibilityLabel={`Exact scooter ready to confirm: ${brandName} ${modelName}, ${years}, ${candidate.variantName ?? 'no separate variant required'}`}
      className="rounded-xl border border-primary/40 bg-primary/10 p-4"
    >
      <View className="flex-row items-center gap-2 mb-3">
        <MaterialIcons name="fact-check" size={21} color="#a9c7ff" />
        <Text accessibilityRole="header" className="font-headline text-base font-bold text-primary">Confirm exact scooter</Text>
      </View>
      <Text className="font-headline text-lg font-bold text-on-surface">{brandName} {modelName}</Text>
      <Text className="font-body text-sm text-on-surface-variant mt-1">Manual years: {years}</Text>
      <Text className="font-body text-sm text-on-surface mt-2">
        Exact variant / code: {candidate.variantName ?? 'No separate variant required'}
      </Text>
      <View className="mt-3 gap-2">
        {(['displacementCc', 'coolingSystem', 'fuelSystem'] as const).map((key) => {
          const feature = candidate[key];
          const value = feature.status === 'confirmed' && feature.value !== null
            ? formatIdentificationFeatureValue(key, feature.value)
            : identificationFeatureStatusLabel(feature.status);
          const pages = feature.pages.length > 0 ? ` · PDF ${feature.pages.length === 1 ? 'p.' : 'pp.'} ${feature.pages.join(', ')}` : '';
          return (
            <Text key={key} className="font-body text-xs text-on-surface-variant leading-5">
              {FEATURE_LABELS[key]}: {value}{pages}
            </Text>
          );
        })}
      </View>
      <Text className="font-body text-xs text-on-surface-variant/80 mt-4 leading-5">
        Review this identity before continuing. The next screen action is the explicit confirmation that saves it.
      </Text>
    </View>
  );
}

export default function ScooterSelectionFields({ onChange, showErrors = false, value }: Props) {
  const [openField, setOpenField] = useState<CatalogSelectionKey | null>(null);
  const selection = value.selection;
  const brand = scooterCatalog.manufacturers.find((item) => item.id === selection.brandId);
  const model = brand?.models.find((item) => item.id === selection.modelId);
  const version = model?.versions.find((item) => item.id === selection.versionId);
  const candidates = getDraftCandidates(value);
  const question = getNextIdentificationQuestion(value);
  const confirmable = isGuidedSelectionConfirmable(value);
  const confirmedCandidate = candidates.length === 1 ? candidates[0] : null;

  const fields = [
    {
      key: 'brandId' as const,
      label: 'Brand',
      placeholder: 'Select brand',
      disabled: false,
      selectedName: brand?.name,
      options: scooterCatalog.manufacturers,
    },
    {
      key: 'modelId' as const,
      label: 'Model family',
      placeholder: brand ? 'Select model family' : 'Select a brand first',
      disabled: !brand,
      selectedName: model?.name,
      options: brand?.models ?? [],
    },
    {
      key: 'versionId' as const,
      label: 'Manual years / version',
      placeholder: model ? 'Select manual years' : 'Select a model first',
      disabled: !model,
      selectedName: version?.name,
      options: model?.versions ?? [],
    },
  ];

  const select = (key: CatalogSelectionKey, id: string) => {
    onChange(changeGuidedCatalogSelection(value, key, id));
    setOpenField(null);
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
              accessibilityLabel={`${field.label}: ${field.selectedName ?? field.placeholder}`}
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
            {missing ? <Text className="text-error font-body text-xs mt-1">{field.label} is required.</Text> : null}
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
                    <Text className="font-body text-sm text-on-surface flex-1">{option.name}</Text>
                    {selection[field.key] === option.id ? <MaterialIcons name="check" size={18} color="#a9c7ff" /> : null}
                  </TouchableOpacity>
                ))}
              </View>
            ) : null}
          </View>
        );
      })}

      {version ? (
        <View className="gap-4">
          <View
            accessibilityLiveRegion="polite"
            className={`rounded-xl border p-4 ${candidates.length === 0 ? 'border-error/50 bg-error/5' : 'border-outline-variant/20 bg-surface-container-high/50'}`}
          >
            <Text accessibilityRole="header" className="font-headline text-base font-bold text-on-surface">
              {candidates.length === 0
                ? 'No exact match found'
                : `${candidates.length} supported candidate${candidates.length === 1 ? '' : 's'}`}
            </Text>
            <Text className="font-body text-xs text-on-surface-variant mt-1 leading-5">
              {candidates.length === 0
                ? 'These answers contradict the manual-backed profiles. Change an earlier answer; nothing saved has been changed.'
                : 'Only candidates not contradicted by confirmed manual data remain. Missing or conflicted facts are never used to guess.'}
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
                Next useful question
              </Text>
              <Text className="font-headline text-lg font-bold text-on-surface mt-2">{question.prompt}</Text>
              <Text className="font-body text-xs text-on-surface-variant mt-2 leading-5">{question.help}</Text>
              <View className="mt-4 gap-2">
                {question.options.map((option) => (
                  <TouchableOpacity
                    key={option.value}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: value.answers[question.key] === option.value }}
                    accessibilityLabel={`${option.label}. ${option.remainingCandidateCount} candidate${option.remainingCandidateCount === 1 ? '' : 's'} would remain.`}
                    className="min-h-12 px-4 py-3 rounded-lg border border-outline-variant/25 bg-surface-container-lowest flex-row items-center justify-between gap-3"
                    onPress={() => onChange(answerIdentificationQuestion(value, question.key, option.value))}
                  >
                    <Text className="font-body text-sm text-on-surface flex-1">{option.label}</Text>
                    <Text className="font-label text-xs text-on-surface-variant">{option.remainingCandidateCount} left</Text>
                  </TouchableOpacity>
                ))}
                <TouchableOpacity
                  accessibilityRole="button"
                  className="min-h-12 px-4 py-3 rounded-lg border border-primary/30 items-center justify-center"
                  onPress={() => onChange(markIdentificationUnsure(value, question.key))}
                >
                  <Text className="font-label text-sm font-bold text-primary">I&apos;m not sure</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : null}

          {!question && candidates.length > 1 ? (
            <View accessibilityLiveRegion="polite" className="rounded-xl border border-outline-variant/30 bg-surface-container-high p-4">
              <Text accessibilityRole="header" className="font-headline text-base font-bold text-on-surface">More information is needed</Text>
              <Text className="font-body text-sm text-on-surface-variant mt-2 leading-5">
                The remaining manual-backed candidates are still ambiguous. Review earlier answers or find the exact model / engine code before saving; 3azza will not choose one for you.
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
              Confirm one exact supported scooter before continuing. Your saved vehicle is unchanged.
            </Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}
