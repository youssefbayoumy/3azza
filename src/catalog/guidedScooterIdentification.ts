import {
  IDENTIFICATION_FEATURE_ORDER,
  featureValueForFiltering,
  formatIdentificationFeatureValue,
  getIdentificationProfilesForVersion,
  type IdentificationFeatureKey,
} from '../modelData/variantIdentification';
import type { VariantIdentificationProfile } from '../modelData/types';
import {
  CUSTOM_MODEL_ID,
  CUSTOM_VERSION_ID,
  isCustomBrandSelection,
  isScooterSelectionComplete,
  OTHER_BRAND_ID,
  type ScooterSelection,
} from './scooterCatalog';
import { getSelectableMaintenanceProfiles } from '../maintenance/profiles';
import {
  normalizeVehicleCapabilities,
  type VehicleCapabilities,
  type VehicleCapabilityKey,
} from './vehicleCapabilities';
import { t } from '../i18n/core';

export type IdentificationAnswers = Partial<Record<IdentificationFeatureKey, string>>;

export type GuidedScooterSelectionDraft = {
  selection: Partial<ScooterSelection>;
  answers: IdentificationAnswers;
  unsureFeatures: IdentificationFeatureKey[];
};

export type IdentificationQuestion = {
  key: IdentificationFeatureKey;
  label: string;
  prompt: string;
  help: string;
  options: { value: string; label: string; remainingCandidateCount: number }[];
};

function questionCopy(key: IdentificationFeatureKey): Pick<IdentificationQuestion, 'label' | 'prompt' | 'help'> {
  const keys = {
  displacementCc: {
    label: 'ident.displacementLabel', prompt: 'ident.displacementPrompt', help: 'ident.displacementHelp',
  },
  coolingSystem: {
    label: 'ident.coolingLabel', prompt: 'ident.coolingPrompt', help: 'ident.coolingHelp',
  },
  fuelSystem: {
    label: 'ident.fuelLabel', prompt: 'ident.fuelPrompt', help: 'ident.fuelHelp',
  },
  modelCode: {
    label: 'ident.codeLabel', prompt: 'ident.codePrompt', help: 'ident.codeHelp',
  },
  } as const;
  const copy = keys[key];
  return { label: t(copy.label), prompt: t(copy.prompt), help: t(copy.help) };
}

export function createGuidedSelectionDraft(
  selection: Partial<ScooterSelection> = {}
): GuidedScooterSelectionDraft {
  if (isCustomBrandSelection(selection)) {
    return {
      selection: {
        selectionMode: 'custom_brand',
        brandId: OTHER_BRAND_ID,
        modelId: CUSTOM_MODEL_ID,
        versionId: CUSTOM_VERSION_ID,
        variantId: null,
        customBrandName: selection.customBrandName ?? '',
        customModelName: selection.customModelName ?? '',
        capabilities: normalizeVehicleCapabilities(selection.capabilities),
      },
      answers: {},
      unsureFeatures: [],
    };
  }
  const draft: GuidedScooterSelectionDraft = {
    selection: {
      selectionMode: 'catalog',
      brandId: selection.brandId,
      modelId: selection.modelId,
      versionId: selection.versionId,
    },
    answers: {},
    unsureFeatures: [],
  };
  if (!selection.variantId) return recomputeDraft(draft);
  const selected = filterSelectableCandidates(
    selection.versionId,
    getIdentificationProfilesForVersion(selection.versionId)
  )
    .find((profile) => profile.variantId === selection.variantId);
  if (!selected || selected.modelCode.status !== 'confirmed' || !selected.modelCode.value) return draft;
  return recomputeDraft({
    ...draft,
    answers: { modelCode: String(selected.modelCode.value) },
  });
}

export function changeGuidedCatalogSelection(
  draft: GuidedScooterSelectionDraft,
  key: 'brandId' | 'modelId' | 'versionId',
  id: string
): GuidedScooterSelectionDraft {
  if (key === 'brandId') {
    return id === OTHER_BRAND_ID
      ? createGuidedSelectionDraft({ selectionMode: 'custom_brand', brandId: OTHER_BRAND_ID })
      : createGuidedSelectionDraft({ selectionMode: 'catalog', brandId: id });
  }
  if (key === 'modelId') return createGuidedSelectionDraft({ brandId: draft.selection.brandId, modelId: id });
  return createGuidedSelectionDraft({
    brandId: draft.selection.brandId,
    modelId: draft.selection.modelId,
    versionId: id,
  });
}

export function changeGuidedCustomIdentity(
  draft: GuidedScooterSelectionDraft,
  key: 'customBrandName' | 'customModelName',
  value: string
): GuidedScooterSelectionDraft {
  if (!isCustomBrandSelection(draft.selection)) return draft;
  return {
    ...draft,
    selection: { ...draft.selection, [key]: value },
  };
}

