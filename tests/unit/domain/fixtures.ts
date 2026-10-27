import { createFloor } from '@/domain/schema';
import type { Floor, Vec2 } from '@/domain/schema';
import { addWall } from '@/domain/model/walls';
import type { WallProps } from '@/domain/model/walls';

export const EXTERIOR: WallProps = { thickness: 300, justification: 'center' };
export const INTERIOR: WallProps = { thickness: 100, justification: 'center' };

export const emptyFloor = (): Floor => createFloor('ground');

export function drawLoop(floor: Floor, points: Vec2[], props: WallProps): void {
  for (let i = 0; i < points.length; i++) addWall(floor, points[i]!, points[(i + 1) % points.length]!, props);
}

/**
 * Synthetic 3-room plan (not a real house): an 8 × 6 m shell of 30 cm walls, split by a 10 cm
 * wall at x = 5 m and a 10 cm wall at y = 3 m on the right side.
 * Net areas: left 4.80 × 5.70 = 27.36 m², right-top and right-bottom 2.80 × 2.80 = 7.84 m².
 */
export function threeRoomFloor(): Floor {
  const floor = emptyFloor();
  drawLoop(
    floor,
    [
      { x: 0, y: 0 },
      { x: 8000, y: 0 },
      { x: 8000, y: 6000 },
      { x: 0, y: 6000 },
    ],
    EXTERIOR,
  );
  addWall(floor, { x: 5000, y: 0 }, { x: 5000, y: 6000 }, INTERIOR);
  addWall(floor, { x: 5000, y: 3000 }, { x: 8000, y: 3000 }, INTERIOR);
  return floor;
}
