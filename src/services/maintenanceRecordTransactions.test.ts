import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { beforeEach, describe, it } from 'node:test';
import { CURRENT_SCHEMA_SQL } from './databaseSchema';
import {
  deleteMaintenanceRecordInTransaction,
  insertMaintenanceRecordInTransaction,
  MaintenanceDuplicateError,
  updateMaintenanceRecordInTransaction,
  type MaintenanceRecordSqlValue,
  type MaintenanceRecordTransactionExecutor,
  type PreparedMaintenanceRecordAction,
  type PreparedMaintenanceRecordInput,
} from './maintenanceRecordTransactions';

function executor(database: DatabaseSync): MaintenanceRecordTransactionExecutor {
  return {
    async getFirstAsync<T>(source: string, params: MaintenanceRecordSqlValue[]): Promise<T | null> {
      return (database.prepare(source).get(...params) as T | undefined) ?? null;
    },
    async getAllAsync<T>(source: string, params: MaintenanceRecordSqlValue[]): Promise<T[]> {
      return database.prepare(source).all(...params) as T[];
    },
    async runAsync(source: string, params: MaintenanceRecordSqlValue[]) {
      const result = database.prepare(source).run(...params);
      return { changes: Number(result.changes), lastInsertRowId: Number(result.lastInsertRowid) };
    },
  };
}

async function inTransaction<T>(database: DatabaseSync, task: () => Promise<T>): Promise<T> {
  database.exec('BEGIN');
  try {
    const result = await task();
    database.exec('COMMIT');
    return result;
  } catch (error) {
    database.exec('ROLLBACK');
    throw error;
  }
}

function action(
  componentId: string,
  maintenanceAction: PreparedMaintenanceRecordAction['action'] = 'replace'
): PreparedMaintenanceRecordAction {
  return {
    ruleId: `${componentId}-${maintenanceAction}`,
    componentId,
    action: maintenanceAction,
    profileId: 'sym-st-200',
    profileVersion: '2026.1',
    title: `${componentId} ${maintenanceAction}`,
    category: 'engine_and_lubrication',
    inspectionResult: null,
  };
}

function record(
  actions: PreparedMaintenanceRecordAction[] = [action('engine-oil')],
  overrides: Partial<PreparedMaintenanceRecordInput> = {}
): PreparedMaintenanceRecordInput {
  return {
    serviceDate: '2026-07-20',
    mileageKm: 11000,
    dateConfidence: 'confirmed',
    mileageConfidence: 'confirmed',
    notes: '',
    cost: null,
    serviceProvider: null,
    recordSource: actions.length > 1 ? 'service_package' : 'manual_entry',
    packageId: actions.length > 1 ? 'package-1' : null,
    packageTitle: actions.length > 1 ? 'Workshop service' : null,
    oilBrand: null,
    oilType: null,
    oilViscosity: null,
    oilNotes: null,
    actions,
    allowDuplicate: false,
    timestamp: '2026-08-01T08:00:00.000Z',
    ...overrides,
  };
}

