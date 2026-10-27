import { describe, expect, it } from 'vitest';
import { newId } from '@/domain/schema';
import type { Floor, Opening } from '@/domain/schema';
import { addWall } from '@/domain/model/walls';
import {
  DEFAULT_DOOR,
  DEFAULT_WINDOW,
  defaultWallHeight,
  maxCeilingAcross,
  minCeilingAcross,
  nearestWall,
  openingRect,
  placeOpening,
  wallPieces,
} from '@/domain/model/openings';
import { emptyFloor } from './fixtures';

function oneWall(thickness = 100, justification: 'center' | 'left' | 'right' = 'center', length = 4000) {
  const floor = emptyFloor();
  const [wallId] = addWall(floor, { x: 0, y: 0 }, { x: length, y: 0 }, { thickness, justification });
  return { floor, wallId: wallId! };
}

function addOpening(floor: Floor, wallId: string, offset: number, over: Partial<Opening> = {}): Opening {
  const spec = DEFAULT_DOOR;
  const opening: Opening = {
    id: newId(),
    wallId,
    offset,
    width: spec.width,
    height: spec.height,
    sillHeight: 0,
    spec: spec.spec,
    ...over,
  };
  floor.openings[opening.id] = opening;
  return opening;
}

const windowOver = {
  width: DEFAULT_WINDOW.width,
  height: DEFAULT_WINDOW.height,
  sillHeight: DEFAULT_WINDOW.sillHeight,
  spec: DEFAULT_WINDOW.spec,
};

describe('wallPieces', () => {
  it('returns one full piece without openings', () => {
    const { floor, wallId } = oneWall();
    const pieces = wallPieces(floor, wallId);
    expect(pieces).toHaveLength(1);
    expect(pieces[0]).toMatchObject({ kind: 'full', x0: 0, x1: 4000, z0: 0 });
    expect(pieces[0]!.z1).toBe(floor.height - floor.slabThickness);
  });

  it('splits around a door and adds a lintel piece', () => {
    const { floor, wallId } = oneWall();
    addOpening(floor, wallId, 2000);
    const pieces = wallPieces(floor, wallId);
    expect(pieces.map((p) => [p.kind, p.x0, p.x1])).toEqual([
      ['full', 0, 1535],
      ['above', 1535, 2465],
      ['full', 2465, 4000],
    ]);
    expect(pieces[1]).toMatchObject({ z0: 2315, z1: floor.height - floor.slabThickness });
  });

  it('drops empty edge pieces for a door at the wall end', () => {
    const { floor, wallId } = oneWall();
    addOpening(floor, wallId, 465);
    const pieces = wallPieces(floor, wallId);
    expect(pieces[0]).toMatchObject({ kind: 'above', x0: 0, x1: 930 });
    expect(pieces).toHaveLength(2);
  });

  it('handles two windows with sill and head pieces', () => {
    const { floor, wallId } = oneWall();
    addOpening(floor, wallId, 1000, windowOver);
    addOpening(floor, wallId, 3000, windowOver);
    const pieces = wallPieces(floor, wallId);
    expect(pieces.filter((p) => p.kind === 'below')).toHaveLength(2);
    expect(pieces.filter((p) => p.kind === 'above')).toHaveLength(2);
    expect(pieces.filter((p) => p.kind === 'full').map((p) => [p.x0, p.x1])).toEqual([
      [0, 400],
      [1600, 2400],
      [3600, 4000],
    ]);
    expect(pieces.find((p) => p.kind === 'below')).toMatchObject({ z0: 0, z1: 900 });
    expect(pieces.find((p) => p.kind === 'above')!.z0).toBe(2100);
  });

  it('omits the head piece when the opening reaches the wall top', () => {
    const { floor, wallId } = oneWall();
    addOpening(floor, wallId, 2000, { height: 5000 });
    expect(wallPieces(floor, wallId).map((p) => p.kind)).toEqual(['full', 'full']);
  });

  it('uses a ceiling hook to clip the tops', () => {
    const { floor, wallId } = oneWall();
    addOpening(floor, wallId, 2000, windowOver);
    const pieces = wallPieces(floor, wallId, undefined, () => 1000);
    expect(pieces.every((p) => p.z1 <= 1000)).toBe(true);
    expect(pieces.some((p) => p.kind === 'above')).toBe(false);
  });
});

