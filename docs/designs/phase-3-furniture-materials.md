# Phase 3 design: furniture and materials

Status: draft v1 (2026-10-28). Nothing in this document is built yet. Needs Bas's answers to the open
questions and his approval before work starts.

## Goal

After Phase 3, Bas and his wife can furnish a room from a catalogue, check that it fits, and try colours and
floors on it. The roadmap's "done when" line is: **a living room furnished and recoloured in under 5 minutes.**

Bas's requested scope: furniture, kitchen units, appliances, TV, radiators, colours, flooring and a simple
indoor plant.

## What exists today

- Walls, rooms, openings, floors, stairs and sloped ceilings are built (Phases 0 to 2, schema v3).
- The schema already has `PlacedObject` (catalogue id, category, position, elevation, rotation, true size,
  mirrored, fixed, optional host, finishes per part) and `Floor.objects`. Nothing creates or draws objects yet.
- `Library` has `materials`, `palettes` (`{ id, name, colors[] }`) and `catalog` (own items, localised name,
  base size, optional model). All are empty in practice.
- Rooms store a `floorFinish` (material, pattern, module, rotation) and an optional `ceilingColor`. 2D and 3D
  fill floors with the material colour only; patterns are not drawn. `src/data/materials.json` has 8 presets.
- Wall colour lives per wall side (`Wall.sides.left/right`). Room detection already knows which wall half-edges
  bound each room, but does not expose it.
- The initial JS is **242.9 KB gzip against a 250 KB budget** (measured 2026-10-28). Only about 7 KB is left,
  so Phase 3 must load almost all of its code lazily. The 3D view is already a lazy chunk.
- Shortcuts in use: V, H, W, C, D, N, S, R (R is the ceiling tool), Ctrl+Z/Y.

## Scope

In scope:

1. A built-in catalogue of about 45 generic items (furniture, kitchen units, appliances, TVs, radiators,
   lighting, rugs, two indoor plants, a custom box) plus three "sets" that place several items at once.
2. Place, move, rotate, mirror, resize (typed), duplicate and delete objects, each one undo step.
3. Snapping: back to a wall with automatic rotation, flush into corners, edge to edge with other objects
   (kitchen runs), and stacking a TV or small plant on a cabinet.
4. Collision and clearance checks shown as warnings and notices. Nothing is blocked by overlap.
5. Colours: room kind, room wall colour, floor material, pattern, rotation and tint, ceiling colour, and
   a colour per part of each object.
6. Palettes: five built-in palettes that colour every room by its kind, applied to one room or a whole
   floor in one undo step. "Save current colours as a palette".
7. 2D symbols and 3D models for every item, floor patterns in 2D and 3D.

Out of scope: glTF or photo-textured models, own catalogue items beyond the custom box, multi-select and
grouping, L-shaped (corner) sofas, curtains and lights that cast light, wall tiles and wallpaper, outdoor
furniture and garden plants (Phase 4), bill of materials and prices (Phase 5), dragging objects in 3D,
furniture that follows a moved wall.

## Design

### Entity model

A placed item is a `PlacedObject` on a floor. What is stored:

- `catalogId`, `category`, `position` (centre of the footprint), `elevation` (bottom, from the floor),
  `rotationDeg` (front direction, counter-clockwise from +X), `size` (true w/d/h in mm), `mirrored`, `fixed`
  (true for kitchen units, appliances and radiators), `label` (custom box text), `locked`, `finishes`.
- `finishes` is keyed by part role (`body`, `front`, `top`, `worktop`, `legs`, `fabric`, `screen`, `metal`,
  `pot`, `foliage`). A missing role uses the catalogue default.
- `host` stays unused in Phase 3. Objects do not follow walls; a wall moved through a sofa shows a
  warning instead. Half-built hosting would be worse than none.

Derived and never stored: footprint polygon, 2D symbol, 3D parts, snap guides, collision and clearance
issues, wall-side colours.

Catalogue ids are saved data. **Never rename or remove a built-in catalogue id.** A test pins the id list. An
object whose catalogue entry is missing still renders as a box with its stored size and colours.

### Schema v4

| Change      | Field                                                                                                         | Why                                                   |
| ----------- | ------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| New enum    | `RoomKindSchema`: `living, dining, kitchen, hall, bedroom, bathroom, toilet, office, storage, utility, other` | Palettes colour rooms by kind                         |
| Room        | `kind: RoomKindSchema.optional()`                                                                             | Absent means "guess from the name, else other"        |
| Room        | `wallFinish: SurfaceFinishSchema.optional()`                                                                  | One wall colour for the whole room (see Colour model) |
| FloorFinish | `color: hex.optional()`                                                                                       | Tint over the material colour                         |
| Palette     | `rooms: z.partialRecord(RoomKindSchema, PaletteRoomSchema).default({})`                                       | Per-kind floor, wall and ceiling colours              |
| New         | `PaletteRoomSchema = { floorMaterialId?: id, floorColor?: hex, wallColor: hex, ceilingColor?: hex }`          |                                                       |

