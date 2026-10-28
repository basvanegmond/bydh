import { pointInPolygon } from '../geometry/polygon';
import type { Floor, Polygon, Stair } from '../schema/types';
import { outerBoundaries } from './rooms';
import { stairGeometry } from './stairs';

/** One floor slab: the outer boundary (counter-clockwise) and the openings cut out of it. */
export interface Slab {
  outline: Polygon;
  holes: Polygon[];
}

const reversed = (polygon: Polygon): Polygon => [...polygon].reverse();

/**
 * Floor slabs, derived from the walls: one per connected group of walls that encloses a space (the outer
 * boundary, wall thickness included). Free-standing groups inside another group's boundary are islands and
 * get no slab of their own. The footprint of every stair that arrives on this floor (`toFloorId`) and cuts a
 * void is subtracted as a hole, when it lies completely inside the slab; other stairs make no hole.
 * Holes are clockwise. A floor without a closed wall loop has no slab.
 */
export function floorSlabs(floor: Floor, arrivingStairs: Stair[]): Slab[] {
  const outlines = outerBoundaries(floor);
  const roots = outlines.filter(
    (outline, i) => !outlines.some((other, j) => j !== i && pointInPolygon(outline[0]!, other)),
  );
  const voids = arrivingStairs
    .filter((s) => s.toFloorId === floor.id && s.cutsVoid)
    .map((s) => stairGeometry(s).outline);
  return roots.map((outline) => ({
    outline,
    holes: voids.filter((v) => v.every((p) => pointInPolygon(p, outline))).map(reversed),
  }));
}
