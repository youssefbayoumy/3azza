import {
  IDENTIFICATION_FEATURE_ORDER,
  featureValueForFiltering,
  formatIdentificationFeatureValue,
  getIdentificationProfilesForVersion,
  type IdentificationFeatureKey,
} from '../modelData/variantIdentification';
import type { VariantIdentificationProfile } from '../modelData/types';
import { isScooterSelectionComplete, type ScooterSelection } from './scooterCatalog';
import { getSelectableMaintenanceProfiles } from '../maintenance/profiles';

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

const QUESTION_COPY: Record<IdentificationFeatureKey, Pick<IdentificationQuestion, 'label' | 'prompt' | 'help'>> = {
  displacementCc: {
    label: 'Engine displacement',
    prompt: 'What displacement does your scooter have?',
    help: 'Use the exact cc value shown in your scooter documents or identification details.',
  },
  coolingSystem: {
    label: 'Cooling system',
    prompt: 'How is the engine cooled?',
    help: 'Choose only if your scooter documentation clearly says air-cooled or liquid-cooled.',
  },
  fuelSystem: {
    label: 'Fuel system',
    prompt: 'How is fuel delivered?',
    help: 'Choose only if your documentation explicitly says carburetor or fuel injection / EFI.',
  },
  modelCode: {
    label: 'Exact model / engine code',
    prompt: 'Which exact code or variant is listed for your scooter?',
    help: 'Check the scooter identification details, registration paperwork, or owner documents. If none clearly lists a code, choose I\'m not sure.',
  },
};

export function createGuidedSelectionDraft(
  selection: Partial<ScooterSelection> = {}
): GuidedScooterSelectionDraft {
  const draft: GuidedScooterSelectionDraft = {
    selection: {
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
  if (key === 'brandId') return createGuidedSelectionDraft({ brandId: id });
  if (key === 'modelId') return createGuidedSelectionDraft({ brandId: draft.selection.brandId, modelId: id });
  return createGuidedSelectionDraft({
    brandId: draft.selection.brandId,
    modelId: draft.selection.modelId,
    versionId: id,
  });
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
    const copy = QUESTION_COPY[key];
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
