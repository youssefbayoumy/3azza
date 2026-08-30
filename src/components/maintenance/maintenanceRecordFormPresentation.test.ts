import assert from 'node:assert/strict';
import test from 'node:test';
import {
  generatedRecordTitle,
  hasSavedAdditionalDetails,
  shouldShowActionSelector,
} from './maintenanceRecordFormPresentation';

const oilReplacement = { label: 'Engine oil replacement' };

test('uses the selected action as the default compact-record title', () => {
  assert.equal(generatedRecordTitle([oilReplacement]), 'Engine oil replacement');
});

test('keeps additional details collapsed for a new basic record', () => {
  assert.equal(hasSavedAdditionalDetails(undefined, [oilReplacement]), false);
});

test('opens additional details for saved optional values or a custom title', () => {
  assert.equal(hasSavedAdditionalDetails({ notes: 'Use 10W-40' }, [oilReplacement]), true);
  assert.equal(hasSavedAdditionalDetails({ title: 'Before trip service' }, [oilReplacement]), true);
});

test('hides an already-known locked action selector but keeps selectable entry paths', () => {
  assert.equal(shouldShowActionSelector(true, [oilReplacement]), false);
  assert.equal(shouldShowActionSelector(false, [oilReplacement]), true);
});
