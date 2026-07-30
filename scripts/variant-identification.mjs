const FEATURE_STATUSES = new Set(['confirmed', 'conflict', 'missing']);
const COOLING_VALUES = new Set(['air', 'liquid']);
const FUEL_VALUES = new Set(['carburetor', 'fuel_injection']);

const unique = (values) => [...new Set(values)];

function normalizeLabel(value) {
  return String(value ?? '')
    .normalize('NFKD')
    .replace(/[()]/g, ' ')
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .trim()
    .toLowerCase();
}

function labelsMatch(left, right) {
  const a = normalizeLabel(left);
  const b = normalizeLabel(right);
  return Boolean(a && b && (a === b || a.includes(b) || b.includes(a)));
}

function isManualWideScope(scope) {
  return /^(?:all|all models|all specification variants|models covered)/i.test(
    normalizeLabel(scope).replaceAll('_', ' ')
  );
}

function collectLeaves(value, path = []) {
  if (value === null || value === undefined) return [];
  if (typeof value !== 'object') return [{ path, value }];
  if (Array.isArray(value)) return value.flatMap((item, index) => collectLeaves(item, [...path, String(index)]));
  return Object.entries(value)
    .filter(([key]) => !['page', 'pages'].includes(key.toLowerCase()))
    .flatMap(([key, nested]) => collectLeaves(nested, [...path, key]));
}

function findVariantValues(value, variantName, allVariantNames) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { found: false, values: [] };
  const entries = Object.entries(value);
  const matching = entries.filter(([key]) => labelsMatch(key, variantName));
  if (matching.length > 0) {
    return { found: true, values: matching.flatMap(([key, nested]) => collectLeaves(nested, [key])) };
  }
  const hasOtherVariantKeys = entries.some(([key]) => allVariantNames.some((name) => labelsMatch(key, name)));
  if (hasOtherVariantKeys) return { found: true, values: [] };
  for (const [key, nested] of entries) {
    const nestedResult = findVariantValues(nested, variantName, allVariantNames);
    if (nestedResult.found) {
      return {
        found: true,
        values: nestedResult.values.map((item) => ({ ...item, path: [key, ...item.path] })),
      };
    }
  }
  return { found: false, values: [] };
}

function recordLeavesForVariant(record, variantName, allVariantNames) {
  const scopes = record.modelScope ?? [];
  const scopeMatches = variantName
    ? scopes.some((scope) => labelsMatch(scope, variantName) || isManualWideScope(scope))
    : scopes.length === 0 || scopes.some(isManualWideScope);
  if (scopes.length > 0 && !scopeMatches) return [];

  if (variantName) {
    const keyed = findVariantValues(record.value, variantName, allVariantNames);
    if (keyed.found) return keyed.values;
    const attributeKeyed = findVariantValues(record.attributes, variantName, allVariantNames);
    if (attributeKeyed.found) return attributeKeyed.values;
  }
  return [
    ...collectLeaves(record.value, [record.subject]),
    ...collectLeaves(record.attributes, ['attributes']),
  ];
}

function parseDisplacement(value, path, record) {
  const field = `${record.subject} ${record.subsection ?? ''} ${path.join(' ')}`.toLowerCase();
  if (!/displacement/.test(field)) return null;
  if (typeof value === 'number') return value;
  const text = String(value);
  const match = text.match(/([0-9]+(?:\.[0-9]+)?)\s*(?:c\.?c\.?|cm3|cm³)\b/i);
  return match ? Number(match[1]) : null;
}

function parseCooling(value, path, record) {
  const field = `${record.subject} ${record.subsection ?? ''} ${path.join(' ')}`.toLowerCase();
  if (!/engine|cool|type/.test(field)) return null;
  const text = String(value).toLowerCase();
  if (/liquid[- ]cooled|water[- ]cooled/.test(text)) return 'liquid';
  if (/air[- ]cooled|forced[- ]air/.test(text)) return 'air';
  return null;
}

function parseFuelSystem(value, path, record) {
  const field = `${record.subject} ${record.subsection ?? ''} ${path.join(' ')}`.toLowerCase();
  const text = String(value).toLowerCase();
  if (!/fuel.system|carb|injection|\befi\b/.test(`${field} ${text}`)) return null;
  if (/carburet/.test(text)) return 'carburetor';
  if (/fuel injection|injected|\befi\b/.test(text)) return 'fuel_injection';
  return null;
}

export function resolveIdentificationValue(candidates) {
  const material = candidates.filter((candidate) => candidate.value !== null && candidate.value !== undefined);
  const sources = unique(candidates.flatMap((candidate) => candidate.sourceRecordIds ?? [])).sort();
  const pages = unique(candidates.flatMap((candidate) => candidate.pages ?? [])).sort((a, b) => a - b);
  if (material.length === 0) return { value: null, status: 'missing', sourceRecordIds: sources, pages };
  const byValue = new Map();
  for (const candidate of material) {
    const key = typeof candidate.value === 'number' ? candidate.value.toFixed(3) : String(candidate.value);
    if (!byValue.has(key)) byValue.set(key, candidate.value);
  }
  if (byValue.size > 1) return { value: null, status: 'conflict', sourceRecordIds: sources, pages };
  return { value: [...byValue.values()][0], status: 'confirmed', sourceRecordIds: sources, pages };
}

