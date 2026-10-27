import { describe, expect, it } from 'vitest';
import { snapPoint } from '@/domain/snapping/snap';
import type { SnapContext } from '@/domain/snapping/snap';

const base: SnapContext = {
  nodes: [
    { x: 0, y: 0 },
    { x: 4000, y: 0 },
  ],
  segments: [{ a: { x: 0, y: 0 }, b: { x: 4000, y: 0 } }],
  gridMm: 100,
  toleranceMm: 50,
};

describe('snapPoint', () => {
  it('prefers an existing node', () => {
    expect(snapPoint({ x: 3970, y: 20 }, base)).toMatchObject({ kind: 'node', point: { x: 4000, y: 0 } });
  });

  it('snaps to a wall midpoint', () => {
    expect(snapPoint({ x: 2030, y: -20 }, base)).toMatchObject({
      kind: 'midpoint',
      point: { x: 2000, y: 0 },
    });
  });

  it('snaps onto a wall', () => {
    expect(snapPoint({ x: 1234, y: 30 }, base)).toMatchObject({ kind: 'edge', point: { x: 1234, y: 0 } });
  });

  it('locks to 15° steps near them and rounds the length to the grid', () => {
    const result = snapPoint(
      { x: 3020, y: 3110 },
      { ...base, nodes: [], segments: [], from: { x: 0, y: 0 } },
    );
    expect(result.kind).toBe('angle');
    expect(Math.hypot(result.point.x, result.point.y)).toBeCloseTo(4300);
    expect(result.point.x).toBeCloseTo(result.point.y);
  });

  it('does not lock when far from a 15° step', () => {
    const result = snapPoint(
      { x: 1000, y: 1300 },
      { ...base, nodes: [], segments: [], from: { x: 0, y: 0 } },
    );
    expect(result.kind).toBe('grid');
  });

  it('forces 45° steps (Shift)', () => {
    const result = snapPoint(
      { x: 1000, y: 1300 },
      { ...base, nodes: [], segments: [], from: { x: 0, y: 0 }, forceAngleStepDeg: 45 },
    );
    expect(result.kind).toBe('angle');
    expect(result.point.x).toBeCloseTo(result.point.y);
  });

  it('aligns with a node on one axis and grid-rounds the other', () => {
    const result = snapPoint({ x: 4030, y: 2345 }, base);
    expect(result).toMatchObject({ kind: 'align', point: { x: 4000, y: 2300 } });
    expect(result.guides).toHaveLength(1);
  });

  it('falls back to the grid', () => {
    expect(snapPoint({ x: 1234, y: 2345 }, base)).toMatchObject({
      kind: 'grid',
      point: { x: 1200, y: 2300 },
    });
  });
});
