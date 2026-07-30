import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { assertSupportedDatabaseVersion } from './databaseVersion';

describe('database schema compatibility', () => {
  it('accepts a current or older non-negative integer schema', () => {
    assert.doesNotThrow(() => assertSupportedDatabaseVersion(0, 9));
    assert.doesNotThrow(() => assertSupportedDatabaseVersion(9, 9));
  });

  it('rejects a schema written by a newer app version', () => {
    assert.throws(
      () => assertSupportedDatabaseVersion(10, 9),
      /created by a newer version of 3azza/
    );
  });

  it('rejects malformed schema versions', () => {
    assert.throws(() => assertSupportedDatabaseVersion(-1, 9), /invalid schema version/);
    assert.throws(() => assertSupportedDatabaseVersion(1.5, 9), /invalid schema version/);
  });
});
