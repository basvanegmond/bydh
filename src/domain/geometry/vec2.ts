import type { Vec2 } from '../schema/types';

/** Distances below this (mm) count as the same point. */
export const EPSILON_MM = 0.5;

export const vec = (x: number, y: number): Vec2 => ({ x, y });
export const add = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x + b.x, y: a.y + b.y });
export const sub = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x - b.x, y: a.y - b.y });
export const scale = (a: Vec2, s: number): Vec2 => ({ x: a.x * s, y: a.y * s });
export const dot = (a: Vec2, b: Vec2): number => a.x * b.x + a.y * b.y;
/** z-component of the 3D cross product; > 0 when b is counter-clockwise from a. */
export const cross = (a: Vec2, b: Vec2): number => a.x * b.y - a.y * b.x;
export const length = (a: Vec2): number => Math.hypot(a.x, a.y);
export const distance = (a: Vec2, b: Vec2): number => Math.hypot(a.x - b.x, a.y - b.y);
export const lerp = (a: Vec2, b: Vec2, t: number): Vec2 => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t,
});
export const almostEqual = (a: Vec2, b: Vec2, tolerance = EPSILON_MM): boolean => distance(a, b) <= tolerance;

export function normalize(a: Vec2): Vec2 {
  const len = length(a);
  return len === 0 ? { x: 0, y: 0 } : { x: a.x / len, y: a.y / len };
}

/** Rotates 90° counter-clockwise: the left-hand normal of a direction. */
export const perpLeft = (a: Vec2): Vec2 => ({ x: -a.y, y: a.x });

/** Angle of a vector in radians, counter-clockwise from +X, in (-π, π]. */
export const angleOf = (a: Vec2): number => Math.atan2(a.y, a.x);

export const toDegrees = (radians: number): number => (radians * 180) / Math.PI;
export const toRadians = (degrees: number): number => (degrees * Math.PI) / 180;

/** Normalises an angle in degrees to [0, 360). */
export function normalizeDegrees(degrees: number): number {
  const d = degrees % 360;
  return d < 0 ? d + 360 : d;
}

export function fromAngle(radians: number, len = 1): Vec2 {
  return { x: Math.cos(radians) * len, y: Math.sin(radians) * len };
}
