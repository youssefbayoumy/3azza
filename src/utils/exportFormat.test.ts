import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildServiceLogsCsv, escapeCsv, getExportCompletionMessage } from './exportFormat';
import type { ServiceLog } from '../types/database.types';

describe('export formatting', () => {
  it('escapes CSV values', () => {
    assert.equal(escapeCsv('Oil "premium", 10W-40'), '"Oil ""premium"", 10W-40"');
    assert.equal(escapeCsv(null), '""');
  });

  it('builds service history CSV rows', () => {
    const logs: ServiceLog[] = [
      {
        id: 1,
        vehicle_id: 1,
        title: 'Oil Change',
        date: '2026-06-28',
        mileage: 1200,
        category: 'engine',
        notes: 'Used synthetic oil',
        cost: 350,
        service_type: 'Oil Change',
        sets_odometer_baseline: 1,
      },
    ];

    const csv = buildServiceLogsCsv(logs);
    assert.match(csv, /^"Date","Odometer KM","Title"/);
    assert.match(csv, /"2026-06-28","1200","Oil Change"/);
  });

  it('leaves the odometer cell empty for date-only history', () => {
    const csv = buildServiceLogsCsv([{
      id: 2,
      vehicle_id: 1,
      title: 'Air Filter',
      date: '2026-06-01',
      mileage: 0,
      category: 'engine',
      notes: '',
      cost: null,
      service_type: 'Air Filter',
      sets_odometer_baseline: 0,
    }]);
    assert.match(csv, /"2026-06-01","","Air Filter"/);
  });

  it('does not claim a share succeeded when the native sheet only closed', () => {
    const message = getExportCompletionMessage('JSON backup', 'file:///backup.json', 'closed');
    assert.match(message, /cannot determine whether another app received the JSON backup/i);
    assert.doesNotMatch(message, /was shared\./i);
    assert.match(message, /file:\/\/\/backup\.json/);
  });

  it('reports the local file when native sharing is unavailable', () => {
    const message = getExportCompletionMessage('CSV', 'file:///history.csv', 'unavailable');
    assert.match(message, /sharing is unavailable/i);
    assert.match(message, /saved locally/i);
  });
});