`PlacedObject`, `CatalogItem` and `Library` keep their shape. `Palette.colors` stays (the swatch row).

`SCHEMA_VERSION` becomes 4. The v3 to v4 migration sets `rooms: {}` on every library palette; every other
new field is optional. The bump is still needed even though the fields are optional: Zod strips unknown keys,
so a v3 app opening a v4 file would silently drop room colours. With the bump it refuses the file.

ADRs: **0009** "Procedural furniture catalogue and the lazy furnish chunk" and **0010** "Room-level wall
colour, palettes by room kind (schema v4)".

### Catalogue format

The built-in catalogue is app data, not project data: `src/data/catalog.json`, validated on load by
`CatalogEntrySchema` in `src/domain/furniture/types.ts`. It is not versioned with `SCHEMA_VERSION`.

```ts
CatalogEntrySchema = z.object({
  id, // stable, kebab-case
  name: LocalizedSchema, // { en, nl }
  group: z.enum([
    'living',
    'dining',
    'kitchen',
    'appliances',
    'bedroom',
    'office',
    'heating',
    'decor',
    'other',
  ]),
  category: ObjectCategorySchema, // drives collision rules
  recipe: RecipeIdSchema, // procedural shape, see 3D approach
  size: SizeSchema, // default w/d/h in mm
  sizeRange: z.object({ w: range, d: range, h: range }).partial().optional(), // absent = fixed size
  elevation: mm.default(0),
  mount: z.enum(['floor', 'wall']), // wall = must sit against a wall
  backToWall: z.boolean(), // auto-rotate when it snaps to a wall
  wallGap: mm.default(0), // e.g. radiator 50
  stackable: z.boolean().default(false), // sits on the top of the object below
  fixed: z.boolean().default(false),
  clearance: z.object({ front: mm, back: mm, left: mm, right: mm }).partial().optional(),
  finishes: record(SurfaceFinishSchema), // default colour per part role
  shape: z.enum(['rect', 'round']).default('rect'),
});
```

Sets live in `src/data/catalogSets.json`: `{ id, name, items: [{ catalogId, offset: Vec2, rotationDeg }] }`,
placed as separate objects in one undo step.

Names of catalogue items, paints and palettes are data with `{ en, nl }`, as `CatalogItem.name` already is.
They do not go in the locale files. This is a reading of the "every UI string in both locale files" rule: the
strings are in both languages, but they live with their data in the lazy chunk.

### Generic item list

Sizes are w x d x h in mm (w along the front). Clearance is the free depth needed in front unless noted.
All items are generic types.

