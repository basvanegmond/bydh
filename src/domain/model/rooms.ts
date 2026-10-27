import { newId } from '../schema/factories';
import type { Floor, FloorFinish, Id, Polygon, Room, Vec2 } from '../schema/types';
import {
  area,
  dedupe,
  interiorPoint,
  pointInPolygon,
  pointInPolygonWithHoles,
  signedArea,
} from '../geometry/polygon';
import { angleOf, sub } from '../geometry/vec2';
import { computeWallOutlines } from './outlines';
import type { WallOutline } from './outlines';
import { nodePosition } from './walls';

/** Enclosed spaces smaller than this (mm², 0.25 m²) are gaps between walls, not rooms. */
export const MIN_ROOM_AREA = 250_000;

export const DEFAULT_FLOOR_FINISH: FloorFinish = {
  materialId: 'oak-plank',
  pattern: 'plank',
  module: { length: 1800, width: 190 },
  rotationDeg: 0,
};

interface HalfEdge {
  from: Id;
  to: Id;
  wallId: Id;
}

/** A face of the wall graph. Positive faces are enclosed spaces; negative ones are outer boundaries. */
interface Face {
  edges: HalfEdge[];
  /** Polygon through the node positions (tiles the plane; used to match room anchors). */
  nodeLoop: Polygon;
  /** Polygon along the wall faces (the visible floor area). */
  interior: Polygon;
  signedNodeArea: number;
  /** Connected group of walls this face belongs to. */
  component: Id;
}

export interface RoomFace {
  nodeLoop: Polygon;
  holeLoops: Polygon[];
  polygon: Polygon;
  holes: Polygon[];
  /** Net floor area in mm² (walls and islands excluded). */
  area: number;
}

export interface RoomGeometry extends RoomFace {
  roomId: Id;
  labelPoint: Vec2;
}

function outgoingEdges(floor: Floor): Map<Id, (HalfEdge & { angle: number })[]> {
  const out = new Map<Id, (HalfEdge & { angle: number })[]>();
  const push = (from: Id, to: Id, wallId: Id) => {
    const angle = angleOf(sub(nodePosition(floor, to), nodePosition(floor, from)));
    out.set(from, [...(out.get(from) ?? []), { from, to, wallId, angle }]);
  };
  for (const wall of Object.values(floor.walls)) {
    push(wall.startNodeId, wall.endNodeId, wall.id);
    push(wall.endNodeId, wall.startNodeId, wall.id);
  }
  for (const list of out.values()) list.sort((a, b) => a.angle - b.angle);
  return out;
}

/** The two corners of the wall face that lies to the left of a half-edge. */
function faceSide(edge: HalfEdge, outline: WallOutline, floor: Floor): [Vec2, Vec2] {
  const forward = floor.walls[edge.wallId]!.startNodeId === edge.from;
  return forward ? [outline.startLeft, outline.endLeft] : [outline.endRight, outline.startRight];
}

/** Union-find over nodes: maps every node to a representative of its connected wall group. */
function components(floor: Floor): Map<Id, Id> {
  const parent = new Map<Id, Id>();
  const find = (id: Id): Id => {
    let root = id;
    while (parent.get(root) !== undefined && parent.get(root) !== root) root = parent.get(root)!;
    parent.set(id, root);
    return root;
  };
  for (const id of Object.keys(floor.wallNodes)) parent.set(id, id);
  for (const wall of Object.values(floor.walls)) parent.set(find(wall.startNodeId), find(wall.endNodeId));
  const result = new Map<Id, Id>();
  for (const id of Object.keys(floor.wallNodes)) result.set(id, find(id));
  return result;
}

