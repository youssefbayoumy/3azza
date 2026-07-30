import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const appRoot = process.cwd();
const repositoryRoot = path.resolve(appRoot, '..');
const outputPath = path.join(appRoot, 'src', 'generated', 'scooterCatalog.json');
const onlineManualConfigPath = path.join(appRoot, 'scripts', 'manual-online-urls.json');

const slugify = (value) => value
  .normalize('NFKD')
  .replace(/[^a-zA-Z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '')
  .toLowerCase();

function versionFromFilename(filename) {
  const match = filename.match(/_((?:19|20)\d{2})-(Present|(?:19|20)\d{2})_EN_/i);
  if (!match) return path.basename(filename, path.extname(filename));
  return `${match[1]}-${match[2][0].toUpperCase()}${match[2].slice(1).toLowerCase()}`;
}

function manualIdFromFilename(filename) {
  return path.basename(filename, path.extname(filename))
    .replace(/^SYM_/i, '')
    .replace(/_Manual$/i, '')
    .normalize('NFKD')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase();
}

function validateOnlineManualUrl(manualId, value) {
  if (value === null) return;
  if (typeof value !== 'string' || value.length === 0 || value.trim() !== value) {
    throw new Error(`Online manual URL for ${manualId} must be a non-empty HTTPS URL or null.`);
  }

  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`Online manual URL for ${manualId} is malformed: ${value}`);
  }

  if (parsed.protocol !== 'https:' || !parsed.hostname || parsed.username || parsed.password) {
    throw new Error(`Online manual URL for ${manualId} must use HTTPS without embedded credentials: ${value}`);
  }
}

async function loadOnlineManualUrls() {
  const raw = JSON.parse(await readFile(onlineManualConfigPath, 'utf8'));
  if (!Array.isArray(raw)) {
    throw new Error('Manual URL configuration must be an array.');
  }

  const urlsByManualId = new Map();
  const configuredUrls = new Map();
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object' || typeof entry.manualId !== 'string') {
      throw new Error('Each manual URL configuration entry must include a manualId.');
    }
    if (urlsByManualId.has(entry.manualId)) {
      throw new Error(`Duplicate manual URL configuration for manual_id ${entry.manualId}.`);
    }
    if (!Object.hasOwn(entry, 'onlineManualUrl')) {
      throw new Error(`Manual URL configuration for ${entry.manualId} must include onlineManualUrl (use null when unavailable).`);
    }
    validateOnlineManualUrl(entry.manualId, entry.onlineManualUrl);
    if (entry.onlineManualUrl !== null) {
      const previousManualId = configuredUrls.get(entry.onlineManualUrl);
      if (previousManualId) {
        throw new Error(`Online manual URL is assigned to more than one manual_id: ${previousManualId}, ${entry.manualId}.`);
      }
      configuredUrls.set(entry.onlineManualUrl, entry.manualId);
    }
    urlsByManualId.set(entry.manualId, entry.onlineManualUrl);
  }
  return urlsByManualId;
}

async function discoverCatalog() {
  const onlineManualUrls = await loadOnlineManualUrls();
  const discoveredManualIds = new Set();
  const rootEntries = await readdir(repositoryRoot, { withFileTypes: true });
  const manufacturerDirectories = rootEntries
    .filter((entry) => entry.isDirectory() && / Manuals$/i.test(entry.name))
    .sort((a, b) => a.name.localeCompare(b.name));

  const manufacturers = [];
  for (const manufacturerDirectory of manufacturerDirectories) {
    const brand = manufacturerDirectory.name.replace(/ Manuals$/i, '').trim();
    const manufacturerPath = path.join(repositoryRoot, manufacturerDirectory.name);
    const modelDirectories = (await readdir(manufacturerPath, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .sort((a, b) => a.name.localeCompare(b.name));
    const models = [];

    for (const modelDirectory of modelDirectories) {
      const modelPath = path.join(manufacturerPath, modelDirectory.name);
      const manuals = (await readdir(modelPath, { withFileTypes: true }))
        .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.pdf'))
        .sort((a, b) => a.name.localeCompare(b.name));
      const versions = manuals.map((manual) => {
        const versionName = versionFromFilename(manual.name);
        const manualRelativePath = path.relative(repositoryRoot, path.join(modelPath, manual.name)).replaceAll('\\', '/');
        const manualId = manualIdFromFilename(manual.name);
        if (discoveredManualIds.has(manualId)) {
          throw new Error(`Duplicate generated manual_id ${manualId}.`);
        }
        if (!onlineManualUrls.has(manualId)) {
          throw new Error(`Missing online manual URL configuration for manual_id ${manualId}. Use null when unavailable.`);
        }
        discoveredManualIds.add(manualId);
        return {
          id: `${slugify(brand)}:${slugify(modelDirectory.name)}:${slugify(versionName)}`,
          name: versionName,
          manualId,
          manualFileName: manual.name,
          manualRelativePath,
          onlineManualUrl: onlineManualUrls.get(manualId),
        };
      });
      if (versions.length > 0) {
        models.push({
          id: `${slugify(brand)}:${slugify(modelDirectory.name)}`,
          name: modelDirectory.name,
          versions,
        });
      }
    }

    if (models.length > 0) {
      manufacturers.push({ id: slugify(brand), name: brand, models });
    }
  }

  for (const configuredManualId of onlineManualUrls.keys()) {
    if (!discoveredManualIds.has(configuredManualId)) {
      throw new Error(`Manual URL configuration references unknown manual_id ${configuredManualId}.`);
    }
  }

  return {
    schemaVersion: 2,
    source: 'Generated from repository manufacturer manual directories',
    manufacturers,
  };
}

const catalog = await discoverCatalog();
const serialized = `${JSON.stringify(catalog, null, 2)}\n`;

if (process.argv.includes('--check')) {
  const existing = await readFile(outputPath, 'utf8').catch(() => '');
  if (existing !== serialized) {
    console.error('Scooter catalog is stale. Run: npm run catalog:generate');
    process.exitCode = 1;
  } else {
    const digest = createHash('sha256').update(serialized).digest('hex').slice(0, 12);
    console.log(`Scooter catalog is current (${digest}).`);
  }
} else {
  await writeFile(outputPath, serialized, 'utf8');
  console.log(`Generated ${path.relative(appRoot, outputPath)} with ${catalog.manufacturers.length} manufacturer(s).`);
}
