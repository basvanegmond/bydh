import { create } from 'zustand';
import { createProject } from '@/domain/schema';
import type { Building, Project, Variant } from '@/domain/schema';

interface ProjectState {
  project: Project;
}

/**
 * Source of truth for the design. Phase 0 holds a fresh project only;
 * Phase 1 adds Immer patch-based edits, undo/redo and the storage layer.
 */
export const useProjectStore = create<ProjectState>()(() => ({
  project: createProject('My home'),
}));

export const selectActiveVariant = (state: ProjectState): Variant | undefined =>
  state.project.variants[state.project.activeVariantId];

/** The main building of the active variant (the house, not a shed). */
export const selectMainBuilding = (state: ProjectState): Building | undefined => {
  const buildings = selectActiveVariant(state)?.scene.buildings ?? {};
  return Object.values(buildings).find((building) => building.kind === 'main');
};
