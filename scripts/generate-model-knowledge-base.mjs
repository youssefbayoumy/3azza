import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import {
  buildVariantIdentification,
  validateVariantIdentificationArtifact,
} from './variant-identification.mjs';

const appRoot = process.cwd();
const masterPath = path.resolve(
  appRoot,
  '..',
  'outputs',
  '019fac48-c161-7542-973e-f0d9306642e1',
  'master_database.json'
);
const catalogPath = path.join(appRoot, 'src', 'generated', 'scooterCatalog.json');
const outputPath = path.join(appRoot, 'src', 'generated', 'modelKnowledgeBase.json');
const identificationOutputPath = path.join(appRoot, 'src', 'generated', 'variantIdentification.json');

const INCLUDED_SECTIONS = new Set([
  'maintenance_schedule',
  'specifications',
  'fluids',
  'pre_ride_inspection',
  'warning_lights',
  'dashboard_indicators',
  'troubleshooting',
  'safety',
  'break_in',
  'conflicts',
  'missing_data',
]);

const slugify = (value) => String(value)
  .normalize('NFKD')
  .replace(/[^a-zA-Z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '')
  .toLowerCase();

function asScopeString(value) {
  if (typeof value === 'string') return value.trim();
  if (value && typeof value === 'object' && typeof value.value === 'string') return value.value.trim();
  return '';
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function getVariantLabels(master, manualId, specificationRecords) {
  const analysis = master.cross_model_analysis?.models_and_variants
    ?.find((item) => item.manual_id === manualId);
  const extracted = analysis?.variant_strings_from_extraction ?? [];
  const scoped = unique(specificationRecords.flatMap((record) => record.model_scope.map(asScopeString)));
  const extractedCandidates = extracted.filter((value) => {
    if (typeof value !== 'string') return false;
    if (/^MODEL:/i.test(value) || /^Fiddle$/i.test(value)) return false;
    if (/^(all_|models_)/i.test(value)) return false;
    return true;
  });

  // Prefer individually named variants when the analysis supplies them. Combined
  // labels are retained only when the manual never separates the covered codes.
  const candidates = extractedCandidates.filter((value) => {
    const isCombined = /\sand\s|\s\/\s/i.test(value);
    if (!isCombined) return true;
    return !extractedCandidates.some((other) => other !== value && value.includes(other));
  });
  const candidatesByIdentity = new Map();
  for (const candidate of candidates) {
    const identity = candidate.match(/\b[A-Z]{2}\d{2}W{1,2}\d?\b/i)?.[0].toLowerCase()
      ?? candidate.toLowerCase();
    const existing = candidatesByIdentity.get(identity);
    if (!existing || scoped.includes(candidate)) candidatesByIdentity.set(identity, candidate);
  }
  const distinctCandidates = [...candidatesByIdentity.values()];

  const joymaxLabels = unique(specificationRecords.flatMap((record) => {
    const values = record.attributes?.values;
    if (!values || typeof values !== 'object' || Array.isArray(values)) return [];
    return Object.keys(values).filter((key) => extractedCandidates.includes(key));
  }));

  const materialLabels = joymaxLabels.length > 1
    ? joymaxLabels
    : scoped.length > 1
      ? distinctCandidates.length > 1
        ? distinctCandidates
        : scoped
      : [];

  return unique(materialLabels).map((name) => ({
    id: `${manualId}:${slugify(name)}`,
    name,
  }));
}

function projectRecord(record, manualPageCount) {
  const pages = unique(record.pages ?? []).sort((a, b) => a - b);
  if (pages.some((page) => !Number.isInteger(page) || page < 1 || page > manualPageCount)) {
    throw new Error(`Record ${record.record_id} contains an invalid 1-based PDF page citation.`);
  }
  if (record.section !== 'missing_data' && record.value !== null && pages.length === 0) {
    throw new Error(`Displayed record ${record.record_id} has no PDF page citation.`);
  }

  return {
    recordId: record.record_id,
    section: record.section,
    subject: record.subject,
    subsection: record.subsection ?? null,
    modelScope: unique((record.model_scope ?? []).map(asScopeString)),
    pages,
    value: record.value,
    attributes: record.attributes ?? {},
  };
}

function stringifyValue(value) {
  if (typeof value === 'string') return value;
  if (value === null || value === undefined) return '';
  return JSON.stringify(value);
}

function collectStatements(value, prefix = '') {
  if (typeof value === 'string' || typeof value === 'number') {
    return [`${prefix} ${String(value)}`.trim()];
  }
  if (value === null || value === undefined) return [];
  if (Array.isArray(value)) return value.flatMap((item) => collectStatements(item, prefix));
  if (typeof value === 'object') {
    return Object.entries(value).flatMap(([key, nested]) =>
      collectStatements(nested, `${prefix} ${key.replaceAll('_', ' ')}`.trim())
    );
  }
  return [];
}

function canonicalTaskId(subject) {
  const text = subject.toLowerCase();
  if (/engine[ _-]*oil$|^engine oil$/.test(text)) return 'engine-oil';
  if (/transmission oil|gearbox oil|final gear oil/.test(text)) return 'transmission-oil';
  if (/air (cleaner|filter)( element)?$/.test(text)) return 'air-filter';
  if (/brake.*(pad|lining)|(?:pad|lining).*brake/.test(text)) return 'brake-pads';
  if (/drive belt|v-belt/.test(text)) return 'drive-belt';
  if (/spark plug/.test(text)) return 'spark-plug';
  if (/coolant/.test(text)) return 'coolant';
  if (/brake fluid/.test(text)) return 'brake-fluid';
  if (/tire pressure/.test(text)) return 'tire-pressure';
  if (/battery/.test(text)) return 'battery';
  return slugify(subject);
}

function taskAction(subject, serialized) {
  const text = `${subject} ${serialized}`.toLowerCase();
  if (/\breplace|replacement|\br\b/.test(text)) return 'replace';
  if (/\bclean|\bc\b/.test(text)) return 'clean';
  return 'check';
}

function extractNumbers(text, unit) {
  const pattern = unit === 'km'
    ? /([0-9][0-9,]*)\s*km\b/gi
    : /([0-9][0-9,]*)\s*months?\b/gi;
  return [...text.matchAll(pattern)]
    .map((match) => Number(match[1].replaceAll(',', '')))
    .filter((value) => Number.isFinite(value) && value > 0);
}

function projectMaintenanceTasks(records, policy) {
  const tasks = new Map();
  for (const record of records) {
    if (record.section !== 'maintenance_schedule') continue;
    const subject = String(record.subject || '').trim();
    if (!subject || /^(maintenance procedure|maintenance_procedure|maintenance schedule)/i.test(subject)) continue;
    const serialized = stringifyValue(record.value);
    const combined = `${subject} ${serialized}`;
    const hasScheduleSignal = /\b(?:km|month|year|daily|before riding|every|initial|new)\b/i.test(combined)
      || Object.keys(record.attributes ?? {}).some((key) => /_km$|\d+km|interval|recurrence/i.test(key));
    if (!hasScheduleSignal) continue;

    const canonicalId = canonicalTaskId(subject);
    const existing = tasks.get(canonicalId) ?? {
      canonicalId,
      name: subject.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase()),
      action: taskAction(subject, serialized),
      manualIntervalKm: null,
      manualIntervalMonths: null,
      recommendedIntervalKm: null,
      recommendationOrigin: 'manual',
      initialDistanceKm: [],
      severeUseNotes: [],
      guidance: [],
      sourceRecordIds: [],
      pages: [],
    };

    const statements = collectStatements(record.value);
    const distances = extractNumbers(combined, 'km');
    const months = extractNumbers(combined, 'months');
    const recurringDistances = statements
      .filter((statement) => /every|thereafter|recurrence|replacement/i.test(statement))
      .flatMap((statement) => extractNumbers(statement, 'km'));
    const initialDistances = statements
      .filter((statement) => /initial(?:ly)?|first|second|new|^\s*\d[\d,]*\s*km\s+[RCI]\b/i.test(statement))
      .flatMap((statement) => extractNumbers(statement.split(/\b(?:every|then)\b/i)[0], 'km'));
    const recurring = recurringDistances.length > 0 ? recurringDistances : distances;
    const intervalKm = recurring.length > 0 ? Math.min(...recurring) : null;
    const intervalMonths = months.length > 0 ? Math.min(...months) : null;

    if (existing.manualIntervalKm === null || (intervalKm !== null && intervalKm < existing.manualIntervalKm)) {
      existing.manualIntervalKm = intervalKm;
    }
    if (existing.manualIntervalMonths === null || (intervalMonths !== null && intervalMonths < existing.manualIntervalMonths)) {
      existing.manualIntervalMonths = intervalMonths;
    }
    existing.initialDistanceKm = unique([...existing.initialDistanceKm, ...initialDistances]).sort((a, b) => a - b);
    existing.guidance.push({ recordId: record.recordId, value: record.value, pages: record.pages });
    existing.sourceRecordIds.push(record.recordId);
    existing.pages = unique([...existing.pages, ...record.pages]).sort((a, b) => a - b);
    if (/severe|dust|frequent rain|heavy load|short trips/i.test(combined)) {
      existing.severeUseNotes.push(serialized);
    }
    existing.recommendedIntervalKm = existing.manualIntervalKm;
    tasks.set(canonicalId, existing);
  }

  const oilPolicy = policy.find((item) => item.policy_id === 'engine_oil_change_interval');
  const oil = tasks.get('engine-oil');
  if (!oil || !oilPolicy || oilPolicy.interval?.distance_km !== 1000) {
    throw new Error('The approved recurring 1,000 km engine-oil policy could not be applied.');
  }
  oil.recommendedIntervalKm = 1000;
  oil.recommendationOrigin = '3azza_policy';
  oil.policyId = oilPolicy.policy_id;
  oil.policyCaveats = oilPolicy.caveats;

  return [...tasks.values()].sort((a, b) => a.canonicalId.localeCompare(b.canonicalId));
}

function conflictAlternatives(record) {
  const candidates = [];
  const value = record.value;
  if (Array.isArray(value)) {
    for (const item of value) candidates.push(item);
  } else if (value && typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) {
      if (/^(?:statement|value|alternative)_[a-z0-9]+$/i.test(key)) {
        candidates.push({ label: key, value: item, pages: value.pages ?? record.pages });
      }
    }
  }
  return candidates.map((item, index) => ({
    label: item?.label ?? `Alternative ${index + 1}`,
    value: item?.value ?? item,
    pages: item?.pages ?? record.pages,
  }));
}

