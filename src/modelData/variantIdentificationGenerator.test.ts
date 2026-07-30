import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import identificationJson from '../generated/variantIdentification.json';
import { modelKnowledgeBase } from './modelKnowledge';
import type { VariantIdentificationData } from './types';
import {
  resolveIdentificationValue,
  validateVariantIdentificationArtifact,
} from '../../scripts/variant-identification.mjs';

const artifact = identificationJson as VariantIdentificationData;

describe('generated variant identification integrity', () => {
  it('covers every exact catalog manual/variant identity once with cited source evidence', () => {
    assert.doesNotThrow(() => validateVariantIdentificationArtifact(artifact, modelKnowledgeBase.profiles));
    const expectedCount = modelKnowledgeBase.profiles.reduce(
      (count, profile) => count + Math.max(1, profile.variants.length),
      0
    );
    assert.equal(artifact.profiles.length, expectedCount);
    assert.equal(new Set(artifact.profiles.map((profile) => `${profile.manualId}:${profile.variantId ?? ''}`)).size, expectedCount);

    const exact = artifact.profiles.find((profile) => profile.variantId !== null && profile.displacementCc.status === 'confirmed');
    assert.ok(exact);
    assert.ok(exact.displacementCc.sourceRecordIds.every((recordId) => recordId.startsWith(`${exact.manualId}:`)));
    assert.ok(exact.displacementCc.pages.every((page) => Number.isInteger(page) && page >= 1));
  });

  it('preserves missing and conflict states instead of manufacturing confirmed values', () => {
    assert.deepEqual(resolveIdentificationValue([]), {
      value: null,
      status: 'missing',
      sourceRecordIds: [],
      pages: [],
    });
    assert.deepEqual(resolveIdentificationValue([
      { value: 'air', sourceRecordIds: ['a'], pages: [1] },
      { value: 'liquid', sourceRecordIds: ['b'], pages: [2] },
    ]), {
      value: null,
      status: 'conflict',
      sourceRecordIds: ['a', 'b'],
      pages: [1, 2],
    });
    assert.ok(artifact.profiles.some((profile) => profile.displacementCc.status === 'missing'));
    assert.ok(artifact.profiles.some((profile) => profile.displacementCc.status === 'conflict'));
  });

  it('rejects duplicate, unknown, cross-manual, invalid enum, cc, page, and catalog mappings', () => {
    const mutate = (change: (copy: VariantIdentificationData) => void) => {
      const copy = structuredClone(artifact);
      change(copy);
      return () => validateVariantIdentificationArtifact(copy, modelKnowledgeBase.profiles);
    };
    assert.throws(mutate((copy) => copy.profiles.push(structuredClone(copy.profiles[0]))), /Duplicate identification identity/);
    assert.throws(mutate((copy) => { copy.profiles[0].manualId = 'unknown_manual'; }), /unknown manual/);
    assert.throws(mutate((copy) => { copy.profiles[0].variantId = 'unknown_variant'; }), /unknown variant/);
    assert.throws(mutate((copy) => { copy.profiles[0].catalogVersionId = 'another:catalog:version'; }), /crosses catalog\/manual identity/);

    const coolingIndex = artifact.profiles.findIndex((profile) => profile.coolingSystem.status === 'confirmed');
    assert.ok(coolingIndex >= 0);
    assert.throws(mutate((copy) => { copy.profiles[coolingIndex].coolingSystem.value = 'steam' as never; }), /invalid enum/);

    const displacementIndex = artifact.profiles.findIndex((profile) => profile.displacementCc.status === 'confirmed');
    assert.ok(displacementIndex >= 0);
    assert.throws(mutate((copy) => { copy.profiles[displacementIndex].displacementCc.value = -1; }), /invalid displacement/);
    assert.throws(mutate((copy) => { copy.profiles[displacementIndex].displacementCc.pages = [0]; }), /invalid 1-based PDF page/);

    const otherManualRecord = modelKnowledgeBase.profiles.find(
      (profile) => profile.manualId !== artifact.profiles[displacementIndex].manualId && profile.records.length > 0
    )?.records[0];
    assert.ok(otherManualRecord);
    assert.throws(mutate((copy) => {
      copy.profiles[displacementIndex].displacementCc.sourceRecordIds = [otherManualRecord.recordId];
      copy.profiles[displacementIndex].displacementCc.pages = otherManualRecord.pages;
    }), /unknown or cross-manual source record/);
  });
});
