import { z } from 'zod';
import { interiorPoint, pointInPolygonWithHoles, area } from '../geometry/polygon';
import { closestPointOnSegment } from '../geometry/segment';
import { cross, distance, dot, normalize, perpLeft, sub } from '../geometry/vec2';
import { addFloor } from '../model/floors';
import { DEFAULT_DOOR, DEFAULT_WINDOW } from '../model/openings';
import type { OpeningSpec } from '../model/openings';
import { mainBuilding, orderedFloors } from '../model/project';
import { computeRoomGeometry, DEFAULT_FLOOR_FINISH, syncRooms } from '../model/rooms';
import { createStair } from '../model/stairPlacement';
import { defaultStepCount, stairDimensions } from '../model/stairs';
import { normalizeFloor } from '../model/normalize';
import { addWall, wallEnds, wallLength, wallsAtNode } from '../model/walls';
import { createProject, newId } from '../schema/factories';
import type {
  DoorSpec,
  Floor,
  FloorFinish,
  FloorLevel,
  Material,
  Opening,
  Polygon,
  Project,
  Vec2,
} from '../schema/types';
import { deriveWallSegments } from './artifactWalls';
import type { ShellRect, WallSegment } from './artifactWalls';

/*
 * Converter for the "floorplan data schema 1.0.0" JSON exported by an earlier planner prototype.
 * Input units are metres with plan x east and y SOUTH (down); BYDH uses millimetres with +Y NORTH,
 * so every y is negated. Only the house levels g / e1 / e2 are converted; see ConversionReport.skipped.
 */

/* ---------- input ---------- */

const Num = z.number().finite();
const RectSchema = z.object({ x0: Num, y0: Num, x1: Num, y1: Num });
const Orientation = z.enum(['north-south', 'east-west']);

export const ArtifactFloorplanSchema = z.object({
  schemaVersion: z.string(),
  rooms: z.array(
    z.object({
      id: z.string(),
      level: z.string(),
      name: z.string(),
      kind: z.string(),
      polygons: z.array(z.array(z.tuple([Num, Num]))),
      walls: z.boolean(),
      default_colors: z.object({ floor: z.string().optional(), wall: z.string().optional() }).optional(),
    }),
  ),
  fixed_elements: z.array(
    z.object({
      id: z.string().optional(),
      level: z.string(),
      kind: z.string(),
      name: z.string().optional(),
      rect: RectSchema,
      stair_steps: z.string().nullish(),
    }),
  ),
  doors: z.array(
    z.object({
      id: z.string(),
      level: z.string(),
      wall_orientation: Orientation,
      wall_coordinate: Num,
      start_along_wall: Num,
      width_m: Num,
      hinge: z.enum(['a', 'b']),
      swing_direction: z.union([z.literal(1), z.literal(-1)]),
      type: z.string(),
    }),
  ),
  windows: z.array(
    z.object({
      id: z.string(),
      level: z.string(),
      wall_orientation: Orientation,
      wall_coordinate: Num,
      start_along_wall: Num,
      width_m: Num,
    }),
  ),
  sloped_roof_zones: z.array(z.object({ id: z.string(), level: z.string(), max_height_m: Num })).default([]),
  wall_shell_rects: z.record(z.string(), z.array(z.tuple([Num, Num, Num, Num]))),
});

export type ArtifactFloorplan = z.infer<typeof ArtifactFloorplanSchema>;

/* ---------- report ---------- */

export interface FloorReport {
  levelId: string;
  name: string;
  walls: number;
  inputRooms: number;
  inputPolygons: number;
  detectedRooms: number;
  matchedPolygons: number;
  unmatchedPolygons: string[];
  extraRooms: string[];
  doorsInput: number;
  doorsPlaced: number;
  windowsInput: number;
  windowsPlaced: number;
  stairs: number;
  skippedOpenings: string[];
  warnings: string[];
}

export interface ConversionReport {
  floors: FloorReport[];
  skipped: string[];
}

