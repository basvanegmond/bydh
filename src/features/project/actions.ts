import { createProject, newId } from '@/domain/schema';
import type { Id, Project } from '@/domain/schema';
import i18n from '@/i18n';
import { projectFileName, downloadText, saveTextToFile } from '@/storage/fileAccess';
import { exportProjectJson } from '@/storage/projectFiles';
import { deleteProject, flushAutosave, openNewProject, repository } from '@/storage/session';
import { useProjectStore } from '@/store/projectStore';
import { useViewStore } from '@/store/viewStore';
import { confirmAction, promptText } from '../dialogs/dialogStore';

const t = (key: string, options?: Record<string, unknown>) => i18n.t(key, options);
const current = (): Project => useProjectStore.getState().project;

/** Replaces the project without undo history (variant switches must not be undone into another variant). */
function replace(project: Project): void {
  useProjectStore.getState().loadProject(project);
  useViewStore.getState().select(null);
}

export async function newProject(): Promise<void> {
  const name = await promptText(t('project.namePrompt'), t('project.newName'));
  if (name) await openNewProject(createProject(name));
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

export function switchVariant(variantId: Id): void {
  const project = current();
  if (!project.variants[variantId] || project.activeVariantId === variantId) return;
  replace({ ...project, activeVariantId: variantId, updatedAt: new Date().toISOString() });
}

export function duplicateVariant(): void {
  const project = current();
  const source = project.variants[project.activeVariantId];
  if (!source) return;
  const copy = {
    ...(JSON.parse(JSON.stringify(source)) as typeof source),
    id: newId(),
    name: `${source.name} ${t('variant.copySuffix')}`,
    createdAt: new Date().toISOString(),
    basedOnVariantId: source.id,
  };
  replace({
    ...project,
    variants: { ...project.variants, [copy.id]: copy },
    variantOrder: [...project.variantOrder, copy.id],
    activeVariantId: copy.id,
    updatedAt: new Date().toISOString(),
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
  const variantOrder = project.variantOrder.filter((id) => id !== variant.id);
  const { [variant.id]: _removed, ...variants } = project.variants;
  const next = variantOrder[0];
  if (!next) return;
  replace({ ...project, variants, variantOrder, activeVariantId: next, updatedAt: new Date().toISOString() });
}
