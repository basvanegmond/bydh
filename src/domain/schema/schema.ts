import { z } from 'zod';

/**
 * Scene graph, schema version 3 (v2: floor elevation is derived, see floorElevations(); v3: sloped
 * ceiling planes on floors).
 * Zod schemas are the source of truth; TypeScript types are inferred.
 * Plan space: +X = east, +Y = north, millimetres, degrees counter-clockwise from +X.
 * three.js mapping: x = X/1000, y = elevation/1000, z = -Y/1000 (metres, Y-up).
 * Derived data (wall outlines, room polygons and areas, slab voids) is never stored.
 */
export const SCHEMA_VERSION = 3;

const id = z.string().min(1);
const mm = z.number().finite();
const deg = z.number().finite();
const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const isoDateTime = z.string().min(1);
const record = <T extends z.ZodType>(value: T) => z.record(z.string(), value);

export const Vec2Schema = z.object({ x: mm, y: mm });
/** Counter-clockwise, implicitly closed. */
export const PolygonSchema = z.array(Vec2Schema);
const SizeSchema = z.object({ w: mm, d: mm, h: mm });
const LocalizedSchema = z.object({ en: z.string(), nl: z.string() });

const entityBase = {
  id,
  name: z.string().optional(),
  locked: z.boolean().optional(),
  hidden: z.boolean().optional(),
};

export const SurfaceFinishSchema = z.object({
  materialId: id.optional(),
  color: hex.optional(),
  finish: z.enum(['matt', 'satin', 'gloss']).optional(),
});

/* ---------- Plot ---------- */
export const ZoneSchema = z.object({
  ...entityBase,
  kind: z.enum([
    'terrace',
    'path',
    'lawn',
    'decking',
    'paving',
    'gravel',
    'bed',
    'raised-bed',
    'pond',
    'driveway',
  ]),
  polygon: PolygonSchema,
  elevation: mm,
  height: mm.optional(),
  finish: SurfaceFinishSchema,
});

export const LinearElementSchema = z.object({
  ...entityBase,
  kind: z.enum(['fence', 'hedge', 'garden-wall', 'edging']),
  points: z.array(Vec2Schema),
  height: mm,
  thickness: mm,
  finish: SurfaceFinishSchema.optional(),
  speciesId: id.optional(),
});

/* ---------- Placed things ---------- */
export const ObjectCategorySchema = z.enum([
  'seating',
  'table',
  'bed',
  'storage',
  'kitchen',
  'appliance',
  'lighting',
  'rug',
  'decor',
  'sanitary',
  'radiator',
  'fireplace',
  'column',
  'electrical',
  'garden',
  'placeholder',
]);

export const PlacedObjectSchema = z.object({
  ...entityBase,
  catalogId: id,
  category: ObjectCategorySchema,
  position: Vec2Schema,
  elevation: mm,
  rotationDeg: deg,
  /** True dimensions; the mesh is scaled from the catalogue base size. */
  size: SizeSchema,
  mirrored: z.boolean(),
  /** Fixed installation: kitchen block, sanitary, radiator, column. */
  fixed: z.boolean(),
  host: z.object({ kind: z.enum(['wall', 'object']), id }).optional(),
  optionId: z.string().optional(),
  finishes: record(SurfaceFinishSchema).optional(),
  label: z.string().optional(),
  priceCents: z.number().int().nonnegative().optional(),
});

export const PlantInstanceSchema = z.object({
  ...entityBase,
  speciesId: id,
  position: Vec2Schema,
  elevation: mm.optional(),
  host: z.object({ kind: z.literal('object'), id }).optional(),
  /** 0–1 of mature size; the growth slider is view state. */
  sizeAtPlanting: z.number().min(0).max(1),
});

export const PlotSchema = z.object({
  /** Kavel / erfgrens; empty until drawn. */
  boundary: PolygonSchema,
  /** Bouwvlak. */
  buildableArea: PolygonSchema.optional(),
  /** Bearing of true north, counter-clockwise from +Y. */
  northDeg: deg,
  /** RD New anchor for a later PDOK/Kadaster import. */
  geoAnchor: z
    .object({ crs: z.literal('EPSG:28992'), x: z.number(), y: z.number(), rotationDeg: deg })
    .optional(),
  zones: record(ZoneSchema),
  linears: record(LinearElementSchema),
  objects: record(PlacedObjectSchema),
  plants: record(PlantInstanceSchema),
});

