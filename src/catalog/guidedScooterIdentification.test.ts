import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  answerIdentificationQuestion,
  changeGuidedCatalogSelection,
  createGuidedSelectionDraft,
  filterIdentificationCandidates,
  getDraftCandidates,
  getNextIdentificationQuestion,
  isGuidedSelectionConfirmable,
  markIdentificationUnsure,
} from './guidedScooterIdentification';
import { resolveScooterSelection } from './scooterCatalog';
import type { VariantIdentificationProfile } from '../modelData/types';

const selectionFor = (modelId: string, versionId: string) => createGuidedSelectionDraft({
  brandId: 'sym',
  modelId,
  versionId,
});

const value = <T>(input: T | null, status: 'confirmed' | 'missing' | 'conflict' = input === null ? 'missing' : 'confirmed') => ({
  value: input,
  status,
  sourceRecordIds: status === 'confirmed' ? ['manual:specifications:1'] : [],
  pages: status === 'confirmed' ? [1] : [],
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

describe('guided scooter identification', () => {
  it('uses exact displacement to distinguish 125 from 200-class and 250/300 candidates', () => {
    const fiddle = selectionFor('sym:fiddle-iii', 'sym:fiddle-iii:2014-2023');
    const fiddle125 = answerIdentificationQuestion(fiddle, 'displacementCc', '124.6');
    assert.deepEqual(getDraftCandidates(fiddle125).map((candidate) => candidate.variantName), ['XA12W (Fiddle III 125 c.c.)']);
    assert.ok(!getDraftCandidates(fiddle125).some((candidate) => candidate.variantName?.includes('200i')));

    const joymax = selectionFor('sym:joymax-z', 'sym:joymax-z:2021-present');
    const joymax125 = answerIdentificationQuestion(joymax, 'displacementCc', '124.9');
    assert.deepEqual(getDraftCandidates(joymax125).map((candidate) => candidate.variantName), ['Joymax Z+125']);
    assert.ok(!getDraftCandidates(joymax125).some((candidate) => /250|300/.test(candidate.variantName ?? '')));
  });

  it('filters confirmed air/liquid and carburetor/injection values while retaining unknowns honestly', () => {
    const fiddle = selectionFor('sym:fiddle-4', 'sym:fiddle-4:2021-present');
    const liquid = answerIdentificationQuestion(fiddle, 'coolingSystem', 'liquid');
    const liquidNames = getDraftCandidates(liquid).map((candidate) => candidate.variantName);
    assert.ok(liquidNames.includes('XG12WW-EU'));
    assert.ok(!liquidNames.includes('XG12W1-EU'));
    assert.ok(liquidNames.includes('XG05W1-NL'));

    const carb = syntheticVariant('carb', 'carburetor');
    const injection = syntheticVariant('efi', 'fuel_injection');
    const unknown = syntheticVariant('unknown', null);
    assert.deepEqual(
      filterIdentificationCandidates([carb, injection, unknown], { fuelSystem: 'carburetor' }).map((item) => item.variantId),
      ['carb', 'unknown']
    );
    assert.deepEqual(
      filterIdentificationCandidates([carb, injection, unknown], { fuelSystem: 'fuel_injection' }).map((item) => item.variantId),
      ['efi', 'unknown']
    );
  });

  it('keeps ambiguous and no-match states recoverable without selecting a variant', () => {
    const air = syntheticVariant('air', 'carburetor');
    const unknown = syntheticVariant('unknown', null);
    unknown.coolingSystem = value(null);
    assert.equal(filterIdentificationCandidates([air, unknown], { coolingSystem: 'air' }).length, 2);
    assert.equal(filterIdentificationCandidates([air], { coolingSystem: 'liquid' }).length, 0);

    let draft = selectionFor('sym:fiddle-iii', 'sym:fiddle-iii:2014-2023');
    draft = markIdentificationUnsure(draft, 'displacementCc');
    assert.equal(getNextIdentificationQuestion(draft)?.key, 'modelCode');
    draft = markIdentificationUnsure(draft, 'modelCode');
    assert.equal(getNextIdentificationQuestion(draft), null);
    assert.equal(getDraftCandidates(draft).length, 4);
    assert.equal(draft.selection.variantId, null);
    assert.equal(isGuidedSelectionConfirmable(draft), false);
  });

  it('clears descendant answers and stale variant IDs when an earlier answer or catalog ancestor changes', () => {
    let draft = selectionFor('sym:fiddle-iii', 'sym:fiddle-iii:2014-2023');
    draft = answerIdentificationQuestion(draft, 'modelCode', 'XA12W (Fiddle III 125 c.c.)');
    assert.ok(draft.selection.variantId?.includes('xa12w'));
    draft = answerIdentificationQuestion(draft, 'displacementCc', '149');
    assert.equal(draft.answers.modelCode, undefined);
    assert.ok(draft.selection.variantId?.includes('xa15w'));

    const modelChanged = changeGuidedCatalogSelection(draft, 'modelId', 'sym:joymax-z');
    assert.deepEqual(modelChanged.answers, {});
    assert.deepEqual(modelChanged.unsureFeatures, []);
    assert.equal(modelChanged.selection.versionId, undefined);
    assert.equal(modelChanged.selection.variantId, undefined);

    const brandChanged = changeGuidedCatalogSelection(draft, 'brandId', 'another-brand');
    assert.deepEqual(brandChanged.selection, { brandId: 'another-brand', modelId: undefined, versionId: undefined });
  });

  it('preserves exact variant identity through resolution and isolates drafts across vehicle switches', () => {
    let first = selectionFor('sym:fiddle-iii', 'sym:fiddle-iii:2014-2023');
    first = answerIdentificationQuestion(first, 'displacementCc', '124.6');
    const firstResolved = resolveScooterSelection(first.selection);
    assert.ok(firstResolved?.variantId?.includes('xa12w'));

    let second = selectionFor('sym:joymax-z', 'sym:joymax-z:2021-present');
    second = answerIdentificationQuestion(second, 'displacementCc', '249.4');
    const reopenedFirst = createGuidedSelectionDraft(firstResolved ?? {});
    assert.equal(reopenedFirst.selection.variantId, first.selection.variantId);
    assert.notEqual(second.selection.variantId, reopenedFirst.selection.variantId);
    assert.equal(second.answers.displacementCc, '249.4');
    assert.equal(reopenedFirst.answers.displacementCc, undefined);
    assert.ok(isGuidedSelectionConfirmable(reopenedFirst));
  });
});
