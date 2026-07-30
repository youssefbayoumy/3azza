import type { ServiceLog } from '../types/database.types';

export type ShareSheetOutcome = 'closed' | 'unavailable';

export function escapeCsv(value: string | number | null | undefined): string {
  const raw = value === null || value === undefined ? '' : String(value);
  return `"${raw.replace(/"/g, '""')}"`;
}

export function buildServiceLogsCsv(logs: ServiceLog[]): string {
  const rows = [
    ['Date', 'Odometer KM', 'Title', 'Category', 'Service Type', 'Cost', 'Notes'].map(escapeCsv).join(','),
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
    return `The share sheet was closed. 3azza cannot determine whether another app received the ${format}. A local copy remains at:\n${uri}`;
  }

  return `Sharing is unavailable. The ${format} was saved locally at:\n${uri}`;
}