/** Traces every face by always taking the next edge clockwise, keeping the face on the left. */
function traceFaces(floor: Floor): Face[] {
  const out = outgoingEdges(floor);
  const componentOf = components(floor);
  const outlines = computeWallOutlines(floor);
  const visited = new Set<string>();
  const key = (e: HalfEdge) => `${e.from}>${e.to}>${e.wallId}`;
  const faces: Face[] = [];

  for (const list of out.values()) {
    for (const first of list) {
      if (visited.has(key(first))) continue;
      const edges: HalfEdge[] = [];
      let edge: HalfEdge = first;
      while (!visited.has(key(edge))) {
        visited.add(key(edge));
        edges.push(edge);
        const atTo = out.get(edge.to)!;
        const back = atTo.findIndex((e) => e.to === edge.from && e.wallId === edge.wallId);
        edge = atTo[(back - 1 + atTo.length) % atTo.length]!;
      }
      const nodeLoop = edges.map((e) => nodePosition(floor, e.from));
      const interior = dedupe(
        edges.flatMap((e) => {
          const outline = outlines[e.wallId];
          return outline ? faceSide(e, outline, floor) : [];
        }),
      );
      faces.push({
        edges,
        nodeLoop,
        interior,
        signedNodeArea: signedArea(nodeLoop),
        component: componentOf.get(first.from)!,
      });
    }
  }
  return faces;
}

/** The outer face of each connected wall group: the one with the smallest signed area (0 for a lone wall). */
function outerFacesOf(faces: Face[]): Face[] {
  const outer = new Map<Id, Face>();
  for (const f of faces) {
    const current = outer.get(f.component);
    if (!current || f.signedNodeArea < current.signedNodeArea) outer.set(f.component, f);
  }
  return [...outer.values()];
}

/**
 * Outer boundary (along the outer wall faces, counter-clockwise) of every connected wall group
 * that encloses at least one room. Groups without a closed loop have no boundary. Used for slabs.
 */
export function outerBoundaries(floor: Floor): Polygon[] {
  const faces = traceFaces(floor);
  const outerFaces = outerFacesOf(faces);
  const closed = new Set<Id>(
    faces
      .filter(
        (f) => !outerFaces.includes(f) && f.signedNodeArea > 0 && signedArea(f.interior) > MIN_ROOM_AREA,
      )
      .map((f) => f.component),
  );
  return outerFaces
    .filter((f) => closed.has(f.component) && f.interior.length >= 3)
    .map((f) => (signedArea(f.interior) < 0 ? [...f.interior].reverse() : f.interior));
}

/** Enclosed spaces of a floor, with free-standing wall islands cut out as holes. */
export function detectRoomFaces(floor: Floor): RoomFace[] {
  const faces = traceFaces(floor);
  const outerFaces = outerFacesOf(faces);
  const enclosed = faces.filter(
    (f) => !outerFaces.includes(f) && f.signedNodeArea > 0 && signedArea(f.interior) > MIN_ROOM_AREA,
  );
  const result: (RoomFace & { component: Id })[] = enclosed.map((f) => ({
    component: f.component,
    nodeLoop: f.nodeLoop,
    holeLoops: [],
    polygon: f.interior,
    holes: [],
    area: signedArea(f.interior),
  }));
  // Each connected group of walls has one negative (outer) face. If it sits inside a room of
  // another group, it is an island (e.g. a free-standing cupboard block) and becomes a hole.
  for (const outer of outerFaces) {
    const probe = outer.nodeLoop[0];
    if (!probe) continue;
    const host = result
      .filter((r) => r.component !== outer.component && pointInPolygon(probe, r.nodeLoop))
      .sort((a, b) => area(a.nodeLoop) - area(b.nodeLoop))[0];
    if (!host) continue;
    host.holeLoops.push(outer.nodeLoop);
    host.holes.push(outer.interior);
    host.area -= area(outer.interior);
  }
  return result.map(({ component, ...face }) => face);
}

const faceContains = (face: RoomFace, p: Vec2) => pointInPolygonWithHoles(p, face.nodeLoop, face.holeLoops);

