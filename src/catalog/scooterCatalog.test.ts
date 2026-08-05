import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  isScooterSelectionComplete,
  resolveScooterSelection,
  scooterCatalog,
} from './scooterCatalog';
import { modelKnowledgeBase } from '../modelData/modelKnowledge';
import { NEW_SYMPHONY_ST_200_PROFILE } from '../maintenance/profiles';

describe('generated scooter catalog', () => {
  it('discovers models and versions from the manual directories', () => {
    const sym = scooterCatalog.manufacturers.find((brand) => brand.id === 'sym');
    assert.ok(sym);
    assert.ok(sym.models.length >= 10);
    assert.ok(sym.models.every((model) => model.versions.length > 0));
    assert.ok(sym.models.every((model) => model.versions.every(
      (version) => version.manualRelativePath.endsWith('.pdf')
    )));
  });

  it('only resolves a version belonging to the selected brand and model', () => {
    const selection = resolveScooterSelection({
      brandId: 'sym',
      modelId: 'sym:new-symphony-st',
      versionId: 'sym:new-symphony-st:2021-present',
    });
    assert.equal(selection?.model.name, 'New Symphony ST');
    assert.equal(resolveScooterSelection({
      brandId: 'sym',
      modelId: 'sym:fiddle-4',
      versionId: 'sym:new-symphony-st:2021-present',
    }), null);
  });

  it('preserves the exact variant identity after resolving a required-variant selection', () => {
    const profile = modelKnowledgeBase.profiles.find((item) =>
      item.catalogVersionId === NEW_SYMPHONY_ST_200_PROFILE.catalogSelection.versionId
    );
    assert.ok(profile);
    const variant = profile.variants.find((item) =>
      item.id === NEW_SYMPHONY_ST_200_PROFILE.catalogSelection.variantId
    );
    assert.ok(variant);
    const input = {
      brandId: profile.brandId,
      modelId: profile.modelId,
      versionId: profile.catalogVersionId,
      variantId: variant.id,
    };

    const resolved = resolveScooterSelection(input);

    assert.ok(resolved);
    assert.equal(resolved.variantId, variant.id);
    assert.equal(resolved.variant?.id, variant.id);
    assert.equal(isScooterSelectionComplete(resolved), true);
  });

  it('keeps an otherwise valid but unvalidated variant-free selection unavailable', () => {
    const profile = modelKnowledgeBase.profiles.find((item) => !item.requiresVariant);
    assert.ok(profile);

    const resolved = resolveScooterSelection({
      brandId: profile.brandId,
      modelId: profile.modelId,
      versionId: profile.catalogVersionId,
    });

    assert.ok(resolved);
    assert.equal(resolved.variantId, null);
    assert.equal(resolved.variant, null);
    assert.equal(isScooterSelectionComplete(resolved), false);
  });

  it('requires the exact validated variant rather than accepting the model family alone', () => {
    assert.equal(isScooterSelectionComplete({
      brandId: 'sym',
      modelId: 'sym:new-symphony-st',
      versionId: 'sym:new-symphony-st:2021-present',
    }), false);
  });
});
