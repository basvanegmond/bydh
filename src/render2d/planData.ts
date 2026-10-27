import { useMemo } from 'react';
import { floorGeometry } from '@/domain/model/floorGeometry';
import type { WallOutline } from '@/domain/model/outlines';
import { resolveFloor } from '@/domain/model/project';
import type { RoomGeometry } from '@/domain/model/rooms';
import type { Segment } from '@/domain/geometry/segment';
import type { Floor, Id, Vec2 } from '@/domain/schema';
import { floorBelow } from '@/features/floors/ghost';
import { useProjectStore } from '@/store/projectStore';
import { useViewStore } from '@/store/viewStore';

export interface PlanData {
  floor: Floor | undefined;
  /** The floor below, when the ghost is on: drawn faintly and used as extra snap targets. */
  ghostFloor: Floor | undefined;
  outlines: Record<Id, WallOutline>;
  rooms: Record<Id, RoomGeometry>;
}

/** The active floor plus its derived geometry, recomputed only when the floor changes. */
export function usePlanData(): PlanData {
  const project = useProjectStore((s) => s.project);
  const activeFloorId = useViewStore((s) => s.activeFloorId);
  const showGhost = useViewStore((s) => s.ghostFloor);
  const floor = resolveFloor(project, activeFloorId);
  const ghostFloor = showGhost && floor ? floorBelow(project, floor.id) : undefined;
  const geometry = useMemo(() => (floor ? floorGeometry(floor) : undefined), [floor]);
  return { floor, ghostFloor, outlines: geometry?.outlines ?? {}, rooms: geometry?.rooms ?? {} };
}

function floorTargets(floor: Floor, excludeNodes: Id[]): { nodes: Vec2[]; segments: Segment[] } {
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

/**
 * Snap targets from a floor, leaving out the given nodes and every wall touching them. The optional
 * ghost floor (the floor below, when the ghost is on) adds its nodes and wall lines unfiltered, so upper
 * walls can sit exactly over lower ones. Without a ghost floor nothing of it is offered.
 */
export function snapTargets(
  floor: Floor | undefined,
  excludeNodes: Id[] = [],
  ghostFloor?: Floor,
): { nodes: Vec2[]; segments: Segment[] } {
  const own = floor ? floorTargets(floor, excludeNodes) : { nodes: [], segments: [] };
  if (!ghostFloor) return own;
  const ghost = floorTargets(ghostFloor, []);
  return { nodes: [...own.nodes, ...ghost.nodes], segments: [...own.segments, ...ghost.segments] };
}

export const pointsAttr = (points: Vec2[]): string => points.map((p) => `${p.x},${p.y}`).join(' ');

export function ringsPath(rings: Vec2[][]): string {
  return rings
    .filter((ring) => ring.length > 2)
    .map((ring) => `M${ring.map((p) => `${p.x},${p.y}`).join('L')}Z`)
    .join(' ');
}
