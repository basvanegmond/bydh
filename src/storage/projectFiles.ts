import { referencedAssetIds, rekeyAssets } from '@/domain/io/assets';
import { addVariantsFrom, asNewProject } from '@/domain/io/merge';
import { newId, parseProjectFile, serializeProjectFile, toProjectFile } from '@/domain/schema';
import type { EmbeddedAsset, Id, Project } from '@/domain/schema';
import type { ProjectRepository } from './repository';

async function blobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk)
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return btoa(binary);
}

function base64ToBlob(base64: string, mime: string): Blob {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

/** JSON text of a project with every referenced asset embedded, so one file carries everything. */
export async function exportProjectJson(project: Project, repo: ProjectRepository): Promise<string> {
  const assets: Record<Id, EmbeddedAsset> = {};
  for (const ref of Object.values(project.library.assets)) {
    const stored = await repo.getAsset(ref.id);
    if (stored) assets[ref.id] = { mime: stored.mime, base64: await blobToBase64(stored.blob) };
  }
  return serializeProjectFile(toProjectFile(project, assets));
}

export type ImportMode = 'new-project' | 'add-variants';

export type ImportResult =
  | {
      ok: true;
      /** The project to open: a new project, or a snapshot of `current` plus the added variants. */
      project: Project;
      /** The validated file contents (assets already re-keyed), for merging into a live project. */
      imported: Project;
      addedVariants: number;
    }
  | { ok: false; message: string; issues?: string[] };

async function sha256Hex(blob: Blob): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Stores the embedded assets without ever overwriting (ADR 0003): an id that already exists with
 * identical bytes is skipped; with different bytes the incoming asset gets a new id. Returns the
 * project with references rewritten and library sha256 values set to the real hash.
 */
async function storeImportedAssets(
  imported: Project,
  assets: Record<Id, EmbeddedAsset>,
  repo: ProjectRepository,
): Promise<Project> {
  const mapping: Record<Id, Id> = {};
  const hashes: Record<Id, string> = {};
  for (const [id, asset] of Object.entries(assets)) {
    const blob = base64ToBlob(asset.base64, asset.mime);
    const hash = await sha256Hex(blob);
    const existing = await repo.getAsset(id);
    let finalId = id;
    if (existing) {
      if ((await sha256Hex(existing.blob)) === hash) {
        hashes[id] = hash;
        continue;
      }
      finalId = newId();
      mapping[id] = finalId;
    }
    hashes[finalId] = hash;
    await repo.putAsset({
      id: finalId,
      name: imported.library.assets[id]?.name ?? id,
      mime: asset.mime,
      blob,
    });
  }
  const project = rekeyAssets(imported, mapping);
  for (const [id, hash] of Object.entries(hashes)) {
    const ref = project.library.assets[id];
    if (ref) project.library.assets[id] = { ...ref, sha256: hash };
  }
  return project;
}

/**
 * Deletes a project and then any of its assets that no remaining project references.
 * If a remaining project cannot be read, nothing is garbage-collected (never lose images).
 */
export async function deleteProjectWithAssets(repo: ProjectRepository, id: Id): Promise<void> {
  const doomed = await repo.loadProject(id).catch(() => undefined);
  await repo.deleteProject(id);
  if (!doomed) return;
  const candidates = referencedAssetIds(doomed);
  try {
    for (const summary of await repo.listProjects()) {
      const other = await repo.loadProject(summary.id);
      if (!other) continue;
      for (const assetId of referencedAssetIds(other)) candidates.delete(assetId);
    }
  } catch {
    return;
  }
  for (const assetId of candidates) await repo.deleteAsset(assetId);
}

/**
 * Validates an exported file, stores its assets and returns the project to open:
 * a copy with a fresh id ('new-project') or the current project plus the file's variants.
 */
export async function importProjectJson(
  text: string,
  repo: ProjectRepository,
  mode: ImportMode,
  current: Project,
  importedSuffix: string,
): Promise<ImportResult> {
  const parsed = parseProjectFile(text);
  if (!parsed.ok)
    return { ok: false, message: parsed.message, ...(parsed.issues ? { issues: parsed.issues } : {}) };
  const { assets = {} } = parsed.file;
  const imported = await storeImportedAssets(parsed.file.project, assets, repo);

  if (mode === 'new-project') {
    const names = (await repo.listProjects()).map((p) => p.name);
    const project = asNewProject(imported, names);
    return { ok: true, project, imported, addedVariants: project.variantOrder.length };
  }
  const { project, added } = addVariantsFrom(current, imported, importedSuffix);
  return { ok: true, project, imported, addedVariants: added.length };
}
