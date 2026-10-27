import { cross, distance, sub, toRadians } from '../geometry/vec2';
import { newId } from '../schema/factories';
import type { CeilingPlane, Floor, Vec2 } from '../schema/types';
import { flatCeilingHeight } from './ceilings';

/** Shortest eave line (mm) the ceiling tool accepts. */
export const MIN_EAVE_LENGTH_MM = 100;
/** Sideways distance (mm) the third click must be from the eave line to pick a side. */
export const MIN_SIDE_OFFSET_MM = 10;

/** Side of the eave line a -> b the point lies on, or null when it is (almost) on the line. */
export function sideOfEave(a: Vec2, b: Vec2, p: Vec2): 'left' | 'right' | null {
  const len = distance(a, b);
  if (len === 0) return null;
  const offset = cross(sub(b, a), sub(p, a)) / len;
  if (Math.abs(offset) < MIN_SIDE_OFFSET_MM) return null;
  return offset > 0 ? 'left' : 'right';
}

/** A plane from the three tool clicks, or null when the eave is too short or the side is ambiguous. */
export function planeFromClicks(
  a: Vec2,
  b: Vec2,
  side: Vec2,
  kneeHeight: number,
  slopeDeg: number,
): CeilingPlane | null {
  if (distance(a, b) < MIN_EAVE_LENGTH_MM) return null;
  const risesToward = sideOfEave(a, b, side);
  if (!risesToward) return null;
  return { id: newId(), eave: { a, b }, kneeHeight, slopeDeg, risesToward };
}

/** Moves a plane (eave line and optional extent) by a plan offset, in place. */
export function translatePlane(plane: CeilingPlane, delta: Vec2): void {
  plane.eave.a = { x: plane.eave.a.x + delta.x, y: plane.eave.a.y + delta.y };
  plane.eave.b = { x: plane.eave.b.x + delta.x, y: plane.eave.b.y + delta.y };
  if (plane.extent) plane.extent = plane.extent.map((p) => ({ x: p.x + delta.x, y: p.y + delta.y }));
}

/**
 * Horizontal distance (mm) from the eave line to where the plane reaches the flat ceiling height,
 * or null when the knee wall is already at or above it (the plane never shows).
 */
export function distanceToFlatCeiling(
  plane: CeilingPlane,
  floor: Pick<Floor, 'height' | 'slabThickness'>,
): number | null {
  const rise = flatCeilingHeight(floor) - plane.kneeHeight;
  if (rise <= 0) return null;
  return rise / Math.tan(toRadians(plane.slopeDeg));
}