function featureCandidates(records, variantName, allVariantNames, parser) {
  return records.flatMap((record) => recordLeavesForVariant(record, variantName, allVariantNames)
    .map((leaf) => ({
      value: parser(leaf.value, leaf.path, record),
      sourceRecordIds: [record.recordId],
      pages: record.pages,
    }))
    .filter((candidate) => candidate.value !== null));
}

function variantIdentityTokens(variantName) {
  return unique(String(variantName ?? '').match(/\b[A-Z]{2}\d{2}[A-Z0-9]*/g) ?? []);
}

function relevantStateRecords(records, featurePattern, variantName, variantCount) {
  return records.filter((record) => {
    const fieldText = `${record.subject} ${record.subsection ?? ''} ${record.attributes?.field ?? ''} ${record.attributes?.topic ?? ''}`;
    const evidenceText = `${fieldText} ${JSON.stringify(record.value)}`;
    if (!featurePattern.test(evidenceText)) return false;
    const scopes = record.modelScope ?? [];
    if (scopes.length > 0) {
      return scopes.some((scope) => isManualWideScope(scope) || (variantName && labelsMatch(scope, variantName)));
    }
    if (variantCount <= 1) return true;
    const tokens = variantIdentityTokens(variantName);
    const recordText = normalizeLabel(evidenceText);
    return tokens.some((token) => recordText.includes(normalizeLabel(token)));
  });
}

function applyExplicitState(value, missingRecords, conflictRecords) {
  const records = conflictRecords.length > 0 ? conflictRecords : missingRecords;
  if (records.length === 0) return value;
  return {
    value: null,
    status: conflictRecords.length > 0 ? 'conflict' : 'missing',
    sourceRecordIds: unique([...value.sourceRecordIds, ...records.map((record) => record.recordId)]).sort(),
    pages: unique([...value.pages, ...records.flatMap((record) => record.pages)]).sort((a, b) => a - b),
  };
}

function modelCodeValue(profile, variant) {
  if (!variant) return { value: null, status: 'missing', sourceRecordIds: [], pages: [] };
  const records = profile.records.filter((record) =>
    record.section === 'specifications'
    && ((record.modelScope ?? []).some((scope) => labelsMatch(scope, variant.name))
      || findVariantValues(record.value, variant.name, profile.variants.map((item) => item.name)).found
      || findVariantValues(record.attributes, variant.name, profile.variants.map((item) => item.name)).found)
  );
  if (records.length === 0) return { value: null, status: 'missing', sourceRecordIds: [], pages: [] };
  return {
    value: variant.name,
    status: 'confirmed',
    sourceRecordIds: unique(records.map((record) => record.recordId)).sort(),
    pages: unique(records.flatMap((record) => record.pages)).sort((a, b) => a - b),
  };
}

export function buildVariantIdentification(profiles) {
  const identificationProfiles = profiles.flatMap((profile) => {
    const variants = profile.variants.length > 0 ? profile.variants : [null];
    const specificationRecords = profile.records.filter((record) => record.section === 'specifications');
    const missingRecords = profile.records.filter((record) => record.section === 'missing_data');
    const allVariantNames = profile.variants.map((variant) => variant.name);
    return variants.map((variant) => {
      const variantName = variant?.name ?? null;
      const displacement = resolveIdentificationValue(
        featureCandidates(specificationRecords, variantName, allVariantNames, parseDisplacement)
      );
      const cooling = resolveIdentificationValue(
        featureCandidates(specificationRecords, variantName, allVariantNames, parseCooling)
      );
      const fuel = resolveIdentificationValue(
        featureCandidates(specificationRecords, variantName, allVariantNames, parseFuelSystem)
      );
      const conflicts = profile.conflicts ?? [];
      return {
        manualId: profile.manualId,
        catalogVersionId: profile.catalogVersionId,
        variantId: variant?.id ?? null,
        variantName,
        modelCode: modelCodeValue(profile, variant),
        displacementCc: applyExplicitState(
          displacement,
          relevantStateRecords(missingRecords, /displacement/i, variantName, variants.length),
          relevantStateRecords(conflicts, /displacement/i, variantName, variants.length)
        ),
        coolingSystem: applyExplicitState(
          cooling,
          relevantStateRecords(missingRecords, /cooling|engine.type/i, variantName, variants.length),
          relevantStateRecords(conflicts, /cooling|engine.type/i, variantName, variants.length)
        ),
        fuelSystem: applyExplicitState(
          fuel,
          relevantStateRecords(missingRecords, /fuel.system|carb|injection|\befi\b/i, variantName, variants.length),
          relevantStateRecords(conflicts, /fuel.system|carb|injection|\befi\b/i, variantName, variants.length)
        ),
        additionalDistinguishers: [],
      };
    });
  });
  return {
    schemaVersion: 1,
    source: 'Generated normalization of validated manual specification records',
    profiles: identificationProfiles,
  };
}

