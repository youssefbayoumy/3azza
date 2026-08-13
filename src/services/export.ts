import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as Crypto from 'expo-crypto';
import {
  getDatabaseBackupData,
  getServiceLogs,
  restoreDatabaseBackupData,
} from './database';
import { toIsoDate } from '../utils/dates';
import {
  normalizeBackupArchive,
  validateDatabaseBackupData,
  type BackupSnapshot,
  type EmbeddedDocumentFile,
  type NormalizedBackupArchive,
} from './backupFormat';
import { buildServiceLogsCsv, type ShareSheetOutcome } from '../utils/exportFormat';

export type ExportResult = {
  uri: string;
  shareSheetOutcome: ShareSheetOutcome;
  documentPhotoCount?: number;
};

export type RestoreResult = {
  sourceSchema: NormalizedBackupArchive['source_schema'];
  documentPhotoCount: number;
};

const MIME_TYPES: Record<EmbeddedDocumentFile['extension'], string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  heic: 'image/heic',
  heif: 'image/heif',
};

function getExportDirectory(): string {
  return FileSystem.documentDirectory ?? FileSystem.cacheDirectory ?? '';
}

async function shareFile(uri: string, mimeType: string): Promise<ShareSheetOutcome> {
  if (!(await Sharing.isAvailableAsync())) return 'unavailable';

  await Sharing.shareAsync(uri, { mimeType });
  return 'closed';
}

function getDocumentExtension(uri: string): EmbeddedDocumentFile['extension'] {
  const path = uri.split(/[?#]/, 1)[0];
  const match = path.match(/\.([a-z0-9]+)$/i);
  const extension = match?.[1].toLowerCase() as EmbeddedDocumentFile['extension'] | undefined;
  if (!extension || !(extension in MIME_TYPES)) {
    throw new Error('A document photo has an unsupported or missing file extension.');
  }
  return extension;
}

async function buildEmbeddedDocumentFiles(
  documents: Awaited<ReturnType<typeof getDatabaseBackupData>>['documents_vault']
): Promise<EmbeddedDocumentFile[]> {
  const files: EmbeddedDocumentFile[] = [];

  for (const document of documents) {
    const info = await FileSystem.getInfoAsync(document.image_uri);
    if (!info.exists || info.isDirectory) {
      throw new Error(`The photo for “${document.title}” is missing. No backup was created.`);
    }
    const extension = getDocumentExtension(document.image_uri);
    const dataBase64 = await FileSystem.readAsStringAsync(document.image_uri, {
      encoding: FileSystem.EncodingType.Base64,
    });
    if (!dataBase64) throw new Error(`The photo for “${document.title}” is empty. No backup was created.`);
    files.push({
      document_id: document.id,
      extension,
      mime_type: MIME_TYPES[extension],
      sha256: await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, dataBase64),
      data_base64: dataBase64,
    });
  }

  return files;
}

export async function buildBackupSnapshot(): Promise<BackupSnapshot> {
  const data = await getDatabaseBackupData();
  const snapshot: BackupSnapshot = {
    exported_at: new Date().toISOString(),
    schema: '3azza-local-backup/v6',
    data,
    document_files: await buildEmbeddedDocumentFiles(data.documents_vault),
  };
  normalizeBackupArchive(snapshot);
  return snapshot;
}

export async function exportBackupJson(): Promise<ExportResult> {
  const directory = getExportDirectory();
  const snapshot = await buildBackupSnapshot();
  const uri = `${directory}3azza-backup-${toIsoDate(new Date())}.json`;

  await FileSystem.writeAsStringAsync(uri, JSON.stringify(snapshot, null, 2), {
    encoding: FileSystem.EncodingType.UTF8,
  });

  return {
    uri,
    shareSheetOutcome: await shareFile(uri, 'application/json'),
    documentPhotoCount: snapshot.document_files.length,
  };
}

export async function prepareBackupJsonFromUri(uri: string): Promise<NormalizedBackupArchive> {
  const raw = await FileSystem.readAsStringAsync(uri, {
    encoding: FileSystem.EncodingType.UTF8,
  });
  const parsed = JSON.parse(raw) as unknown;
  return normalizeBackupArchive(parsed);
}

export async function restorePreparedBackup(archive: NormalizedBackupArchive): Promise<RestoreResult> {
  const createdUris: string[] = [];

  try {
    let data = archive.data;
    if (
      archive.source_schema === '3azza-local-backup/v4'
      || archive.source_schema === '3azza-local-backup/v5'
      || archive.source_schema === '3azza-local-backup/v6'
    ) {
      const directory = FileSystem.documentDirectory;
      if (!directory) throw new Error('App document storage is unavailable.');
      const restoredUris = new Map<number, string>();
      const restoreToken = Date.now();

      for (const [index, file] of archive.document_files.entries()) {
        const digest = await Crypto.digestStringAsync(
          Crypto.CryptoDigestAlgorithm.SHA256,
          file.data_base64
        );
        if (digest.toLowerCase() !== file.sha256.toLowerCase()) {
          throw new Error(`Document photo ${file.document_id} failed its integrity check.`);
        }
        const destination = `${directory}restored-document-${file.document_id}-${restoreToken}-${index}.${file.extension}`;
        await FileSystem.writeAsStringAsync(destination, file.data_base64, {
          encoding: FileSystem.EncodingType.Base64,
        });
        createdUris.push(destination);
        restoredUris.set(file.document_id, destination);
      }

      data = {
        ...archive.data,
        documents_vault: archive.data.documents_vault.map((document) => ({
          ...document,
          image_uri: restoredUris.get(document.id) ?? document.image_uri,
        })),
      };
      validateDatabaseBackupData(data);
    }

    await restoreDatabaseBackupData(data);
    return {
      sourceSchema: archive.source_schema,
      documentPhotoCount: archive.document_files.length,
    };
  } catch (error) {
    await Promise.all(
      createdUris.map((uri) => FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => undefined))
    );
    throw error;
  }
}

export async function restoreBackupJsonFromUri(uri: string): Promise<RestoreResult> {
  return restorePreparedBackup(await prepareBackupJsonFromUri(uri));
}

export async function exportServiceLogsCsv(): Promise<ExportResult> {
  const directory = getExportDirectory();
  const logs = await getServiceLogs();
  const uri = `${directory}3azza-service-history-${toIsoDate(new Date())}.csv`;

  await FileSystem.writeAsStringAsync(uri, buildServiceLogsCsv(logs), {
    encoding: FileSystem.EncodingType.UTF8,
  });

  return { uri, shareSheetOutcome: await shareFile(uri, 'text/csv') };
}
