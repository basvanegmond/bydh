import { SCHEMA_VERSION } from './schema';

type RawFile = Record<string, unknown>;
/** Upgrades a raw file from version N to N + 1. Keyed by the source version N. */
type Migration = (file: RawFile) => RawFile;

/** Add an entry here whenever SCHEMA_VERSION is bumped; never edit a released migration. */
export const migrations: Record<number, Migration> = {};

export class MigrationError extends Error {
  constructor(
    message: string,
    readonly code: 'not-an-object' | 'missing-version' | 'from-the-future' | 'no-migration-path',
  ) {
    super(message);
    this.name = 'MigrationError';
  }
}

/** Brings a raw (unvalidated) project file up to SCHEMA_VERSION. Validation happens afterwards. */
export function migrateToCurrent(
  raw: unknown,
  steps: Record<number, Migration> = migrations,
  target: number = SCHEMA_VERSION,
): RawFile {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new MigrationError('A project file must be a JSON object.', 'not-an-object');
  }
  let file = raw as RawFile;
  let version = file['schemaVersion'];
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
    throw new MigrationError('The file has no valid schemaVersion.', 'missing-version');
  }
  if (version > target) {
    throw new MigrationError(
      `This file was made by a newer version of the app (schema ${version}); please update.`,
      'from-the-future',
    );
  }
  while (version < target) {
    const step = steps[version];
    if (!step) throw new MigrationError(`No migration from schema ${version}.`, 'no-migration-path');
    file = { ...step(file), schemaVersion: version + 1 };
    version += 1;
  }
  return file;
}