function validateValue(name, value, profile, recordMap, enumValues) {
  if (!FEATURE_STATUSES.has(value?.status)) throw new Error(`${name} has an invalid status.`);
  if (!Array.isArray(value.sourceRecordIds) || !Array.isArray(value.pages)) {
    throw new Error(`${name} must retain sourceRecordIds and pages arrays.`);
  }
  if (new Set(value.sourceRecordIds).size !== value.sourceRecordIds.length) throw new Error(`${name} has duplicate source record IDs.`);
  if (new Set(value.pages).size !== value.pages.length) throw new Error(`${name} has duplicate PDF pages.`);
  if (value.status === 'confirmed' && (value.value === null || value.value === undefined)) throw new Error(`${name} is confirmed without a value.`);
  if (value.status !== 'confirmed' && value.value !== null) throw new Error(`${name} must keep conflict/missing values null.`);
  if (value.status === 'confirmed' && value.sourceRecordIds.length === 0) throw new Error(`${name} is confirmed without source evidence.`);
  if (enumValues && value.status === 'confirmed' && !enumValues.has(value.value)) throw new Error(`${name} has an invalid enum value.`);
  if (name.endsWith('displacementCc') && value.status === 'confirmed'
    && (!Number.isFinite(value.value) || value.value <= 0 || value.value > 2000)) {
    throw new Error(`${name} has an invalid displacement value.`);
  }
  for (const recordId of value.sourceRecordIds) {
    if (!recordMap.has(recordId)) throw new Error(`${name} references an unknown or cross-manual source record ${recordId}.`);
  }
  for (const page of value.pages) {
    if (!Number.isInteger(page) || page < 1 || page > profile.pageCount) throw new Error(`${name} has an invalid 1-based PDF page.`);
    if (value.sourceRecordIds.length > 0 && !value.sourceRecordIds.some((recordId) => recordMap.get(recordId).pages.includes(page))) {
      throw new Error(`${name} cites a page not present on its source records.`);
    }
  }
}

export function validateVariantIdentificationArtifact(artifact, profiles) {
  if (artifact?.schemaVersion !== 1 || !Array.isArray(artifact.profiles)) throw new Error('Malformed variant identification artifact.');
  const catalogByManual = new Map(profiles.map((profile) => [profile.manualId, profile]));
  const expected = new Set(profiles.flatMap((profile) =>
    (profile.variants.length > 0 ? profile.variants : [null])
      .map((variant) => `${profile.manualId}\u0000${variant?.id ?? ''}`)
  ));
  const seen = new Set();
  for (const item of artifact.profiles) {
    const profile = catalogByManual.get(item.manualId);
    if (!profile) throw new Error(`Identification profile references unknown manual ${item.manualId}.`);
    if (item.catalogVersionId !== profile.catalogVersionId) throw new Error(`Identification profile crosses catalog/manual identity for ${item.manualId}.`);
    const variant = item.variantId === null ? null : profile.variants.find((candidate) => candidate.id === item.variantId);
    if (item.variantId !== null && !variant) throw new Error(`Identification profile references unknown variant ${item.variantId}.`);
    if (profile.variants.length > 0 && item.variantId === null) throw new Error(`Required variant identity is missing for ${item.manualId}.`);
    if (profile.variants.length === 0 && item.variantId !== null) throw new Error(`Variant-free manual ${item.manualId} cannot have a variant identity.`);
    if (item.variantName !== (variant?.name ?? null)) throw new Error(`Variant label does not match stable identity ${item.variantId}.`);
    const identity = `${item.manualId}\u0000${item.variantId ?? ''}`;
    if (seen.has(identity)) throw new Error(`Duplicate identification identity ${identity}.`);
    seen.add(identity);
    const recordMap = new Map([...profile.records, ...(profile.conflicts ?? [])].map((record) => [record.recordId, record]));
    validateValue(`${identity}.modelCode`, item.modelCode, profile, recordMap);
    validateValue(`${identity}.displacementCc`, item.displacementCc, profile, recordMap);
    validateValue(`${identity}.coolingSystem`, item.coolingSystem, profile, recordMap, COOLING_VALUES);
    validateValue(`${identity}.fuelSystem`, item.fuelSystem, profile, recordMap, FUEL_VALUES);
    if (!Array.isArray(item.additionalDistinguishers)) throw new Error(`${identity} has malformed additional distinguishers.`);
  }
  if (seen.size !== expected.size || [...expected].some((identity) => !seen.has(identity))) {
    throw new Error('Every catalog manual/variant identity must have exactly one identification profile.');
  }
  return artifact;
}
