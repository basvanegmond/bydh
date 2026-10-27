import { orderedFloors } from '@/domain/model/project';
import type { Floor, Id, Project } from '@/domain/schema';

/** The floor directly below the given one in the main building, if any. */
export function floorBelow(project: Project, floorId: Id | null): Floor | undefined {
  const floors = orderedFloors(project);
  const index = floors.findIndex((f) => f.id === floorId);
  return index > 0 ? floors[index - 1] : undefined;
}