export interface ConversionResult {
  project: Project;
  report: ConversionReport;
}

/* ---------- levels ---------- */

interface LevelPlan {
  id: string;
  level: FloorLevel;
  name: string;
}

const LEVELS: LevelPlan[] = [
  { id: 'g', level: 'ground', name: 'Begane grond' },
  { id: 'e1', level: 'first', name: '1e verdieping' },
  { id: 'e2', level: 'second', name: '2e verdieping' },
];

const FLOOR_HEIGHT_MM = 2600;
const SLAB_MM = 200;
/** Wall ends and node merges closer than this are the same point (mm). */
const NODE_TOLERANCE_MM = 25;
/** An opening further than this from a wall of matching direction is not placed (mm). */
const OPENING_WALL_TOLERANCE_MM = 150;
const GRID_MM = 10;
/** A hanging wall end within this distance of another wall is joined to it (mm). */
const DANGLING_REACH_MM = 200;

/* ---------- coordinates ---------- */

const toMm = (metres: number): number => Math.round((metres * 1000) / GRID_MM) * GRID_MM + 0;

/** Artifact plan point (metres, y south) to BYDH plan point (mm, y north), snapped to the grid. */
export function toPlanPoint(x: number, ySouth: number): Vec2 {
  return { x: toMm(x), y: toMm(-ySouth) };
}

function shellRect([x0, y0, x1, y1]: [number, number, number, number]): ShellRect {
  const a = toPlanPoint(x0, y0);
  const b = toPlanPoint(x1, y1);
  return { x0: Math.min(a.x, b.x), x1: Math.max(a.x, b.x), y0: Math.min(a.y, b.y), y1: Math.max(a.y, b.y) };
}

/* ---------- floor finishes and wall colours ---------- */

const HEX = /^#[0-9a-fA-F]{6}$/;

function floorMaterialFor(kind: string, color: string): { material: Material; finish: FloorFinish } {
  const tiled = kind === 'bath';
  const seamless = kind === 'storage';
  const materialKind: Material['kind'] = tiled ? 'tile' : seamless ? 'concrete' : 'wood';
  const id = `import-floor-${materialKind}-${color.slice(1).toLowerCase()}`;
  const material: Material = {
    id,
    name: `${tiled ? 'Tegels' : seamless ? 'Gietvloer' : 'Vloer'} ${color.toLowerCase()}`,
    kind: materialKind,
    color: color.toLowerCase(),
    finish: 'matt',
  };
  const finish: FloorFinish = tiled
    ? { materialId: id, pattern: 'tile', module: { length: 600, width: 600 }, rotationDeg: 0 }
    : seamless
      ? { materialId: id, pattern: 'seamless', rotationDeg: 0 }
      : { materialId: id, pattern: 'plank', module: { length: 1800, width: 190 }, rotationDeg: 0 };
  return { material, finish };
}

/* ---------- openings ---------- */

/** Door operation for an artifact door type. */
export function doorOperation(type: string): DoorSpec['operation'] {
  if (type === 'double') return 'double-swing';
  if (type === 'slide') return 'sliding';
  return 'swing';
}

interface ArtifactOpening {
  wall_orientation: 'north-south' | 'east-west';
  wall_coordinate: number;
  start_along_wall: number;
  width_m: number;
}

interface OpeningFrame {
  start: Vec2;
  centre: Vec2;
  end: Vec2;
}

/** Start end, centre and end of an opening in BYDH plan space, and the wall axis it lies on. */
function openingFrame(o: ArtifactOpening): OpeningFrame {
  // Not snapped to the grid: the centre decides the offset along the wall.
  const exact = (along: number): Vec2 =>
    o.wall_orientation === 'north-south'
      ? { x: o.wall_coordinate * 1000, y: -along * 1000 }
      : { x: along * 1000, y: -o.wall_coordinate * 1000 };
  return {
    start: exact(o.start_along_wall),
    centre: exact(o.start_along_wall + o.width_m / 2),
    end: exact(o.start_along_wall + o.width_m),
  };
}

