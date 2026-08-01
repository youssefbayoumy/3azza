import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyBiometricResult,
  getAppLockEntryMode,
  isValidPin,
  mergeWithLockedSession,
  normalizePinInput,
  shouldLockOnAppStateChange,
} from './appLock';

describe('app-lock utilities', () => {
  it('routes an enabled new app lock to PIN creation and an existing lock to unlock', () => {
    assert.equal(getAppLockEntryMode(false), 'create-pin');
    assert.equal(getAppLockEntryMode(true), 'unlock');
  });

  it('accepts exactly four numeric PIN digits', () => {
    assert.equal(normalizePinInput('1a2 345'), '1234');
    assert.equal(isValidPin('1234'), true);
    assert.equal(isValidPin('123'), false);
    assert.equal(isValidPin('12a4'), false);
  });

  it('never restores an authenticated session from persisted state', () => {
    const current = { isAuthenticated: false, garageMode: false };
    const merged = mergeWithLockedSession(
      { isAuthenticated: true, garageMode: true },
      current
    );

    assert.deepEqual(merged, { isAuthenticated: false, garageMode: true });
  });

  it('classifies biometric success, cancellation, rejection, lockout, and availability', () => {
    assert.equal(classifyBiometricResult(true), 'success');
    assert.equal(classifyBiometricResult(false, 'user_cancel'), 'cancelled');
    assert.equal(classifyBiometricResult(false, 'system_cancel'), 'cancelled');
    assert.equal(classifyBiometricResult(false, 'authentication_failed'), 'failed');
    assert.equal(classifyBiometricResult(false, 'lockout'), 'locked');
    assert.equal(classifyBiometricResult(false, 'not_enrolled'), 'unavailable');
    assert.equal(classifyBiometricResult(false, 'unknown'), 'error');
  });

  it('locks an authenticated session whenever the app enters the background', () => {
    assert.equal(shouldLockOnAppStateChange('active', 'background', true), true);
    assert.equal(shouldLockOnAppStateChange('inactive', 'background', true), true);
    assert.equal(shouldLockOnAppStateChange('active', 'inactive', true), false);
    assert.equal(shouldLockOnAppStateChange('active', 'background', false), false);
  });
});
