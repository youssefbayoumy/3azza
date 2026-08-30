import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveMaintenanceRecordBackAction } from './maintenanceRecordFormKeyboard';

test('Android Back dismisses the open keyboard before it can close the maintenance form', () => {
  assert.equal(resolveMaintenanceRecordBackAction(true), 'dismiss-keyboard');
});

test('Android Back keeps the existing form-close behavior after the keyboard is closed', () => {
  assert.equal(resolveMaintenanceRecordBackAction(false), 'close-form');
});