| Group      | id                    | Recipe                      | Size              | Elev.  | Mount               | Resizable                | Clearance                     |
| ---------- | --------------------- | --------------------------- | ----------------- | ------ | ------------------- | ------------------------ | ----------------------------- |
| Living     | `sofa-3`              | sofa                        | 2100 x 950 x 800  | 0      | floor, back to wall | w 1400-3200              |                               |
| Living     | `sofa-2`              | sofa                        | 1600 x 900 x 800  | 0      | floor, back to wall | w 1200-2000              |                               |
| Living     | `armchair`            | sofa                        | 850 x 850 x 850   | 0      | floor               |                          |                               |
| Living     | `coffee-table`        | table                       | 1100 x 600 x 400  | 0      | floor               | w, d                     |                               |
| Living     | `coffee-table-round`  | table (round)               | 800 x 800 x 400   | 0      | floor               | w=d                      |                               |
| Living     | `tv-cabinet`          | cabinet                     | 1800 x 450 x 500  | 0      | floor, back to wall | w                        | 500                           |
| Living     | `tv-55`               | tv                          | 1230 x 80 x 720   | stacks | floor or wall       |                          |                               |
| Living     | `tv-65`               | tv                          | 1450 x 80 x 840   | stacks | floor or wall       |                          |                               |
| Living     | `bookcase`            | shelf                       | 1200 x 350 x 2000 | 0      | floor, back to wall | w, h                     | 600                           |
| Living     | `sideboard`           | cabinet                     | 1600 x 450 x 850  | 0      | floor, back to wall | w                        | 600                           |
| Living     | `floor-lamp`          | lamp                        | 400 x 400 x 1600  | 0      | floor               |                          |                               |
| Living     | `pouf`                | box (round)                 | 600 x 600 x 400   | 0      | floor               |                          |                               |
| Dining     | `dining-table`        | table                       | 2000 x 950 x 750  | 0      | floor               | w, d                     | front and back 750            |
| Dining     | `dining-table-round`  | table (round)               | 1200 x 1200 x 750 | 0      | floor               | w=d                      | all sides 750                 |
| Dining     | `dining-chair`        | chair                       | 450 x 450 x 900   | 0      | floor               |                          |                               |
| Kitchen    | `kitchen-base`        | kitchen-base                | 600 x 600 x 900   | 0      | floor, back to wall | w 300-1200               | 1000                          |
| Kitchen    | `kitchen-sink`        | kitchen-base (sink)         | 800 x 600 x 900   | 0      | floor, back to wall | w 600-1200               | 1000                          |
| Kitchen    | `kitchen-hob`         | kitchen-base (hob)          | 600 x 600 x 900   | 0      | floor, back to wall | w 600-900                | 1000                          |
| Kitchen    | `kitchen-dishwasher`  | kitchen-base (plain front)  | 600 x 600 x 900   | 0      | floor, back to wall |                          | 1000                          |
| Kitchen    | `kitchen-tall-oven`   | kitchen-tall (oven)         | 600 x 600 x 2100  | 0      | floor, back to wall | h                        | 1000                          |
| Kitchen    | `kitchen-tall-fridge` | kitchen-tall (fridge)       | 600 x 600 x 2100  | 0      | floor, back to wall | h                        | 1000                          |
| Kitchen    | `kitchen-wall`        | kitchen-wall                | 600 x 350 x 720   | 1450   | wall                | w 300-1200, h            |                               |
| Kitchen    | `kitchen-hood`        | hood                        | 900 x 500 x 750   | 1550   | wall                | w 600-900                |                               |
| Kitchen    | `kitchen-island`      | kitchen-base (island)       | 2400 x 1000 x 900 | 0      | floor               | w, d                     | front and back 1000           |
| Appliances | `fridge-freezer`      | appliance                   | 600 x 650 x 1850  | 0      | floor, back to wall |                          | 700                           |
| Appliances | `washing-machine`     | appliance (round door)      | 600 x 600 x 850   | 0      | floor, back to wall |                          | 700                           |
| Appliances | `dryer`               | appliance (round door)      | 600 x 600 x 850   | 0      | floor, back to wall |                          | 700                           |
| Appliances | `washer-dryer-stack`  | appliance (two round doors) | 600 x 650 x 1750  | 0      | floor, back to wall |                          | 700                           |
| Appliances | `boiler-unit`         | appliance                   | 450 x 350 x 700   | 1300   | wall                |                          | 600                           |
| Heating    | `radiator-panel`      | radiator                    | 1000 x 100 x 600  | 120    | wall, gap 50        | w 400-3000, h 300-900    | 300                           |
| Heating    | `radiator-vertical`   | radiator                    | 450 x 100 x 1800  | 100    | wall, gap 50        | w, h                     | 300                           |
| Bedroom    | `bed-double`          | bed                         | 1800 x 2100 x 550 | 0      | floor, back to wall | w 1400-2000, d 2000-2200 | left and right 600, front 600 |
| Bedroom    | `bed-single`          | bed                         | 900 x 2000 x 500  | 0      | floor, back to wall | w 800-1200               | left 600                      |
| Bedroom    | `wardrobe`            | wardrobe                    | 2000 x 600 x 2200 | 0      | floor, back to wall | w, h                     | 800                           |
| Bedroom    | `bedside-table`       | cabinet                     | 450 x 400 x 500   | 0      | floor, back to wall |                          |                               |
| Office     | `desk`                | table                       | 1400 x 700 x 750  | 0      | floor               | w, d                     | front 900                     |
| Office     | `office-chair`        | chair (swivel)              | 550 x 550 x 900   | 0      | floor               |                          |                               |
| Decor      | `rug`                 | rug                         | 2000 x 3000 x 10  | 0      | floor               | w, d                     |                               |
| Decor      | `rug-round`           | rug (round)                 | 2000 x 2000 x 10  | 0      | floor               | w=d                      |                               |
| Decor      | `plant-large`         | plant                       | 450 x 450 x 1300  | 0      | floor               | h 600-2000               |                               |
| Decor      | `plant-small`         | plant                       | 300 x 300 x 600   | stacks | floor               | h 300-900                |                               |
| Other      | `box`                 | box                         | 1000 x 500 x 750  | any    | floor               | all                      |                               |

Sets: `set-living` (3-seat sofa, two armchairs, coffee table, rug), `set-dining-6` (table and six chairs),
`set-bedroom` (double bed and two bedside tables).

The sizes are rules of thumb (Dutch kitchen modules: 600 deep, 900 to the worktop, wall cabinets from 1450).
Each one can be typed per object, so measured sizes can be entered later without a data change.

### Placement and rotation

