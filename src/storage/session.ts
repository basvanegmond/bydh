import { create } from 'zustand';
import { createProject } from '@/domain/schema';
import type { DefaultNames, Id, Project } from '@/domain/schema';
import { useProjectStore } from '@/store/projectStore';
import { asNewProject } from '@/domain/io/merge';
import { IndexedDbRepository } from './indexedDbRepository';
import { MemoryRepository } from './memoryRepository';
import { deleteProjectWithAssets } from './projectFiles';
import type { ProjectRepository, ProjectSummary } from './repository';

const AUTOSAVE_DELAY_MS = 800;

/** 'pending' = changed but not yet written; never claim 'saved' while changes are waiting. */
export type SaveStatus = 'idle' | 'pending' | 'saving' | 'saved' | 'error';

interface PersistenceState {
  status: SaveStatus;
  lastSavedAt: string | null;
  error: string | null;
  projects: ProjectSummary[];
  /** False when IndexedDB is unavailable and work only lives in memory. */
  durable: boolean;
  /** True when another tab saved the open project after this tab loaded it; autosave is paused. */
  externalChange: boolean;
  /** Stored projects that failed validation and were skipped at startup. */
  skippedInvalid: number;
}

export const usePersistence = create<PersistenceState>()(() => ({
  status: 'idle',
  lastSavedAt: null,
  error: null,
  projects: [],
  durable: true,
  externalChange: false,
  skippedInvalid: 0,
}));

function createRepository(): ProjectRepository {
  if (typeof indexedDB === 'undefined') {
    usePersistence.setState({ durable: false });
    return new MemoryRepository();
  }
  return new IndexedDbRepository(__DEPLOY_CHANNEL__);
}

export const repository: ProjectRepository = createRepository();

export async function refreshProjectList(): Promise<void> {
  usePersistence.setState({ projects: await repository.listProjects() });
}

/** Default names for new projects (translated by the caller; stored in data, see factories). */
let defaultNames: DefaultNames = {};

/** The version of the open project this tab last loaded or saved, to detect other tabs' writes. */
let known: { id: Id; updatedAt: string } | null = null;

const channel =
  typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel(`bydh-${__DEPLOY_CHANNEL__}`);

function markKnown(project: Project): void {
  known = { id: project.id, updatedAt: project.updatedAt };
}

/** True when the stored copy was written by someone else since this tab last saw it. */
async function changedElsewhere(project: Project): Promise<boolean> {
  if (!known || known.id !== project.id) return false;
  const stored = (await repository.listProjects()).find((p) => p.id === project.id);
  return stored !== undefined && stored.updatedAt !== known.updatedAt;
}

