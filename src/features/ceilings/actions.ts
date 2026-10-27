import { saddleRoofFromWalls } from '@/domain/model/ceilings';
import { resolveFloor } from '@/domain/model/project';
import i18n from '@/i18n';
import { useProjectStore } from '@/store/projectStore';
import { useViewStore } from '@/store/viewStore';
import { confirmAction } from '../dialogs/dialogStore';

/**
 * Adds a saddle roof (two ceiling planes) along the longest pair of facing outer walls, as one undo step.
 * When the floor already has ceiling planes, asks first and replaces them. Resolves with the number of
 * planes added: 0 when the walls give no roof, null when the user declines the replacement.
 */
export async function addRoofFromWalls(): Promise<number | null> {
  const { project } = useProjectStore.getState();
  const { activeFloorId, ceilingDefaults } = useViewStore.getState();
  const floor = resolveFloor(project, activeFloorId);
  if (!floor) return 0;
  const planes = saddleRoofFromWalls(floor, ceilingDefaults.kneeHeight, ceilingDefaults.slopeDeg);
  if (planes.length === 0) return 0;
  const existing = Object.keys(floor.ceilingPlanes).length;
  if (existing > 0) {
    const ok = await confirmAction(
      i18n.t('ceilings.replaceRoofTitle'),
      i18n.t('ceilings.replaceRoofMessage', { count: existing }),
    );
    if (!ok) return null;
  }
  useProjectStore.getState().editFloor('Roof from walls', floor.id, (f) => {
    f.ceilingPlanes = {};
    for (const plane of planes) f.ceilingPlanes[plane.id] = plane;
  });
  const first = planes[0];
  if (first) useViewStore.getState().select({ kind: 'ceilingPlane', id: first.id });
  return planes.length;
}