- **Furnish tool (F).** Opens the catalogue panel. Clicking an item arms the tool: a ghost follows the
  pointer with snapping and a click places it. The tool stays armed for the next copy; Esc disarms. Items
  can also be dragged from the panel onto the plan.
- **Rotation.** Q and E rotate 90 degrees (Shift: 15 degrees), M mirrors. R is taken by the ceiling tool. A
  round handle in front of the selected object rotates it by drag with 15-degree steps (Shift: free). The
  inspector takes typed degrees.
- **Select tool.** Click selects; drag moves (one transaction, one undo step); arrows nudge 10 mm (Shift
  100 mm); Ctrl+D duplicates next to the original, snapped; Delete removes. Locked objects do not move.
- **Stacking.** A `stackable` item whose centre is over another object takes that object's top as its
  elevation (TV on TV cabinet, small plant on sideboard). Off it, it drops back to its default elevation.

### Snapping

`snapFurniture(input): SnapOutcome` (pure, `src/domain/furniture/snapFurniture.ts`). Input: the wanted
pose, size, catalogue entry, wall face segments (from `floorGeometry` outlines), other footprints, tolerance
in mm (10 px at the current zoom, like walls) and modifiers. Steps, first match per axis wins:

1. **Wall.** If the back edge is within tolerance of a wall face and the entry has `backToWall`, rotate so
   the back faces the wall and put the back edge on the face plus `wallGap`. Freestanding items only snap
   flush if already parallel. A `mount: 'wall'` item with no wall in reach is shown red and is not placed.
2. **Corner.** After a wall snap, a side edge within tolerance of a crossing wall face slides flush.
3. **Objects.** For objects with a parallel rotation (within 1 degree, modulo 90): side flush to side,
   fronts aligned, backs aligned, centres aligned. This makes kitchen runs and chairs around a table.
4. **Fallback.** Round the free axes to 10 mm. Alt turns all snapping off.

The outcome carries the pose, elevation (stacking), guide segments for 2D and `blocked: boolean`.

### Collisions and clearances

`furnitureIssues(floor, stairs, catalog): Issue[]` (pure, `src/domain/furniture/issues.ts`), cached per
frozen floor like `floorGeometry`. Footprints are oriented rectangles (round items use their bounding
square). Two things overlap when their plan footprints intersect (separating axis test) by more than 1 mm and
their height ranges (`elevation` to `elevation + h`) also overlap.

| Issue       | Rule                                                                                                           | Severity              |
| ----------- | -------------------------------------------------------------------------------------------------------------- | --------------------- |
| `overlap`   | Two objects overlap. Exempt: rugs; seating with a table or desk (chairs tucked in); a stacked item on its base | Warning (red outline) |
| `wall`      | Footprint enters a wall outline by more than 5 mm                                                              | Warning               |
| `door`      | Footprint enters the swing area of a door (from `doorSweep`) and the object starts below the door head         | Warning               |
| `stair`     | Footprint overlaps a stair on this floor or a stair void                                                       | Warning               |
| `clearance` | Another object (not a rug) or a wall enters this object's clearance zone by more than 50 mm                    | Notice (amber)        |

**Blocked** (the action does not happen) only for: a wall-mounted item with no wall in reach, a typed size
outside `sizeRange`, and edits to a locked object. Overlap is never blocked: real rooms have intended
overlaps, and blocking would slow down the 5-minute goal.

Clearance zones are drawn for the selected object, or for all objects with the "Show clearances" toggle.

### Colour model

- **Walls.** A room has an optional `wallFinish`. The colour of a wall side is resolved by
  `wallSideFinish(floor, wallId, side)` in `src/domain/model/finishes.ts`: the side's own colour (an override
  from the wall inspector) wins, then the `wallFinish` of the room on that side, then the default wall colour.
  The room-to-wall-side link is derived: `RoomFace` gains `wallSides: { wallId, side }[]` from the half-edges
  room detection already walks. A shared wall can have a different colour on each side with no extra data.
  "Reset wall overrides" clears the side colours of one room.
- **Floors.** `floorFinish` = material, pattern (`plank`, `herringbone`, `chevron`, `tile`, `seamless`),
  module size, rotation and optional tint. Shown colour = tint, else the material colour.
- **Ceilings.** `ceilingColor` as today.
- **Objects.** One colour and finish per part role; matt, satin and gloss map to roughness 0.9, 0.6 and
  0.25 in 3D.
- **Materials.** `src/data/materials.json` grows from 8 to about 16 floor materials (light, natural and
  smoked oak; laminate; vinyl plank; light, grey and anthracite tiles; bluestone; poured floor; polished
  concrete; two carpets). It stays in the initial bundle because the 2D plan needs floor colours on load.
- **Paints.** `src/data/paints.json` (lazy) holds about 24 named paint colours: whites, sands, clays, greens,
  blues, greys, ink. Any hex can also be picked.