const [master, catalog] = await Promise.all([
  readFile(masterPath, 'utf8').then(JSON.parse),
  readFile(catalogPath, 'utf8').then(JSON.parse),
]);

if (master.quality_gate?.merge_ready !== true) {
  throw new Error('Model knowledge generation requires quality_gate.merge_ready=true.');
}
if (!Array.isArray(master.manuals) || master.manuals.length !== 10) {
  throw new Error(`Expected exactly 10 validated manuals; found ${master.manuals?.length ?? 0}.`);
}
for (const manual of master.manuals) {
  if (String(manual.validation?.status).toLowerCase() !== 'pass') {
    throw new Error(`Manual ${manual.manual_id} is not independently validated PASS.`);
  }
}

const catalogVersions = catalog.manufacturers.flatMap((brand) =>
  brand.models.flatMap((model) => model.versions.map((version) => ({ brand, model, version })))
);
const manualIds = new Set(master.manuals.map((manual) => manual.manual_id));
const mappedManualIds = new Set();
for (const { version } of catalogVersions) {
  if (!manualIds.has(version.manualId)) throw new Error(`Catalog version ${version.id} maps to unknown manual_id ${version.manualId}.`);
  if (mappedManualIds.has(version.manualId)) throw new Error(`Duplicate catalog mapping for manual_id ${version.manualId}.`);
  mappedManualIds.add(version.manualId);
}
if (catalogVersions.length !== master.manuals.length || mappedManualIds.size !== master.manuals.length) {
  throw new Error('Every catalog version must map one-to-one with exactly one validated manual_id.');
}

