import { describe, expect, it } from 'vitest';
import {
  centeredViewport,
  gridSpacing,
  MAX_SCALE,
  MIN_SCALE,
  panBy,
  planToScreen,
  scaleBarLength,
  screenToPlan,
  zoomAt,
} from '@/render2d/viewport';

const view = { scale: 0.05, offsetX: 400, offsetY: 300 };

describe('plan ↔ screen', () => {
  it('flips Y so north points up', () => {
    expect(planToScreen(view, { x: 1000, y: 1000 })).toEqual({ x: 450, y: 250 });
  });

  it('round-trips', () => {
    const plan = { x: 5620, y: -11350 };
    const back = screenToPlan(view, planToScreen(view, plan));
    expect(back.x).toBeCloseTo(plan.x);
    expect(back.y).toBeCloseTo(plan.y);
  });

  it('centres a plan point', () => {
    const centered = centeredViewport({ width: 800, height: 600 }, { x: 2000, y: 1000 }, 0.1);
    expect(planToScreen(centered, { x: 2000, y: 1000 })).toEqual({ x: 400, y: 300 });
  });
});

describe('zoomAt', () => {
  it('keeps the plan point under the cursor fixed', () => {
    const anchor = { x: 123, y: 456 };
    const before = screenToPlan(view, anchor);
    const after = screenToPlan(zoomAt(view, 2.5, anchor), anchor);
    expect(after.x).toBeCloseTo(before.x);
    expect(after.y).toBeCloseTo(before.y);
  });

  it('clamps to the scale limits', () => {
    expect(zoomAt(view, 1e6, { x: 0, y: 0 }).scale).toBe(MAX_SCALE);
    expect(zoomAt(view, 1e-6, { x: 0, y: 0 }).scale).toBe(MIN_SCALE);
  });
});

describe('panBy', () => {
  it('moves the offset in screen pixels', () => {
    expect(panBy(view, 10, -20)).toEqual({ scale: 0.05, offsetX: 410, offsetY: 280 });
  });
});

describe('gridSpacing', () => {
  it('uses 50 cm minor / 1 m major lines at the default zoom (1 m = 50 px)', () => {
    expect(gridSpacing(0.05)).toEqual({ minor: 500, major: 1000 });
  });

  it('gets finer when zoomed in and coarser when zoomed out', () => {
    expect(gridSpacing(1).minor).toBe(10);
    expect(gridSpacing(0.005).minor).toBe(5000);
  });

  it('keeps minor lines at least 8 px apart', () => {
    for (const scale of [0.005, 0.01, 0.05, 0.2, 1, 2]) {
      expect(gridSpacing(scale).minor * scale).toBeGreaterThanOrEqual(8);
    }
  });
});

describe('scaleBarLength', () => {
  it('picks the largest nice length that fits', () => {
    expect(scaleBarLength(0.05, 120)).toBe(2000);
    expect(scaleBarLength(0.5, 120)).toBe(200);
  });
});