describe('unified maintenance record transactions', () => {
  let database: DatabaseSync;
  let transaction: MaintenanceRecordTransactionExecutor;

  beforeEach(() => {
    database = new DatabaseSync(':memory:');
    database.exec(CURRENT_SCHEMA_SQL);
    database.prepare(
      "INSERT INTO vehicle_profile (id, name, current_mileage) VALUES (1, 'Primary', 12000), (2, 'Other', 12000)"
    ).run();
    transaction = executor(database);
  });

  it('rejects future dates and records an exact-mileage/unknown-date baseline safely', async () => {
    await assert.rejects(
      inTransaction(database, () => insertMaintenanceRecordInTransaction(
        transaction,
        1,
        record([action('engine-oil')], { serviceDate: '2026-08-02' }),
        new Date('2026-08-01T12:00:00Z')
      )),
      /cannot be in the future/
    );

    await inTransaction(database, () => insertMaintenanceRecordInTransaction(
      transaction,
      1,
      record([action('engine-oil')], {
        serviceDate: null,
        dateConfidence: 'unknown',
      }),
      new Date('2026-08-01T12:00:00Z')
    ));
    const row = database.prepare(
      `SELECT date, mileage, sets_odometer_baseline AS baseline,
              maintenance_date_confidence AS dateConfidence
       FROM service_logs`
    ).get() as { date: string; mileage: number; baseline: number; dateConfidence: string };
    assert.deepEqual({ ...row }, { date: '', mileage: 11000, baseline: 1, dateConfidence: 'unknown' });
  });

  it('writes a multi-action package atomically with one history state per action', async () => {
    const input = record([action('engine-oil'), action('air-filter', 'inspect')], {
      serviceProvider: 'Workshop A',
      oilBrand: 'Brand A',
      oilViscosity: '10W-40',
    });
    const result = await inTransaction(
      database,
      () => insertMaintenanceRecordInTransaction(transaction, 1, input)
    );
    assert.equal(result.ids.length, 2);
    assert.equal(result.packageId, 'package-1');
    const rows = database.prepare(
      `SELECT service_package_id AS packageId, service_provider AS provider,
              oil_viscosity AS viscosity
       FROM service_logs ORDER BY id`
    ).all() as { packageId: string; provider: string; viscosity: string }[];
    assert.deepEqual(rows.map((row) => ({ ...row })), [
      { packageId: 'package-1', provider: 'Workshop A', viscosity: '10W-40' },
      { packageId: 'package-1', provider: 'Workshop A', viscosity: '10W-40' },
    ]);
    assert.equal(
      (database.prepare('SELECT COUNT(*) AS count FROM maintenance_history_states').get() as { count: number }).count,
      2
    );
  });

  it('records one compact-menu child action without updating its sibling', async () => {
    const selected = action('engine-fasteners', 'inspect');
    await inTransaction(
      database,
      () => insertMaintenanceRecordInTransaction(transaction, 1, record([selected]))
    );
    const states = database.prepare(
      `SELECT component_id AS componentId, action
       FROM maintenance_history_states ORDER BY component_id`
    ).all() as { componentId: string; action: string }[];
    assert.deepEqual(states.map((row) => ({ ...row })), [
      { componentId: 'engine-fasteners', action: 'inspect' },
    ]);
    assert.equal(
      (database.prepare(
        "SELECT COUNT(*) AS count FROM maintenance_history_states WHERE component_id = 'general-fasteners'"
      ).get() as { count: number }).count,
      0
    );
  });

  it('requires explicit duplicate confirmation and marks the confirmed copy', async () => {
    const input = record();
    await inTransaction(database, () => insertMaintenanceRecordInTransaction(transaction, 1, input));
    await assert.rejects(
      inTransaction(database, () => insertMaintenanceRecordInTransaction(transaction, 1, input)),
      (error: unknown) => error instanceof MaintenanceDuplicateError && error.duplicates.length === 1
    );
    await inTransaction(database, () => insertMaintenanceRecordInTransaction(
      transaction,
      1,
      { ...input, allowDuplicate: true, timestamp: '2026-08-01T09:00:00.000Z' }
    ));
    assert.deepEqual(
      (database.prepare('SELECT duplicate_confirmed AS confirmed FROM service_logs ORDER BY id').all() as {
        confirmed: number;
      }[]).map((row) => row.confirmed),
      [0, 1]
    );
  });

  it('stores other work with no scheduler identity or history-state side effect', async () => {
    const otherWork: PreparedMaintenanceRecordAction = {
      ruleId: null,
      componentId: null,
      action: null,
      profileId: null,
      profileVersion: null,
      title: 'Front fairing repair',
      category: 'bodywork',
      inspectionResult: null,
    };
    await inTransaction(
      database,
      () => insertMaintenanceRecordInTransaction(transaction, 1, record([otherWork]))
    );
    const row = database.prepare(
      `SELECT maintenance_rule_id AS ruleId, maintenance_component_id AS componentId,
              maintenance_action AS action, maintenance_profile_id AS profileId
       FROM service_logs`
    ).get() as Record<string, null>;
    assert.deepEqual({ ...row }, { ruleId: null, componentId: null, action: null, profileId: null });
    assert.equal(
      (database.prepare('SELECT COUNT(*) AS count FROM maintenance_history_states').get() as { count: number }).count,
      0
    );
  });

  it('edits a package as one record, preserving retained created_at and replacing actions', async () => {
    const initial = record([action('engine-oil'), action('air-filter', 'inspect')]);
    const created = await inTransaction(
      database,
      () => insertMaintenanceRecordInTransaction(transaction, 1, initial)
    );
    const engineId = created.ids[0];
    const updated = record([action('engine-oil'), action('brake-fluid', 'inspect')], {
      serviceDate: '2026-07-21',
      timestamp: '2026-08-01T10:00:00.000Z',
    });
    assert.equal(await inTransaction(
      database,
      () => updateMaintenanceRecordInTransaction(transaction, 1, engineId, updated)
    ), true);

    const rows = database.prepare(
      `SELECT id, maintenance_component_id AS componentId, created_at AS createdAt,
              updated_at AS updatedAt
       FROM service_logs ORDER BY id`
    ).all() as { id: number; componentId: string; createdAt: string; updatedAt: string }[];
    assert.equal(rows.length, 2);
    assert.equal(rows[0].id, engineId);
    assert.equal(rows[0].createdAt, initial.timestamp);
    assert.equal(rows[0].updatedAt, updated.timestamp);
    assert.deepEqual(rows.map((row) => row.componentId), ['engine-oil', 'brake-fluid']);
    const airState = database.prepare(
      `SELECT history_state AS state, last_service_log_id AS logId
       FROM maintenance_history_states WHERE component_id = 'air-filter'`
    ).get() as { state: string; logId: number | null };
    assert.deepEqual({ ...airState }, { state: 'unknown', logId: null });
  });

  it('rejects profile reinterpretation and never rewrites retained rule provenance', async () => {
    const originalAction = action('engine-oil');
    const created = await inTransaction(
      database,
      () => insertMaintenanceRecordInTransaction(transaction, 1, record([originalAction]))
    );
    const id = created.ids[0];

    const differentProfileAction: PreparedMaintenanceRecordAction = {
      ...originalAction,
      ruleId: 'other-profile-engine-oil',
      profileId: 'other-scooter-profile',
      profileVersion: '1.0',
    };
    await assert.rejects(
      inTransaction(database, () => updateMaintenanceRecordInTransaction(
        transaction,
        1,
        id,
        record([differentProfileAction], { timestamp: '2026-08-01T10:00:00.000Z' })
      )),
      /previous scooter profile/
    );

    const replacementRule: PreparedMaintenanceRecordAction = {
      ...originalAction,
      ruleId: 'new-catalog-rule-id',
      profileVersion: '2027.1',
      title: 'Updated engine-oil label',
    };
    assert.equal(await inTransaction(database, () => updateMaintenanceRecordInTransaction(
      transaction,
      1,
      id,
      record([replacementRule], { timestamp: '2026-08-01T11:00:00.000Z' })
    )), true);

    const stored = database.prepare(
      `SELECT id, service_type AS serviceType, maintenance_rule_id AS ruleId,
              maintenance_profile_id AS profileId,
              maintenance_profile_version AS profileVersion
       FROM service_logs WHERE id = ?`
    ).get(id) as {
      id: number;
      serviceType: string | null;
      ruleId: string | null;
      profileId: string | null;
      profileVersion: string | null;
    };
    assert.deepEqual({ ...stored }, {
      id,
      serviceType: originalAction.ruleId,
      ruleId: originalAction.ruleId,
      profileId: originalAction.profileId,
      profileVersion: originalAction.profileVersion,
    });
  });

  it('deletes every package member from the scoped vehicle and recomputes each state', async () => {
    const input = record([action('engine-oil'), action('air-filter', 'inspect')]);
    const first = await inTransaction(
      database,
      () => insertMaintenanceRecordInTransaction(transaction, 1, input)
    );
    await inTransaction(
      database,
      () => insertMaintenanceRecordInTransaction(transaction, 2, { ...input, allowDuplicate: true })
    );

    assert.equal(await inTransaction(
      database,
      () => deleteMaintenanceRecordInTransaction(
        transaction,
        1,
        first.ids[1],
        '2026-08-01T11:00:00.000Z'
      )
    ), true);
    assert.equal(
      (database.prepare('SELECT COUNT(*) AS count FROM service_logs WHERE vehicle_id = 1').get() as { count: number }).count,
      0
    );
    assert.equal(
      (database.prepare('SELECT COUNT(*) AS count FROM service_logs WHERE vehicle_id = 2').get() as { count: number }).count,
      2
    );
    assert.deepEqual(
      (database.prepare(
        'SELECT history_state AS state FROM maintenance_history_states WHERE vehicle_id = 1 ORDER BY component_id'
      ).all() as { state: string }[]).map((row) => row.state),
      ['unknown', 'unknown']
    );
  });
});
