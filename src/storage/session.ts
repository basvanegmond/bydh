import { create } from 'zustand';
import { createProject } from '@/domain/schema';
import type { Id, Project } from '@/domain/schema';
import { useProjectStore } from '@/store/projectStore';
import { IndexedDbRepository } from './indexedDbRepository';
import { MemoryRepository } from './memoryRepository';
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
}

export const usePersistence = create<PersistenceState>()(() => ({
  status: 'idle',
  lastSavedAt: null,
  error: null,
  projects: [],
  durable: true,
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

async function save(project: Project): Promise<void> {
  usePersistence.setState({ status: 'saving' });
  try {
    await repository.saveProject(project);
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

/** Opens the most recently edited project (or creates one) and starts autosaving. */
export async function startPersistence(defaultName: string): Promise<void> {
  try {
    void navigator.storage?.persist?.();
    const [latest] = await repository.listProjects();
    const project = latest ? await repository.loadProject(latest.id) : undefined;
    const initial = project ?? createProject(defaultName);
    useProjectStore.getState().loadProject(initial);
    if (!project) await save(initial);
    else await refreshProjectList();
  } catch (error) {
    usePersistence.setState({
      status: 'error',
      error: error instanceof Error ? error.message : String(error),
    });
  }
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
  if (project) useProjectStore.getState().loadProject(project);
}

export async function openNewProject(project: Project): Promise<void> {
  await flushAutosave();
  useProjectStore.getState().loadProject(project);
  await save(project);
}

export async function deleteProject(id: Id, fallbackName: string): Promise<void> {
  await flushAutosave();
  await repository.deleteProject(id);
  await refreshProjectList();
  if (useProjectStore.getState().project.id !== id) return;
  const next = usePersistence.getState().projects[0];
  if (next) await openProject(next.id);
  else await openNewProject(createProject(fallbackName));
}
