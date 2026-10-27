import { BufferGeometry, ExtrudeGeometry, Float32BufferAttribute, Path, Shape, ShapeGeometry } from 'three';
import { signedArea } from '@/domain/geometry/polygon';
import { dot, normalize, perpLeft, sub, toRadians } from '@/domain/geometry/vec2';
import {
  clipHalfPlane,
  coverRegion,
  flatCeilingHeight,
  planeHeightAt,
  subtractConvex,
  wallCeilingHook,
} from '@/domain/model/ceilings';
import type { HalfPlane } from '@/domain/model/ceilings';
import { CEILING_SAMPLE_STEP_MM, wallPieces } from '@/domain/model/openings';
import type { WallPiece } from '@/domain/model/openings';
import { wallExtents } from '@/domain/model/outlines';
import type { WallOutline } from '@/domain/model/outlines';
import type { RoomGeometry } from '@/domain/model/rooms';
import type { Slab } from '@/domain/model/slabs';
import { wallEnds, wallLength } from '@/domain/model/walls';
import type { CeilingPlane, Floor, Polygon, Vec2, Wall } from '@/domain/schema';

/** Plan mm (x east, y north) + elevation mm → three.js metres (x, y up, z = −north). */
export const toThree = (p: Vec2, elevationMm: number): [number, number, number] => [
  p.x / 1000,
  elevationMm / 1000,
  -p.y / 1000,
];

/** Material groups of a wall mesh. */
export const WALL_GROUP = { right: 0, left: 1, caps: 2 } as const;

/** Accumulates triangles (as three.js metres) and material groups. */
export class MeshBuilder {
  readonly positions: number[] = [];
  readonly groups: { start: number; count: number; materialIndex: number }[] = [];

  /** A triangle from three plan points with elevations (mm). */
  tri(a: Vec2, za: number, b: Vec2, zb: number, c: Vec2, zc: number): void {
    this.positions.push(...toThree(a, za), ...toThree(b, zb), ...toThree(c, zc));
  }

  /** A quad a, b, c, d (in order around its edge), as two triangles. */
  quad(a: Vec2, za: number, b: Vec2, zb: number, c: Vec2, zc: number, d: Vec2, zd: number): void {
    this.tri(a, za, b, zb, c, zc);
    this.tri(a, za, c, zc, d, zd);
  }

  /** Runs `build` and records the vertices it added as one material group. */
  group(materialIndex: number, build: () => void): void {
    const start = this.positions.length / 3;
    build();
    const count = this.positions.length / 3 - start;
    if (count > 0) this.groups.push({ start, count, materialIndex });
  }

  build(): BufferGeometry {
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new Float32BufferAttribute(this.positions, 3));
    for (const g of this.groups) geometry.addGroup(g.start, g.count, g.materialIndex);
    geometry.computeVertexNormals();
    return geometry;
  }
}

/** Sloped wall tops are sampled at this spacing along the wall. */
export const SLOPE_STEP_MM = CEILING_SAMPLE_STEP_MM;

interface PieceSpan {
  piece: WallPiece;
  capStart: boolean;
  capEnd: boolean;
}

/**
 * Splits pieces whose top follows the ceiling hook into short segments, because a plane meets the flat
 * ceiling (or the end of its coverage) inside a wall piece and the top is then not a straight line.
 */
function sampledSpans(pieces: WallPiece[], top: ((alongMm: number) => number) | undefined): PieceSpan[] {
  return pieces.flatMap((piece): PieceSpan[] => {
    if (!top) return [{ piece, capStart: true, capEnd: true }];
    const n = Math.max(1, Math.ceil((piece.x1 - piece.x0) / SLOPE_STEP_MM));
    const spans: PieceSpan[] = [];
    for (let i = 0; i < n; i++) {
      const x0 = piece.x0 + ((piece.x1 - piece.x0) * i) / n;
      const x1 = piece.x0 + ((piece.x1 - piece.x0) * (i + 1)) / n;
      const cap = piece.topLimit ?? Infinity;
      const t0 = Math.max(Math.min(top(x0), cap), piece.z0);
      const t1 = Math.max(Math.min(top(x1), cap), piece.z0);
      if (t0 <= piece.z0 && t1 <= piece.z0) continue;
      spans.push({
        piece: { ...piece, x0, x1, z1: t0, z1End: t1 },
        capStart: i === 0,
        capEnd: i === n - 1,
      });
    }
    return spans;
  });
}

/**
 * A wall as extruded solid pieces over its mitred outline: full-height pieces between the openings plus
 * a piece below each sill and above each head, with three material groups so each side can be painted
 * separately. Bottom faces on the floor are omitted. Wall tops follow the ceiling planes of the floor.
 */
