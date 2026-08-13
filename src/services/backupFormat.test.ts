import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeBackupArchive, normalizeBackupSnapshot } from './backupFormat';
import type { DatabaseBackupData } from '../services/database';

function makeValidData(): DatabaseBackupData {
  return {
    active_vehicle_id: 1,
    vehicle_profiles: [{
      id: 1,
      name: 'Scooter',
      current_mileage: 100,
      total_km_range: 120,
      has_completed_setup: 1,
      service_history_setup_completed: 1,
      created_at: '2026-07-24T00:00:00.000Z',
      daily_average_km: 0,
      last_odometer_update_timestamp: null,
      tank_capacity_liters: null,
      scooter_brand_id: 'sym',
      scooter_model_id: 'sym:new-symphony-st',
      scooter_version_id: 'sym:new-symphony-st:2021-present',
      vehicle_capabilities_version: 1,
      vehicle_capabilities_json: '{"schemaVersion":1,"powertrain":"unknown","transmission":"unknown","finalDrive":"unknown","cooling":"unknown","brakeSystem":"unknown","abs":"unknown","wheelType":"unknown"}',
    }],
    vehicle_vitals: [],
    service_intervals: [{
      id: 1,
      vehicle_id: 1,
      name: 'Oil Change',
      interval_km: 1000,
      last_service_odometer_km: 0,
      has_known_odometer_baseline: 1,
      type: 'replace',
    }],
    service_logs: [{
      id: 1,
      vehicle_id: 1,
      title: 'Oil Change',
      date: '2026-07-24',
      mileage: 0,
      category: 'engine',
      notes: '',
      cost: null,
      service_type: 'Oil Change',
      sets_odometer_baseline: 1,
    }],
    gas_logs: [],
    inventory_items: [],
    documents_vault: [],
    pre_ride_checks: [],
  };
}