async function save(project: Project): Promise<void> {
  if (usePersistence.getState().externalChange) {
    pending = project; // kept so "keep mine" can still write it
    return;
  }
  usePersistence.setState({ status: 'saving' });
  try {
    if (await changedElsewhere(project)) {
      pending = project;
      usePersistence.setState({ status: 'idle', externalChange: true });
      return;
    }
    await repository.saveProject(project);
    markKnown(project);
    channel?.postMessage({ projectId: project.id, updatedAt: project.updatedAt });
    // A newer change may have arrived while this one was being written.
    usePersistence.setState({
      status: pending ? 'pending' : 'saved',
      lastSavedAt: new Date().toISOString(),
      error: null,
    });
    await refreshProjectList();
  } catch (error) {
    usePersistence.setState({
      status: 'error',
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

let timer: ReturnType<typeof setTimeout> | undefined;
let pending: Project | null = null;

/** Writes any pending change immediately (e.g. before switching projects). */
export async function flushAutosave(): Promise<void> {
  clearTimeout(timer);
  const project = pending;
  pending = null;
  if (project) await save(project);
}

function scheduleSave(project: Project): void {
  pending = project;
  usePersistence.setState({ status: 'pending' });
  clearTimeout(timer);
  timer = setTimeout(() => void flushAutosave(), AUTOSAVE_DELAY_MS);
}

/** The newest stored project that passes validation; invalid ones are skipped, never deleted. */
async function loadLatestValid(): Promise<{ project: Project | undefined; skipped: number }> {
  let skipped = 0;
  for (const summary of await repository.listProjects()) {
    try {
      const project = await repository.loadProject(summary.id);
      if (project) return { project, skipped };
    } catch {
      skipped += 1;
    }
  }
  return { project: undefined, skipped };
}

/** Opens the most recently edited project (or creates one) and starts autosaving. */
export async function startPersistence(defaultName: string, names: DefaultNames = {}): Promise<void> {
  defaultNames = names;
  try {
    void navigator.storage?.persist?.();
    const { project, skipped } = await loadLatestValid();
    const initial = project ?? createProject(defaultName, defaultNames);
    usePersistence.setState({ skippedInvalid: skipped });
    useProjectStore.getState().loadProject(initial);
    markKnown(initial);
    if (!project) await save(initial);
    else await refreshProjectList();
  } catch (error) {
    usePersistence.setState({
      status: 'error',
      error: error instanceof Error ? error.message : String(error),
    });
  }
  channel?.addEventListener('message', (event: MessageEvent<{ projectId: Id; updatedAt: string }>) => {
    const open = useProjectStore.getState().project.id;
    if (event.data.projectId === open && event.data.updatedAt !== known?.updatedAt)
      usePersistence.setState({ externalChange: true });
  });
  useProjectStore.subscribe((state, previous) => {
    if (state.project !== previous.project) scheduleSave(state.project);
  });
  // Best effort when the tab is hidden or closed within the autosave delay.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') void flushAutosave();
  });
  window.addEventListener('pagehide', () => void flushAutosave());
}

export async function openProject(id: Id): Promise<void> {
  await flushAutosave();
  const project = await repository.loadProject(id);
  if (project) {
    pending = null; // a paused (conflicting) save must not leak onto the next project
    usePersistence.setState({ externalChange: false });
    markKnown(project);
    useProjectStore.getState().loadProject(project);
  }
}

/** After a "changed in another tab" warning: take the other tab's version and drop local edits. */
export async function reloadFromStorage(): Promise<void> {
  const id = useProjectStore.getState().project.id;
  pending = null;
  clearTimeout(timer);
  await openProject(id);
  usePersistence.setState({ status: 'idle' });
}

/** After the warning: write this tab's version over the other tab's. */
export async function keepLocalVersion(): Promise<void> {
  const stored = (await repository.listProjects()).find(
    (p) => p.id === useProjectStore.getState().project.id,
  );
  if (stored) known = { id: stored.id, updatedAt: stored.updatedAt };
  usePersistence.setState({ externalChange: false });
  pending = null;
  await save(useProjectStore.getState().project);
}

/** After the warning: keep this tab's version as a separate project, and open the other version. */
export async function saveLocalAsCopy(copyName: string): Promise<void> {
  const local = useProjectStore.getState().project;
  const copy = asNewProject(local, [copyName]);
  copy.name = copyName;
  pending = null;
  clearTimeout(timer);
  await repository.saveProject(copy);
  await reloadFromStorage();
  await refreshProjectList();
}

export async function openNewProject(project: Project): Promise<void> {
  await flushAutosave();
  pending = null;
  usePersistence.setState({ externalChange: false });
  useProjectStore.getState().loadProject(project);
  markKnown(project);
  await save(project);
}

export async function deleteProject(id: Id, fallbackName: string): Promise<void> {
  await flushAutosave();
  await deleteProjectWithAssets(repository, id);
  await refreshProjectList();
  if (useProjectStore.getState().project.id !== id) return;
  const next = usePersistence.getState().projects[0];
  if (next) await openProject(next.id);
  else await openNewProject(createProject(fallbackName, defaultNames));
}
