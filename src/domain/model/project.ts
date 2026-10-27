import type { Building, Floor, Id, Project, Variant } from '../schema/types';

export const activeVariant = (project: Project): Variant | undefined =>
  project.variants[project.activeVariantId];

/** The house (not a shed) in the active variant. */
export function mainBuilding(project: Project): Building | undefined {
  const buildings = activeVariant(project)?.scene.buildings ?? {};
  return Object.values(buildings).find((b) => b.kind === 'main');
}

/** Floors of the main building, bottom to top. */
export function orderedFloors(project: Project): Floor[] {
  const building = mainBuilding(project);
  if (!building) return [];
  return building.floorOrder.flatMap((id) => building.floors[id] ?? []);
}

/** The floor with this id in the active variant, or the lowest floor when the id is unknown. */
export function resolveFloor(project: Project, floorId: Id | null): Floor | undefined {
  const floors = orderedFloors(project);
  return floors.find((f) => f.id === floorId) ?? floors.find((f) => f.level === 'ground') ?? floors[0];
}