describe('backup format', () => {
  it('preserves explicit setup and known-zero baseline flags in v3 backups', () => {
    const data = makeValidData();

    const normalized = normalizeBackupSnapshot({ schema: '3azza-local-backup/v3', exported_at: 'now', data });
    assert.equal(normalized.vehicle_profiles[0].service_history_setup_completed, 1);
    assert.equal(normalized.service_intervals[0].has_known_odometer_baseline, 1);
    assert.equal(normalized.service_logs[0].sets_odometer_baseline, 1);
    assert.equal(normalized.vehicle_profiles[0].maintenance_history_level, 'not_asked');
    assert.deepEqual(normalized.maintenance_preferences, []);
    assert.deepEqual(normalized.maintenance_history_states, []);
  });

  it('round-trips maintenance record metadata, preferences, and history states in v4', () => {
    const data = makeValidData();
    data.vehicle_profiles[0].maintenance_history_level = 'detailed_records';
    data.service_logs[0] = {
      ...data.service_logs[0],
      service_type: 'engine-oil-replace',
      maintenance_rule_id: 'engine-oil-replace',
      maintenance_component_id: 'engine-oil',
      maintenance_action: 'replace',
      maintenance_profile_id: 'sym-new-symphony-st-200',
      maintenance_profile_version: '2026.1',
      maintenance_migration_status: 'confirmed',
      maintenance_mileage_confidence: 'confirmed',
      maintenance_date_confidence: 'confirmed',
      maintenance_record_source: 'manual_entry',
      service_provider: 'Workshop A',
      service_package_id: null,
      service_package_title: null,
      oil_brand: 'Brand A',
      oil_type: 'synthetic',
      oil_viscosity: '10W-40',
      oil_notes: null,
      duplicate_confirmed: 0,
      created_at: '2026-07-24T09:00:00.000Z',
      updated_at: '2026-07-24T09:30:00.000Z',
    };
    data.maintenance_preferences = [{
      id: 1,
      vehicle_id: 1,
      profile_id: 'sym-new-symphony-st-200',
      component_id: 'engine-oil',
      action: 'replace',
      profile_recommended_interval_km: 1000,
      user_interval_km: 800,
      effective_interval_km: 800,
      interval_source: 'user_custom',
      longer_than_recommended_confirmed: 0,
      reason: null,
      created_at: '2026-07-24T09:00:00.000Z',
      updated_at: '2026-07-24T09:30:00.000Z',
    }];
    data.odometer_events = [{
      id: 1,
      vehicle_id: 1,
      event_type: 'instrument_cluster_replacement',
      previous_effective_km: 100,
      new_effective_km: 100,
      previous_displayed_km: 100,
      new_displayed_km: 0,
      reason: 'Cluster replaced',
      recorded_at: '2026-07-24T10:00:00.000Z',
    }];
    data.maintenance_history_states = [{
      vehicle_id: 1,
      profile_id: 'sym-new-symphony-st-200',
      component_id: 'engine-oil',
      action: 'replace',
      history_state: 'confirmed',
      last_service_log_id: 1,
      notes: null,
      created_at: '2026-07-24T09:00:00.000Z',
      updated_at: '2026-07-24T09:30:00.000Z',
    }];

    const normalized = normalizeBackupArchive({
      schema: '3azza-local-backup/v4',
      exported_at: '2026-08-01T00:00:00.000Z',
      data,
      document_files: [],
    }).data;
    assert.equal(normalized.service_logs[0].oil_viscosity, '10W-40');
    assert.equal(normalized.maintenance_preferences?.[0].effective_interval_km, 800);
    assert.equal(normalized.maintenance_preferences?.[0].original_interval_km, 1000);
    assert.equal(normalized.maintenance_preferences?.[0].custom_interval_km, 800);
    assert.equal(normalized.maintenance_preferences?.[0].distance_enabled, 1);
    assert.equal(normalized.maintenance_preferences?.[0].time_enabled, 0);
    assert.equal(normalized.maintenance_history_states?.[0].last_service_log_id, 1);
    assert.equal(normalized.odometer_events?.[0].new_displayed_km, 0);
  });

  it('accepts a self-contained v4 backup with exactly one file per document', () => {
    const data = makeValidData();
    data.documents_vault.push({
      id: 4,
      vehicle_id: 1,
      title: 'Registration',
      image_uri: 'file:///old/registration.jpg',
      expiry_date: null,
      added_at: '2026-07-24T00:00:00.000Z',
    });
    const archive = normalizeBackupArchive({
      schema: '3azza-local-backup/v4',
      exported_at: '2026-07-24T00:00:00.000Z',
      data,
      document_files: [{
        document_id: 4,
        extension: 'jpg',
        mime_type: 'image/jpeg',
        sha256: 'a'.repeat(64),
        data_base64: 'aGVsbG8=',
      }],
    });

    assert.equal(archive.source_schema, '3azza-local-backup/v4');
    assert.equal(archive.document_files[0].document_id, 4);
  });

  it('round-trips an Other-brand vehicle and capabilities in a v6 backup', () => {
    const data = makeValidData();
    data.vehicle_profiles[0] = {
      ...data.vehicle_profiles[0],
      scooter_brand_id: 'other',
      scooter_model_id: 'other:custom-model',
      scooter_version_id: 'other:custom-model:basic-tracking',
      scooter_variant_id: null,
      vehicle_selection_mode: 'custom_brand',
      custom_brand_name: 'Vigory',
      custom_model_name: 'VR 150',
      vehicle_capabilities_version: 1,
      vehicle_capabilities_json: '{"schemaVersion":1,"powertrain":"four_stroke","transmission":"manual","finalDrive":"chain","cooling":"air","brakeSystem":"disc","abs":"no","wheelType":"spoke"}',
    };

    const archive = normalizeBackupArchive({
      schema: '3azza-local-backup/v6',
      exported_at: '2026-08-09T00:00:00.000Z',
      data,
      document_files: [],
    });

    assert.equal(archive.source_schema, '3azza-local-backup/v6');
    assert.equal(archive.data.vehicle_profiles[0].vehicle_selection_mode, 'custom_brand');
    assert.equal(archive.data.vehicle_profiles[0].custom_brand_name, 'Vigory');
    assert.equal(archive.data.vehicle_profiles[0].custom_model_name, 'VR 150');
    assert.match(archive.data.vehicle_profiles[0].vehicle_capabilities_json, /"finalDrive":"chain"/);
  });

  it('upgrades a v5 vehicle without capabilities to the inclusive unknown profile', () => {
    const data = makeValidData() as unknown as { vehicle_profiles: Record<string, unknown>[] } & Record<string, unknown>;
    delete data.vehicle_profiles[0].vehicle_capabilities_version;
    delete data.vehicle_profiles[0].vehicle_capabilities_json;
    const archive = normalizeBackupArchive({
      schema: '3azza-local-backup/v5',
      exported_at: '2026-08-09T00:00:00.000Z',
      data,
      document_files: [],
    });
    assert.equal(archive.source_schema, '3azza-local-backup/v5');
    assert.equal(archive.data.vehicle_profiles[0].vehicle_capabilities_version, 1);
    assert.match(archive.data.vehicle_profiles[0].vehicle_capabilities_json, /"powertrain":"unknown"/);
  });

  it('rejects malformed capability data in the current backup schema', () => {
    const data = makeValidData();
    data.vehicle_profiles[0].vehicle_capabilities_json = '{bad json';
    assert.throws(() => normalizeBackupArchive({
      schema: '3azza-local-backup/v6',
      exported_at: '2026-08-09T00:00:00.000Z',
      data,
      document_files: [],
    }), /vehicle_capabilities_json/);
  });

  it('rejects missing, duplicate, or malformed v4 document photo data', () => {
    const data = makeValidData();
    data.documents_vault.push({
      id: 4,
      vehicle_id: 1,
      title: 'Registration',
      image_uri: 'file:///old/registration.jpg',
      expiry_date: null,
      added_at: '2026-07-24T00:00:00.000Z',
    });
    const file = {
      document_id: 4,
      extension: 'jpg',
      mime_type: 'image/jpeg',
      sha256: 'a'.repeat(64),
      data_base64: 'aGVsbG8=',
    };

    assert.throws(
      () => normalizeBackupArchive({
        schema: '3azza-local-backup/v4',
        exported_at: 'now',
        data,
        document_files: [],
      }),
      /missing photo data for document 4/
    );
    assert.throws(
      () => normalizeBackupArchive({
        schema: '3azza-local-backup/v4',
        exported_at: 'now',
        data,
        document_files: [file, file],
      }),
      /duplicates a document file/
    );
    assert.throws(
      () => normalizeBackupArchive({
        schema: '3azza-local-backup/v4',
        exported_at: 'now',
        data,
        document_files: [{ ...file, data_base64: 'not base64' }],
      }),
      /valid base64 data/
    );
  });

  it('accepts v2 multi-vehicle backups', () => {
    const data = {
      active_vehicle_id: 2,
      vehicle_profiles: [
        {
          id: 2,
          name: 'Scooter',
          current_mileage: 100,
          total_km_range: 120,
          has_completed_setup: 1,
          created_at: '2026-06-28',
          daily_average_km: 20,
          last_odometer_update_timestamp: null,
        },
      ],
      vehicle_vitals: [],
      service_intervals: [],
      service_logs: [],
      gas_logs: [],
      inventory_items: [],
      documents_vault: [],
      pre_ride_checks: [],
    };

    const normalized = normalizeBackupSnapshot({ schema: '3azza-local-backup/v2', exported_at: 'now', data });
    assert.equal(normalized.active_vehicle_id, 2);
    assert.equal(normalized.vehicle_profiles[0].service_history_setup_completed, 0);
  });

  it('upgrades v1 single-vehicle backups to vehicle-scoped rows', () => {
    const normalized = normalizeBackupSnapshot({
      schema: '3azza-local-backup/v1',
      exported_at: 'now',
      vehicle_profile: {
        id: 7,
        current_mileage: 5000,
        total_km_range: 140,
        has_completed_setup: 1,
        created_at: '2026-06-28',
        daily_average_km: 35,
        last_odometer_update_timestamp: null,
      },
      vehicle_vitals: null,
      service_intervals: [{ id: 1, name: 'Oil Change', interval_km: 1000, last_service_odometer_km: 4000, type: 'replace' }],
      service_logs: [],
      gas_logs: [],
      inventory_items: [],
      documents_vault: [],
      pre_ride_checks: null,
    });

    assert.equal(normalized.active_vehicle_id, 7);
    assert.equal(normalized.vehicle_profiles[0].name, 'Primary Vehicle');
    assert.equal(normalized.service_intervals[0].vehicle_id, 7);
    assert.equal(normalized.service_intervals[0].has_known_odometer_baseline, 1);
  });

  it('rejects missing collections and malformed legacy rows instead of dropping them', () => {
    const missing = makeValidData() as Record<string, unknown>;
    delete missing.gas_logs;
    assert.throws(
      () => normalizeBackupSnapshot({ schema: '3azza-local-backup/v3', exported_at: 'now', data: missing }),
      /data\.gas_logs.*must be an array/
    );

    assert.throws(
      () => normalizeBackupSnapshot({
        schema: '3azza-local-backup/v1',
        exported_at: 'now',
        vehicle_profile: null,
        vehicle_vitals: null,
        service_intervals: ['not a row'],
        service_logs: [],
        gas_logs: [],
        inventory_items: [],
        documents_vault: [],
        pre_ride_checks: null,
      }),
      /service_intervals\[0\].*must be an object/
    );
  });

  it('rejects duplicate IDs, orphaned rows, and an invalid active vehicle', () => {
    const duplicate = makeValidData();
    duplicate.vehicle_profiles.push({ ...duplicate.vehicle_profiles[0] });
    assert.throws(
      () => normalizeBackupSnapshot({ schema: '3azza-local-backup/v3', exported_at: 'now', data: duplicate }),
      /duplicates ID 1/
    );

    const orphan = makeValidData();
    orphan.service_logs[0].vehicle_id = 99;
    assert.throws(
      () => normalizeBackupSnapshot({ schema: '3azza-local-backup/v3', exported_at: 'now', data: orphan }),
      /references missing vehicle 99/
    );

    const inactive = makeValidData();
    inactive.active_vehicle_id = 99;
    assert.throws(
      () => normalizeBackupSnapshot({ schema: '3azza-local-backup/v3', exported_at: 'now', data: inactive }),
      /active_vehicle_id.*existing vehicle/
    );
  });

  it('rejects invalid domains and inconsistent linked records', () => {
    const invalidVitals = makeValidData();
    invalidVitals.vehicle_vitals.push({
      id: 1,
      vehicle_id: 1,
      oil_life_pct: 150,
      tire_pressure_psi: 30,
      battery_health_pct: 90,
      coolant_temp_c: 90,
      brake_pad_pct: 80,
      updated_at: '2026-07-24T00:00:00.000Z',
    });
    assert.throws(
      () => normalizeBackupSnapshot({ schema: '3azza-local-backup/v3', exported_at: 'now', data: invalidVitals }),
      /oil_life_pct.*cannot be more than 100/
    );

    const invalidInventory = makeValidData();
    invalidInventory.inventory_items.push({
      id: 1,
      vehicle_id: 1,
      name: 'Filter',
      category: '',
      status: 'In Stock' as const,
      quantity: 0,
      last_replaced_at: null,
    });
    assert.throws(
      () => normalizeBackupSnapshot({ schema: '3azza-local-backup/v3', exported_at: 'now', data: invalidInventory }),
      /status.*does not match/
    );

    const missingInterval = makeValidData();
    missingInterval.service_logs[0].service_type = 'Missing Interval';
    assert.throws(
      () => normalizeBackupSnapshot({ schema: '3azza-local-backup/v3', exported_at: 'now', data: missingInterval }),
      /service_type.*does not match/
    );
  });

  it('rejects service, interval, and fuel odometers above the confirmed vehicle reading', () => {
    const service = makeValidData();
    service.service_logs[0].mileage = 101;
    assert.throws(
      () => normalizeBackupSnapshot({ schema: '3azza-local-backup/v3', exported_at: 'now', data: service }),
      /service_logs\[0\]\.mileage.*Update the vehicle odometer first/
    );

    const interval = makeValidData();
    interval.service_intervals[0].last_service_odometer_km = 101;
    assert.throws(
      () => normalizeBackupSnapshot({ schema: '3azza-local-backup/v3', exported_at: 'now', data: interval }),
      /service_intervals\[0\]\.last_service_odometer_km.*Update the vehicle odometer first/
    );

    const fuel = makeValidData();
    fuel.gas_logs.push({
      id: 1,
      vehicle_id: 1,
      liters: 1,
      cost: 0,
      odometer_km: 101,
      station: null,
      logged_at: '2026-07-24T00:00:00.000Z',
      logged_on: '2026-07-24',
      is_full_tank: 0,
    });
    assert.throws(
      () => normalizeBackupSnapshot({ schema: '3azza-local-backup/v3', exported_at: 'now', data: fuel }),
      /gas_logs\[0\]\.odometer_km.*Update the vehicle odometer first/
    );
  });
});
