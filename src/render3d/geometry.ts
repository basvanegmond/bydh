import { BufferGeometry, Float32BufferAttribute, Path, Shape, ShapeGeometry } from 'three';
import type { WallOutline } from '@/domain/model/outlines';
import type { RoomGeometry } from '@/domain/model/rooms';
import type { Vec2 } from '@/domain/schema';

/** Plan mm (x east, y north) + elevation mm → three.js metres (x, y up, z = −north). */
export const toThree = (p: Vec2, elevationMm: number): [number, number, number] => [
  p.x / 1000,
  elevationMm / 1000,
  -p.y / 1000,
];

/** Material groups of a wall mesh. */
export const WALL_GROUP = { right: 0, left: 1, caps: 2 } as const;

/**
 * A wall as a prism over its mitred outline, with three material groups so each side can be
 * painted separately. Bottom faces are omitted (they sit on the floor).
 */
export function wallGeometry(outline: WallOutline, baseMm: number, heightMm: number): BufferGeometry {
  const { startRight: sr, endRight: er, endLeft: el, startLeft: sl } = outline;
  const top = baseMm + heightMm;
  const positions: number[] = [];
  const geometry = new BufferGeometry();

  const quad = (a: Vec2, b: Vec2) => {
    positions.push(...toThree(a, baseMm), ...toThree(b, baseMm), ...toThree(b, top));
    positions.push(...toThree(a, baseMm), ...toThree(b, top), ...toThree(a, top));
  };
  const addGroup = (build: () => void, materialIndex: number) => {
    const start = positions.length / 3;
    build();
    geometry.addGroup(start, positions.length / 3 - start, materialIndex);
  };

  addGroup(() => quad(sr, er), WALL_GROUP.right);
  addGroup(() => quad(el, sl), WALL_GROUP.left);
  addGroup(() => {
    quad(er, el);
    quad(sl, sr);
    positions.push(...toThree(sr, top), ...toThree(er, top), ...toThree(el, top));
    positions.push(...toThree(sr, top), ...toThree(el, top), ...toThree(sl, top));
  }, WALL_GROUP.caps);

  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  return geometry;
}

const toShapePoints = (ring: Vec2[]) => ring.map((p) => ({ x: p.x / 1000, y: p.y / 1000 }));

/** Flat floor surface of a room (in the XY plane; rotate −90° about X to lay it down). */
export function roomFloorGeometry(room: RoomGeometry): ShapeGeometry {
  const shape = new Shape();
  toShapePoints(room.polygon).forEach((p, i) => (i === 0 ? shape.moveTo(p.x, p.y) : shape.lineTo(p.x, p.y)));
  for (const hole of room.holes) {
    const path = new Path();
    toShapePoints(hole).forEach((p, i) => (i === 0 ? path.moveTo(p.x, p.y) : path.lineTo(p.x, p.y)));
    shape.holes.push(path);
  }
  return new ShapeGeometry(shape);
}
