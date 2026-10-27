import { describe, expect, it } from 'vitest';
import { computeWallOutlines } from '@/domain/model/outlines';
import { floorSlabs } from '@/domain/model/slabs';
import { addWall } from '@/domain/model/walls';
import { createFloor, newId } from '@/domain/schema';
import type { CeilingPlane, Floor, Opening } from '@/domain/schema';
import { ceilingPlanePolygon, prismGeometry, slabGeometry, wallGeometry } from '@/render3d/geometry';
import { boxesGeometry, openingParts } from '@/render3d/openings3d';
import { isStackMode, visibleFloorIds } from '@/render3d/stack';

const WALL = { thickness: 200, justification: 'center' } as const;

/** One straight 4 m wall; its top is at 2500 (floor height 2700 minus the 200 slab). */
function wallFloor(): { floor: Floor; wallId: string } {
  const floor = createFloor('ground');
  addWall(floor, { x: 0, y: 0 }, { x: 4000, y: 0 }, WALL);
  return { floor, wallId: Object.keys(floor.walls)[0]! };
}

const opening = (wallId: string, over: Partial<Opening> = {}): Opening => ({
  id: newId(),
  wallId,
  offset: 2000,
  width: 1000,
  height: 2100,
  sillHeight: 0,
  spec: { type: 'door', operation: 'swing', hinge: 'left', opensTo: 'left' },
  ...over,
});

const build = (floor: Floor, wallId: string, base = 0) =>
  wallGeometry(floor, floor.walls[wallId]!, computeWallOutlines(floor)[wallId]!, base);

const count = (g: ReturnType<typeof build>) => g.getAttribute('position').count;

function bounds(g: ReturnType<typeof build>) {
  g.computeBoundingBox();
  return g.boundingBox!;
}

function heights(g: ReturnType<typeof build>): Set<number> {
  const pos = g.getAttribute('position');
  const ys = new Set<number>();
  for (let i = 0; i < pos.count; i++) ys.add(Math.round(pos.getY(i) * 1000));
  return ys;
}

describe('wallGeometry', () => {
  it('builds one full piece without openings (30 vertices, no bottom)', () => {
    const { floor, wallId } = wallFloor();
    const g = build(floor, wallId);
    expect(count(g)).toBe(30);
    const b = bounds(g);
    expect(b.min.y).toBeCloseTo(0);
    expect(b.max.y).toBeCloseTo(2.5);
    expect(b.max.x).toBeCloseTo(4);
    expect(g.groups.map((x) => x.materialIndex)).toEqual([0, 1, 2]);
  });

  it('slices a door into two full pieces and a head piece', () => {
    const { floor, wallId } = wallFloor();
    const o = opening(wallId);
    floor.openings[o.id] = o;
    // 2 full pieces (30 each) + 1 head piece (36, with an underside)
    expect(count(build(floor, wallId))).toBe(96);
  });

  it('adds sill and head pieces for a window and lifts by the base elevation', () => {
    const { floor, wallId } = wallFloor();
    const o = opening(wallId, {
      sillHeight: 900,
      height: 1200,
      spec: { type: 'window', operation: 'fixed' },
    });
    floor.openings[o.id] = o;
    const g = build(floor, wallId, 3000);
    expect(count(g)).toBe(30 + 30 + 30 + 36);
    expect(bounds(g).min.y).toBeCloseTo(3);
  });

  it('lowers the wall top under a ceiling plane', () => {
    const { floor, wallId } = wallFloor();
    const plane: CeilingPlane = {
      id: newId(),
      eave: { a: { x: 0, y: -1000 }, b: { x: 4000, y: -1000 } },
      kneeHeight: 1000,
      slopeDeg: 45,
      risesToward: 'left',
    };
    floor.ceilingPlanes[plane.id] = plane;
    // the wall axis is 1000 from the eave: 1000 + 1000 = 2000, below the flat 2500
    expect(Math.max(...heights(build(floor, wallId)))).toBe(2000);
  });

  it('slopes the top along a wall that runs up a plane and stops at the flat ceiling', () => {
    const { floor, wallId } = wallFloor();
    const plane: CeilingPlane = {
      id: newId(),
      eave: { a: { x: 0, y: -1000 }, b: { x: 0, y: 1000 } },
      kneeHeight: 1000,
      slopeDeg: 45,
      risesToward: 'right',
    };
    floor.ceilingPlanes[plane.id] = plane;
    const g = build(floor, wallId);
    expect(bounds(g).max.y).toBeCloseTo(2.5);
    const h = heights(g);
    expect(h.has(1000)).toBe(true);
    expect(h.has(2500)).toBe(true);
    expect(count(g)).toBeGreaterThan(30);
  });
});

