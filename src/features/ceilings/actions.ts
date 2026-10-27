import { saddleRoofFromWalls } from '@/domain/model/ceilings';
import { resolveFloor } from '@/domain/model/project';
import { useProjectStore } from '@/store/projectStore';
import { useViewStore } from '@/store/viewStore';

/** Adds a saddle roof (two ceiling planes) along the longest pair of facing outer walls, as one undo step. */
export function addRoofFromWalls(): number {
  const { project, editFloor } = useProjectStore.getState();
  const { activeFloorId, ceilingDefaults, select } = useViewStore.getState();
  const floor = resolveFloor(project, activeFloorId);
  if (!floor) return 0;
  const planes = saddleRoofFromWalls(floor, ceilingDefaults.kneeHeight, ceilingDefaults.slopeDeg);
  if (planes.length === 0) return 0;
  editFloor('Roof from walls', floor.id, (f) => {
    for (const plane of planes) f.ceilingPlanes[plane.id] = plane;
  });
  const first = planes[0];
  if (first) select({ kind: 'ceilingPlane', id: first.id });
  return planes.length;
}