- **Palettes.** `src/data/palettes.json` (lazy) holds five built-in palettes: Neutral, Nordic oak, Forest
  green, Lime and clay, Ink and concrete. The four named ones come from Bas's earlier mock-up (floor and wall
  colour per room kind). Each palette has a swatch row and a floor material, floor tint, wall colour and
  ceiling colour per room kind.
- **Applying a palette** (`applyPalette(floor, palette, scope)`): for each room in scope, using `kind` (or
  `guessRoomKind(name)`, which knows common Dutch and English room names), set `wallFinish`, `floorFinish` and
  `ceilingColor`, and clear that room's wall-side overrides. One undo step. Rooms whose kind the palette does
  not cover are left alone. "Save as palette" copies the current floor's colours by room kind into
  `library.palettes`.
- `syncRooms` already carries names and finishes across wall edits by overlap. It must carry `kind` and
  `wallFinish` too, or a wall edit would reset room colours.

**Rendering.** 2D: rooms are filled with the floor colour plus a low-contrast SVG `<pattern>` for the pattern,
module and rotation. Walls stay solid in plan, as plan convention expects. 3D: walls use `wallSideFinish`;
floors use a procedural `CanvasTexture` per finish key (pattern, module, colour, rotation; 256 px tile with
joint lines, repeated by module size, cached); ceilings use their colour; furniture uses
`MeshStandardMaterial` per part, cached by colour and finish.

### 3D approach: procedural recipes, not glTF

Recommendation: **procedural parametric recipes**. `recipeParts(entry, size): Part[]` (pure,
`src/domain/furniture/recipes.ts`) returns boxes, cylinders and spheres in object-local millimetres, each with
a part role. Examples: a sofa is a base, back, two arms and seat cushions; a kitchen base unit is a plinth,
body, front and a worktop with 20 mm overhang (sink and hob add a basin or rings); a plant is a cylinder pot
plus three spheres of foliage scaled by height. Resizing rescales parts by rule (arms keep their width, seats
stretch), so a 3200 mm sofa still looks right.

The same parts feed the 2D symbol: `planSymbol(entry, size)` (`symbols.ts`) projects the parts to a top view
and adds conventions (bed pillows and fold line, hob rings, sink basin, door arc on appliances, dashed outline
for wall cabinets and hoods). This works like the wall pieces: one source for both views, so they cannot
disagree, and catalogue thumbnails are the same SVG symbols, so there are no image files.

Why not glTF: GLTFLoader with Draco adds about 40 to 60 KB gzip to the 3D chunk, each model is 0.1 to 2 MB to
host, licences must be tracked, and fixed meshes stretch badly when resized. `CatalogItem.model` stays in
the schema for a later "own model" feature.

**Bundle plan.**

- Zero new dependencies.
- Initial bundle: schema and migration, `viewStore` additions, the lazy loader, three Suspense slots, the
  tool button, the wall-side resolver and a few locale keys. **Target: at most +3 KB gzip**, measured in WP0
  and again in WP9.
- Lazy "furnish" chunk (`src/features/furniture/runtime.ts`): catalogue, recipes, symbols, snapping, issues,
  palettes, paints, panels, inspectors, 2D layers and the `furnish` i18n namespace. Target under 45 KB gzip.
  It loads when the active floor has objects, when the furnish tool or an object or room is selected, and
  on browser idle after the first render, so the first click is instant. The budget script counts only
  `<script src>` entries in `index.html`, so lazy chunks do not count.
- 3D furniture and floor textures go in the existing lazy Scene3D chunk. They share the domain modules with
  the furnish chunk; the bundler puts those in a shared chunk.
- Guard: an ESLint `no-restricted-imports` rule bans static imports of `@/features/furniture/*` and
  `@/domain/furniture/*` from initial-bundle code (everything except `lazy.ts`, the furniture folder itself
  and `src/render3d`). `check-bundle-size.mjs` also prints the furnish chunk size.

### UI

- **Tool rail.** "Furnish (F)" button (lucide `Sofa`) and a "Show clearances" toggle.
- **Catalogue panel.** Drawer next to the tool rail: search, group tabs (Living, Dining, Kitchen, Appliances,
  Bedroom, Office, Heating, Decor, Sets, Other), tiles with the SVG symbol, name and size.
- **2D layer order.** Rooms, rugs, floor objects, walls, openings, stairs, wall-hung objects above 1400 mm
  (dashed), then selection, clearance zones, issue outlines and snap guides. Each object is a `<g
data-entity="object:<id>">` so `entityAt` hit-testing works unchanged.
- **Object inspector.** Name (catalogue) and label; width, depth, height and elevation in the user's units
  with the allowed range; rotation; mirror; one colour row per part (palette swatches, paint list, custom);
  "Built-in" (`fixed`); lock; duplicate; delete; issue list, where clicking an issue selects the other
  object.
