import { describe, expect, it } from 'vitest';
import { defaultStepCount, stairDimensions, stairGeometry } from '@/domain/model/stairs';
import type { Stair, Vec2 } from '@/domain/schema';

const stair = (over: Partial<Stair> = {}): Stair => ({
  id: 's1',
  fromFloorId: 'a',
  toFloorId: 'b',
  shape: 'straight',
  position: { x: 0, y: 0 },
  rotationDeg: 0,
  width: 900,
  runLength: 2700,
  steps: 10,
  cutsVoid: true,
  ...over,
});

function bounds(points: Vec2[]) {
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
}

const area = (poly: Vec2[]): number =>
  poly.reduce((sum, p, i) => {
    const q = poly[(i + 1) % poly.length]!;
    return sum + (p.x * q.y - q.x * p.y) / 2;
  }, 0);

describe('defaultStepCount', () => {
  it('rounds height / 180 with a minimum of 2', () => {
    expect(defaultStepCount(2700)).toBe(15);
    expect(defaultStepCount(2600)).toBe(14);
    expect(defaultStepCount(100)).toBe(2);
  });
});

describe('stairDimensions', () => {
  it('computes riser and tread without warnings', () => {
    const d = stairDimensions(stair({ steps: 15, runLength: 3600 }), 2700);
    expect(d.riser).toBe(180);
    expect(d.tread).toBe(240);
    expect(d.warnings).toEqual([]);
  });

  it('warns about a high riser and a short tread', () => {
    const d = stairDimensions(stair({ steps: 12, runLength: 2400 }), 2700);
    expect(d.riser).toBeCloseTo(225);
    expect(d.tread).toBe(200);
    expect(d.warnings).toEqual(['riser-too-high', 'tread-too-short']);
  });
});

describe('straight stair', () => {
  it('has one polygon per step and a rectangular outline', () => {
    const g = stairGeometry(stair());
    expect(g.steps).toHaveLength(10);
    expect(bounds(g.outline)).toEqual({ minX: 0, maxX: 2700, minY: -450, maxY: 450 });
    expect(g.walkingLine).toEqual([
      { x: 0, y: 0 },
      { x: 2700, y: 0 },
    ]);
    expect(g.landing).toBeUndefined();
    expect(g.steps.reduce((s, p) => s + area(p), 0)).toBeCloseTo(2700 * 900);
  });

  it('rotates around the anchor and treats spiral as straight', () => {
    const g = stairGeometry(stair({ rotationDeg: 90, position: { x: 1000, y: 2000 }, shape: 'spiral' }));
    expect(g.steps).toHaveLength(10);
    expect(g.walkingLine[0]).toEqual({ x: 1000, y: 2000 });
    expect(g.walkingLine[1]!.x).toBeCloseTo(1000);
    expect(g.walkingLine[1]!.y).toBeCloseTo(4700);
    const b = bounds(g.outline);
    expect(b.minX).toBeCloseTo(550);
    expect(b.maxX).toBeCloseTo(1450);
  });
});

describe('quarter-turn stair', () => {
  const base = stair({ shape: 'quarter-turn', turn: 'left', steps: 11, runLength: 2750 });

  it('splits the steps around a square landing', () => {
    const g = stairGeometry(base);
    expect(g.steps).toHaveLength(11);
    expect(g.landing).toBeDefined();
    expect(Math.abs(area(g.landing!))).toBeCloseTo(900 * 900);
  });

  it('turns left: outline bounds and walking line', () => {
    // rest = 10, flight 1 = 5 steps (1250), flight 2 = 5 steps (1250)
    const g = stairGeometry(base);
    expect(bounds(g.outline)).toEqual({ minX: 0, maxX: 2150, minY: -450, maxY: 450 + 1250 });
    expect(g.walkingLine).toEqual([
      { x: 0, y: 0 },
      { x: 1700, y: 0 },
      { x: 1700, y: 1700 },
    ]);
    expect(g.steps.reduce((s, p) => s + area(p), 0)).toBeCloseTo(area(g.outline));
  });

  it('mirrors for a right turn and keeps counter-clockwise winding', () => {
    const g = stairGeometry({ ...base, turn: 'right' });
    expect(bounds(g.outline)).toEqual({ minX: 0, maxX: 2150, minY: -450 - 1250, maxY: 450 });
    expect(g.walkingLine[2]).toEqual({ x: 1700, y: -1700 });
    expect(area(g.outline)).toBeGreaterThan(0);
  });

  it('rotates the whole footprint', () => {
    const g = stairGeometry({ ...base, rotationDeg: 90 });
    expect(g.walkingLine[1]!.x).toBeCloseTo(0);
    expect(g.walkingLine[1]!.y).toBeCloseTo(1700);
    expect(g.walkingLine[2]!.x).toBeCloseTo(-1700);
  });
});

describe('half-turn stair', () => {
  const base = stair({ shape: 'half-turn', turn: 'left', steps: 12, runLength: 3000 });

  it('has two landings and returns parallel to the first flight', () => {
    // rest = 10, 5 + 5 steps of 250
    const g = stairGeometry(base);
    expect(g.steps).toHaveLength(12);
    expect(Math.abs(area(g.landing!))).toBeCloseTo(1800 * 900);
    expect(bounds(g.outline)).toEqual({ minX: 0, maxX: 2150, minY: -450, maxY: 1350 });
    expect(g.walkingLine).toEqual([
      { x: 0, y: 0 },
      { x: 1700, y: 0 },
      { x: 1700, y: 900 },
      { x: 0, y: 900 },
    ]);
    expect(g.steps.reduce((s, p) => s + area(p), 0)).toBeCloseTo(area(g.outline));
  });

  it('turns right', () => {
    const g = stairGeometry({ ...base, turn: 'right' });
    expect(bounds(g.outline)).toEqual({ minX: 0, maxX: 2150, minY: -1350, maxY: 450 });
    expect(g.walkingLine.at(-1)).toEqual({ x: 0, y: -900 });
  });
});