interface WallMatch {
  wallId: string;
  offset: number;
  length: number;
  dir: Vec2;
}

function findWall(floor: Floor, centre: Vec2, vertical: boolean): WallMatch | null {
  let best: (WallMatch & { d: number }) | null = null;
  for (const wall of Object.values(floor.walls)) {
    const { a, b } = wallEnds(floor, wall);
    const dir = normalize(sub(b, a));
    const axis: Vec2 = vertical ? { x: 0, y: 1 } : { x: 1, y: 0 };
    if (Math.abs(cross(dir, axis)) > 0.17) continue;
    const { point, t } = closestPointOnSegment(centre, a, b);
    const d = distance(point, centre);
    const len = wallLength(floor, wall);
    if (d <= OPENING_WALL_TOLERANCE_MM && (!best || d < best.d))
      best = { wallId: wall.id, offset: t * len, length: len, dir, d };
  }
  return best;
}

function overlapsExisting(floor: Floor, wallId: string, offset: number, width: number): boolean {
  return Object.values(floor.openings).some(
    (o) => o.wallId === wallId && Math.abs(o.offset - offset) < (o.width + width) / 2,
  );
}

/**
 * Hinge and swing side of an artifact door on a BYDH wall. Artifact: hinge 'a' is the end with the
 * lower along-wall coordinate (north end of a north-south wall, west end of an east-west wall);
 * swing_direction 1 swings to the larger perpendicular coordinate (east, or south), -1 the other way.
 * BYDH: hinge 'left' is at the wall's start end; opensTo 'left' swings to the left of the wall
 * direction. The y flip is handled by working with BYDH world vectors.
 */
export function doorHingeAndSide(
  o: Pick<ArtifactOpening, 'wall_orientation'> & { hinge: 'a' | 'b'; swing_direction: 1 | -1 },
  frame: OpeningFrame,
  wallDir: Vec2,
): { hinge: 'left' | 'right'; opensTo: 'left' | 'right' } {
  const hingePoint = o.hinge === 'a' ? frame.start : frame.end;
  const hinge = dot(sub(hingePoint, frame.centre), wallDir) < 0 ? 'left' : 'right';
  const swing: Vec2 =
    o.wall_orientation === 'north-south' ? { x: o.swing_direction, y: 0 } : { x: 0, y: -o.swing_direction };
  const opensTo = dot(perpLeft(wallDir), swing) > 0 ? 'left' : 'right';
  return { hinge, opensTo };
}

function placeOpenings(floor: Floor, levelId: string, input: ArtifactFloorplan, report: FloorReport): void {
  const doors = input.doors.filter((d) => d.level === levelId);
  const windows = input.windows.filter((w) => w.level === levelId);
  report.doorsInput = doors.length;
  report.windowsInput = windows.length;
  const place = (
    id: string,
    o: ArtifactOpening,
    base: OpeningSpec,
    makeSpec: (m: WallMatch, f: OpeningFrame) => Opening['spec'],
  ): boolean => {
    const skip = (why: string): false => {
      report.skippedOpenings.push(`${id}: ${why}`);
      return false;
    };
    const frame = openingFrame(o);
    const match = findWall(floor, frame.centre, o.wall_orientation === 'north-south');
    const width = Math.round(o.width_m * 1000);
    if (!match) return skip(`no wall within ${OPENING_WALL_TOLERANCE_MM} mm`);
    if (match.length < width) return skip('wall piece too short');
    const offset = Math.min(Math.max(match.offset, width / 2), match.length - width / 2);
    if (overlapsExisting(floor, match.wallId, offset, width)) return skip('overlaps another opening');
    const opening: Opening = {
      id: newId(),
      wallId: match.wallId,
      offset,
      width,
      height: base.height,
      sillHeight: base.sillHeight,
      spec: makeSpec(match, frame),
    };
    floor.openings[opening.id] = opening;
    return true;
  };
  for (const d of doors) {
    const spec = (m: WallMatch, f: OpeningFrame): Opening['spec'] => ({
      type: 'door',
      operation: doorOperation(d.type),
      ...doorHingeAndSide(d, f, m.dir),
    });
    if (place(d.id, d, DEFAULT_DOOR, spec)) report.doorsPlaced++;
  }
  for (const w of windows) {
    if (place(w.id, w, DEFAULT_WINDOW, () => ({ ...DEFAULT_WINDOW.spec }))) report.windowsPlaced++;
  }
}

