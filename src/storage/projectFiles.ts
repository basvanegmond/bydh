import { addVariantsFrom, asNewProject } from '@/domain/io/merge';
import { parseProjectFile, serializeProjectFile, toProjectFile } from '@/domain/schema';
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
  { ok: true; project: Project; addedVariants: number } | { ok: false; message: string; issues?: string[] };

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
  const { project: imported, assets = {} } = parsed.file;

  for (const [id, asset] of Object.entries(assets)) {
    const ref = imported.library.assets[id];
    await repo.putAsset({
      id,
      name: ref?.name ?? id,
      mime: asset.mime,
      blob: base64ToBlob(asset.base64, asset.mime),
    });
  }

  if (mode === 'new-project') {
    const names = (await repo.listProjects()).map((p) => p.name);
    const project = asNewProject(imported, names);
    return { ok: true, project, addedVariants: project.variantOrder.length };
  }
  const { project, added } = addVariantsFrom(current, imported, importedSuffix);
  return { ok: true, project, addedVariants: added.length };
}