/* ---------- Building & floors ---------- */
export const WallNodeSchema = z.object({ id, position: Vec2Schema });

export const WallSchema = z.object({
  ...entityBase,
  startNodeId: id,
  endNodeId: id,
  thickness: mm.positive(),
  /** Defaults to the floor height. */
  height: mm.positive().optional(),
  /** Which face sits on the node line, looking from start to end. */
  justification: z.enum(['center', 'left', 'right']),
  structural: z.boolean().optional(),
  sides: z.object({ left: SurfaceFinishSchema, right: SurfaceFinishSchema }),
});

export const DoorSpecSchema = z.object({
  type: z.literal('door'),
  operation: z.enum(['swing', 'double-swing', 'sliding', 'pocket', 'doorway']),
  hinge: z.enum(['left', 'right']),
  /** Wall side the leaf swings into; the UI shows in/out relative to the room. */
  opensTo: z.enum(['left', 'right']),
  frameColor: hex.optional(),
  leaf: SurfaceFinishSchema.optional(),
});

export const WindowSpecSchema = z.object({
  type: z.literal('window'),
  operation: z.enum(['fixed', 'tilt-turn', 'casement', 'sliding', 'top-hung']),
  hinge: z.enum(['left', 'right']).optional(),
  /** Optional like the door's frameColor; the renderer falls back to a default frame colour. */
  frameColor: hex.optional(),
  divisions: z.number().int().nonnegative().optional(),
});

export const OpeningSchema = z.object({
  ...entityBase,
  /** Must reference a wall on the same floor (checked by FloorSchema). */
  wallId: id,
  /**
   * Along the wall axis, from the start node to the opening centre. Door `hinge` and `opensTo`
   * are relative to the wall direction: `left`/`right` as seen walking from start to end node.
   */
  offset: mm,
  width: mm.positive(),
  height: mm.positive(),
  sillHeight: mm.nonnegative(),
  spec: z.discriminatedUnion('type', [DoorSpecSchema, WindowSpecSchema]),
});

export const FloorFinishSchema = z.object({
  materialId: id,
  pattern: z.enum(['plank', 'herringbone', 'chevron', 'tile', 'seamless']),
  module: z.object({ length: mm.positive(), width: mm.positive() }).optional(),
  rotationDeg: deg,
});

export const RoomSchema = z.object({
  ...entityBase,
  name: z.string(),
  /** A point inside the room; re-identifies it after wall edits. Polygon and area are derived. */
  anchor: Vec2Schema,
  floorFinish: FloorFinishSchema,
  ceilingColor: hex.optional(),
});

export const UnderlaySchema = z.object({
  ...entityBase,
  assetId: id,
  /** Page number when the image was rendered from a PDF. */
  pdfPage: z.number().int().positive().optional(),
  /** Natural size of the image in pixels. */
  imagePx: z.object({ w: z.number().positive(), h: z.number().positive() }),
  /** Plan position of the image's top-left corner. */
  position: Vec2Schema,
  rotationDeg: deg,
  /** From two-point calibration. */
  mmPerPx: z.number().positive(),
  opacity: z.number().min(0).max(1),
});

export const DimensionLineSchema = z.object({ ...entityBase, a: Vec2Schema, b: Vec2Schema, offset: mm });

export const FloorLevelSchema = z.enum(['basement', 'ground', 'first', 'second', 'attic', 'roof']);

/**
 * A sloped ceiling plane (attic roof slope). Planes are the design; ceiling heights, headroom areas
 * and clipped wall tops are derived (see model/ceilings.ts). Heights are measured from the finished
 * floor level of the floor that owns the plane.
 */
export const CeilingPlaneSchema = z
  .object({
    ...entityBase,
    /** Eave line in plan space, where the slope meets the knee wall. */
    eave: z.object({ a: Vec2Schema, b: Vec2Schema }),
    /** Ceiling height at the eave line (knee-wall height), from the floor level. */
    kneeHeight: mm.nonnegative(),
    /** Slope angle above horizontal, in degrees: greater than 0 and less than 90. */
    slopeDeg: deg.gt(0).lt(90),
    /** Side of the eave line a -> b the plane rises towards, as seen walking from a to b. */
    risesToward: z.enum(['left', 'right']),
    /**
     * Optional plan polygon limiting where the plane applies (convex, for headroom clipping).
     * Absent: the plane covers the whole floor footprint on its rising side.
     */
    extent: PolygonSchema.optional(),
  })
  .superRefine((plane, ctx) => {
    if (plane.eave.a.x === plane.eave.b.x && plane.eave.a.y === plane.eave.b.y)
      ctx.addIssue({
        code: 'custom',
        path: ['eave'],
        message: 'The eave line needs two distinct points',
      });
  });

