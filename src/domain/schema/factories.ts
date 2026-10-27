import type { Building, Floor, FloorLevel, Id, Plot, Project, Scene, Variant } from './types';

export const newId = (): Id => crypto.randomUUID();

const nowIso = (): string => new Date().toISOString();

/** Default floor-to-floor height and slab, typical for a Dutch terraced/semi-detached house. */
const DEFAULT_FLOOR_HEIGHT_MM = 2700;
const DEFAULT_SLAB_MM = 200;

/** Without a name the UI shows the translated level ("Begane grond" / "Ground floor"). */
export function createFloor(level: FloorLevel, elevation: number, name?: string): Floor {
  return {
    id: newId(),
    ...(name ? { name } : {}),
    level,
    elevation,
    height: DEFAULT_FLOOR_HEIGHT_MM,
    slabThickness: DEFAULT_SLAB_MM,
    wallNodes: {},
    walls: {},
    openings: {},
    rooms: {},
    objects: {},
    plants: {},
    underlays: {},
    dimensions: {},
  };
}

export function createBuilding(name: string): Building {
  const ground = createFloor('ground', 0);
  return {
    id: newId(),
    name,
    kind: 'main',
    position: { x: 0, y: 0 },
    rotationDeg: 0,
    floors: { [ground.id]: ground },
    floorOrder: [ground.id],
    stairs: {},
  };
}

export function createPlot(): Plot {
  return { boundary: [], northDeg: 0, zones: {}, linears: {}, objects: {}, plants: {} };
}

export function createScene(): Scene {
  const house = createBuilding('House');
  return { plot: createPlot(), buildings: { [house.id]: house } };
}

export function createVariant(name: string, scene: Scene = createScene()): Variant {
  return { id: newId(), name, createdAt: nowIso(), scene };
}

export function createProject(name: string): Project {
  const variant = createVariant('Current layout');
  const timestamp = nowIso();
  return {
    id: newId(),
    name,
    createdAt: timestamp,
    updatedAt: timestamp,
    settings: { gridMm: 100, displayUnit: 'm' },
    library: { materials: {}, palettes: {}, catalog: {}, assets: {} },
    variants: { [variant.id]: variant },
    variantOrder: [variant.id],
    activeVariantId: variant.id,
  };
}
