import type { Building, Floor, FloorLevel, Id, Plot, Project, Scene, Variant } from './types';

export const newId = (): Id => crypto.randomUUID();

const nowIso = (): string => new Date().toISOString();

/** Default floor-to-floor height and slab, typical for a Dutch terraced/semi-detached house. */
const DEFAULT_FLOOR_HEIGHT_MM = 2700;
const DEFAULT_SLAB_MM = 200;

/**
 * Names stored in data are user content, not UI text: callers pass translated defaults (i18n)
 * so a Dutch user does not get English names. The English fallbacks are for tests and tools.
 */
export interface DefaultNames {
  variant?: string;
  building?: string;
}

/** Without a name the UI shows the translated level ("Begane grond" / "Ground floor"). */
export function createFloor(level: FloorLevel, name?: string): Floor {
  return {
    id: newId(),
    ...(name ? { name } : {}),
    level,
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

export function createBuilding(name = 'House'): Building {
  const ground = createFloor('ground');
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

export function createScene(buildingName?: string): Scene {
  const house = createBuilding(buildingName);
  return { plot: createPlot(), buildings: { [house.id]: house } };
}

export function createVariant(name = 'Current layout', scene: Scene = createScene()): Variant {
  return { id: newId(), name, createdAt: nowIso(), scene };
}

export function createProject(name: string, names: DefaultNames = {}): Project {
  const variant = createVariant(names.variant, createScene(names.building));
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
