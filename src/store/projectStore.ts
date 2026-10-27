import { enablePatches, applyPatches, produceWithPatches } from 'immer';
import { create } from 'zustand';
import { emptyHistory, merge, record, takeRedo, takeUndo } from '@/domain/history/history';
import type { History, HistoryEntry } from '@/domain/history/history';
import { activeVariant, mainBuilding, resolveFloor } from '@/domain/model/project';
import { syncRooms } from '@/domain/model/rooms';
import { createProject } from '@/domain/schema';
import type { Building, Floor, Id, Project, Variant } from '@/domain/schema';

enablePatches();

interface ProjectState {
  project: Project;
  history: History;
  /** Open transaction: edits are merged into one undo step until commit. */
  transaction: HistoryEntry | null;
  /** Replaces the project (open, import, new) and clears undo history. */
  loadProject: (project: Project) => void;
  /** Applies an undoable change to the project. */
  edit: (label: string, recipe: (draft: Project) => void) => void;
  /** Applies an undoable change to one floor and re-detects its rooms. */
  editFloor: (label: string, floorId: Id | null, recipe: (floor: Floor) => void) => void;
  beginTransaction: (label: string) => void;
  commitTransaction: () => void;
  cancelTransaction: () => void;
  undo: () => void;
  redo: () => void;
}

export const useProjectStore = create<ProjectState>()((set, get) => ({
  project: createProject('My home'),
  history: emptyHistory(),
  transaction: null,

  loadProject: (project) => set({ project, history: emptyHistory(), transaction: null }),

  edit: (label, recipe) => {
    const [next, patches, inverse] = produceWithPatches(get().project, (draft) => {
      recipe(draft);
      draft.updatedAt = new Date().toISOString();
    });
    if (patches.length === 0) return;
    const entry: HistoryEntry = { label, patches, inverse };
    const { transaction, history } = get();
    if (transaction) set({ project: next, transaction: merge(transaction, entry) });
    else set({ project: next, history: record(history, entry) });
  },

  editFloor: (label, floorId, recipe) => {
    get().edit(label, (draft) => {
      const floor = resolveFloor(draft, floorId);
      if (!floor) return;
      recipe(floor);
      syncRooms(floor);
    });
  },

  beginTransaction: (label) => {
    if (get().transaction) get().commitTransaction();
    set({ transaction: { label, patches: [], inverse: [] } });
  },

  commitTransaction: () => {
    const { transaction, history } = get();
    if (!transaction) return;
    set({ transaction: null, history: record(history, transaction) });
  },

  cancelTransaction: () => {
    const { transaction, project } = get();
    if (!transaction) return;
    set({ transaction: null, project: applyPatches(project, transaction.inverse) });
  },

  undo: () => {
    get().commitTransaction();
    const step = takeUndo(get().history);
    if (!step) return;
    set({ history: step.history, project: applyPatches(get().project, step.entry.inverse) });
  },

  redo: () => {
    get().commitTransaction();
    const step = takeRedo(get().history);
    if (!step) return;
    set({ history: step.history, project: applyPatches(get().project, step.entry.patches) });
  },
}));

export const selectActiveVariant = (state: { project: Project }): Variant | undefined =>
  activeVariant(state.project);

export const selectMainBuilding = (state: { project: Project }): Building | undefined =>
  mainBuilding(state.project);