const normalizedRecords = master.normalized?.records ?? [];
const profiles = catalogVersions.map(({ brand, model, version }) => {
  const manual = master.manuals.find((item) => item.manual_id === version.manualId);
  const manualRecords = normalizedRecords
    .filter((record) => record.manual_id === manual.manual_id && INCLUDED_SECTIONS.has(record.section))
    .map((record) => projectRecord(record, manual.page_count));
  const specificationRecords = normalizedRecords
    .filter((record) => record.manual_id === manual.manual_id && record.section === 'specifications');
  const variants = getVariantLabels(master, manual.manual_id, specificationRecords);
  const conflicts = manualRecords
    .filter((record) => record.section === 'conflicts')
    .map((record) => ({ ...record, alternatives: conflictAlternatives(record) }));

  return {
    catalogVersionId: version.id,
    brandId: brand.id,
    modelId: model.id,
    manualId: manual.manual_id,
    brandName: brand.name,
    modelName: model.name,
    manualYears: version.name,
    manualVersion: manual.version,
    pageCount: manual.page_count,
    variants,
    requiresVariant: variants.length > 1,
    maintenanceTasks: projectMaintenanceTasks(manualRecords, master.application_policy_overrides ?? []),
    records: manualRecords.filter((record) => record.section !== 'conflicts'),
    conflicts,
  };
});

const output = {
  schemaVersion: 1,
  sourceDatabase: master.database_name,
  sourceSchemaVersion: master.schema_version,
  quality: {
    mergeReady: true,
    manualCount: master.manuals.length,
    normalizedRecordCount: master.normalized.records.length,
    specificationFactCount: master.normalized.specification_facts.length,
    preservedConflictCount: normalizedRecords.filter((record) => record.section === 'conflicts').length,
  },
  applicationPolicyOverrides: master.application_policy_overrides ?? [],
  profiles,
};

const serialized = `${JSON.stringify(output)}\n`;
const identification = buildVariantIdentification(profiles);
validateVariantIdentificationArtifact(identification, profiles);
const identificationSerialized = `${JSON.stringify(identification, null, 2)}\n`;
if (process.argv.includes('--check')) {
  const [existing, existingIdentification] = await Promise.all([
    readFile(outputPath, 'utf8').catch(() => ''),
    readFile(identificationOutputPath, 'utf8').catch(() => ''),
  ]);
  if (existing !== serialized || existingIdentification !== identificationSerialized) {
    console.error('Model knowledge base or variant identification data is stale. Run: npm run model-data:generate');
    process.exitCode = 1;
  } else {
    const digest = createHash('sha256').update(serialized + identificationSerialized).digest('hex').slice(0, 12);
    console.log(`Model knowledge and identification data are current (${digest}, ${profiles.length} manuals).`);
  }
} else {
  await Promise.all([
    writeFile(outputPath, serialized, 'utf8'),
    writeFile(identificationOutputPath, identificationSerialized, 'utf8'),
  ]);
  console.log(`Generated model knowledge plus ${identification.profiles.length} manual/variant identification profiles.`);
}
