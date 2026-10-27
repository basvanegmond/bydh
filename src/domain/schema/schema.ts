import { z } from 'zod';

/**
 * Scene graph, schema version 1. Zod schemas are the source of truth; TypeScript types are inferred.
 * Plan space: +X = east, +Y = north, millimetres, degrees counter-clockwise from +X.
 * three.js mapping: x = X/1000, y = elevation/1000, z = -Y/1000 (metres, Y-up).
 * Derived data (wall outlines, room polygons and areas, slab voids) is never stored.
 */
export const SCHEMA_VERSION = 1;

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
  frameColor: hex,
  divisions: z.number().int().nonnegative().optional(),
});

export const OpeningSchema = z.object({
  ...entityBase,
  wallId: id,
  /** Along the wall axis, from the start node to the opening centre. */
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

export const FloorSchema = z.object({
  ...entityBase,
  level: FloorLevelSchema,
  /** Finished floor level relative to peil (ground floor = 0). */
  elevation: mm,
  /** Floor-to-floor height. */
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
});

export const StairSchema = z.object({
  ...entityBase,
  fromFloorId: id,
  toFloorId: id,
  shape: z.enum(['straight', 'quarter-turn', 'half-turn', 'spiral']),
  position: Vec2Schema,
  rotationDeg: deg,
  width: mm.positive(),
  runLength: mm.positive(),
  steps: z.number().int().positive(),
  turn: z.enum(['left', 'right']).optional(),
  /** The slab hole on toFloor is derived from the stair footprint. */
  cutsVoid: z.boolean(),
});

export const BuildingSchema = z.object({
  ...entityBase,
  /** Outbuilding = bijgebouw / shed. */
  kind: z.enum(['main', 'outbuilding']),
  position: Vec2Schema,
  rotationDeg: deg,
  floors: record(FloorSchema),
  /** Bottom to top. */
  floorOrder: z.array(id),
  stairs: record(StairSchema),
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
    variantOrder: z.array(id).min(1),
    activeVariantId: id,
  })
  .refine((p) => p.activeVariantId in p.variants, { message: 'activeVariantId must reference a variant' })
  .refine((p) => p.variantOrder.every((v) => v in p.variants), {
    message: 'variantOrder must only reference existing variants',
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
