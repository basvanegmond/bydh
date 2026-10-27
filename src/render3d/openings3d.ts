import type { BufferGeometry } from 'three';
import { normalize, perpLeft, sub } from '@/domain/geometry/vec2';
import { wallExtents } from '@/domain/model/outlines';
import { wallEnds } from '@/domain/model/walls';
import type { Floor, Opening, Vec2, Wall } from '@/domain/schema';
import { MeshBuilder } from './geometry';

/** An axis-aligned box in wall-local coordinates (mm): along the wall, lateral (left is +), vertical. */
export interface LocalBox {
  a0: number;
  a1: number;
  l0: number;
  l1: number;
  z0: number;
  z1: number;
}

export interface OpeningParts {
  frame: LocalBox[];
  leaf: LocalBox[];
  glass: LocalBox[];
  sash: LocalBox[];
  frameColor: string;
  leafColor: string;
}

export const DEFAULT_FRAME_COLOR = '#f2f2f0';
export const DEFAULT_LEAF_COLOR = '#d9d4c8';
export const FRAME_MEMBER_MM = 60;
const THRESHOLD_MM = 20;
const LEAF_THICKNESS_MM = 40;
const GLASS_THICKNESS_MM = 8;
const BAR_MM = 30;
const GAP_MM = 2;

const box = (a0: number, a1: number, l0: number, l1: number, z0: number, z1: number): LocalBox => ({
  a0,
  a1,
  l0,
  l1,
  z0,
  z1,
});

/**
 * The parts of a door or window in wall-local coordinates, closed state: a frame of four boxes inside the
 * hole (head, two jambs, threshold or sill), a thin leaf for doors (none for a doorway; two for a double
 * swing door), and a glass pane plus `divisions` vertical bars for windows.
 */
export function openingParts(wall: Wall, opening: Opening): OpeningParts {
  const { left: extLeft, right: extRight } = wallExtents(wall);
  const spec = opening.spec;
  const f = FRAME_MEMBER_MM;
  const a0 = opening.offset - opening.width / 2;
  const a1 = opening.offset + opening.width / 2;
  const z0 = opening.sillHeight;
  const z1 = opening.sillHeight + opening.height;
  const [l0, l1] = [-extRight, extLeft];
  const mid = (extLeft - extRight) / 2;
  const sill = spec.type === 'door' ? THRESHOLD_MM : f;
  const frame = [
    box(a0, a1, l0, l1, z1 - f, z1),
    box(a0, a0 + f, l0, l1, z0 + sill, z1 - f),
    box(a1 - f, a1, l0, l1, z0 + sill, z1 - f),
    box(a0, a1, l0, l1, z0, z0 + sill),
  ];
  const parts: OpeningParts = {
    frame,
    leaf: [],
    glass: [],
    sash: [],
    frameColor: spec.frameColor ?? DEFAULT_FRAME_COLOR,
    leafColor: (spec.type === 'door' && spec.leaf?.color) || DEFAULT_LEAF_COLOR,
  };
  const [i0, i1] = [a0 + f, a1 - f];
  const [iz0, iz1] = [z0 + sill, z1 - f];
  if (i1 <= i0 || iz1 <= iz0) return parts;

  if (spec.type === 'door') {
    if (spec.operation === 'doorway') return parts;
    const half = LEAF_THICKNESS_MM / 2;
    const slide =
      spec.operation === 'sliding'
        ? Math.max(0, (extLeft + extRight - LEAF_THICKNESS_MM) / 2 - 5) * (spec.opensTo === 'left' ? 1 : -1)
        : 0;
    const c = mid + slide;
    if (spec.operation === 'double-swing') {
      const centre = (i0 + i1) / 2;
      parts.leaf.push(box(i0, centre - GAP_MM, c - half, c + half, iz0, iz1));
      parts.leaf.push(box(centre + GAP_MM, i1, c - half, c + half, iz0, iz1));
    } else {
      parts.leaf.push(box(i0, i1, c - half, c + half, iz0, iz1));
    }
    return parts;
  }

  const g = GLASS_THICKNESS_MM / 2;
  parts.glass.push(box(i0, i1, mid - g, mid + g, iz0, iz1));
  const bars = spec.divisions ?? 0;
  for (let k = 1; k <= bars; k++) {
    const x = i0 + ((i1 - i0) * k) / (bars + 1);
    parts.sash.push(box(x - BAR_MM / 2, x + BAR_MM / 2, mid - BAR_MM / 2, mid + BAR_MM / 2, iz0, iz1));
  }
  return parts;
}

/** Converts wall-local boxes of one wall to a three.js geometry (12 triangles per box). */
export function boxesGeometry(floor: Floor, wall: Wall, boxes: LocalBox[], baseMm: number): BufferGeometry {
  const { a, b } = wallEnds(floor, wall);
  const dir = normalize(sub(b, a));
  const left = perpLeft(dir);
  const at = (along: number, lateral: number): Vec2 => ({
    x: a.x + dir.x * along + left.x * lateral,
    y: a.y + dir.y * along + left.y * lateral,
  });
  const mesh = new MeshBuilder();
  for (const x of boxes) {
    const [p00, p10, p11, p01] = [at(x.a0, x.l0), at(x.a1, x.l0), at(x.a1, x.l1), at(x.a0, x.l1)];
    const [z0, z1] = [baseMm + x.z0, baseMm + x.z1];
    mesh.quad(p00, z0, p10, z0, p10, z1, p00, z1);
    mesh.quad(p10, z0, p11, z0, p11, z1, p10, z1);
    mesh.quad(p11, z0, p01, z0, p01, z1, p11, z1);
    mesh.quad(p01, z0, p00, z0, p00, z1, p01, z1);
    mesh.quad(p00, z1, p10, z1, p11, z1, p01, z1);
    mesh.quad(p00, z0, p01, z0, p11, z0, p10, z0);
  }
  return mesh.build();
}