/* ---------- walls and rooms ---------- */

interface PolyOwner {
  roomId: string;
  name: string;
  kind: string;
  floorColor?: string;
  wallColor?: string;
}

function collectPolygons(
  input: ArtifactFloorplan,
  levelId: string,
): { polygons: Polygon[]; owners: PolyOwner[] } {
  const polygons: Polygon[] = [];
  const owners: PolyOwner[] = [];
  for (const room of input.rooms) {
    if (room.level !== levelId || !room.walls) continue;
    for (const ring of room.polygons) {
      polygons.push(ring.map(([x, y]) => toPlanPoint(x, y)));
      owners.push({
        roomId: room.id,
        name: room.name,
        kind: room.kind,
        ...(room.default_colors?.floor ? { floorColor: room.default_colors.floor } : {}),
        ...(room.default_colors?.wall ? { wallColor: room.default_colors.wall } : {}),
      });
    }
  }
  return { polygons, owners };
}

/** Polygons of one input room share a group: no wall is drawn between them. */
function groupsOf(owners: PolyOwner[]): number[] {
  const ids = [...new Set(owners.map((o) => o.roomId))];
  return owners.map((o) => ids.indexOf(o.roomId));
}

function wallSides(seg: WallSegment, owners: PolyOwner[]) {
  const colorOf = (poly?: number) => {
    const c = poly === undefined ? undefined : owners[poly]?.wallColor;
    return c && HEX.test(c) ? { color: c.toLowerCase() } : {};
  };
  return { left: colorOf(seg.leftPoly), right: colorOf(seg.rightPoly) };
}

function drawWalls(floor: Floor, segments: WallSegment[], owners: PolyOwner[]): void {
  for (const seg of segments) {
    const thickness = Math.max(50, Math.round(seg.thickness / 5) * 5);
    addWall(
      floor,
      seg.a,
      seg.b,
      { thickness, justification: 'center', sides: wallSides(seg, owners) },
      NODE_TOLERANCE_MM,
    );
  }
  normalizeFloor(floor, NODE_TOLERANCE_MM);
  repairDanglingEnds(floor);
  normalizeFloor(floor, NODE_TOLERANCE_MM);
}

/**
 * Walls of neighbouring rooms can jog a few centimetres, leaving a wall end hanging next to another
 * wall. Such an end is joined to the closest point of a nearby wall so rooms stay enclosed.
 */
export function repairDanglingEnds(floor: Floor, reachMm: number = DANGLING_REACH_MM): void {
  for (const node of Object.values(floor.wallNodes)) {
    const own = wallsAtNode(floor, node.id);
    if (own.length !== 1) continue;
    let best: { point: Vec2; d: number } | null = null;
    for (const wall of Object.values(floor.walls)) {
      if (wall.id === own[0]!.id) continue;
      const { a, b } = wallEnds(floor, wall);
      const { point } = closestPointOnSegment(node.position, a, b);
      const d = distance(point, node.position);
      if (d > NODE_TOLERANCE_MM && d <= reachMm && (!best || d < best.d)) best = { point, d };
    }
    if (best) {
      const props = { thickness: own[0]!.thickness, justification: 'center' as const };
      addWall(floor, node.position, best.point, props, NODE_TOLERANCE_MM);
    }
  }
}