- **Room inspector, new "Colours and floor" section** (lazy): room kind, wall colour and reset overrides,
  floor material, pattern, rotation and tint, ceiling colour, palette picker with "Apply to room", "Apply to
  floor" and "Save as palette".
- **3D.** Clicking an object selects it and the selection is highlighted, as for stairs.

### i18n keys

Initial bundle (`en.json`, `nl.json`): `tools.furnish`, `tools.showClearances`, `inspector.objectLoading`.

Lazy namespace `furnish` (`src/i18n/locales/furnish.en.json`, `furnish.nl.json`), added with
`i18n.addResourceBundle` when the chunk loads. WP0 writes the full key set below in both files, so later
packages never edit the same locale file:

- `catalog.title`, `catalog.search`, `catalog.empty`, `catalog.dragHint`, `catalog.size`,
  `catalog.groups.{living,dining,kitchen,appliances,bedroom,office,heating,decor,sets,other}`
- `tool.hint`, `tool.needsWall`, `tool.placed`
- `object.title`, `object.label`, `object.width`, `object.depth`, `object.height`, `object.elevation`,
  `object.rotation`, `object.mirror`, `object.builtIn`, `object.locked`, `object.colours`, `object.custom`,
  `object.sizeRange`, `object.duplicate`, `object.delete`,
  `object.part.{body,front,top,worktop,legs,fabric,screen,metal,pot,foliage}`
- `issues.title`, `issues.none`, `issues.overlap`, `issues.wall`, `issues.door`, `issues.stair`,
  `issues.clearance`
- `room.coloursTitle`, `room.kind`, `room.kinds.{living,dining,kitchen,hall,bedroom,bathroom,toilet,office,storage,utility,other}`,
  `room.wallColour`, `room.resetWalls`, `room.floorMaterial`, `room.pattern`,
  `room.patterns.{plank,herringbone,chevron,tile,seamless}`, `room.floorRotation`, `room.floorTint`,
  `room.ceilingColour`
- `palette.title`, `palette.applyRoom`, `palette.applyFloor`, `palette.save`, `palette.saveName`,
  `palette.applied`
- `paints.title`

A unit test checks that both namespace files have the same keys.

## Testing plan

Unit (Vitest, `tests/unit/domain/furniture/` and alongside):

- Schema: a v3 fixture migrates to v4 (palettes get `rooms: {}`, everything else unchanged), migration is
  idempotent, v4 round-trips, a v4 file is refused by the v3 path (`from-the-future`).
- Catalogue: every entry validates; ids are unique and match a pinned list; every recipe exists; default sizes
  sit inside `sizeRange`; `en` and `nl` names are non-empty; sets reference real ids.
- Recipes and symbols: for every entry at default, minimum and maximum size, all parts stay inside the
  bounding box and the symbol stays inside the footprint.
- Snapping: back-to-wall with rotation on each of four wall directions, wall gap, corner flush, kitchen run of
  three units (flush sides, aligned fronts), centre alignment, Alt off, wall-mounted item blocked away from
  walls, stacking on and off a cabinet.
- Issues: overlap true and false (rotated cases), height separation (wall cabinet over base unit), each
  exemption, wall intrusion, door sweep for left and right hinge and both sides, stair overlap, clearance hit and
  miss, cache returns the same array for a frozen floor.
- Finishes: `wallSides` per room including a shared wall, `wallSideFinish` precedence, `applyPalette` to a room
  and a floor (one undo step, overrides cleared, uncovered kinds untouched), `guessRoomKind`, `syncRooms` keeps
  `kind` and `wallFinish` after a wall split.
- 3D helpers: floor texture tile parameters per pattern (pure function; the canvas drawing itself is not unit
  tested), part-to-mesh transforms (three.js axis mapping).
- Round trip: a project with furniture, room colours and a saved palette survives export, import and reload
  with no data change.

Playwright (Chromium):

- `furniture.spec.ts`: place a sofa from the catalogue; snap it to a wall (check its `data-` pose attributes);
  rotate with Q/E; duplicate; delete; undo each step; build a run of three kitchen units and check they are
  flush; drag a chair onto a sofa and see the warning, move it away and see it clear.
- `colours.spec.ts`: set room kind, wall colour and floor pattern; apply a palette to the floor; undo restores
  everything in one step.
- `threed-furniture.spec.ts`: the 3D view renders a furnished room without console errors; clicking an object
  selects it.
- `phase3-acceptance.spec.ts`: the done-when flow on a synthetic 5 x 4 m room: living set, TV cabinet and TV,
  plant, floor change and palette, in **at most 30 UI actions**, then export and import. A script cannot
  measure human speed, so Bas also times one run by hand (target under 5 minutes).
