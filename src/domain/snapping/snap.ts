import type { Vec2 } from '../schema/types';
import type { Segment } from '../geometry/segment';
import { closestPointOnSegment } from '../geometry/segment';
import { add, angleOf, distance, dot, fromAngle, lerp, sub, toDegrees, toRadians } from '../geometry/vec2';

export type SnapKind = 'node' | 'midpoint' | 'edge' | 'angle' | 'align' | 'grid' | 'free';

export interface SnapContext {
  nodes: Vec2[];
  segments: Segment[];
  /** Grid step in mm; 0 disables grid snapping. */
  gridMm: number;
  /** Capture radius in mm (the caller converts screen pixels at the current zoom). */
  toleranceMm: number;
  /** Start of the segment being drawn; enables angle snapping. */
  from?: Vec2;
  /** Angles within this many degrees of a multiple of `angleStepDeg` lock to it. */
  angleStepDeg?: number;
  angleToleranceDeg?: number;
  /** Always lock to multiples of this step (e.g. 45° while Shift is held). */
  forceAngleStepDeg?: number;
}

export interface SnapResult {
  point: Vec2;
  kind: SnapKind;
  /** Helper lines to draw (plan coordinates). */
  guides: Segment[];
}

const GUIDE_REACH_MM = 100_000;

function nearestNode(raw: Vec2, ctx: SnapContext): Vec2 | null {
  let best: { p: Vec2; d: number } | null = null;
  for (const p of ctx.nodes) {
    const d = distance(p, raw);
    if (d <= ctx.toleranceMm && (!best || d < best.d)) best = { p, d };
  }
  return best?.p ?? null;
}

function nearestMidpoint(raw: Vec2, ctx: SnapContext): Vec2 | null {
  for (const s of ctx.segments) {
    const mid = lerp(s.a, s.b, 0.5);
    if (distance(mid, raw) <= ctx.toleranceMm) return mid;
  }
  return null;
}

function nearestEdgePoint(raw: Vec2, ctx: SnapContext): Vec2 | null {
  let best: { p: Vec2; d: number } | null = null;
  for (const s of ctx.segments) {
    const { point } = closestPointOnSegment(raw, s.a, s.b);
    const d = distance(point, raw);
    if (d <= ctx.toleranceMm && (!best || d < best.d)) best = { p: point, d };
  }
  return best?.p ?? null;
}

const roundTo = (value: number, step: number) => (step > 0 ? Math.round(value / step) * step : value);

function angleSnap(raw: Vec2, from: Vec2, ctx: SnapContext): SnapResult | null {
  const delta = sub(raw, from);
  if (delta.x === 0 && delta.y === 0) return null;
  const step = ctx.forceAngleStepDeg ?? ctx.angleStepDeg ?? 15;
  const degrees = toDegrees(angleOf(delta));
  const snapped = Math.round(degrees / step) * step;
  if (ctx.forceAngleStepDeg === undefined && Math.abs(snapped - degrees) > (ctx.angleToleranceDeg ?? 4))
    return null;
  const dir = fromAngle(toRadians(snapped));
  const len = Math.max(roundTo(dot(delta, dir), ctx.gridMm), 0);
  const point = add(from, { x: dir.x * len, y: dir.y * len });
  return {
    point,
    kind: 'angle',
    guides: [{ a: from, b: add(from, { x: dir.x * GUIDE_REACH_MM, y: dir.y * GUIDE_REACH_MM }) }],
  };
}

/** Aligns x and/or y with existing nodes (extension lines); grid-rounds the other axis. */
function alignOrGrid(raw: Vec2, ctx: SnapContext): SnapResult {
  const alignX = ctx.nodes.find((n) => Math.abs(n.x - raw.x) <= ctx.toleranceMm);
  const alignY = ctx.nodes.find((n) => Math.abs(n.y - raw.y) <= ctx.toleranceMm);
  const point = {
    x: alignX ? alignX.x : roundTo(raw.x, ctx.gridMm),
    y: alignY ? alignY.y : roundTo(raw.y, ctx.gridMm),
  };
  const guides: Segment[] = [];
  if (alignX) guides.push({ a: alignX, b: { x: alignX.x, y: point.y } });
  if (alignY) guides.push({ a: alignY, b: { x: point.x, y: alignY.y } });
  if (guides.length > 0) return { point, kind: 'align', guides };
  return { point, kind: ctx.gridMm > 0 ? 'grid' : 'free', guides };
}

/**
 * Snaps a raw cursor position. Priority: existing node > wall midpoint > point on a wall >
 * angle lock from the drawing start > alignment with nodes > grid.
 */
export function snapPoint(raw: Vec2, ctx: SnapContext): SnapResult {
  const node = nearestNode(raw, ctx);
  if (node) return { point: node, kind: 'node', guides: [] };
  const mid = nearestMidpoint(raw, ctx);
  if (mid) return { point: mid, kind: 'midpoint', guides: [] };
  const edge = nearestEdgePoint(raw, ctx);
  if (edge) return { point: edge, kind: 'edge', guides: [] };
  if (ctx.from) {
    const angled = angleSnap(raw, ctx.from, ctx);
    if (angled) return angled;
  }
  return alignOrGrid(raw, ctx);
}
