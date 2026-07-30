import assert from 'node:assert/strict';
import test from 'node:test';
import catalogJson from '../generated/scooterCatalog.json';
import {
  formatKnowledgeValue,
  getApplicableMaintenance,
  getApplicableSpecifications,
  getConflictsForContext,
  getModelProfileForVehicle,
  modelKnowledgeBase,
} from './modelKnowledge';
import type { ModelKnowledgeProfile, VehicleModelSelection } from './types';

function vehicleFor(model: ModelKnowledgeProfile, variantId: string | null = null): VehicleModelSelection {
  return {
    scooter_brand_id: model.brandId,
    scooter_model_id: model.modelId,
    scooter_version_id: model.catalogVersionId,
    scooter_variant_id: variantId,
  };
}

test('all ten catalog versions map one-to-one to validated manual IDs', () => {
  const catalogManualIds = catalogJson.manufacturers.flatMap((brand) =>
    brand.models.flatMap((model) => model.versions.map((version) => version.manualId))
  );
  const knowledgeManualIds = modelKnowledgeBase.profiles.map((profile) => profile.manualId);
  assert.equal(catalogManualIds.length, 10);
  assert.equal(new Set(catalogManualIds).size, 10);
  assert.deepEqual([...catalogManualIds].sort(), [...knowledgeManualIds].sort());
  assert.equal(modelKnowledgeBase.quality.mergeReady, true);
  assert.equal(modelKnowledgeBase.quality.preservedConflictCount, 56);
});

test('profiles contain no records or citations from another manual', () => {
  for (const profile of modelKnowledgeBase.profiles) {
    for (const record of [...profile.records, ...profile.conflicts]) {
      assert.ok(record.recordId.startsWith(`${profile.manualId}:`), record.recordId);
      assert.ok(record.pages.length > 0, `${record.recordId} has no pages`);
      assert.ok(record.pages.every((page) => Number.isInteger(page) && page >= 1 && page <= profile.pageCount));
    }
  }
});

test('variant facts stay grouped until an exact Fiddle variant is selected', () => {
  const fiddle = modelKnowledgeBase.profiles.find((profile) => profile.modelName === 'Fiddle 4');
  assert.ok(fiddle);
  const unresolved = getApplicableSpecifications(vehicleFor(fiddle));
  assert.equal(unresolved.exactVariant.length, 0);
  assert.ok(unresolved.variantAlternatives.length > 0);

  const xg12 = fiddle.variants.find((variant) => variant.name === 'XG12W1-EU');
  assert.ok(xg12);
  const selected = getApplicableSpecifications(vehicleFor(fiddle, xg12.id));
  assert.ok(selected.exactVariant.length > 0);
  assert.equal(selected.variantAlternatives.length, 0);
  assert.equal(selected.exactVariant.some((item) => item.modelScope.some((scope) => scope.includes('XG12WW'))), false);
});

test('JET and Joymax exact variants cannot leak another engine displacement', () => {
  const jet = modelKnowledgeBase.profiles.find((profile) => profile.modelName === 'JET 14 AI ABS');
  assert.ok(jet);
  const jet125 = jet.variants.find((variant) => variant.name === 'XC12W1-EU');
  assert.ok(jet125);
  const jetValues = getApplicableSpecifications(vehicleFor(jet, jet125.id)).exactVariant.map((item) => formatKnowledgeValue(item.value));
  assert.ok(jetValues.some((value) => value.includes('124.65 cc')));
  assert.equal(jetValues.some((value) => value.includes('49.46 cc') || value.includes('168.9 cc')), false);

  const joymax = modelKnowledgeBase.profiles.find((profile) => profile.modelName === 'Joymax Z+');
  assert.ok(joymax);
  const z125 = joymax.variants.find((variant) => variant.name === 'Joymax Z+125');
  const z300 = joymax.variants.find((variant) => variant.name === 'Joymax Z 300');
  assert.ok(z125 && z300);
  const values125 = getApplicableSpecifications(vehicleFor(joymax, z125.id)).exactVariant.map((item) => formatKnowledgeValue(item.value));
  const values300 = getApplicableSpecifications(vehicleFor(joymax, z300.id)).exactVariant.map((item) => formatKnowledgeValue(item.value));
  assert.ok(values125.includes('124.9 cm3'));
  assert.ok(values300.includes('278.3 cm3'));
  assert.equal(values125.includes('278.3 cm3'), false);
});

test('every model uses the 1,000 km oil policy while retaining manual initial and time guidance', () => {
  for (const profile of modelKnowledgeBase.profiles) {
    const oil = getApplicableMaintenance(vehicleFor(profile)).find((task) => task.canonicalId === 'engine-oil');
    assert.ok(oil, profile.modelName);
    assert.equal(oil.recommendedIntervalKm, 1000, profile.modelName);
    assert.equal(oil.recommendationOrigin, '3azza_policy', profile.modelName);
    assert.ok(oil.guidance.length > 0, profile.modelName);
    assert.ok(oil.initialDistanceKm.length > 0, profile.modelName);
  }
  const timed = modelKnowledgeBase.profiles
    .map((profile) => getApplicableMaintenance(vehicleFor(profile)).find((task) => task.canonicalId === 'engine-oil'))
    .filter((task) => task?.manualIntervalMonths !== null);
  assert.ok(timed.length > 0);
});

test('conflicts surface alternatives and missing values remain missing', () => {
  const fiddle = modelKnowledgeBase.profiles.find((profile) => profile.modelName === 'Fiddle 4');
  assert.ok(fiddle);
  const conflicts = getConflictsForContext(vehicleFor(fiddle));
  assert.ok(conflicts.length > 0);
  assert.ok(conflicts.some((conflict) => conflict.alternatives.length >= 2));
  const missing = fiddle.records.filter((record) => record.section === 'missing_data');
  assert.ok(missing.length > 0);
  assert.ok(missing.some((record) => record.value === null));
  assert.equal(formatKnowledgeValue(null), 'Not specified in this manual.');
});

test('an unknown catalog selection never falls back to another model', () => {
  assert.equal(getModelProfileForVehicle({
    scooter_brand_id: 'sym',
    scooter_model_id: 'sym:not-real',
    scooter_version_id: 'sym:not-real:version',
    scooter_variant_id: null,
  }), null);
});