export function wallGeometry(
  floor: Floor,
  wall: Wall,
  outline: WallOutline,
  baseMm: number,
  openings = Object.values(floor.openings),
  ceilingSlabMm?: number,
): BufferGeometry {
  const { a, b } = wallEnds(floor, wall);
  const length = wallLength(floor, wall);
  const dir = normalize(sub(b, a));
  const left = perpLeft(dir);
  const ext = wallExtents(wall);
  const hasPlanes = Object.keys(floor.ceilingPlanes).length > 0;
  const hook = hasPlanes ? wallCeilingHook(floor, wall, { a, b }, ceilingSlabMm) : undefined;
  const spans = sampledSpans(wallPieces(floor, wall, openings, hook, ceilingSlabMm), hook);

  const at = (x: number, lateral: number): Vec2 => ({
    x: a.x + dir.x * x + left.x * lateral,
    y: a.y + dir.y * x + left.y * lateral,
  });
  const rightAt = (x: number) =>
    x <= 0 ? outline.startRight : x >= length ? outline.endRight : at(x, -ext.right);
  const leftAt = (x: number) =>
    x <= 0 ? outline.startLeft : x >= length ? outline.endLeft : at(x, ext.left);

  const mesh = new MeshBuilder();
  mesh.group(WALL_GROUP.right, () => {
    for (const { piece: p } of spans) {
      const r0 = rightAt(p.x0);
      const r1 = rightAt(p.x1);
      mesh.quad(r0, baseMm + p.z0, r1, baseMm + p.z0, r1, baseMm + p.z1End, r0, baseMm + p.z1);
    }
  });
  mesh.group(WALL_GROUP.left, () => {
    for (const { piece: p } of spans) {
      const l0 = leftAt(p.x0);
      const l1 = leftAt(p.x1);
      mesh.quad(l1, baseMm + p.z0, l0, baseMm + p.z0, l0, baseMm + p.z1, l1, baseMm + p.z1End);
    }
  });
  mesh.group(WALL_GROUP.caps, () => {
    for (const { piece: p, capStart, capEnd } of spans) {
      const [r0, r1, l0, l1] = [rightAt(p.x0), rightAt(p.x1), leftAt(p.x0), leftAt(p.x1)];
      const [z0, t0, t1] = [baseMm + p.z0, baseMm + p.z1, baseMm + p.z1End];
      if (capStart) mesh.quad(l0, z0, r0, z0, r0, t0, l0, t0);
      if (capEnd) mesh.quad(r1, z0, l1, z0, l1, t1, r1, t1);
      mesh.quad(r0, t0, r1, t1, l1, t1, l0, t0);
      if (p.kind === 'above') mesh.quad(r0, z0, l0, z0, l1, z0, r1, z0);
    }
  });
  return mesh.build();
}

/** A convex prism over a plan polygon from z0 to z1 (mm); the bottom face is omitted. */
export function prismGeometry(polygon: Vec2[], z0: number, z1: number): BufferGeometry {
  const mesh = new MeshBuilder();
  polygon.forEach((p, i) => {
    const q = polygon[(i + 1) % polygon.length] ?? p;
    mesh.quad(p, z0, q, z0, q, z1, p, z1);
  });
  const first = polygon[0];
  if (first) {
    for (let i = 1; i + 1 < polygon.length; i++) {
      const [b, c] = [polygon[i], polygon[i + 1]];
      if (b && c) mesh.tri(first, z1, b, z1, c, z1);
    }
  }
  return mesh.build();
}

const toShapePoints = (ring: Vec2[]) => ring.map((p) => ({ x: p.x / 1000, y: p.y / 1000 }));

function shapeOf(outer: Polygon, holes: Polygon[]): Shape {
  const shape = new Shape();
  toShapePoints(outer).forEach((p, i) => (i === 0 ? shape.moveTo(p.x, p.y) : shape.lineTo(p.x, p.y)));
  for (const hole of holes) {
    const path = new Path();
    toShapePoints(hole).forEach((p, i) => (i === 0 ? path.moveTo(p.x, p.y) : path.lineTo(p.x, p.y)));
    shape.holes.push(path);
  }
  return shape;
}

/** Flat floor surface of a room (in the XY plane; rotate −90° about X to lay it down). */
export function roomFloorGeometry(room: RoomGeometry): ShapeGeometry {
  return new ShapeGeometry(shapeOf(room.polygon, room.holes));
}

/**
 * A floor slab extruded `thicknessMm` upwards from z = 0 in the XY plane; rotate −90° about X and place
 * it so its top is at the floor level. Holes (stair voids) go through the full thickness.
 */
export function slabGeometry(slab: Slab, thicknessMm: number): ExtrudeGeometry {
  return new ExtrudeGeometry(shapeOf(slab.outline, slab.holes), {
    depth: thicknessMm / 1000,
    bevelEnabled: false,
  });
}

/* ---------- Ceiling planes ---------- */