- Bundle: initial JS stays under 250 KB, Phase 3 adds at most 3 KB, and the lint rule passes.

## Risks

1. **Bundle budget (7 KB left).** One static import of the furniture code pulls everything into the entry.
   Mitigation: the lint rule, a lazy loader with a single entry point, measurement in WP0 and WP9. If the 3 KB
   target is missed, stop and report rather than raise the budget quietly.
2. **Noisy warnings.** Chairs under tables and TVs on cabinets would warn all day without exemptions. Mitigation:
   the exemption list, height separation, and warnings that never block.
3. **Room colours lost on wall edits.** `syncRooms` must carry the new room fields (WP4, tested).
4. **Furniture does not follow walls.** Moving a wall leaves objects behind, and they show a `wall` warning.
   Accepted for Phase 3.
5. **Shortcut clashes.** R is the ceiling tool and Ctrl+D is the browser bookmark key. Q/E/M/F are free;
   Ctrl+D is prevented while the plan has focus, and the inspector has a Duplicate button as well.
6. **Catalogue id drift.** Renaming an id breaks saved projects. Mitigation: pinned id test, box fallback.
7. **Performance.** Pairwise checks are O(n squared); fine below about 300 objects per floor, and cached per
   frozen floor. Drags check only the moving object.

## Decisions (Bas, answered)

1. **Sanitary items.** Yes: toilet, washbasin, bath and shower are added now as four data-only catalogue items.
2. **Kitchen as modules.** Separate modules that snap into runs. Modules can be locked in place (a built kitchen
   cannot be moved): use the existing locked-object flag, and let a kitchen run lock and unlock as a group.
3. **Palettes.** Seed the built-in palettes from the earlier mock-up's four palettes plus a neutral one.
4. **Clearance zones.** Shown only for the selected object.

## Acceptance criteria

- About 45 catalogue items in 9 groups plus 3 sets can be placed, and each shows in 2D and 3D.
- Place, move, rotate (keys, handle, typed), mirror, resize, duplicate and delete each take one undo step; a
  drag takes one.
- Snapping: back to wall with rotation, flush into corners, kitchen units flush with aligned fronts, TV stacks
  on the TV cabinet, wall-mounted items refuse to float.
- Overlap, wall, door-swing and stair conflicts show as warnings in 2D and in the inspector; clearance
  conflicts show as notices; nothing is blocked by overlap.
- Room kind, wall colour, floor material, pattern, rotation and tint, ceiling colour and object part colours
  are editable; a palette applies to a room or a floor in one undo step; 3D shows wall colours, floor patterns
  and furniture colours.
- A v3 file opens (migrated); a furnished, coloured project survives export, import and reload unchanged.
- A living room is furnished and recoloured in under 5 minutes (scripted at most 30 actions, plus Bas's timed
  manual run).
- Typecheck, lint, format, unit and Playwright tests pass; the initial JS stays under 250 KB gzip with at
  most 3 KB added.

## Work packages

Branch: `feat/phase-3-furniture-materials`. Every package ends with typecheck, lint and tests passing and its
own conventional commit. "Owns" means only that package edits the file in Phase 3.

**WP0 Foundations and contracts** (lead, serial, before everything else)
Owns: `src/domain/schema/{schema,migrations,types}.ts`; `src/domain/furniture/types.ts` (CatalogEntry schema,
`Part`, `Pose`, `Footprint`, `SnapInput`, `SnapOutcome`, `Issue`); **stub files with final signatures and
trivial bodies** for `src/domain/furniture/{catalog,recipes,symbols,footprint,snapFurniture,placement,issues,doorSweep}.ts`,
`src/domain/model/finishes.ts`, `src/render2d/tools/useFurnitureTool.tsx`,
`src/features/furniture/{FurnitureLayer,CatalogPanel,ObjectInspector,ColourPicker}.tsx`,
`src/features/finishes/{RoomFinishSection,FloorPatternDefs}.tsx`; `src/features/furniture/{lazy,runtime}.ts`
(runtime wires all exports once); `src/store/viewStore.ts` (tool `furnish`, selection `object`, armed item,
`showClearances`); `src/render2d/PlanView.tsx` (furnish tool, FurnitureLayer and FloorPatternDefs slots);
`src/features/inspector/Inspector.tsx` (ObjectInspector and RoomFinishSection slots); `src/i18n/furnish.ts`,
`src/i18n/locales/furnish.{en,nl}.json` (full key set), the three keys in `en.json`/`nl.json`;
`eslint.config.js` (lazy-boundary rule); `scripts/check-bundle-size.mjs` (chunk report);
`tests/unit/domain/schema/migrationV4.test.ts`; `docs/decisions/0009-*.md`, `0010-*.md`.
Done when: everything compiles with stubs, the empty slots render, and the initial bundle delta is measured.