function nameAndFinishRooms(
  floor: Floor,
  project: Project,
  polygons: Polygon[],
  owners: PolyOwner[],
  report: FloorReport,
): void {
  const geometry = computeRoomGeometry(floor);
  const matched = new Set<string>();
  polygons.forEach((polygon, i) => {
    const owner = owners[i]!;
    const probe = interiorPoint(polygon);
    const hit = Object.values(geometry).find((g) => pointInPolygonWithHoles(probe, g.polygon, g.holes));
    const room = hit ? floor.rooms[hit.roomId] : undefined;
    if (!room) {
      report.unmatchedPolygons.push(`${owner.name} (${owner.roomId})`);
      return;
    }
    report.matchedPolygons++;
    matched.add(room.id);
    if (!room.name) room.name = owner.name;
    else if (!room.name.split(' / ').includes(owner.name)) room.name += ` / ${owner.name}`;
    if (owner.floorColor && HEX.test(owner.floorColor)) {
      const { material, finish } = floorMaterialFor(owner.kind, owner.floorColor);
      project.library.materials[material.id] = material;
      room.floorFinish = finish;
    }
  });
  for (const g of Object.values(geometry)) {
    if (!matched.has(g.roomId)) report.extraRooms.push(`${(area(g.polygon) / 1e6).toFixed(2)} m2 unnamed`);
  }
}

/* ---------- stairs ---------- */

const STAIR_DIRECTION_DEG: Record<string, number> = { e: 0, n: 90, w: 180, s: 270 };

function addStairs(
  project: Project,
  floor: Floor,
  toFloorId: string | undefined,
  levelId: string,
  input: ArtifactFloorplan,
  report: FloorReport,
): void {
  const building = mainBuilding(project)!;
  for (const el of input.fixed_elements) {
    if (el.level !== levelId || el.kind !== 'stairs') continue;
    if (!toFloorId) {
      report.warnings.push('stairs on the top floor skipped');
      continue;
    }
    const rotationDeg = STAIR_DIRECTION_DEG[el.stair_steps ?? 'e'] ?? 0;
    const p0 = toPlanPoint(el.rect.x0, el.rect.y0);
    const p1 = toPlanPoint(el.rect.x1, el.rect.y1);
    const box = {
      x0: Math.min(p0.x, p1.x),
      x1: Math.max(p0.x, p1.x),
      y0: Math.min(p0.y, p1.y),
      y1: Math.max(p0.y, p1.y),
    };
    const horizontal = rotationDeg === 0 || rotationDeg === 180;
    const midX = (box.x0 + box.x1) / 2;
    const midY = (box.y0 + box.y1) / 2;
    const position: Vec2 =
      rotationDeg === 0
        ? { x: box.x0, y: midY }
        : rotationDeg === 180
          ? { x: box.x1, y: midY }
          : rotationDeg === 90
            ? { x: midX, y: box.y0 }
            : { x: midX, y: box.y1 };
    const stair = createStair(floor, toFloorId, position, rotationDeg);
    stair.width = horizontal ? box.y1 - box.y0 : box.x1 - box.x0;
    stair.runLength = horizontal ? box.x1 - box.x0 : box.y1 - box.y0;
    stair.steps = defaultStepCount(floor.height);
    building.stairs[stair.id] = stair;
    report.stairs++;
    const warnings = stairDimensions(stair, floor.height).warnings;
    if (warnings.length)
      report.warnings.push(
        `stair "${el.name ?? 'stair'}": ${warnings.join(', ')} (rect is ${stair.runLength} mm long)`,
      );
  }
}

/* ---------- conversion ---------- */

function emptyReport(plan: LevelPlan): FloorReport {
  return {
    levelId: plan.id,
    name: plan.name,
    walls: 0,
    inputRooms: 0,
    inputPolygons: 0,
    detectedRooms: 0,
    matchedPolygons: 0,
    unmatchedPolygons: [],
    extraRooms: [],
    doorsInput: 0,
    doorsPlaced: 0,
    windowsInput: 0,
    windowsPlaced: 0,
    stairs: 0,
    skippedOpenings: [],
    warnings: [],
  };
}

