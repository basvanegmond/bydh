import { useMemo } from 'react';
import { floorGeometry } from '@/domain/model/floorGeometry';
import type { WallOutline } from '@/domain/model/outlines';
import { resolveFloor } from '@/domain/model/project';
import type { RoomGeometry } from '@/domain/model/rooms';
import type { Segment } from '@/domain/geometry/segment';
import type { Floor, Id, Vec2 } from '@/domain/schema';
import { useProjectStore } from '@/store/projectStore';
import { useViewStore } from '@/store/viewStore';

export interface PlanData {
  floor: Floor | undefined;
  outlines: Record<Id, WallOutline>;
  rooms: Record<Id, RoomGeometry>;
}

/** The active floor plus its derived geometry, recomputed only when the floor changes. */
export function usePlanData(): PlanData {
  const project = useProjectStore((s) => s.project);
  const activeFloorId = useViewStore((s) => s.activeFloorId);
  const floor = resolveFloor(project, activeFloorId);
  const geometry = useMemo(() => (floor ? floorGeometry(floor) : undefined), [floor]);
  return { floor, outlines: geometry?.outlines ?? {}, rooms: geometry?.rooms ?? {} };
}

/** Snap targets from a floor, leaving out the given nodes and every wall touching them. */
export function snapTargets(
  floor: Floor | undefined,
  excludeNodes: Id[] = [],
): { nodes: Vec2[]; segments: Segment[] } {
  if (!floor) return { nodes: [], segments: [] };
  const excluded = new Set(excludeNodes);
  const nodes = Object.values(floor.wallNodes)
    .filter((n) => !excluded.has(n.id))
    .map((n) => n.position);
  const segments = Object.values(floor.walls)
    .filter((w) => !excluded.has(w.startNodeId) && !excluded.has(w.endNodeId))
    .flatMap((w) => {
      const a = floor.wallNodes[w.startNodeId];
      const b = floor.wallNodes[w.endNodeId];
      return a && b ? [{ a: a.position, b: b.position }] : [];
    });
  return { nodes, segments };
}

export const pointsAttr = (points: Vec2[]): string => points.map((p) => `${p.x},${p.y}`).join(' ');

export function ringsPath(rings: Vec2[][]): string {
  return rings
    .filter((ring) => ring.length > 2)
    .map((ring) => `M${ring.map((p) => `${p.x},${p.y}`).join('L')}Z`)
    .join(' ');
}
