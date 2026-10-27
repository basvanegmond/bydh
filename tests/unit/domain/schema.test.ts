import { describe, expect, it } from 'vitest';
import {
  createFloor,
  createProject,
  migrateToCurrent,
  MigrationError,
  parseProjectFile,
  ProjectFileSchema,
  SCHEMA_VERSION,
  serializeProjectFile,
  toProjectFile,
} from '@/domain/schema';
import type { Project } from '@/domain/schema';

function projectWithContent(): Project {
  const project = createProject('Fixture house');
  const variant = project.variants[project.activeVariantId]!;
  const building = Object.values(variant.scene.buildings)[0]!;
  const first = createFloor('first', 2700);
  building.floors[first.id] = first;
  building.floorOrder.push(first.id);
  const ground = building.floors[building.floorOrder[0]!]!;
  ground.wallNodes = {
    a: { id: 'a', position: { x: 0, y: 0 } },
    b: { id: 'b', position: { x: 5620, y: 0 } },
  };
  ground.walls = {
    w1: {
      id: 'w1',
      startNodeId: 'a',
      endNodeId: 'b',
      thickness: 300,
      justification: 'center',
      sides: { left: { color: '#f4f1ea', finish: 'matt' }, right: {} },
    },
  };
  ground.openings = {
    d1: {
      id: 'd1',
      wallId: 'w1',
      offset: 1200,
      width: 930,
      height: 2315,
      sillHeight: 0,
      spec: { type: 'door', operation: 'swing', hinge: 'left', opensTo: 'right' },
    },
  };
  ground.rooms = {
    r1: {
      id: 'r1',
      name: 'Woonkamer',
      anchor: { x: 2800, y: 2500 },
      floorFinish: {
        materialId: 'oak',
        pattern: 'plank',
        module: { length: 1800, width: 190 },
        rotationDeg: 90,
      },
    },
  };
  return project;
}

describe('factories', () => {
  it('create a project that satisfies the schema', () => {
    const file = toProjectFile(createProject('Empty'));
    expect(ProjectFileSchema.safeParse(file).success).toBe(true);
  });

  it('start with one variant, one main building and a ground floor', () => {
    const project = createProject('Empty');
    const variant = project.variants[project.activeVariantId]!;
    const buildings = Object.values(variant.scene.buildings);
    expect(project.variantOrder).toEqual([variant.id]);
    expect(buildings).toHaveLength(1);
    expect(buildings[0]!.kind).toBe('main');
    expect(Object.values(buildings[0]!.floors).map((f) => f.level)).toEqual(['ground']);
  });
});

describe('project file round-trip', () => {
  it('serialises and parses back to a deep-equal project', () => {
    const project = projectWithContent();
    const result = parseProjectFile(serializeProjectFile(toProjectFile(project)));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.file.project).toEqual(project);
  });

  it('reports invalid JSON without throwing', () => {
    expect(parseProjectFile('{not json')).toMatchObject({ ok: false, reason: 'invalid-json' });
  });

  it('reports validation issues with a path', () => {
    const file = toProjectFile(projectWithContent());
    const text = serializeProjectFile(file).replace('"thickness": 300', '"thickness": -1');
    const result = parseProjectFile(text);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('validation');
      expect(result.issues?.some((issue) => issue.includes('walls.w1.thickness'))).toBe(true);
    }
  });

  it('rejects a project whose active variant does not exist', () => {
    const file = toProjectFile(createProject('Broken'));
    file.project.activeVariantId = 'missing';
    expect(parseProjectFile(JSON.stringify(file))).toMatchObject({ ok: false, reason: 'validation' });
  });
});

describe('migrations', () => {
  it('passes a current-version file through untouched', () => {
    const file = { schemaVersion: SCHEMA_VERSION, format: 'bydh-project' };
    expect(migrateToCurrent(file)).toEqual(file);
  });

  it('refuses files from a newer app version', () => {
    expect(() => migrateToCurrent({ schemaVersion: SCHEMA_VERSION + 1 })).toThrow(MigrationError);
    expect(parseProjectFile(JSON.stringify({ schemaVersion: 99 }))).toMatchObject({
      ok: false,
      reason: 'migration',
    });
  });

  it('refuses non-objects and missing versions', () => {
    expect(() => migrateToCurrent([])).toThrow(/JSON object/);
    expect(() => migrateToCurrent({})).toThrow(/schemaVersion/);
  });

  it('applies chained steps in order and stamps each version', () => {
    // A pretend v1 → v2 → v3 chain, migrated to target version 3.
    const steps = {
      1: (f: Record<string, unknown>) => ({ ...f, trail: ['1→2'] }),
      2: (f: Record<string, unknown>) => ({ ...f, trail: [...(f['trail'] as string[]), '2→3'] }),
    };
    expect(migrateToCurrent({ schemaVersion: 1 }, steps, 3)).toEqual({
      schemaVersion: 3,
      trail: ['1→2', '2→3'],
    });
    expect(migrateToCurrent({ schemaVersion: 2, trail: [] }, steps, 3)).toEqual({
      schemaVersion: 3,
      trail: ['2→3'],
    });
  });

  it('fails clearly when a step is missing', () => {
    expect(() => migrateToCurrent({ schemaVersion: 1 }, {}, 2)).toThrow(/No migration from schema 1/);
  });
});
