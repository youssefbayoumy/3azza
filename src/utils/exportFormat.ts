import type { ServiceLog } from '../types/database.types';
import { t } from '../i18n/core';

export type ShareSheetOutcome = 'closed' | 'unavailable';

export function escapeCsv(value: string | number | null | undefined): string {
  const raw = value === null || value === undefined ? '' : String(value);
  return `"${raw.replace(/"/g, '""')}"`;
}

export function buildServiceLogsCsv(logs: ServiceLog[]): string {
  const rows = [
    [t('export.csv.date'), t('export.csv.odometer'), t('export.csv.title'), t('export.csv.category'), t('export.csv.serviceType'), t('export.csv.cost'), t('export.csv.notes')].map(escapeCsv).join(','),
    ...logs.map((log) =>
      [
        log.date,
        log.sets_odometer_baseline === 1 ? log.mileage : '',
        log.title,
        log.category,
        log.service_type,
        log.cost,
        log.notes,
      ]
        .map(escapeCsv)
        .join(',')
    ),
  ];

  return `${rows.join('\n')}\n`;
}

export function getExportCompletionMessage(
  format: string,
  uri: string,
  shareSheetOutcome: ShareSheetOutcome
): string {
  if (shareSheetOutcome === 'closed') {
    return t('export.shareClosed', { format, uri });
  }

  return t('export.shareUnavailable', { format, uri });
}