/** Grid sample points inside a room face, used to estimate polygon overlap without clipping. */
function sampleFace(face: RoomFace, n = 24): Vec2[] {
  const xs = face.nodeLoop.map((p) => p.x);
  const ys = face.nodeLoop.map((p) => p.y);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const points: Vec2[] = [];
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const p = { x: x0 + ((i + 0.5) / n) * (x1 - x0), y: y0 + ((j + 0.5) / n) * (y1 - y0) };
      if (faceContains(face, p)) points.push(p);
    }
  }
  return points;
}

/** Pairs previous rooms with new faces by largest overlap; returns faceIndex -> room. */
function matchByOverlap(floor: Floor, faces: RoomFace[], previous: Floor): Map<number, Room> {
  const oldFaces = detectRoomFaces(previous);
  const pairs: { faceIndex: number; room: Room; overlap: number }[] = [];
  for (const room of Object.values(floor.rooms)) {
    const prevRoom = previous.rooms[room.id];
    const oldFace = prevRoom && oldFaces.find((f) => faceContains(f, prevRoom.anchor));
    if (!oldFace) continue;
    const samples = sampleFace(oldFace);
    faces.forEach((face, faceIndex) => {
      const overlap = samples.filter((p) => faceContains(face, p)).length;
      if (overlap > 0) pairs.push({ faceIndex, room, overlap });
    });
  }
  pairs.sort((p, q) => q.overlap - p.overlap);
  const result = new Map<number, Room>();
  const used = new Set<Id>();
  for (const { faceIndex, room } of pairs) {
    if (result.has(faceIndex) || used.has(room.id)) continue;
    result.set(faceIndex, room);
    used.add(room.id);
  }
  return result;
}

/**
 * Keeps floor.rooms in step with the walls: every enclosed space has exactly one room.
 * When `previous` (the floor before the edit) is given, rooms follow the new space that overlaps
 * their old space most, so resizing a room keeps its name and finish. Otherwise, and for leftovers,
 * a room keeps its identity while its anchor stays inside its space; when a wall splits a space,
 * the half without the anchor becomes a new room; when spaces merge, the first room wins; rooms
 * whose space disappeared are removed.
 */
export function syncRooms(
  floor: Floor,
  defaultFinish: FloorFinish = DEFAULT_FLOOR_FINISH,
  previous?: Floor,
): void {
  const faces = detectRoomFaces(floor);
  const byOverlap = previous ? matchByOverlap(floor, faces, previous) : new Map<number, Room>();
  const kept = new Set<Id>([...byOverlap.values()].map((r) => r.id));
  faces.forEach((face, index) => {
    const keeper =
      byOverlap.get(index) ??
      Object.values(floor.rooms).find((r) => !kept.has(r.id) && faceContains(face, r.anchor));
    if (keeper) {
      kept.add(keeper.id);
      if (!pointInPolygonWithHoles(keeper.anchor, face.polygon, face.holes)) {
        keeper.anchor = interiorPoint(face.polygon, face.holes);
      }
      return;
    }
    const room: Room = {
      id: newId(),
      name: '',
      anchor: interiorPoint(face.polygon, face.holes),
      floorFinish: structuredClone(defaultFinish),
    };
    floor.rooms[room.id] = room;
    kept.add(room.id);
  });
  for (const id of Object.keys(floor.rooms)) if (!kept.has(id)) delete floor.rooms[id];
}

/** Geometry for each room of a floor (derived; never stored). */
export function computeRoomGeometry(floor: Floor): Record<Id, RoomGeometry> {
  const faces = detectRoomFaces(floor);
  const result: Record<Id, RoomGeometry> = {};
  for (const room of Object.values(floor.rooms)) {
    const face = faces.find((f) => faceContains(f, room.anchor));
    if (!face) continue;
    result[room.id] = { ...face, roomId: room.id, labelPoint: interiorPoint(face.polygon, face.holes) };
  }
  return result;
}
