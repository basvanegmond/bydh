import { describe, expect, it } from 'vitest';
import { DEFAULT_DOOR, DEFAULT_WINDOW } from '@/domain/model/openings';
import { computeWallOutlines } from '@/domain/model/outlines';
import { addWall } from '@/domain/model/walls';
import { newId } from '@/domain/schema';
import type { Opening } from '@/domain/schema';
import { openingShapes } from '@/render2d/openingShapes';
import { wallPlanPolygons } from '@/render2d/wallPiecePolygons';
import { emptyFloor } from '../domain/fixtures';

const sides = { left: 50, right: 50 };

function door(over: Partial<Extract<Opening['spec'], { type: 'door' }>> = {}, width = 900): Opening {
  return {
    id: newId(),
    wallId: 'w',
    offset: 1000,
    width,
    height: 2000,
    sillHeight: 0,
    spec: { ...(DEFAULT_DOOR.spec as Extract<Opening['spec'], { type: 'door' }>), ...over },
  };
}

function windowOf(operation: 'fixed' | 'casement' | 'sliding'): Opening {
  return {
    id: newId(),
    wallId: 'w',
    offset: 1000,
    width: 1200,
    height: 1200,
    sillHeight: 900,
    spec: { ...(DEFAULT_WINDOW.spec as Extract<Opening['spec'], { type: 'window' }>), operation },
  };
}

describe('openingShapes', () => {
  it('draws a swing door leaf and arc at the hinge end on the open side', () => {
    const shapes = openingShapes(door({ hinge: 'left', opensTo: 'left' }), sides);
    expect(shapes[0]).toEqual({ kind: 'line', x1: -450, y1: 0, x2: -450, y2: 900 });
    expect(shapes[1]).toEqual({ kind: 'arc', d: 'M-450 900A900 900 0 0 0 450 0' });
  });

  it('mirrors the leaf and arc for the right hinge and the right side', () => {
    const shapes = openingShapes(door({ hinge: 'right', opensTo: 'right' }), sides);
    expect(shapes[0]).toMatchObject({ x1: 450, y2: -900 });
    expect(shapes[1]).toEqual({ kind: 'arc', d: 'M450 -900A900 900 0 0 0 -450 0' });
  });

  it('flips the arc sweep when only the swing side changes', () => {
    const shapes = openingShapes(door({ hinge: 'left', opensTo: 'right' }), sides);
    expect(shapes[1]).toEqual({ kind: 'arc', d: 'M-450 -900A900 900 0 0 1 450 0' });
  });

  it('draws two half leaves with two arcs for a double swing door', () => {
    const shapes = openingShapes(door({ operation: 'double-swing' }), sides);
    expect(shapes.filter((s) => s.kind === 'arc')).toHaveLength(2);
    expect(shapes.filter((s) => s.kind === 'line')).toHaveLength(2);
  });

  it('draws sliding leaf plus track, a dashed pocket leaf, and nothing for a doorway', () => {
    const sliding = openingShapes(door({ operation: 'sliding' }), sides);
    expect(sliding.map((s) => s.kind)).toEqual(['rect', 'line']);
    const pocket = openingShapes(door({ operation: 'pocket' }), sides);
    expect(pocket).toMatchObject([{ kind: 'rect', dashed: true }]);
    expect(openingShapes(door({ operation: 'doorway' }), sides)).toEqual([]);
  });

  it('draws three parallel lines for a fixed window and a sash line for a casement', () => {
    expect(openingShapes(windowOf('fixed'), sides)).toHaveLength(3);
    const casement = openingShapes(windowOf('casement'), sides);
    expect(casement).toHaveLength(4);
    expect(casement.at(-1)).toMatchObject({ kind: 'line', thin: true });
    expect(openingShapes(windowOf('sliding'), sides).filter((s) => s.kind === 'rect')).toHaveLength(2);
  });
});

describe('wallPlanPolygons', () => {
  it('leaves a gap in the wall where a door sits', () => {
    const floor = emptyFloor();
    const [wallId] = addWall(
      floor,
      { x: 0, y: 0 },
      { x: 4000, y: 0 },
      { thickness: 100, justification: 'center' },
    );
    const wall = floor.walls[wallId!]!;
    const opening = { ...door(), wallId: wallId! };
    floor.openings[opening.id] = opening;
    const outline = computeWallOutlines(floor)[wallId!]!;
    const quads = wallPlanPolygons(floor, wall, outline);
    expect(quads).toHaveLength(2);
    // First piece runs from the wall start to the opening start (1000 - 450).
    expect(quads[0]![1].x).toBeCloseTo(550);
    expect(quads[1]![0].x).toBeCloseTo(1450);
    // Ends reuse the mitred outline corners.
    expect(quads[0]![0]).toEqual(outline.startRight);
    expect(quads[1]![1]).toEqual(outline.endRight);
  });
});