export function changeGuidedVehicleCapability<K extends VehicleCapabilityKey>(
  draft: GuidedScooterSelectionDraft,
  key: K,
  value: VehicleCapabilities[K]
): GuidedScooterSelectionDraft {
  if (!isCustomBrandSelection(draft.selection)) return draft;
  return {
    ...draft,
    selection: {
      ...draft.selection,
      capabilities: {
        ...normalizeVehicleCapabilities(draft.selection.capabilities),
        [key]: value,
      },
    },
  };
}

function keepBefore<T>(values: Partial<Record<IdentificationFeatureKey, T>>, key: IdentificationFeatureKey) {
  const cutoff = IDENTIFICATION_FEATURE_ORDER.indexOf(key);
  return Object.fromEntries(Object.entries(values).filter(([candidate]) =>
    IDENTIFICATION_FEATURE_ORDER.indexOf(candidate as IdentificationFeatureKey) < cutoff
  )) as Partial<Record<IdentificationFeatureKey, T>>;
}

function recomputeDraft(draft: GuidedScooterSelectionDraft): GuidedScooterSelectionDraft {
  const candidates = filterIdentificationCandidates(
    filterSelectableCandidates(
      draft.selection.versionId,
      getIdentificationProfilesForVersion(draft.selection.versionId)
    ),
    draft.answers
  );
  return {
    ...draft,
    selection: {
      ...draft.selection,
      variantId: candidates.length === 1 ? candidates[0].variantId : null,
    },
  };
}

export function answerIdentificationQuestion(
  draft: GuidedScooterSelectionDraft,
  key: IdentificationFeatureKey,
  value: string
): GuidedScooterSelectionDraft {
  const answers = { ...keepBefore(draft.answers, key), [key]: value };
  const unsureBefore = new Set(
    draft.unsureFeatures.filter((candidate) =>
      IDENTIFICATION_FEATURE_ORDER.indexOf(candidate) < IDENTIFICATION_FEATURE_ORDER.indexOf(key)
    )
  );
  return recomputeDraft({ ...draft, answers, unsureFeatures: [...unsureBefore] });
}

export function markIdentificationUnsure(
  draft: GuidedScooterSelectionDraft,
  key: IdentificationFeatureKey
): GuidedScooterSelectionDraft {
  const answers = keepBefore(draft.answers, key);
  const unsureFeatures = draft.unsureFeatures.filter((candidate) =>
    IDENTIFICATION_FEATURE_ORDER.indexOf(candidate) < IDENTIFICATION_FEATURE_ORDER.indexOf(key)
  );
  unsureFeatures.push(key);
  return recomputeDraft({ ...draft, answers, unsureFeatures });
}

export function filterIdentificationCandidates(
  profiles: VariantIdentificationProfile[],
  answers: IdentificationAnswers
): VariantIdentificationProfile[] {
  return profiles.filter((profile) => Object.entries(answers).every(([rawKey, answer]) => {
    const key = rawKey as IdentificationFeatureKey;
    const candidateValue = featureValueForFiltering(profile, key);
    return candidateValue === null || candidateValue === answer;
  }));
}

function filterSelectableCandidates(
  versionId: string | null | undefined,
  profiles: VariantIdentificationProfile[]
): VariantIdentificationProfile[] {
  const selectableVariants = new Set(getSelectableMaintenanceProfiles()
    .filter((profile) => profile.catalogSelection.versionId === versionId)
    .map((profile) => profile.catalogSelection.variantId));
  return profiles.filter((profile) => profile.variantId !== null && selectableVariants.has(profile.variantId));
}

export function getDraftCandidates(draft: GuidedScooterSelectionDraft): VariantIdentificationProfile[] {
  return filterIdentificationCandidates(
    filterSelectableCandidates(
      draft.selection.versionId,
      getIdentificationProfilesForVersion(draft.selection.versionId)
    ),
    draft.answers
  );
}

export function getNextIdentificationQuestion(draft: GuidedScooterSelectionDraft): IdentificationQuestion | null {
  const candidates = getDraftCandidates(draft);
  if (candidates.length <= 1) return null;
  for (const key of IDENTIFICATION_FEATURE_ORDER) {
    if (draft.answers[key] !== undefined || draft.unsureFeatures.includes(key)) continue;
    const values = [...new Set(candidates.map((profile) => featureValueForFiltering(profile, key)).filter(
      (value): value is string => value !== null
    ))];
    if (values.length < 2) continue;
    const copy = questionCopy(key);
    return {
      key,
      ...copy,
      options: values.map((value) => ({
        value,
        label: formatIdentificationFeatureValue(key, value),
        remainingCandidateCount: filterIdentificationCandidates(candidates, { [key]: value }).length,
      })),
    };
  }
  return null;
}

export function isGuidedSelectionConfirmable(draft: GuidedScooterSelectionDraft): boolean {
  return isScooterSelectionComplete(draft.selection);
}