describe('openingRect', () => {
  it('spans the wall thickness with centre justification', () => {
    const { floor, wallId } = oneWall(300);
    const rect = openingRect(floor, addOpening(floor, wallId, 2000))!;
    expect(rect).toEqual([
      { x: 1535, y: -150 },
      { x: 2465, y: -150 },
      { x: 2465, y: 150 },
      { x: 1535, y: 150 },
    ]);
  });

  it('respects justification', () => {
    const { floor, wallId } = oneWall(300, 'left');
    const rect = openingRect(floor, addOpening(floor, wallId, 2000))!;
    // left justification: the node line is the left face, so the wall extends to the right (negative y)
    expect(rect[0].y).toBe(-300);
    expect(rect[2].y).toBe(0);
  });
});

describe('nearestWall', () => {
  it('projects onto the closest wall within tolerance', () => {
    const { floor, wallId } = oneWall();
    expect(nearestWall(floor, { x: 1000, y: 80 }, 100)).toEqual({ wallId, offset: 1000, distance: 80 });
  });

  it('returns null beyond tolerance and ignores short walls', () => {
    const { floor } = oneWall();
    expect(nearestWall(floor, { x: 1000, y: 500 }, 100)).toBeNull();
    const short = oneWall(100, 'center', 250);
    expect(nearestWall(short.floor, { x: 100, y: 0 }, 100)).toBeNull();
  });
});

describe('placeOpening', () => {
  it('places at the requested free spot', () => {
    const { floor, wallId } = oneWall();
    expect(placeOpening(floor, DEFAULT_DOOR, wallId, 2000)).toMatchObject({
      wallId,
      offset: 2000,
      width: 930,
    });
  });

  it('keeps 100 mm at the wall ends', () => {
    const { floor, wallId } = oneWall();
    expect(placeOpening(floor, DEFAULT_DOOR, wallId, 0)!.offset).toBe(565);
    expect(placeOpening(floor, DEFAULT_DOOR, wallId, 4000)!.offset).toBe(3435);
  });

  it('returns null when the wall is too short', () => {
    const { floor, wallId } = oneWall(100, 'center', 1000);
    expect(placeOpening(floor, DEFAULT_DOOR, wallId, 500)).toBeNull();
  });

  it('shifts to the nearest free position when partly occupied', () => {
    const { floor, wallId } = oneWall();
    addOpening(floor, wallId, 2000); // occupies 1535..2465
    expect(placeOpening(floor, DEFAULT_DOOR, wallId, 2300)!.offset).toBe(2930);
  });

  it('returns null when no gap fits, and ignoreId lets an opening move itself', () => {
    const { floor, wallId } = oneWall(100, 'center', 1300);
    const existing = addOpening(floor, wallId, 650);
    expect(placeOpening(floor, DEFAULT_DOOR, wallId, 650)).toBeNull();
    expect(placeOpening(floor, DEFAULT_DOOR, wallId, 650, existing.id)!.offset).toBe(650);
  });
});

describe('wallPieces with sloped ceilings', () => {
  const gable = (x: number) => Math.min(Math.tan(Math.PI / 6) * x, Math.tan(Math.PI / 6) * (6000 - x));

  it('lowers the piece under a sill so it never pokes through the ceiling', () => {
    const { floor, wallId } = oneWall(100, 'center', 6000);
    addOpening(floor, wallId, 3000, { ...windowOver, sillHeight: 900 });
    const below = wallPieces(floor, wallId, undefined, () => 500).find((p) => p.kind === 'below')!;
    expect(below.z1).toBe(500);
    expect(below.z1End).toBe(500);
    expect(below.topLimit).toBe(900);
  });

  it('keeps the piece above a window on a gable wall when only the middle clears the head', () => {
    const { floor, wallId } = oneWall(100, 'center', 6000);
    addOpening(floor, wallId, 3000, { ...windowOver, width: 1200, height: 1200, sillHeight: 200 });
    // ceiling is 1386 at both ends of the window (head 1400) but 1732 at the ridge
    expect(gable(2400)).toBeLessThan(1400);
    const pieces = wallPieces(floor, wallId, undefined, gable);
    expect(pieces.some((p) => p.kind === 'above')).toBe(true);
  });

  it('exports min and max ceiling helpers over a span', () => {
    expect(minCeilingAcross(gable, 2400, 3600)).toBeCloseTo(gable(2400));
    expect(maxCeilingAcross(gable, 2400, 3600)).toBeGreaterThan(1650);
  });

  it('uses the given ceiling slab for the default wall height', () => {
    const { floor, wallId } = oneWall();
    const wall = floor.walls[wallId]!;
    expect(defaultWallHeight(floor, wall)).toBe(floor.height - floor.slabThickness);
    expect(defaultWallHeight(floor, wall, 120)).toBe(floor.height - 120);
    expect(wallPieces(floor, wallId, undefined, undefined, 120)[0]!.z1).toBe(floor.height - 120);
  });
});
