import type { Stair, Vec2 } from '../schema/types';
import { toRadians } from '../geometry/vec2';

/**
 * Stair footprints. Pure and derived: nothing here is stored.
 *
 * Local frame: s runs along the stair direction from the anchor (the centre of the bottom
 * step's front edge), t runs to the left of that direction. `turn: 'right'` mirrors t.
 * Every step, landings included, counts as one of `stair.steps`; the nominal tread depth is
 * `runLength / steps` and a landing is a square of `width`. Quarter-turn stairs have one
 * landing, half-turn stairs two (side by side), and the remaining steps are split between
 * the two flights (the lower flight gets the extra one).
 * 'spiral' is not supported: it is drawn as a straight stair rather than failing.
 */

export const TARGET_RISER_MM = 180;
export const MAX_RISER_MM = 200;
export const MIN_TREAD_MM = 220;

export interface StairGeometry {
  /** One polygon per step (landings included), bottom to top, in plot space. */
  steps: Vec2[][];
  /** Outer boundary of the whole stair. */
  outline: Vec2[];
  /** Polyline from the bottom to the top of the stair, for the direction arrow. */
  walkingLine: Vec2[];
  /** Combined landing area for quarter- and half-turn stairs. */
  landing?: Vec2[];
}

export type StairWarning = 'riser-too-high' | 'tread-too-short';

export interface StairDimensions {
  riser: number;
  tread: number;
  warnings: StairWarning[];
}

export function defaultStepCount(floorToFloorHeightMm: number): number {
  return Math.max(2, Math.round(floorToFloorHeightMm / TARGET_RISER_MM));
}

export function stairDimensions(
  stair: Pick<Stair, 'steps' | 'runLength'>,
  floorToFloorHeightMm: number,
): StairDimensions {
  const riser = floorToFloorHeightMm / stair.steps;
  const tread = stair.runLength / stair.steps;
  const warnings: StairWarning[] = [];
  if (riser > MAX_RISER_MM) warnings.push('riser-too-high');
  if (tread < MIN_TREAD_MM) warnings.push('tread-too-short');
  return { riser, tread, warnings };
}

type Pt = [number, number];
const rect = (s0: number, s1: number, t0: number, t1: number): Pt[] => [
  [s0, t0],
  [s1, t0],
  [s1, t1],
  [s0, t1],
];

interface Local {
  steps: Pt[][];
  outline: Pt[];
  line: Pt[];
  landing?: Pt[];
}

/** n strips of depth `tread` along s, starting at s0 (direction +1 or -1), across [t0, t1]. */
function stripsAlongS(s0: number, dir: 1 | -1, n: number, tread: number, t0: number, t1: number): Pt[][] {
  return Array.from({ length: n }, (_, i) => {
    const a = s0 + dir * i * tread;
    const b = a + dir * tread;
    return rect(Math.min(a, b), Math.max(a, b), t0, t1);
  });
}

function stripsAlongT(t0: number, n: number, tread: number, s0: number, s1: number): Pt[][] {
  return Array.from({ length: n }, (_, i) => rect(s0, s1, t0 + i * tread, t0 + (i + 1) * tread));
}

function localStraight(stair: Stair): Local {
  const w = stair.width / 2;
  const tread = stair.runLength / stair.steps;
  return {
    steps: stripsAlongS(0, 1, stair.steps, tread, -w, w),
    outline: rect(0, stair.runLength, -w, w),
    line: [
      [0, 0],
      [stair.runLength, 0],
    ],
  };
}

function flights(stair: Stair, landings: number): { n1: number; n2: number; tread: number; f1: number } {
  const rest = Math.max(0, stair.steps - landings);
  const n1 = Math.ceil(rest / 2);
  const tread = stair.runLength / stair.steps;
  return { n1, n2: rest - n1, tread, f1: n1 * tread };
}

function localQuarter(stair: Stair): Local {
  const W = stair.width;
  const w = W / 2;
  const { n1, n2, tread, f1 } = flights(stair, 1);
  const top = w + n2 * tread;
  const landing = rect(f1, f1 + W, -w, w);
  return {
    steps: [...stripsAlongS(0, 1, n1, tread, -w, w), landing, ...stripsAlongT(w, n2, tread, f1, f1 + W)],
    outline: [
      [0, -w],
      [f1 + W, -w],
      [f1 + W, top],
      [f1, top],
      [f1, w],
      [0, w],
    ],
    line: [
      [0, 0],
      [f1 + w, 0],
      [f1 + w, top],
    ],
    landing,
  };
}

function localHalf(stair: Stair): Local {
  const W = stair.width;
  const w = W / 2;
  const { n1, n2, tread, f1 } = flights(stair, 2);
  const back = f1 - n2 * tread;
  return {
    steps: [
      ...stripsAlongS(0, 1, n1, tread, -w, w),
      rect(f1, f1 + W, -w, w),
      rect(f1, f1 + W, w, W + w),
      ...stripsAlongS(f1, -1, n2, tread, w, W + w),
    ],
    outline: [
      [0, -w],
      [f1 + W, -w],
      [f1 + W, W + w],
      [back, W + w],
      [back, w],
      [0, w],
    ],
    line: [
      [0, 0],
      [f1 + w, 0],
      [f1 + w, W],
      [back, W],
    ],
    landing: rect(f1, f1 + W, -w, W + w),
  };
}

function toPlot(stair: Stair, mirror: boolean): (p: Pt) => Vec2 {
  const a = toRadians(stair.rotationDeg);
  const c = Math.cos(a);
  const s = Math.sin(a);
  return ([ls, lt]) => {
    const t = mirror ? -lt : lt;
    return { x: stair.position.x + ls * c - t * s, y: stair.position.y + ls * s + t * c };
  };
}

export function stairGeometry(stair: Stair): StairGeometry {
  const local =
    stair.shape === 'quarter-turn'
      ? localQuarter(stair)
      : stair.shape === 'half-turn'
        ? localHalf(stair)
        : localStraight(stair); // 'straight' and the unsupported 'spiral'
  const mirror = stair.turn === 'right' && (stair.shape === 'quarter-turn' || stair.shape === 'half-turn');
  const map = toPlot(stair, mirror);
  // Mirroring flips the winding; reverse so polygons stay counter-clockwise.
  const poly = (pts: Pt[]): Vec2[] => (mirror ? pts.map(map).reverse() : pts.map(map));
  return {
    steps: local.steps.map(poly),
    outline: poly(local.outline),
    walkingLine: local.line.map(map),
    ...(local.landing ? { landing: poly(local.landing) } : {}),
  };
}
