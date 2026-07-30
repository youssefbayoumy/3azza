export function assertSupportedDatabaseVersion(version: number, currentVersion: number): void {
  if (!Number.isInteger(version) || version < 0) {
    throw new Error('The local database has an invalid schema version.');
  }

  if (version > currentVersion) {
    throw new Error(
      `This database was created by a newer version of 3azza (schema ${version}; supported ${currentVersion}).`
    );
  }
}
