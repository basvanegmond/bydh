import type { Underlay, Vec2 } from '../schema/types';
import { add, distance, sub, toRadians } from '../geometry/vec2';

/**
 * An underlay maps image pixels (x right, y down) to plan millimetres (y up):
 * plan = position + rotate(rotationDeg) · (px · mmPerPx, −py · mmPerPx)
 */

const rotate = (v: Vec2, degrees: number): Vec2 => {
  const r = toRadians(degrees);
  return { x: v.x * Math.cos(r) - v.y * Math.sin(r), y: v.x * Math.sin(r) + v.y * Math.cos(r) };
};

export function imageToPlan(u: Pick<Underlay, 'position' | 'rotationDeg' | 'mmPerPx'>, px: Vec2): Vec2 {
  return add(u.position, rotate({ x: px.x * u.mmPerPx, y: -px.y * u.mmPerPx }, u.rotationDeg));
}

export function planToImage(u: Pick<Underlay, 'position' | 'rotationDeg' | 'mmPerPx'>, p: Vec2): Vec2 {
  const local = rotate(sub(p, u.position), -u.rotationDeg);
  return { x: local.x / u.mmPerPx, y: -local.y / u.mmPerPx };
}

/**
 * Two-point calibration: the user clicked plan points a and b on the image and says they are
 * `realMm` apart. Returns the new scale and a position that keeps point a where it was.
 */
export function calibrate(
  u: Pick<Underlay, 'position' | 'rotationDeg' | 'mmPerPx'>,
  a: Vec2,
  b: Vec2,
  realMm: number,
): Pick<Underlay, 'position' | 'mmPerPx'> | null {
  const pa = planToImage(u, a);
  const pb = planToImage(u, b);
  const pixels = distance(pa, pb);
  if (pixels < 1 || realMm <= 0) return null;
  const mmPerPx = realMm / pixels;
  const offset = rotate({ x: pa.x * mmPerPx, y: -pa.y * mmPerPx }, u.rotationDeg);
  return { mmPerPx, position: sub(a, offset) };
}

/** Plan size of the whole image in mm. */
export const underlaySizeMm = (u: Pick<Underlay, 'imagePx' | 'mmPerPx'>) => ({
  w: u.imagePx.w * u.mmPerPx,
  h: u.imagePx.h * u.mmPerPx,
});