/** Unit normal pointing to the rising side of the plane. */
function risingNormal(plane: CeilingPlane): Vec2 {
  const n = perpLeft(normalize(sub(plane.eave.b, plane.eave.a)));
  return plane.risesToward === 'left' ? n : { x: -n.x, y: -n.y };
}

/**
 * The part of a room polygon covered by a plane and still below the flat ceiling: between the eave line
 * and the line where the plane reaches the flat ceiling height, and inside the plane `extent` (convex).
 * Islands (holes) in the room are ignored. Empty when nothing is left.
 */
export function ceilingPlanePolygon(
  plane: CeilingPlane,
  floor: Floor,
  room: Polygon,
  ceilingSlabMm?: number,
): Polygon {
  const n = risingNormal(plane);
  const base = dot(n, plane.eave.a);
  const reach =
    (flatCeilingHeight(floor, ceilingSlabMm) - plane.kneeHeight) / Math.tan(toRadians(plane.slopeDeg));
  if (reach <= 0) return [];
  let poly = clipHalfPlane(room, { n, c: base });
  poly = clipHalfPlane(poly, { n: { x: -n.x, y: -n.y }, c: -(base + reach) });
  const extent = plane.extent;
  if (extent && extent.length >= 3) {
    const sign = signedArea(extent) >= 0 ? 1 : -1;
    extent.forEach((p, i) => {
      const q = extent[(i + 1) % extent.length] ?? p;
      if (q === p) return;
      const inward = perpLeft(normalize(sub(q, p)));
      const m = { x: inward.x * sign, y: inward.y * sign };
      if (poly.length >= 3) poly = clipHalfPlane(poly, { n: m, c: dot(m, p) });
    });
  }
  return poly.length >= 3 ? poly : [];
}

/** Where plane `q` (applies and) is lower than plane `p`, as a convex region; null when it never is. */
function lowerRegion(p: CeilingPlane, q: CeilingPlane, qEarlier: boolean): HalfPlane[] | null {
  const [np, nq] = [risingNormal(p), risingNormal(q)];
  const [tp, tq] = [Math.tan(toRadians(p.slopeDeg)), Math.tan(toRadians(q.slopeDeg))];
  const [bp, bq] = [dot(np, p.eave.a), dot(nq, q.eave.a)];
  // q is lower where  tq*(nq.x - bq) + kq  <  tp*(np.x - bp) + kp,  i.e. dot(m, x) - c < 0.
  const m = { x: tq * nq.x - tp * np.x, y: tq * nq.y - tp * np.y };
  const c = tq * bq - tp * bp + p.kneeHeight - q.kneeHeight;
  const cover = coverRegion(q);
  if (Math.hypot(m.x, m.y) < 1e-9) {
    // Parallel and equal slope: q is lower everywhere (or tied, where the earlier plane wins).
    return -c < 0 || (-c === 0 && qEarlier) ? cover : null;
  }
  return [...cover, { n: { x: -m.x, y: -m.y }, c: -c }];
}

/**
 * The visible parts of a plane surface over a room: `ceilingPlanePolygon` minus the places where another
 * plane of the floor is lower (the ceiling height is the lowest covering plane), so the surfaces of two
 * planes never pass through each other near a ridge. Returns disjoint pieces.
 */
export function ceilingPlanePieces(
  plane: CeilingPlane,
  floor: Floor,
  room: Polygon,
  ceilingSlabMm?: number,
): Polygon[] {
  let pieces: Polygon[] = [ceilingPlanePolygon(plane, floor, room, ceilingSlabMm)].filter(
    (p) => p.length >= 3,
  );
  const planes = Object.values(floor.ceilingPlanes);
  const self = planes.indexOf(plane);
  planes.forEach((other, i) => {
    if (other === plane) return;
    const region = lowerRegion(plane, other, i < self);
    if (region) pieces = pieces.flatMap((piece) => subtractConvex(piece, region));
  });
  return pieces.filter((p) => p.length >= 3 && Math.abs(signedArea(p)) > 1);
}

/** Triangulated ceiling surface of one plane over a polygon, at `baseMm` + the plane height. */
export function ceilingSurfaceGeometry(
  plane: CeilingPlane,
  polygon: Polygon,
  baseMm: number,
): BufferGeometry {
  const flat = new ShapeGeometry(shapeOf(polygon, []));
  const pos = flat.getAttribute('position');
  const out: number[] = [];
  for (let i = 0; i < pos.count; i++) {
    const p = { x: pos.getX(i) * 1000, y: pos.getY(i) * 1000 };
    out.push(...toThree(p, baseMm + planeHeightAt(plane, p)));
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(out, 3));
  const index = flat.getIndex();
  if (index) geometry.setIndex(Array.from(index.array));
  flat.dispose();
  geometry.computeVertexNormals();
  return geometry;
}
