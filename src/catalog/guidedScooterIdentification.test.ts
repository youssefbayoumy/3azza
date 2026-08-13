import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  changeGuidedCatalogSelection,
  changeGuidedCustomIdentity,
  changeGuidedVehicleCapability,
  createGuidedSelectionDraft,
  filterIdentificationCandidates,
  getDraftCandidates,
  getNextIdentificationQuestion,
  isGuidedSelectionConfirmable,
} from './guidedScooterIdentification';
import type { VariantIdentificationProfile } from '../modelData/types';
import { NEW_SYMPHONY_ST_200_PROFILE } from '../maintenance/profiles';
import { OTHER_BRAND_ID } from './scooterCatalog';

const value = <T>(input: T | null) => ({
  value: input,
  status: input === null ? 'missing' as const : 'confirmed' as const,
  sourceRecordIds: input === null ? [] : ['manual:specifications:1'],
  pages: input === null ? [] : [1],
});

function syntheticVariant(id: string, fuel: 'carburetor' | 'fuel_injection' | null): VariantIdentificationProfile {
  return {
    manualId: 'manual',
    catalogVersionId: 'version',
    variantId: id,
    variantName: id,
    modelCode: value(id),
    displacementCc: value(125),
    coolingSystem: value('air'),
    fuelSystem: value(fuel),
    additionalDistinguishers: [],
  };
}

describe('guided scooter identification profile gate', () => {
  const supported = NEW_SYMPHONY_ST_200_PROFILE.catalogSelection;

  it('exposes and auto-resolves only the validated exact ST 200 variant', () => {
    const draft = createGuidedSelectionDraft(supported);
    assert.deepEqual(getDraftCandidates(draft).map((candidate) => candidate.variantId), [supported.variantId]);
    assert.equal(draft.selection.variantId, supported.variantId);
    assert.equal(getNextIdentificationQuestion(draft), null);
    assert.equal(isGuidedSelectionConfirmable(draft), true);
  });

  it('does not expose extracted or needs-review scooter candidates', () => {
    const unsupported = createGuidedSelectionDraft({
      brandId: 'sym',
      modelId: 'sym:fiddle-iii',
      versionId: 'sym:fiddle-iii:2014-2023',
    });
    assert.deepEqual(getDraftCandidates(unsupported), []);
    assert.equal(unsupported.selection.variantId, null);
    assert.equal(isGuidedSelectionConfirmable(unsupported), false);
  });

  it('clears exact identity when a catalog ancestor changes', () => {
    const draft = createGuidedSelectionDraft(supported);
    const changed = changeGuidedCatalogSelection(draft, 'modelId', 'sym:joymax-z');
    assert.deepEqual(changed.answers, {});
    assert.deepEqual(changed.unsureFeatures, []);
    assert.equal(changed.selection.versionId, undefined);
    assert.equal(changed.selection.variantId, null);
  });

  it('keeps the generic candidate filter honest about missing facts', () => {
    const carb = syntheticVariant('carb', 'carburetor');
    const injection = syntheticVariant('efi', 'fuel_injection');
    const unknown = syntheticVariant('unknown', null);
    assert.deepEqual(
      filterIdentificationCandidates([carb, injection, unknown], { fuelSystem: 'carburetor' })
        .map((item) => item.variantId),
      ['carb', 'unknown']
    );
  });

  it('creates a confirmable basic-tracking identity for Other brand', () => {
    let draft = changeGuidedCatalogSelection(createGuidedSelectionDraft(), 'brandId', OTHER_BRAND_ID);
    assert.equal(isGuidedSelectionConfirmable(draft), false);
    draft = changeGuidedCustomIdentity(draft, 'customBrandName', 'Dayun');
    draft = changeGuidedCustomIdentity(draft, 'customModelName', 'DY 150');
    draft = changeGuidedVehicleCapability(draft, 'powertrain', 'four_stroke');
    draft = changeGuidedVehicleCapability(draft, 'transmission', 'manual');
    assert.equal(isGuidedSelectionConfirmable(draft), true);
    assert.equal(draft.selection.capabilities?.powertrain, 'four_stroke');
    assert.equal(draft.selection.capabilities?.transmission, 'manual');
    assert.deepEqual(getDraftCandidates(draft), []);
    assert.equal(getNextIdentificationQuestion(draft), null);
  });
});
