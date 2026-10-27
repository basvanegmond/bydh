import type { Vec2 } from '@/domain/schema';

/**
 * Plan (mm, +Y north) ↔ screen (px, +Y down).
 * screen.x = plan.x * scale + offsetX;  screen.y = -plan.y * scale + offsetY
 */
export interface Viewport {
  /** Pixels per millimetre. */
  scale: number;
  offsetX: number;
  offsetY: number;
}

export const MIN_SCALE = 0.005; // 1 px = 200 mm: a whole kavel fits easily
export const MAX_SCALE = 2; // 1 mm = 2 px: socket-level detail

export function planToScreen(view: Viewport, p: Vec2): Vec2 {
  return { x: p.x * view.scale + view.offsetX, y: -p.y * view.scale + view.offsetY };
}

export function screenToPlan(view: Viewport, s: Vec2): Vec2 {
  return { x: (s.x - view.offsetX) / view.scale, y: -(s.y - view.offsetY) / view.scale };
}

/** Zooms by `factor` keeping the plan point under `anchor` (screen px) fixed. */
export function zoomAt(view: Viewport, factor: number, anchor: Vec2): Viewport {
  const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, view.scale * factor));
  const planAnchor = screenToPlan(view, anchor);
  return {
    scale,
    offsetX: anchor.x - planAnchor.x * scale,
    offsetY: anchor.y + planAnchor.y * scale,
  };
}

export function panBy(view: Viewport, dx: number, dy: number): Viewport {
  return { ...view, offsetX: view.offsetX + dx, offsetY: view.offsetY + dy };
}

/** Centres plan point `center` in a screen of `size` at `scale`. */
export function centeredViewport(
  size: { width: number; height: number },
  center: Vec2,
  scale: number,
): Viewport {
  return { scale, offsetX: size.width / 2 - center.x * scale, offsetY: size.height / 2 + center.y * scale };
}

const GRID_STEPS_MM = [10, 50, 100, 500, 1000, 5000, 10000, 50000];
const MIN_MINOR_PX = 8;

/** Finest grid step that is at least MIN_MINOR_PX on screen, plus the next step up as major lines. */
export function gridSpacing(scale: number): { minor: number; major: number } {
  const index = GRID_STEPS_MM.findIndex((step) => step * scale >= MIN_MINOR_PX);
  const minorIndex = index === -1 ? GRID_STEPS_MM.length - 2 : index;
  const minor = GRID_STEPS_MM[minorIndex] ?? 10;
  const major = GRID_STEPS_MM[minorIndex + 1] ?? minor * 10;
  return { minor, major };
}

const NICE_LENGTHS_MM = [100, 200, 500, 1000, 2000, 5000, 10000, 20000, 50000];

/** Largest "nice" length that fits in `maxPx` on screen, for the scale bar. */
export function scaleBarLength(scale: number, maxPx = 120): number {
  let best = NICE_LENGTHS_MM[0] ?? 100;
  for (const length of NICE_LENGTHS_MM) if (length * scale <= maxPx) best = length;
  return best;
}