const FloorShape = z.object({
  ...entityBase,
  level: FloorLevelSchema,
  /**
   * Floor-to-floor height (includes the slab). The finished floor level relative to peil is
   * derived, not stored: see floorElevations() (the 'ground' floor is 0).
   */
  height: mm.positive(),
  slabThickness: mm.positive(),
  wallNodes: record(WallNodeSchema),
  walls: record(WallSchema),
  openings: record(OpeningSchema),
  rooms: record(RoomSchema),
  objects: record(PlacedObjectSchema),
  plants: record(PlantInstanceSchema),
  underlays: record(UnderlaySchema),
  dimensions: record(DimensionLineSchema),
  /** Sloped ceiling planes (v3); empty means a flat ceiling at height - slabThickness. */
  ceilingPlanes: record(CeilingPlaneSchema).default({}),
});

export const FloorSchema = FloorShape.superRefine((floor, ctx) => {
  for (const [key, wall] of Object.entries(floor.walls)) {
    for (const field of ['startNodeId', 'endNodeId'] as const) {
      if (!(wall[field] in floor.wallNodes))
        ctx.addIssue({
          code: 'custom',
          path: ['walls', key, field],
          message: `Wall "${key}" references missing wall node "${wall[field]}"`,
        });
    }
  }
  for (const [key, opening] of Object.entries(floor.openings)) {
    if (!(opening.wallId in floor.walls))
      ctx.addIssue({
        code: 'custom',
        path: ['openings', key, 'wallId'],
        message: `Opening "${key}" references missing wall "${opening.wallId}"`,
      });
  }
});

export const StairSchema = z.object({
  ...entityBase,
  fromFloorId: id,
  toFloorId: id,
  shape: z.enum(['straight', 'quarter-turn', 'half-turn', 'spiral']),
  /**
   * Anchor of the stair footprint in plot space: the centre of the bottom step's front edge
   * (where you step on) for straight, quarter-turn and half-turn stairs; the centre of the
   * stairwell for spirals. `rotationDeg` turns the footprint around this anchor and points the
   * run direction (counter-clockwise from +X).
   */
  position: Vec2Schema,
  rotationDeg: deg,
  width: mm.positive(),
  /**
   * Horizontal length of the walking line along the run. Spirals have no straight run: for
   * them it is the outer diameter of the stairwell (and `width` is the tread width).
   */
  runLength: mm.positive(),
  steps: z.number().int().positive(),
  turn: z.enum(['left', 'right']).optional(),
  /** The slab hole on toFloor is derived from the stair footprint. */
  cutsVoid: z.boolean(),
});

export const BuildingSchema = z
  .object({
    ...entityBase,
    /** Outbuilding = bijgebouw / shed. */
    kind: z.enum(['main', 'outbuilding']),
    /**
     * Reserved, not applied yet: floor geometry is stored in plot space, so position must stay
     * (0, 0) and rotationDeg 0 until a later phase defines a building-to-plot transform.
     */
    position: Vec2Schema,
    /** Reserved, see `position`. */
    rotationDeg: deg,
    floors: record(FloorSchema),
    /** Bottom to top; must list exactly the keys of `floors`. */
    floorOrder: z.array(id),
    stairs: record(StairSchema),
  })
  .superRefine((building, ctx) => {
    const seen = new Set<string>();
    building.floorOrder.forEach((floorId, index) => {
      if (!(floorId in building.floors))
        ctx.addIssue({
          code: 'custom',
          path: ['floorOrder', index],
          message: `floorOrder references missing floor "${floorId}"`,
        });
      if (seen.has(floorId))
        ctx.addIssue({
          code: 'custom',
          path: ['floorOrder', index],
          message: `Duplicate floor "${floorId}"`,
        });
      seen.add(floorId);
    });
    for (const key of Object.keys(building.floors)) {
      if (!seen.has(key))
        ctx.addIssue({
          code: 'custom',
          path: ['floorOrder'],
          message: `Floor "${key}" is missing from floorOrder`,
        });
    }
    for (const [key, stair] of Object.entries(building.stairs)) {
      for (const field of ['fromFloorId', 'toFloorId'] as const) {
        if (!(stair[field] in building.floors))
          ctx.addIssue({
            code: 'custom',
            path: ['stairs', key, field],
            message: `Stair "${key}" references missing floor "${stair[field]}"`,
          });
      }
    }
  });

