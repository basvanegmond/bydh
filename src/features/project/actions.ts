import { createProject, newId } from '@/domain/schema';
import type { Id, Project } from '@/domain/schema';
import i18n from '@/i18n';
import { projectFileName, downloadText, saveTextToFile } from '@/storage/fileAccess';
import { exportProjectJson } from '@/storage/projectFiles';
import { deleteProject, flushAutosave, openNewProject, repository } from '@/storage/session';
import { useProjectStore } from '@/store/projectStore';
import { confirmAction, promptText } from '../dialogs/dialogStore';

const t = (key: string, options?: Record<string, unknown>) => i18n.t(key, options);
const current = (): Project => useProjectStore.getState().project;

export async function newProject(): Promise<void> {
  const name = await promptText(t('project.namePrompt'), t('project.newName'));
  if (name)
    await openNewProject(
      createProject(name, { variant: t('app.defaultVariantName'), building: t('app.defaultBuildingName') }),
    );
}

export async function renameProject(): Promise<void> {
  const name = await promptText(t('project.namePrompt'), current().name);
  if (name) useProjectStore.getState().edit('Rename project', (p) => void (p.name = name));
}

export async function deleteCurrentProject(): Promise<void> {
  const { id, name } = current();
  if (await confirmAction(t('project.delete'), t('project.deleteConfirm', { name }))) {
    await deleteProject(id, t('app.defaultProjectName'));
  }
}

export async function downloadProject(): Promise<void> {
  await flushAutosave();
  downloadText(await exportProjectJson(current(), repository), projectFileName(current().name));
}

export async function saveProjectToFile(): Promise<void> {
  await flushAutosave();
  await saveTextToFile(await exportProjectJson(current(), repository), projectFileName(current().name));
}

// Variant switch, duplicate and delete are ordinary undoable edits. Undo patches are paths into
// a specific variant, so keeping history is only coherent if switching is itself a step: undo then
// walks back through "Switch variant" and the edits are always undone in the variant they were made in.

export function switchVariant(variantId: Id): void {
  const project = current();
  if (!project.variants[variantId] || project.activeVariantId === variantId) return;
  useProjectStore.getState().edit('Switch variant', (p) => void (p.activeVariantId = variantId));
}

export function duplicateVariant(): void {
  const source = current().variants[current().activeVariantId];
  if (!source) return;
  const copy = {
    ...structuredClone(source),
    id: newId(),
    name: `${source.name} ${t('variant.copySuffix')}`,
    createdAt: new Date().toISOString(),
    basedOnVariantId: source.id,
  };
  useProjectStore.getState().edit('Duplicate variant', (p) => {
    p.variants[copy.id] = copy;
    p.variantOrder.push(copy.id);
    p.activeVariantId = copy.id;
  });
}

export async function renameVariant(): Promise<void> {
  const project = current();
  const variant = project.variants[project.activeVariantId];
  const name = variant && (await promptText(t('variant.namePrompt'), variant.name));
  if (!name) return;
  useProjectStore.getState().edit('Rename variant', (p) => {
    const v = p.variants[p.activeVariantId];
    if (v) v.name = name;
  });
}

export async function deleteVariant(): Promise<void> {
  const project = current();
  const variant = project.variants[project.activeVariantId];
  if (!variant || project.variantOrder.length < 2) return;
  if (!(await confirmAction(t('variant.delete'), t('variant.deleteConfirm', { name: variant.name })))) return;
  useProjectStore.getState().edit('Delete variant', (p) => {
    const next = p.variantOrder.find((id) => id !== variant.id);
    if (!next) return;
    delete p.variants[variant.id];
    p.variantOrder = p.variantOrder.filter((id) => id !== variant.id);
    p.activeVariantId = next;
  });
}