describe('openingParts', () => {
  const wall = () => {
    const { floor, wallId } = wallFloor();
    return floor.walls[wallId]!;
  };

  it('gives a swing door a frame of four boxes and a closed leaf', () => {
    const w = wall();
    const parts = openingParts(w, opening(w.id));
    expect(parts.frame).toHaveLength(4);
    expect(parts.leaf).toHaveLength(1);
    expect(parts.glass).toHaveLength(0);
    const leaf = parts.leaf[0]!;
    expect(leaf.a0).toBeGreaterThan(1500);
    expect(leaf.a1).toBeLessThan(2500);
  });

  it('gives a doorway no leaf and a double swing door two', () => {
    const w = wall();
    const doorway = openingParts(
      w,
      opening(w.id, { spec: { type: 'door', operation: 'doorway', hinge: 'left', opensTo: 'left' } }),
    );
    expect(doorway.leaf).toHaveLength(0);
    const double = openingParts(
      w,
      opening(w.id, { spec: { type: 'door', operation: 'double-swing', hinge: 'left', opensTo: 'left' } }),
    );
    expect(double.leaf).toHaveLength(2);
  });

  it('gives a window glass and one bar per division, using the frame colour', () => {
    const w = wall();
    const parts = openingParts(
      w,
      opening(w.id, {
        sillHeight: 900,
        height: 1200,
        spec: { type: 'window', operation: 'casement', divisions: 2, frameColor: '#112233' },
      }),
    );
    expect(parts.glass).toHaveLength(1);
    expect(parts.sash).toHaveLength(2);
    expect(parts.leaf).toHaveLength(0);
    expect(parts.frameColor).toBe('#112233');
  });

  it('builds 36 vertices per box within the opening height', () => {
    const { floor, wallId } = wallFloor();
    const w = floor.walls[wallId]!;
    const parts = openingParts(w, opening(w.id));
    const g = boxesGeometry(floor, w, parts.frame, 0);
    expect(count(g)).toBe(4 * 36);
    expect(bounds(g).max.y).toBeCloseTo(2.1);
    expect(count(boxesGeometry(floor, w, [], 0))).toBe(0);
  });
});

describe('slabs, prisms and ceilings', () => {
  const square = (size: number) => [
    { x: 0, y: 0 },
    { x: size, y: 0 },
    { x: size, y: size },
    { x: 0, y: size },
  ];

  it('extrudes a slab with a hole', () => {
    const hole = [
      { x: 1000, y: 1000 },
      { x: 1000, y: 2000 },
      { x: 2000, y: 2000 },
      { x: 2000, y: 1000 },
    ];
    const solid = slabGeometry({ outline: square(4000), holes: [] }, 200);
    const holed = slabGeometry({ outline: square(4000), holes: [hole] }, 200);
    expect(count(holed)).toBeGreaterThan(count(solid));
    holed.computeBoundingBox();
    expect(holed.boundingBox!.max.z).toBeCloseTo(0.2);
  });

  it('builds a slab from a real floor', () => {
    const floor = createFloor('ground');
    const sq = square(3000);
    sq.forEach((p, i) => addWall(floor, p, sq[(i + 1) % 4]!, WALL));
    const slabs = floorSlabs(floor, []);
    expect(slabs).toHaveLength(1);
    expect(count(slabGeometry(slabs[0]!, 200))).toBeGreaterThan(0);
  });

  it('builds a prism without a bottom face', () => {
    const g = prismGeometry(square(300), 0, 180);
    expect(count(g)).toBe(4 * 6 + 6);
  });

  it('clips a ceiling plane to the part of a room below the flat ceiling', () => {
    const floor = createFloor('second');
    const room = [
      { x: 0, y: 0 },
      { x: 6000, y: 0 },
      { x: 6000, y: 4000 },
      { x: 0, y: 4000 },
    ];
    const plane: CeilingPlane = {
      id: newId(),
      eave: { a: { x: 0, y: 0 }, b: { x: 6000, y: 0 } },
      kneeHeight: 1000,
      slopeDeg: 45,
      risesToward: 'left',
    };
    // flat ceiling 2500: the plane reaches it 1500 from the eave
    const ys = ceilingPlanePolygon(plane, floor, room).map((p) => p.y);
    expect(Math.min(...ys)).toBeCloseTo(0);
    expect(Math.max(...ys)).toBeCloseTo(1500);
  });
});

describe('visibleFloorIds', () => {
  const ids = ['a', 'b', 'c'];

  it('shows everything, up to the active floor, or only the active floor', () => {
    expect([...visibleFloorIds(ids, 'b', 'all')]).toEqual(ids);
    expect([...visibleFloorIds(ids, 'b', 'upTo')]).toEqual(['a', 'b']);
    expect([...visibleFloorIds(ids, 'b', 'active')]).toEqual(['b']);
  });

  it('shows everything when the active floor is unknown', () => {
    expect(visibleFloorIds(ids, null, 'active').size).toBe(3);
    expect(isStackMode('upTo')).toBe(true);
    expect(isStackMode('nope')).toBe(false);
  });
});
