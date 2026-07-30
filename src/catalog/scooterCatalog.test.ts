import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  getMaintenanceTemplate,
  isScooterSelectionComplete,
  resolveScooterSelection,
  scooterCatalog,
} from './scooterCatalog';
import { modelKnowledgeBase } from '../modelData/modelKnowledge';

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
    const profile = modelKnowledgeBase.profiles.find((item) => item.requiresVariant && item.variants.length > 0);
    assert.ok(profile);
    const variant = profile.variants[0];
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

  it('normalizes a variant-free selection without inventing a variant identity', () => {
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
    assert.equal(isScooterSelectionComplete(resolved), true);
  });

  it('keeps engine oil as a 1,000 km replacement task', () => {
    const selection = {
      brandId: 'sym',
      modelId: 'sym:new-symphony-st',
      versionId: 'sym:new-symphony-st:2021-present',
    };
    const oil = getMaintenanceTemplate(selection).find((item) => item.canonicalId === 'engine-oil');
    assert.equal(oil?.intervalKm, 1000);
    assert.equal(oil?.type, 'replace');
    assert.equal(oil?.origin, '3azza_policy');
    assert.ok(oil?.initialDistanceKm.includes(300));
  });
});
