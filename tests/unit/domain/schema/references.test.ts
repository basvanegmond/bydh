import { describe, expect, it } from 'vitest';
import {
  createFloor,
  createProject,
  floorElevations,
  migrateToCurrent,
  parseProjectFile,
  SCHEMA_VERSION,
  serializeProjectFile,
  toProjectFile,
} from '@/domain/schema';
import type { Project } from '@/domain/schema';

function building(project: Project) {
  const variant = project.variants[project.activeVariantId]!;
  return Object.values(variant.scene.buildings)[0]!;
}

function parse(project: Project) {
  return parseProjectFile(serializeProjectFile(toProjectFile(project)));
}

function issues(project: Project): string {
  const result = parse(project);
  return result.ok ? '' : (result.issues ?? []).join('\n');
}

const wall = (startNodeId: string, endNodeId: string) => ({
  id: 'w',
  startNodeId,
  endNodeId,
  thickness: 100,
  justification: 'center' as const,
  sides: { left: {}, right: {} },
});

describe('reference checks', () => {
  it('accepts a consistent project', () => {
    expect(parse(createProject('ok')).ok).toBe(true);
  });

  it('rejects a wall pointing at a missing node', () => {
    const project = createProject('x');
    const floor = Object.values(building(project).floors)[0]!;
    floor.wallNodes['a'] = { id: 'a', position: { x: 0, y: 0 } };
    floor.walls['w'] = wall('a', 'ghost');
    expect(issues(project)).toContain('missing wall node "ghost"');
  });

  it('rejects an opening on a missing wall', () => {
    const project = createProject('x');
    const floor = Object.values(building(project).floors)[0]!;
    floor.openings['o'] = {
      id: 'o',
      wallId: 'nope',
      offset: 500,
      width: 900,
      height: 2000,
      sillHeight: 0,
      spec: { type: 'window', operation: 'fixed' },
    };
    expect(issues(project)).toContain('openings.o.wallId');
  });

  it('rejects floorOrder mismatches and stairs to missing floors', () => {
    const project = createProject('x');
    const b = building(project);
    const extra = createFloor('first');
    b.floors[extra.id] = extra;
    expect(issues(project)).toContain('missing from floorOrder');
    b.floorOrder.push(extra.id, extra.id);
    expect(issues(project)).toContain('Duplicate floor');
    b.floorOrder = [...Object.keys(b.floors), 'ghost'];
    expect(issues(project)).toContain('missing floor "ghost"');
    b.floorOrder = Object.keys(b.floors);
    b.stairs['s'] = {
      id: 's',
      fromFloorId: b.floorOrder[0]!,
      toFloorId: 'upstairs',
      shape: 'straight',
      position: { x: 0, y: 0 },
      rotationDeg: 0,
      width: 900,
      runLength: 3000,
      steps: 15,
      cutsVoid: true,
    };
    expect(issues(project)).toContain('stairs.s.toFloorId');
  });

  it('requires variantOrder and variants to match both ways', () => {
    const project = createProject('x');
    project.variants['orphan'] = { ...project.variants[project.activeVariantId]!, id: 'orphan' };
    expect(issues(project)).toContain('missing from variantOrder');
    project.variantOrder.push('orphan', 'ghost');
    expect(issues(project)).toContain('missing variant "ghost"');
  });

  it('accepts a window without frameColor', () => {
    const project = createProject('x');
    const floor = Object.values(building(project).floors)[0]!;
    floor.wallNodes['a'] = { id: 'a', position: { x: 0, y: 0 } };
    floor.wallNodes['b'] = { id: 'b', position: { x: 4000, y: 0 } };
    floor.walls['w'] = wall('a', 'b');
    floor.openings['o'] = {
      id: 'o',
      wallId: 'w',
      offset: 500,
      width: 900,
      height: 1200,
      sillHeight: 900,
      spec: { type: 'window', operation: 'fixed' },
    };
    expect(parse(project).ok).toBe(true);
  });
});

describe('floorElevations', () => {
  it('derives elevations from order and heights, ground = 0', () => {
    const project = createProject('x');
    const b = building(project);
    const basement = createFloor('basement');
    const first = createFloor('first');
    b.floors[basement.id] = basement;
    b.floors[first.id] = first;
    const ground = b.floorOrder[0]!;
    b.floorOrder = [basement.id, ground, first.id];
    basement.height = 2400;
    b.floors[ground]!.height = 2700;
    const e = floorElevations(b);
    expect(e[basement.id]).toBe(-2400);
    expect(e[ground]).toBe(0);
    expect(e[first.id]).toBe(2700);
  });
});

type Json = Record<string, unknown>;

/** A frozen v1-shaped file: floors still carry `elevation`. */
function v1File(): Json {
  const file = JSON.parse(serializeProjectFile(toProjectFile(createProject('legacy')))) as Json;
  file['schemaVersion'] = 1;
  const project = file['project'] as Json;
  const variant = Object.values(project['variants'] as Record<string, Json>)[0]!;
  const scene = variant['scene'] as { buildings: Record<string, { floors: Record<string, Json> }> };
  for (const floor of Object.values(Object.values(scene.buildings)[0]!.floors)) floor['elevation'] = 0;
  return file;
}

describe('migration v1 -> v2', () => {
  it('strips stored elevation and yields a valid current file', () => {
    expect(SCHEMA_VERSION).toBe(2);
    const migrated = migrateToCurrent(v1File());
    expect(migrated['schemaVersion']).toBe(2);
    expect(JSON.stringify(migrated)).not.toContain('"elevation"');
    expect(parseProjectFile(JSON.stringify(v1File())).ok).toBe(true);
  });

  it('does not mutate its input', () => {
    const file = v1File();
    const before = JSON.stringify(file);
    migrateToCurrent(file);
    expect(JSON.stringify(file)).toBe(before);
  });

  it('still rejects a v1 file with dangling references after migration', () => {
    const file = v1File();
    (file['project'] as Json)['variantOrder'] = ['ghost'];
    expect(parseProjectFile(JSON.stringify(file))).toMatchObject({ ok: false, reason: 'validation' });
  });
});