**WP1 Catalogue, recipes and symbols** (domain and data)
Owns: `src/data/catalog.json`, `src/data/catalogSets.json`, `src/domain/furniture/{catalog,recipes,symbols}.ts`,
`tests/unit/domain/furniture/{catalog,recipes,symbols}.test.ts`.

**WP2 Placement and snapping** (domain)
Owns: `src/domain/furniture/{footprint,snapFurniture,placement}.ts` (stacking, duplicate offset, set
expansion), `tests/unit/domain/furniture/{footprint,snap,placement}.test.ts`.

**WP3 Collisions and clearances** (domain)
Owns: `src/domain/furniture/{issues,doorSweep}.ts`, `tests/unit/domain/furniture/{issues,doorSweep}.test.ts`.

**WP4 Finishes, materials and palettes** (domain and data)
Owns: `src/domain/model/finishes.ts`, `src/domain/model/rooms.ts` (`wallSides`, `syncRooms` carries new
fields), `src/data/{materials.json,materials.ts,paints.json,palettes.json}`,
`tests/unit/domain/{finishes,roomWallSides}.test.ts`.

**WP5 2D furniture editing**
Owns: `src/render2d/tools/useFurnitureTool.tsx`, `src/render2d/tools/useSelectTool.tsx` (object branch),
`src/features/toolbar/ToolRail.tsx`, `src/app/useShortcuts.ts` (Ctrl+D),
`src/features/furniture/{FurnitureLayer,CatalogPanel,CatalogTile}.tsx`, `src/features/furniture/actions.ts`,
`tests/e2e/furniture.spec.ts`. Uses WP1 to WP3.

**WP6 Object inspector and colour picker**
Owns: `src/features/furniture/{ObjectInspector,PartColours,IssuesList,ColourPicker}.tsx`. Uses WP1, WP3, WP4.

**WP7 Room colours and floor patterns**
Owns: `src/features/finishes/{RoomFinishSection,PalettePicker,FloorPatternDefs}.tsx`,
`src/features/finishes/actions.ts`, `src/render2d/layers/PlanLayers.tsx` (pattern fill),
`tests/e2e/colours.spec.ts`. Uses WP4 and WP6's `ColourPicker` (its props are fixed by the WP0 stub).

**WP8 3D furniture and finishes**
Owns: `src/render3d/{Furniture3D.tsx,furnitureMeshes.ts,floorTextures.ts}`, `src/render3d/Scene3D.tsx`,
`src/render3d/FloorParts.tsx`, `tests/unit/render3d/{furnitureMeshes,floorTextures}.test.ts`,
`tests/e2e/threed-furniture.spec.ts`. Uses WP1 and WP4.

**WP9 Acceptance and docs** (lead, last)
Owns: `tests/e2e/phase3-acceptance.spec.ts`, `tests/unit/domain/phase3RoundTrip.test.ts`, `docs/roadmap.md`,
`docs/architecture.md`; proposes (does not apply) the CLAUDE.md folder-structure line for `src/domain/furniture/`.
Runs the full suite and the bundle check, summarises, and waits for Bas's approval.

## Parallelisation plan

```
WP0 (serial, lead)
  └─► Wave A (parallel, domain only, pure tests):  WP1 · WP2 · WP3 · WP4
        └─► Wave B (parallel, UI):                 WP5 · WP6 · WP7 · WP8
              └─► WP9 (serial, lead)
```

- **Why waves.** Wave A is pure TypeScript with fast unit tests and no shared files, so four agents cannot
  collide. Wave B could start on the WP0 stubs, but its e2e tests need real snapping and issues, so it starts
  when Wave A is merged. WP6 and WP7 share only `ColourPicker`, whose props WP0 fixed; WP7 builds against
  the stub until WP6 lands.
- **No shared edits.** Every file has one owner (table above). The shell files that several features need
  (`PlanView.tsx`, `Inspector.tsx`, `runtime.ts`, the `furnish` locale files) are wired once in WP0. A
  package that needs a new locale key or a contract change asks the lead, who makes it on the phase branch,
  and the package rebases.
- **Contracts.** `src/domain/furniture/types.ts` and the stub signatures are frozen after WP0. Changing them
  needs the lead.
- **Branches.** Each package runs in its own worktree on `feat/phase-3-wpN-*` off the phase branch, merges back
  by rebase in numeric order within its wave, and must pass typecheck, lint and tests on its own.
- **Agents.** Packages run on `sonnet`; the `code-reviewer` (`opus`) reviews each wave before the next one
  starts; `test-writer` can fill unit test gaps in Wave A. The lead measures the initial bundle after WP0, after
  Wave B and in WP9.
