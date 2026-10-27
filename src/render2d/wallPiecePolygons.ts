import { add, normalize, perpLeft, scale, sub } from '@/domain/geometry/vec2';
import type { WallOutline } from '@/domain/model/outlines';
import { wallExtents } from '@/domain/model/outlines';
import { wallPieces } from '@/domain/model/openings';
import { wallEnds, wallLength } from '@/domain/model/walls';
import type { Floor, Vec2, Wall } from '@/domain/schema';

type Quad = [Vec2, Vec2, Vec2, Vec2];

/**
 * Plan polygons of the full-height solid parts of a wall (the parts between openings).
 * Pieces below a sill or above a head are not drawn: in plan the opening shows as a gap.
 * A piece touching a wall end reuses the mitred outline corners, so joins stay exact.
 */
export function wallPlanPolygons(
  floor: Floor,
  wall: Wall,
  outline: WallOutline,
  ceilingSlabMm?: number,
): Quad[] {
  const length = wallLength(floor, wall);
  const { a, b } = wallEnds(floor, wall);
  const dir = normalize(sub(b, a));
  const left = perpLeft(dir);
  const ext = wallExtents(wall);
  const at = (along: number, side: number): Vec2 => add(add(a, scale(dir, along)), scale(left, side));
  const EPS = 0.01;
  return wallPieces(floor, wall, undefined, undefined, ceilingSlabMm)
    .filter((p) => p.kind === 'full')
    .map((p): Quad => {
      const atStart = p.x0 <= EPS;
      const atEnd = p.x1 >= length - EPS;
      return [
        atStart ? outline.startRight : at(p.x0, -ext.right),
        atEnd ? outline.endRight : at(p.x1, -ext.right),
        atEnd ? outline.endLeft : at(p.x1, ext.left),
        atStart ? outline.startLeft : at(p.x0, ext.left),
      ];
    });
}