function convertFloor(
  project: Project,
  floor: Floor,
  plan: LevelPlan,
  input: ArtifactFloorplan,
): FloorReport {
  const report = emptyReport(plan);
  const { polygons, owners } = collectPolygons(input, plan.id);
  report.inputRooms = input.rooms.filter((r) => r.level === plan.id).length;
  report.inputPolygons = polygons.length;
  const shells = (input.wall_shell_rects[plan.id] ?? []).map(shellRect);
  drawWalls(floor, deriveWallSegments(polygons, shells, {}, groupsOf(owners)), owners);
  placeOpenings(floor, plan.id, input, report);
  syncRooms(floor, DEFAULT_FLOOR_FINISH);
  nameAndFinishRooms(floor, project, polygons, owners, report);
  report.walls = Object.keys(floor.walls).length;
  report.detectedRooms = Object.keys(floor.rooms).length;
  return report;
}

function skippedList(input: ArtifactFloorplan): string[] {
  const roofs = input.sloped_roof_zones.filter((z) => z.level === 'e2').length;
  const voids = input.fixed_elements.filter((e) => e.kind === 'void').length;
  const fixed = input.fixed_elements.filter(
    (e) => e.kind !== 'stairs' && e.kind !== 'void' && e.kind !== 'house',
  ).length;
  return [
    `${input.rooms.filter((r) => r.level === 't').length} garden rooms and the plot (level t)`,
    `${fixed} fixed elements (kitchen, sanitary, appliances, storage): furniture phase`,
    `${roofs} sloped roof zones on e2: model with ceiling planes in the app`,
    `${voids} stairwell void element(s): the stair cuts its own slab opening`,
    'furniture catalogue, colour palettes, default furniture layout, parcel, backdrop',
  ];
}

/** Converts a validated artifact floorplan into a BYDH project plus a report of what was (not) mapped. */
export function convertArtifactFloorplan(input: ArtifactFloorplan, projectName: string): ConversionResult {
  const project = createProject(projectName, { variant: 'Huidige indeling', building: 'Woning' });
  const building = mainBuilding(project)!;
  const ids = [building.floorOrder[0]!];
  for (let i = 1; i < LEVELS.length; i++)
    ids.push(addFloor(building, 'above', { height: FLOOR_HEIGHT_MM, slabThickness: SLAB_MM }));
  const floors = orderedFloors(project);
  floors.forEach((floor, i) => {
    const plan = LEVELS[i]!;
    floor.name = plan.name;
    floor.level = plan.level;
    floor.height = FLOOR_HEIGHT_MM;
    floor.slabThickness = SLAB_MM;
  });
  const reports = LEVELS.map((plan, i) => convertFloor(project, floors[i]!, plan, input));
  LEVELS.forEach((plan, i) => addStairs(project, floors[i]!, ids[i + 1], plan.id, input, reports[i]!));
  return { project, report: { floors: reports, skipped: skippedList(input) } };
}

/** Human-readable summary of a conversion. */
export function formatReport(report: ConversionReport): string {
  const lines: string[] = [];
  for (const f of report.floors) {
    lines.push(`${f.name} (${f.levelId})`);
    lines.push(
      `  walls ${f.walls}; rooms detected ${f.detectedRooms} vs input ${f.inputRooms} rooms / ${f.inputPolygons} polygons (matched ${f.matchedPolygons})`,
    );
    lines.push(
      `  doors ${f.doorsPlaced}/${f.doorsInput}; windows ${f.windowsPlaced}/${f.windowsInput}; stairs ${f.stairs}`,
    );
    for (const m of f.unmatchedPolygons) lines.push(`  NOT DETECTED as room: ${m}`);
    for (const m of f.extraRooms) lines.push(`  extra detected room: ${m}`);
    for (const m of f.skippedOpenings) lines.push(`  skipped opening ${m}`);
    for (const m of f.warnings) lines.push(`  warning: ${m}`);
  }
  lines.push('Not converted:');
  for (const s of report.skipped) lines.push(`  - ${s}`);
  return lines.join('\n');
}
