import { enablePatches, applyPatches, current, produceWithPatches } from 'immer';
import { create } from 'zustand';
import { emptyHistory, merge, record, takeRedo, takeUndo } from '@/domain/history/history';
import type { History, HistoryEntry } from '@/domain/history/history';
import { normalizeFloor } from '@/domain/model/normalize';
import { activeVariant, findFloor, mainBuilding, orderedFloors } from '@/domain/model/project';
import { syncRooms } from '@/domain/model/rooms';
import { createProject } from '@/domain/schema';
import { useViewStore } from './viewStore';
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

/** Floors edited during the open transaction (normalised when it commits). */
const touchedFloors = new Set<Id>();

export const useProjectStore = create<ProjectState>()((set, get) => ({
  project: createProject('My home'),
  history: emptyHistory(),
  transaction: null,

  loadProject: (project) => {
    touchedFloors.clear();
    set({ project, history: emptyHistory(), transaction: null });
  },

  edit: (label, recipe) => {
    const [produced, patches, inverse] = produceWithPatches(get().project, recipe);
    // A recipe that changed nothing records nothing (no undo step, no autosave).
    if (patches.length === 0) return;
    // updatedAt is bookkeeping: set outside the recipe so it is not part of the undo step.
    const next: Project = { ...produced, updatedAt: new Date().toISOString() };
    const entry: HistoryEntry = { label, patches, inverse };
    const { transaction, history } = get();
    if (transaction) set({ project: next, transaction: merge(transaction, entry) });
    else set({ project: next, history: record(history, entry) });
  },

  editFloor: (label, floorId, recipe) => {
    // Edits need an exact floor id; an unknown id is a no-op rather than silently hitting the ground floor.
    if (!floorId || !findFloor(get().project, floorId)) return;
    const inTransaction = get().transaction !== null;
    if (inTransaction) touchedFloors.add(floorId);
    get().edit(label, (draft) => {
      const floor = findFloor(draft, floorId);
      if (!floor) return;
      const previous = current(floor); // lets room sync keep names/finishes by overlap
      recipe(floor);
      // During a drag only rooms are kept live (cheap); wall-graph normalisation runs at drag end.
      if (!inTransaction) normalizeFloor(floor);
      syncRooms(floor, undefined, previous);
    });
  },

  beginTransaction: (label) => {
    if (get().transaction) get().commitTransaction();
    set({ transaction: { label, patches: [], inverse: [] } });
  },

  commitTransaction: () => {
    if (!get().transaction) return;
    // Drag ended: restore wall-graph invariants once, as part of the same undo step.
    const ids = [...touchedFloors];
    touchedFloors.clear();
    for (const id of ids) {
      get().edit('Normalize', (draft) => {
        const floor = findFloor(draft, id);
        if (!floor) return;
        const previous = current(floor);
        normalizeFloor(floor);
        syncRooms(floor, undefined, previous);
      });
    }
    const { transaction, history } = get();
    if (!transaction) return;
    set({ transaction: null, history: record(history, transaction) });
  },

  cancelTransaction: () => {
    const { transaction, project } = get();
    touchedFloors.clear();
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

/**
 * Keeps the per-viewer UI state valid whenever the project changes (load, variant switch, undo):
 * the active floor must exist in the active variant, and a variant change clears the selection.
 */
function syncView(project: Project, previous: Project | null): void {
  const view = useViewStore.getState();
  const floors = orderedFloors(project);
  if (!floors.some((f) => f.id === view.activeFloorId)) {
    const fallback = floors.find((f) => f.level === 'ground') ?? floors[0];
    useViewStore.setState({ activeFloorId: fallback?.id ?? null, selection: null });
  }
  if (previous && previous.activeVariantId !== project.activeVariantId) view.select(null);
}

useProjectStore.subscribe((state, prev) => {
  if (state.project !== prev.project) syncView(state.project, prev.project);
});
syncView(useProjectStore.getState().project, null);
