import { migrateToCurrent, MigrationError } from './migrations';
import { ProjectFileSchema, SCHEMA_VERSION } from './schema';
import type { EmbeddedAsset, Id, Project, ProjectFile } from './types';

export type ParseResult =
  | { ok: true; file: ProjectFile }
  | { ok: false; reason: 'invalid-json' | 'migration' | 'validation'; message: string; issues?: string[] };

export function toProjectFile(project: Project, assets?: Record<Id, EmbeddedAsset>): ProjectFile {
  return {
    format: 'bydh-project',
    schemaVersion: SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    project,
    ...(assets ? { assets } : {}),
  };
}

export function serializeProjectFile(file: ProjectFile): string {
  return JSON.stringify(file, null, 2);
}

/** JSON text → migrated, validated ProjectFile. Never throws; returns a reason the UI can show. */
export function parseProjectFile(text: string): ParseResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, reason: 'invalid-json', message: 'The file is not valid JSON.' };
  }
  let migrated: unknown;
  try {
    migrated = migrateToCurrent(raw);
  } catch (error) {
    const message = error instanceof MigrationError ? error.message : 'The file could not be upgraded.';
    return { ok: false, reason: 'migration', message };
  }
  const result = ProjectFileSchema.safeParse(migrated);
  if (!result.success) {
    const issues = result.error.issues.map(
      (issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`,
    );
    return { ok: false, reason: 'validation', message: 'The file is not a valid BYDH project.', issues };
  }
  return { ok: true, file: result.data };
}
