import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  classifyNotificationPermission,
  getNotificationNavigationTarget,
  getNotificationResponseFingerprint,
  parseNotificationIntent,
} from './notificationRouting';

describe('notification routing', () => {
  it('distinguishes granted, requestable, and system-blocked notification permission', () => {
    assert.equal(classifyNotificationPermission({ granted: true, canAskAgain: true }), 'granted');
    assert.equal(classifyNotificationPermission({ status: 'undetermined', canAskAgain: true }), 'requestable');
    assert.equal(classifyNotificationPermission({ status: 'denied', canAskAgain: false }), 'blocked');
    assert.equal(classifyNotificationPermission(null), 'blocked');
  });

  it('accepts only known destinations and safe vehicle identifiers', () => {
    assert.deepEqual(parseNotificationIntent({ route: 'PreRideCheck', vehicleId: 7 }), {
      route: 'PreRideCheck',
      vehicleId: 7,
    });
    assert.deepEqual(parseNotificationIntent({ route: 'Vault', vehicleId: '12' }), {
      route: 'Vault',
      vehicleId: 12,
    });
    assert.deepEqual(parseNotificationIntent({ route: 'VehicleSettings', vehicleId: -1 }), {
      route: 'VehicleSettings',
      vehicleId: null,
    });
    assert.equal(parseNotificationIntent({ route: 'Unknown' }), null);
    assert.equal(parseNotificationIntent(null), null);
  });

  it('maps tab and stack destinations without untyped route casts', () => {
    assert.deepEqual(
      getNotificationNavigationTarget({ route: 'Vitals', vehicleId: 1 }),
      { kind: 'tab', screen: 'Maintenance' }
    );
    assert.deepEqual(
      getNotificationNavigationTarget({ route: 'Maintenance', vehicleId: 1 }),
      { kind: 'tab', screen: 'Maintenance' }
    );
    assert.deepEqual(
      getNotificationNavigationTarget({ route: 'VehicleSettings', vehicleId: null }),
      { kind: 'stack', screen: 'VehicleSettings' }
    );
  });

  it('deduplicates the same response while allowing later deliveries from a repeating request', () => {
    const first = getNotificationResponseFingerprint('daily', 100, 'default');
    assert.equal(first, getNotificationResponseFingerprint('daily', 100, 'default'));
    assert.notEqual(first, getNotificationResponseFingerprint('daily', 200, 'default'));
  });
});