export const SceneSchema = z.object({ plot: PlotSchema, buildings: record(BuildingSchema) });

export const VariantSchema = z.object({
  id,
  name: z.string().min(1),
  author: z.string().optional(),
  notes: z.string().optional(),
  createdAt: isoDateTime,
  basedOnVariantId: id.optional(),
  scene: SceneSchema,
});

/* ---------- Library ---------- */
export const MaterialSchema = z.object({
  id,
  name: z.string(),
  kind: z.enum(['paint', 'wood', 'tile', 'stone', 'concrete', 'carpet', 'fabric', 'metal', 'glass']),
  color: hex,
  finish: z.enum(['matt', 'satin', 'gloss']),
  texture: z.object({ assetId: id, sizeMm: z.object({ w: mm.positive(), h: mm.positive() }) }).optional(),
});

export const PaletteSchema = z.object({ id, name: z.string(), colors: z.array(hex) });

export const CatalogItemSchema = z.object({
  id,
  name: LocalizedSchema,
  category: ObjectCategorySchema,
  baseSize: SizeSchema,
  /** Absent means a parametric placeholder box. */
  model: z.union([z.object({ assetId: id }), z.object({ url: z.string() })]).optional(),
  placeholderColor: hex.optional(),
  options: z
    .array(z.object({ id: z.string(), name: LocalizedSchema, finishes: record(SurfaceFinishSchema) }))
    .optional(),
  defaultPriceCents: z.number().int().nonnegative().optional(),
});

export const AssetRefSchema = z.object({
  id,
  kind: z.enum(['image', 'pdf', 'model', 'texture']),
  name: z.string(),
  mime: z.string(),
  bytes: z.number().int().nonnegative(),
  sha256: z.string(),
  license: z.string().optional(),
});

export const LibrarySchema = z.object({
  materials: record(MaterialSchema),
  palettes: record(PaletteSchema),
  catalog: record(CatalogItemSchema),
  /** Binaries live in IndexedDB and are embedded on export. */
  assets: record(AssetRefSchema),
});

/* ---------- Project & file ---------- */
export const ProjectSettingsSchema = z.object({
  gridMm: mm.positive(),
  displayUnit: z.enum(['cm', 'm']),
  location: z.object({ lat: z.number().min(-90).max(90), lon: z.number().min(-180).max(180) }).optional(),
});

export const ProjectSchema = z
  .object({
    id,
    name: z.string().min(1),
    createdAt: isoDateTime,
    updatedAt: isoDateTime,
    settings: ProjectSettingsSchema,
    library: LibrarySchema,
    variants: record(VariantSchema),
    /** Must list exactly the keys of `variants`. */
    variantOrder: z.array(id).min(1),
    activeVariantId: id,
  })
  .superRefine((p, ctx) => {
    if (!(p.activeVariantId in p.variants))
      ctx.addIssue({
        code: 'custom',
        path: ['activeVariantId'],
        message: 'activeVariantId must reference a variant',
      });
    const seen = new Set<string>();
    p.variantOrder.forEach((variantId, index) => {
      if (!(variantId in p.variants))
        ctx.addIssue({
          code: 'custom',
          path: ['variantOrder', index],
          message: `variantOrder references missing variant "${variantId}"`,
        });
      if (seen.has(variantId))
        ctx.addIssue({
          code: 'custom',
          path: ['variantOrder', index],
          message: `Duplicate variant "${variantId}"`,
        });
      seen.add(variantId);
    });
    for (const key of Object.keys(p.variants)) {
      if (!seen.has(key))
        ctx.addIssue({
          code: 'custom',
          path: ['variantOrder'],
          message: `Variant "${key}" is missing from variantOrder`,
        });
    }
  });

export const EmbeddedAssetSchema = z.object({ mime: z.string(), base64: z.string() });

export const ProjectFileSchema = z.object({
  format: z.literal('bydh-project'),
  schemaVersion: z.literal(SCHEMA_VERSION),
  exportedAt: isoDateTime,
  project: ProjectSchema,
  /** Present in exports only. */
  assets: record(EmbeddedAssetSchema).optional(),
});
