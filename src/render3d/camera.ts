import { boundingBox, pointInPolygon } from '@/domain/geometry/polygon';
import type { Floor, Polygon, Vec2 } from '@/domain/schema';

/** Pure camera helpers. Plan coordinates are mm; scene coordinates are metres (x = X, y up, z = -Y). */

export type Vec3 = [number, number, number];
export interface CameraPose {
  position: Vec3;
  target: Vec3;
}
export interface PlanBox {
  min: Vec2;
  max: Vec2;
}

export const EYE_HEIGHT_M = 1.6;
export const CUT_HEIGHT_M = 0.3;
const ELEVATION_DEG = 50;
const FOV_DEG = 45;
/** Distance in metres of the look-at point in front of the eye in inside view. */
export const INSIDE_STEP_M = 0.1;

/** Orbit camera that frames a plan bounding box from about 50 degrees above the horizon, from the south-east. */
export function frameBox(box: PlanBox | null, elevationMm: number, heightM = 2.6): CameraPose {
  const w = box ? (box.max.x - box.min.x) / 1000 : 8;
  const d = box ? (box.max.y - box.min.y) / 1000 : 8;
  const cx = box ? (box.min.x + box.max.x) / 2000 : 0;
  const cz = box ? -(box.min.y + box.max.y) / 2000 : 0;
  const ty = elevationMm / 1000 + heightM / 2;
  const radius = Math.max(3, Math.hypot(w, d, heightM) / 2);
  const distance = Math.min(140, (radius / Math.sin((FOV_DEG / 2) * (Math.PI / 180))) * 0.95);
  const el = ELEVATION_DEG * (Math.PI / 180);
  const az = Math.atan2(0.6, 0.8);
  return {
    target: [cx, ty, cz],
    position: [
      cx + distance * Math.cos(el) * Math.sin(az),
      ty + distance * Math.sin(el),
      cz + distance * Math.cos(el) * Math.cos(az),
    ],
  };
}

/** Eye pose at the given plan point, looking horizontally along `dir` (plan direction, unit). */
export function eyePose(point: Vec2, elevationMm: number, dir: Vec2): CameraPose {
  const y = elevationMm / 1000 + EYE_HEIGHT_M;
  const x = point.x / 1000;
  const z = -point.y / 1000;
  return {
    position: [x, y, z],
    target: [x + dir.x * INSIDE_STEP_M, y, z - dir.y * INSIDE_STEP_M],
  };
}

/** Longest axis of a polygon's bounding box as a unit plan direction (east or north). */
export function longestAxis(polygon: Polygon): Vec2 {
  const xs = polygon.map((p) => p.x);
  const ys = polygon.map((p) => p.y);
  const w = Math.max(...xs) - Math.min(...xs);
  const h = Math.max(...ys) - Math.min(...ys);
  return w >= h ? { x: 1, y: 0 } : { x: 0, y: 1 };
}

export interface RoomLike {
  roomId: string;
  area: number;
  labelPoint: Vec2;
  polygon: Polygon;
}

/** The selected room, else the largest one; null when the floor has no rooms. */
export function pickRoom<T extends RoomLike>(rooms: T[], selectedId: string | null): T | null {
  const selected = rooms.find((r) => r.roomId === selectedId);
  if (selected) return selected;
  return rooms.reduce<T | null>((best, r) => (best && best.area >= r.area ? best : r), null);
}

/**
 * Eye pose in a room: on the longest axis, a third of the way back from the centre so most of the room
 * is ahead (the centre, then the label point, when that falls outside), looking along that axis.
 */
export function roomEyePose(room: RoomLike, elevationMm: number): CameraPose {
  const dir = longestAxis(room.polygon);
  const box = boundingBox(room.polygon);
  if (!box) return eyePose(room.labelPoint, elevationMm, dir);
  const centre = { x: (box.min.x + box.max.x) / 2, y: (box.min.y + box.max.y) / 2 };
  const length = dir.x ? box.max.x - box.min.x : box.max.y - box.min.y;
  const back = { x: centre.x - dir.x * length * 0.3, y: centre.y - dir.y * length * 0.3 };
  const point = [back, centre].find((p) => pointInPolygon(p, room.polygon)) ?? room.labelPoint;
  return eyePose(point, elevationMm, dir);
}

export interface WallFacing {
  a: Vec2;
  b: Vec2;
  /** Centre of the building (plan, mm). */
  centre: Vec2;
  /** Orbit target in plan coordinates (mm). */
  target: Vec2;
  /** Camera in plan coordinates (mm). */
  camera: Vec2;
}

/**
 * True when the wall is between the camera and the target and its outward side faces the camera, so it
 * hides the interior and should be cut away. The outward side is the one pointing away from the centre.
 */
export function isWallCut({ a, b, centre, target, camera }: WallFacing): boolean {
  const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  let nx = -(b.y - a.y);
  let ny = b.x - a.x;
  if (nx * (mid.x - centre.x) + ny * (mid.y - centre.y) < 0) {
    nx = -nx;
    ny = -ny;
  }
  const facing = nx * (camera.x - mid.x) + ny * (camera.y - mid.y) > 0;
  const camSide = (mid.x - target.x) * (camera.x - target.x) + (mid.y - target.y) * (camera.y - target.y) > 0;
  return facing && camSide;
}

/** Scale applied to a wall's height (about its base) to bring its top down to the cut height. */
export function cutScale(wallHeightM: number): number {
  return Math.min(1, CUT_HEIGHT_M / Math.max(0.1, wallHeightM));
}

/** Moves a pose horizontally along its viewing direction (or sideways when `strafe`), by `step` metres. */
export function walk(pose: CameraPose, step: number, strafe = false): CameraPose {
  let dx = pose.target[0] - pose.position[0];
  let dz = pose.target[2] - pose.position[2];
  const len = Math.hypot(dx, dz);
  if (len < 1e-9) return pose;
  dx /= len;
  dz /= len;
  if (strafe) [dx, dz] = [-dz, dx];
  const move: Vec3 = [dx * step, 0, dz * step];
  return {
    position: [pose.position[0] + move[0], pose.position[1], pose.position[2] + move[2]],
    target: [pose.target[0] + move[0], pose.target[1], pose.target[2] + move[2]],
  };
}

/** Plan bounding box (mm) of a floor's wall nodes; null when it has none. */
export function floorBox(floor: Floor | null | undefined): PlanBox | null {
  return floor ? boundingBox(Object.values(floor.wallNodes).map((n) => n.position)) : null;
}
