# Phase 4 design: garden and plants

Status: draft v1 (2026-10-28), not yet reviewed by Bas. Nothing in this document is built. Phase 3
(furniture and materials) is being designed in parallel in `docs/designs/phase-3-furniture-materials.md`;
the assumptions this document makes about it are listed under "Assumptions about Phase 3" and must be
reconciled before Phase 4 starts.

## Goal

After Phase 4, Bas and his wife can draw the real garden around the house (plot boundary, lawn, terrace,
paths, beds, hedges, fences, trees and plants), see it in 2D and 3D, see how the plants look in a given
season and in a given number of years, and see where the sun and the shadows fall at any date and time.

Proposed "done when" line for the roadmap: **the garden is traced over the cadastral image with a lawn, a
terrace, beds, a hedge and three trees; on 21 June, dragging the time slider moves the shadows in 2D and
3D; at +10 years the trees are visibly bigger; a sun-hours map shows which part of the terrace gets the most
sun.**

## What exists today

- The scene schema (v3) already has a `Plot` with `boundary`, `buildableArea`, `northDeg`, `geoAnchor`,
  `zones` (lawn, terrace, path, decking, paving, gravel, bed, raised bed, pond, driveway), `linears` (fence,
  hedge, garden wall, edging, with an optional `speciesId`), `objects` (placed objects) and `plants`
  (`PlantInstance`: `speciesId`, `position`, `sizeAtPlanting` 0 to 1). `ProjectSettings.location` (lat/lon)
  is optional. **Nothing in `src/` reads or writes the plot yet**: it is created empty by `createPlot()` and
  carried through files untouched.
- Floor geometry is stored in plot space (`Building.position` stays 0), so the house and the garden already
  share one coordinate system. No transform is needed.
- The 2D plan (`PlanView`) is floor-centric: every tool hook is called unconditionally and works on the
  active floor. Underlays live on floors only.
- The 3D scene already has `shadows` on, a fixed directional light and a 120 m ground plane. It renders on
  demand (`frameloop="demand"`), so shadows only cost time when something changes.
- Derived geometry the garden can reuse: `wallPieces` (wall faces with tops clipped by ceiling planes),
  `floorSlabs` (outer footprint per floor), `ceilingHeightAt` and `ceilingPlanePieces`, `floorElevations`.
- There is no general polygon boolean library. `ceilings.ts` has convex clipping (`clipHalfPlane`,
  `subtractConvex`).
- **Bundle:** the initial JS is 242.9 KB gzip against a 250 KB budget (7.1 KB headroom on 2026-10-28), and
  Phase 3 will use part of that. Phase 4 must therefore put almost everything in lazy chunks.
- Bas's export of the current situation (gitignored, under `docs/plans/`) has a garden level with five
  wall-less outdoor areas (four rectangles and one L-shape), a small storage room with walls, four "house"
  blocks with heights between roughly 3 and 6 m that act as context masses, a four-point parcel polygon and
  two backdrop polygons. Its y axis points south (ours points north). It is a reference for tracing and
  testing by hand only; no importer is planned in this phase and no value from it goes into the repo.

## Assumptions about Phase 3 (to reconcile)

Checked against the Phase 3 draft as it stood on 2026-10-28; re-check when Phase 3 is approved.

1. Phase 3 adds schema **v4** (palettes by room kind). Phase 4 adds **v5** on top, with its own migration
   `migrateV4ToV5`. If Phase 3 ends up without a schema change, Phase 4 becomes v4 instead; nothing else
   changes.
2. Phase 3 delivers a built-in catalogue (`src/data/catalog.json`, `CatalogEntrySchema` in
   `src/domain/furniture/types.ts`, not versioned with the schema) and a placement tool that puts
   `PlacedObject`s into `Floor.objects`. Phase 3 explicitly leaves outdoor furniture to Phase 4. Phase 4
   therefore adds about eight garden entries (garden table, chair, bench, lounge set, parasol, barbecue,
   large planter, trampoline) in a **separate file** `src/data/catalogGarden.json`, adds a `garden` value to
   the catalogue `group` enum, and makes the placement tool accept a container (a floor or the plot) so it
   can place into `Plot.objects`. These are small edits in Phase 3's files, owned in Phase 4 by WP0 (enum)
   and WP5b (tool container).
3. Phase 3's indoor plants (`plant-large`, `plant-small`) are `PlacedObject` catalogue items in the `decor`
   group. Phase 4 does **not** reuse `PlacedObject` for garden plants: plants need a species, a growth curve
   and a seasonal look, which a furniture item does not have. `PlantInstance` (already in the schema) stays
   the garden plant entity in `Plot.plants`. `Floor.plants` stays unused; indoor pot plants with a species
   and growth are possible later by pointing it at the same species catalogue. The two kinds of "plant"
   coexist without a migration.
4. Phase 3 grows `src/data/materials.json`. Phase 4 adds outdoor materials (grass, clinker paving, concrete
   tiles, gravel, decking, water, bark) in a **separate file** `src/data/outdoorMaterials.json`, merged by
   `findMaterial`, so the two phases do not edit the same data file.
5. Phase 3 adds values to the `Tool` and `Selection` unions in `viewStore`. Phase 4 adds its own values after
   Phase 3 is merged (the foundation work package owns that edit).

## Scope

In scope:

1. **Garden mode.** A "Garden" entry in the floor switcher. In garden mode the 2D plan shows the plot, with
   the ground floor as a solid, snappable, non-editable footprint, and the tool rail shows garden tools.
2. **Plot boundary** (draw, edit, typed edge lengths) and **north direction** (typed or dragged arrow).
3. **Zones**: polygon and rectangle drawing, vertex editing, kind, material, elevation, raised height, area.
4. **Line elements**: fences, hedges, garden walls and edging as polylines with height and thickness.
5. **Context volumes**: simple blocks for neighbouring houses, a shed or a garage, with a flat or gable
   top. They cast shadows and give the garden context.
6. **Plot underlays**: a cadastral image or garden drawing can be imported and calibrated on the plot,
   like floor underlays.
7. **Plant catalogue** of about 40 common Dutch garden species plus generic placeholders, with a growth
   model and a seasonal look. Place, move, delete; a size slider for "years from now".
8. **Sun path**: sun position from location, date and time; a date and time bar; sun-driven light and
   shadows in 3D; a sun compass and shadow overlay in 2D; a sun-hours map for a chosen day.
9. **Derived exterior roof** ("roof skin") from the existing ceiling planes, so the house has a roof in 3D
   and casts the right shadow. No schema change. See "Roof".
10. 3D rendering of the plot: ground, zones, line elements, volumes, plants.
11. **Garden furniture**: about eight catalogue entries placed on the plot with Phase 3's object tool.

Out of scope (non-goals):

- The full roof model: dormers, hip roofs as a first-class shape, roof editing separate from the attic
  ceiling, gutters. See "Roof" for the recommendation to defer.
- Terrain: slopes, height maps, retaining walls, cut and fill. The ground is flat at peil; zones only
  have an elevation and a raised height.
- Net areas of overlapping zones (lawn minus beds) and quantities. That needs polygon booleans and belongs
  with the bill of materials in Phase 5.
- Custom species editing, plant care calendars, hardiness zones, irrigation, garden lighting.
- Photoreal plants or textures. Plants are procedural low-poly shapes in flat colours.
- A PDOK or Kadaster import (Phase 6), and an importer for Bas's export file.
- Clouds, weather, diffuse-sky simulation. Shadows are geometric only.
- Editing outbuildings as real buildings with walls and doors. A shed is a volume in this phase.

## Design

### Garden mode

The garden is not a floor, so it does not go into `floorOrder`. `viewStore` gets
`planLayer: 'building' | 'garden'`. The floor switcher shows "Garden" below the lowest floor; choosing it
sets `planLayer = 'garden'` and keeps `activeFloorId` unchanged, so switching back returns to the same
floor.

In garden mode:

- The 2D plan draws the plot layers (below) and the **ground floor** (the floor at elevation 0) as a solid
  footprint: slab outlines filled, walls drawn as now, at full opacity but not selectable. Its outer wall
  faces and corners are snap targets.
- The tool rail shows the garden tools: select, pan, boundary, zone, line element, plant, volume, object
  (Phase 3's tool filtered to `garden`), calibrate (for plot underlays). Building tools are hidden.
- The inspector shows garden entities. `Delete`, undo and redo work as in building mode.
- The 3D view always shows the plot, in both modes.

**Lazy seam.** `PlanView` calls every tool hook on every render, so garden tools cannot simply be added to
it without growing the initial chunk. Instead, `PlanView` gets one slot: when `planLayer === 'garden'` it
renders a lazily loaded `<GardenPlan>` inside the plan's transform group. `GardenPlan` calls the garden
tool hooks, draws the garden layers, and writes the active tool's `ToolHandlers` into a ref owned by
`PlanView`. `PlanView`'s pointer and key handlers delegate to that ref when the active tool is a garden
tool. The first work package builds this seam with a no-op tool before any garden tool exists.

### Entity model

All lengths in millimetres, plan space as for floors. What is stored is the design; everything listed as
"derived" is computed.

**Plot boundary** (`Plot.boundary`, exists). A simple counter-clockwise polygon, empty until drawn. Derived:
area, edge lengths. `buildableArea` stays in the schema but gets no UI in this phase.

**North** (`Plot.northDeg`, exists). Bearing of true north, counter-clockwise from plan +Y. Default 0 (plan
up is north). Set in the plot inspector or by dragging the north arrow in garden mode.

**Zones** (`Plot.zones`, exists). Polygon, kind, `elevation` (top surface above peil, default 0), optional
`height` (raised beds and decking: the visible side height), `finish` (material and colour). Rules:

- Polygons must be simple (no self-intersection) with at least three points. The zone tool refuses to close
  a self-intersecting polygon; vertex drags that would self-intersect are rejected.
- Zones may overlap. Draw order is derived: larger area first, so a bed inside the lawn shows on top. No
  stored order array is needed because nothing else depends on it.
- Derived: gross area, perimeter. The inspector shows the gross area; a note says overlaps are not
  subtracted.
- Default materials by kind (lawn: grass, terrace: concrete tiles, path: clinker paving, gravel: gravel,
  decking: wood, pond: water, bed: bark mulch).

**Line elements** (`Plot.linears`, exists). A polyline (two or more points), kind, `height`, `thickness`,
optional `finish` and `speciesId` (hedges). Defaults: fence 1800 x 40 mm, hedge 1500 x 600 mm, garden wall
1000 x 100 mm, edging 100 x 50 mm. Hedges keep their stored height: a hedge is clipped to size, so it does
not grow with the growth slider; the species only gives its colour and seasonal look.

**Context volumes** (`Plot.volumes`, **new in v5**). A polygon footprint, `baseElevation`, `height` and a
`roof`: `{ kind: 'flat' }` or `{ kind: 'gable', eaveHeight, ridgeDeg }` (ridge direction in plan degrees,
the ridge runs through the footprint's centre along that direction). `kind`: neighbour house, shed, garage,
other (for label and colour only). Volumes are not editable buildings: they exist to cast shadows and give
context.

**Plants** (`Plot.plants`, exists, one optional field added). `speciesId`, `position`, optional
`elevation` (for a plant in a raised bed it defaults to the zone's elevation under it), `sizeAtPlanting`
(fraction of mature size, **read as "size in `recordedYear`"**), and new optional `recordedYear` (integer).
Absent `recordedYear` means "the current year", which is what the field effectively meant until now. The
plant tool sets it to the current year. This keeps a tree entered as 8 m today at 8 m next year instead of
silently restarting its growth.

**Plot underlays** (`Plot.underlays`, **new in v5**). Same `UnderlaySchema` as floors, calibrated with the
existing two-point tool, drawn below everything in garden mode.

**Plot objects** (`Plot.objects`, exists). Garden furniture: Phase 3's `PlacedObject` and object tool,
with the entries from `src/data/catalogGarden.json` (see "Assumptions about Phase 3", item 2).

### Plant catalogue

The species catalogue is built-in data, not part of the project file: `src/data/plants/species.json`,
validated by a Zod schema in `src/domain/plants/species.ts`, loaded lazily with the garden chunk. Plants
reference it by a stable `speciesId` (for example `acer-campestre`). Ids are never reused or renamed; a
removed species keeps a tombstone entry so old files still render (as a generic shape of the same form).

A species record:

| Field                             | Meaning                                                                                 |
| --------------------------------- | --------------------------------------------------------------------------------------- |
| `id`, `name: { en, nl }`, `latin` | Identity and display. Names are bilingual in the data, not in the locale files.         |
| `form`                            | `tree`, `shrub`, `hedge`, `perennial`, `grass`, `climber`, `groundcover`                |
| `shape`                           | `round`, `columnar`, `conical`, `weeping`, `spreading`: drives the 2D glyph and 3D mesh |
| `matureHeight`, `matureSpread`    | mm, typical in a Dutch garden (not the record in the wild)                              |
| `yearsToMature`                   | years to reach 90% of mature size from a young plant                                    |
| `foliage`                         | `deciduous`, `evergreen`, `semi-evergreen`, `herbaceous` (dies back in winter)          |
| `leafOut`, `leafDrop`             | months (1 to 12), defaults 4 and 11                                                     |
| `colors`                          | `{ spring, summer, autumn, winter? }` leaf colours, hex                                 |
| `flower`                          | optional `{ color, from, to }` (months)                                                 |
| `sun`                             | `full`, `partial`, `shade`: preference, used for a hint against the sun-hours map       |
| `trunkHeight`                     | trees only: clear stem height as a fraction of total height                             |

**Content.** About 40 species chosen for a typical Dutch town garden: small trees (field maple, Amelanchier,
birch, crab apple, Japanese maple, magnolia, a fruit tree), hedge plants (beech, hornbeam, yew, privet,
cherry laurel), shrubs (hydrangea, lilac, Buddleja, boxwood, Viburnum, Pieris), perennials and grasses
(lavender, Geranium, Nepeta, Salvia, Hosta, Miscanthus, Pennisetum), climbers (ivy, clematis, wisteria,
climbing rose), ground cover. Plus generic entries for each form and size (small, medium, large tree;
evergreen and deciduous shrub; perennial) so any plant can be placed before its species is known. Sizes come
from general horticultural references and are typical values; they are editable later only by choosing
another species.

**Growth model.** One pure function, monomolecular growth from the recorded size towards mature size:

```
k = ln(10) / yearsToMature          // 90% of mature size after yearsToMature from size 0
years = (currentYear + growthYears) - (recordedYear ?? currentYear)
s = 1 - (1 - sizeAtPlanting) * exp(-k * max(years, 0))
height = matureHeight * s,  spread = matureSpread * s
```

It is monotonic, gives `sizeAtPlanting` at year 0, never exceeds mature size and needs one parameter per
species. `growthYears` (0 to 30) is view state: the "years from now" slider, shared by 2D and 3D.

**Seasonal look.** `seasonLook(species, month)` returns `{ state, leafColor, flowerColor? }` with `state`
one of `bare`, `leafing`, `full`, `autumn`, `dormant`:

- deciduous: `bare` from `leafDrop + 1` to `leafOut - 1`, `leafing` in `leafOut`, `full` until
  `leafDrop - 1`, `autumn` in `leafDrop`;
- evergreen: always `full` (winter colour if given);
- herbaceous: `dormant` in winter (drawn small and brown), otherwise as deciduous;
- flowering months add the flower colour.

The month comes from the **same date as the sun**, so one date slider drives both season and shadows.

### Sun path

**Location.** Use the existing optional `settings.location` (lat/lon). When it is absent, use a fixed
default in the centre of the Netherlands (52.1 N, 5.1 E). Across the Netherlands this default is off by at
most about 1.5 degrees of latitude, which changes the sun's height by about the same amount: good enough
for a garden. The plot inspector lets Bas set the location, but **the value is rounded to 0.1 degree
(about 10 km) before it is stored**, so a project file never holds the house's exact position. A
location-free model was considered and rejected: the sun's height depends on latitude, so some latitude is
always needed; the default supplies it.

**Time.** Date (month and day) and local clock time are view state, not part of the design. Clock time is
converted to UTC with the EU daylight-saving rule (summer time from the last Sunday of March 01:00 UTC to the
last Sunday of October 01:00 UTC, CET otherwise), as a pure function. This assumes the house is in the
Central European time zone; a time-zone setting is not needed for a house in the Netherlands.

**Algorithm.** `sunPosition(utcMs, latDeg, lonDeg)` uses the NOAA general solar position equations
(fractional year, equation of time, declination, hour angle), about 40 lines, no dependency. Accuracy is
better than half a degree, far below what matters for garden shadows. It returns altitude and azimuth
(degrees, azimuth clockwise from true north). `sunDirectionPlan(sun, northDeg)` turns that into a unit
vector in plan space (x, y, z up), using `Plot.northDeg`. `sunTimes(date, lat, lon)` gives sunrise, solar
noon and sunset in local minutes; `sunDayPath` samples the day for the compass arc.

**3D.** When "sun" is on, `SunLight` replaces the fixed directional light:

- light direction from `sunDirectionPlan`, converted to three.js axes;
- intensity and colour fade with altitude (warm and low near the horizon); below the horizon the
  directional light is off and the hemisphere light dims ("night");
- the shadow camera is an orthographic box fitted to the plot boundary, the buildings and the volumes, plus
  the tallest caster, rotated with the light. A tight box gives sharp shadows from a 2048 map;
- casters: walls, slabs, roof skin, volumes, line elements, tree trunks and canopies, shrubs. Receivers:
  ground, zones, walls, slabs. Glass panes do not cast shadows, so the sun shines into rooms through windows,
  which shows up with the cutaway view;
- leafless (`bare`) canopies do not cast shadows and are drawn as a faint wire-like crown;
- the scene still renders on demand; the time slider calls `invalidate()` at most once per animation frame.

With "sun" off, the current fixed light stays, so nothing changes for people who do not use it.

**2D.**

- A **sun compass** in the corner of the plan (screen space): north arrow, the day's sun arc from sunrise to
  sunset azimuth, the current sun direction and altitude, and the times of sunrise and sunset. Shown in
  both modes when sun is on. The north arrow is always shown in garden mode.
- A **shadow overlay** for the chosen moment. Every caster is turned into 3D planar faces (`Face3D`): the
  wall pieces from `wallPieces` (their clipped tops make gables correct), the roof skin faces, volume faces,
  line elements as thin vertical faces, and tree and shrub canopies as ellipsoids. Each face is projected
  onto the ground along the sun direction (`p - d * z / tan(altitude)`). All projected polygons are drawn
  inside one SVG group with opacity, so overlaps do not get darker and no polygon union is needed. This is
  exact for the modelled geometry. Canopies project to ellipses (16-point polygons).
- A **sun-hours map** for the chosen date: a grid over the plot (default 1000 mm cells, 500 mm optional),
  sampled every 15 minutes between sunrise and sunset; a cell counts as sunny at a sample when it is outside
  every projected shadow polygon (bounding-box prefilter, then point in polygon). It runs in a Web Worker
  (`sunHours.worker.ts`, a thin wrapper around a pure function) and is drawn as at most eight `<path>`
  elements, one per band (0 to 1 h, 1 to 2 h, ... 7 h and more), with a legend. It is computed on request
  ("Show sun hours") and recomputed when the date or the scene changes while it is visible.
- A plant whose `sun` preference is `full` but whose position gets less than 4 hours on the chosen date gets
  a small warning in the inspector (and the reverse for `shade` above 6 hours). Advice only.

### Roof

**Recommendation: defer the full roof model (dormers, hips, roof as its own editable object) to after Phase
5, and build only a derived roof skin now.**

Reasons:

- The garden goals need the house's silhouette and shadow, not dormers. The Phase 2 ceiling planes already
  describe the roof slopes of the attic, and the export's top-floor roof zones fit a saddle roof with knee
  walls, which the planes handle. A hip can already be approximated with extra planes.
- Dormers cut openings into sloped planes and add small walls and roofs of their own. That is new geometry
  in the wall-pieces pipeline (ADR 0008) and in slab and ceiling clipping: easily as large as the rest of
  this phase, with the most regression risk, for little garden value.
- Deferring costs nothing in data: the roof skin is derived, so a later roof model can replace it without a
  migration.

**Roof skin (built now).** `roofFaces(building, { overhangMm, thicknessMm })`, pure, in
`src/domain/model/roofSkin.ts`:

- for the top floor (and any floor with ceiling planes and no floor above it): each ceiling plane is lifted
  by the roof build-up thickness (default 300 mm), clipped to the floor's slab outline grown by the overhang
  (default 300 mm, convex clipping per plane with `clipHalfPlane`), and clipped against the other planes
  (the lower plane wins), giving one planar polygon per roof face;
- a floor with no planes and no floor above gets a flat roof: the slab outline at the top of the floor;
- the result feeds the 3D roof mesh (roof tile colour, underside in the ceiling colour) and the shadow
  casters. Under the cutaway and "up to active floor" stack modes the roof is hidden with its floor.

Overhang and thickness are constants in this phase (view settings, not stored). If Bas wants them per
house, they become a small schema field later.

### Rendering in 2D

Garden layers, bottom to top, all in plan millimetres inside the existing transform group:

1. plot underlays;
2. plot ground: the boundary polygon in a light ground colour, the outside left blank;
3. zones, larger first, filled with the material colour and a kind pattern (paving: fine grid matching a
   default module, gravel: dots, decking: lines, lawn: none), stroke darker; raised beds get a double edge;
4. sun-hours map (when on), semi-transparent;
5. shadow overlay (when sun is on and the sun is up);
6. ground floor footprint (filled slab outlines, walls as in building mode);
7. line elements: fence as a thin line with posts every 2 m, hedge as a thick soft band in the species
   colour, garden wall as a filled strip, edging as a thin line;
8. volumes: hatched footprint with height label;
9. plants: canopy at the current growth and season, from `plantGlyph(species, size, look)`: trees as a
   scalloped circle with a trunk dot, shrubs as a plain circle, perennials as a small circle with dots,
   grasses as a starburst, climbers as a short dashed arc; the mature spread is shown as a dashed circle
   when the plant is selected or being placed;
10. plot objects (Phase 3's object layer, reused);
11. labels: zone kind and area, volume heights, plant names (toggle);
12. screen-space HUD: north arrow, sun compass, sun-hours legend.

The element count stays well under the ~1000 elements that ADR 0001 assumes for a plan: plants are one
element each, the sun map is at most eight paths, shadows are one group of a few hundred polygons. If a
garden ever gets far more, shadows can be merged into one `<path>` with `fill-rule="nonzero"`.

### Rendering in 3D

New components in `src/render3d/garden/` and `src/render3d/sun/`, all inside the existing lazy `Scene3D`
chunk:

- **Plot ground**: the boundary polygon as a ground surface just above the generic plane; the generic plane
  stays outside the plot.
- **Zones**: `ShapeGeometry` at `elevation + 2 mm` (no z-fighting), extruded by `height` for raised beds
  and decking, pond slightly lowered, colour from the material. Receive shadows.
- **Line elements**: per segment a box (fence: thin, plus posts; hedge: soft green box with rounded top
  approximated by a bevel; garden wall: solid box). Cast and receive.
- **Volumes**: prisms, or a prism plus a gable top, in a neutral grey. Cast and receive.
- **Plants**: one `InstancedMesh` per (form, shape) pair, instance matrices from position and grown size,
  instance colours from the season. Trees are a trunk cylinder plus a canopy (sphere, tall ellipsoid, cone
  or flattened sphere by shape); shrubs an ellipsoid; perennials a flattened hemisphere; grasses a narrow
  cone. Low poly (canopy about 60 triangles). A few hundred plants cost a handful of draw calls.
- **Roof skin**: one mesh per face, extruded by the thickness.
- **SunLight** and the shadow frustum fit (see "Sun path").

Selection in 3D: clicking a plant, zone or line element selects it and switches the 2D plan to garden mode,
as clicking a wall switches to its floor today.

### UI

- **Floor switcher**: a "Garden" entry under the floors (icon: tree).
- **Garden tool rail** (lazy, shown in garden mode): select (V), pan (H), boundary (B), zone (Z), line
  element (L), plant (P), volume (M), object (O, Phase 3), calibrate (K). Tool options bar: zone kind and
  rectangle/polygon mode; line element kind, height, thickness; volume height and roof.
- **Drawing**: polygons are clicked point by point; clicking the first point, double-click or Enter closes;
  Escape cancels; typed lengths work as in the wall tool. Snapping: grid, plot boundary vertices and edges,
  ground-floor outer wall faces and corners, other zone vertices. Vertex editing on a selected polygon: drag
  a vertex, drag a midpoint handle to add a vertex, Delete on a hovered vertex removes it. Every drag is one
  undo step (transaction).
- **Plant picker**: a side panel with search (Dutch, English and Latin names), filters (form, evergreen,
  sun, height at maturity) and a colour swatch per species. Choosing a species arms the plant tool; each
  click places one plant; the tool stays armed. The placement preview shows the mature spread.
- **Inspectors**: plot (north, location with rounding note, area), zone (kind, material, elevation, raised
  height, area), line element (kind, height, thickness, species for hedges, length), volume (kind, height,
  roof), plant (species, "size now" as a percentage and as height/spread, recorded year, derived size at
  the slider, sun hint, "too close to the house" hint when the mature canopy overlaps the building
  footprint).
- **Time bar** (shown in 2D and 3D when sun is on, at the bottom): sun on/off, date slider (day of year with
  month labels and quick buttons for 21 March, 21 June, 21 December), time slider (sunrise to sunset in
  15-minute steps, the clock time shown), a play button that runs through the day, and the growth slider
  "years from now" (0 to 30). All sliders are the existing shadcn `Slider` (Radix: keyboard accessible).

### i18n

- UI strings for the garden go into a **lazy i18next namespace** `garden`, loaded with the garden chunk via
  `i18n.addResourceBundle`, so they do not count against the initial bundle. Files:
  `src/i18n/locales/{en,nl}/garden/{tools,inspector,sun,catalogue}.json`, merged into one namespace by the
  loader. Each work package owns its file, so parallel work does not conflict.
- The few strings in the initial chunk (the "Garden" entry, its tooltip) go into the main `en.json` and
  `nl.json`.
- Species names are bilingual in `species.json` (`name.en`, `name.nl`) plus a Latin name; they are data,
  not UI strings. A unit test checks every species has both names.
- Month names and times use `Intl.DateTimeFormat` with the current locale (no extra strings).

### Schema impact (v5)

On top of Phase 3's v4:

```ts
const GableTopSchema = z.object({ kind: z.literal('gable'), eaveHeight: mm.positive(), ridgeDeg: deg });
const FlatTopSchema = z.object({ kind: z.literal('flat') });

export const VolumeSchema = z.object({
  ...entityBase,
  kind: z.enum(['neighbour', 'shed', 'garage', 'other']),
  polygon: PolygonSchema,
  baseElevation: mm,
  height: mm.positive(),          // ridge height for a gable top
  roof: z.discriminatedUnion('kind', [FlatTopSchema, GableTopSchema]),
});

// PlantInstanceSchema gains:
recordedYear: z.number().int().min(1900).max(2200).optional(),

// PlotSchema gains:
underlays: record(UnderlaySchema).default({}),
volumes: record(VolumeSchema).default({}),
```

- `SCHEMA_VERSION` becomes 5. `migrateV4ToV5` sets `plot.underlays = {}` and `plot.volumes = {}` on every
  variant's scene, does not mutate its input, and leaves `recordedYear` absent. A frozen v4 fixture (from
  Phase 3) is added; released migrations are not touched.
- A `superRefine` on `GableTop` checks `eaveHeight <= height`. Zone and boundary polygons are not
  validated for self-intersection in the schema (files from older versions must still open); the tools
  enforce it.
- `settings.location` is unchanged; the rounding is a UI rule. ADR 0009 records it.
- Nothing derived is added: areas, roof faces, shadows, sun hours and plant sizes are all computed.

### Interaction with existing code

- `projectStore` gets `editPlot(label, recipe: (plot: Plot) => void)` on the active variant, recording
  patches like `editFloor`.
- `viewStore` gets: `planLayer`, garden `Tool` values (`boundary`, `zone`, `linear`, `plant`, `volume`),
  `Selection` kinds (`plot`, `zone`, `linear`, `plant`, `volume`, `plotUnderlay`), `sun: { enabled, month,
day, minutes }`, `growthYears`, `showSunHours`, `sunHoursCellMm`, `showPlantLabels`,
  `armedSpeciesId`, defaults for zone kind and line element kind. All persisted per viewer except
  `armedSpeciesId`; none in the project file or undo history.
- The calibrate tool and underlay layer take an underlay container (floor or plot) instead of assuming the
  floor. That is a small refactor of `useCalibrateTool` and `UnderlayLayer`.
- Snapping (`src/domain/snapping/snap.ts`) gets a candidate source for plot geometry and the ground-floor
  footprint; the snap rules themselves do not change.
- `Scene3D` mounts the garden group, the roof skin and `SunLight`; the fixed light is kept for "sun off".
- `findMaterial` also looks in `outdoorMaterials.json`.
- The ground floor for garden mode is the floor whose derived elevation is 0 (else the lowest floor).

### Performance and bundle

- **Initial chunk budget for Phase 4: at most 2 KB gzip.** It contains only the schema additions, the
  `viewStore` fields, `editPlot`, the "Garden" switcher entry and the lazy seam in `PlanView`.
- **Garden chunk** (`GardenPlan`, garden tools, inspectors, picker, time bar, sun math, glyphs, lazy i18n
  namespace): target under 40 KB gzip, loaded on first entry into garden mode or when sun is switched on.
- **Species data**: its own chunk (about 4 KB gzip), loaded with the garden chunk.
- **3D additions** go into the existing `Scene3D` chunk; target under 15 KB gzip extra.
- **Sun-hours worker**: its own chunk, only loaded when the map is requested.
- If the headroom after Phase 3 is below 4 KB, the first work package first moves something existing out of
  the initial chunk (candidates: the inspector sub-panels and the import dialog) before adding anything.
- 3D shadow cost: on-demand rendering means shadows cost nothing while idle. While scrubbing time, each frame
  re-renders the shadow map once (one extra pass over a few thousand triangles plus instanced plants).
  The shadow map stays 2048; the frustum fit keeps it sharp.

## Alternatives considered

- **Plants as `PlacedObject`s** (one placed-item concept for everything). Rejected: growth, season and
  species do not fit a furniture item, and the schema already has `PlantInstance`.
- **The garden as a floor** (a pseudo-floor in `floorOrder`). Rejected: floors have walls, rooms, slabs and
  elevations that make no sense for a plot, and the plot is shared by all buildings.
- **A sun library** (suncalc or similar). Rejected: the maths is short, the result must be unit-tested
  anyway, and a dependency adds bundle and supply-chain surface for little gain.
- **2D shadows by polygon union** (a clipping library). Rejected for this phase: drawing projected faces in
  one opacity group gives the same picture with no dependency. The union is needed only for net areas,
  which wait for Phase 5.
- **Canvas for the sun-hours map.** Rejected: banded SVG paths keep the plan vector-exportable (ADR 0001).

## Risks

1. **Bundle headroom.** 7.1 KB today, shared with Phase 3. Mitigation: everything lazy, a 2 KB cap for the
   initial chunk, a recovery step in the first work package, and the CI budget check on every PR.
2. **Shadow quality and speed in 3D.** A large frustum blurs shadows; scrubbing may stutter on a weak
   laptop. Mitigation: frustum fitted to plot and casters, `invalidate()` at most once per frame, shadows
   only when sun is on, a manual benchmark script with a synthetic 300-plant garden.
3. **Coupling with Phase 3.** Both phases touch the schema version, `viewStore` unions, materials, the
   object tool and the inspector. Mitigation: Phase 4 starts after Phase 3 is merged; the foundation work
   package owns all shared-file edits; the assumptions above are checked first.
4. **Floor-centric code paths.** Code that assumes an active floor (select tool, inspector, Delete key,
   ghost floor) may misbehave in garden mode. Mitigation: garden mode has its own select tool and
   inspector, and an e2e test switches modes with a selection active.
5. **Location privacy.** A precise lat/lon in an exported file would reveal the address. Mitigation:
   rounding to 0.1 degree on input, default without any location, synthetic fixtures only.
6. **Plant data quality.** Typical sizes vary a lot with pruning and soil. Mitigation: the data says
   "typical in a garden", every plant can be resized via "size now", and generic entries exist.
7. **Roof skin edge cases.** Planes that do not meet cleanly (one-sided slope next to a flat part) may give
   odd faces. Mitigation: unit tests for saddle, one-sided and flat cases; the skin can be switched off.

## Decisions and open questions

Recommended decisions (taken unless Bas says otherwise):

- Full roof model deferred; derived roof skin built now.
- Location rounded to 0.1 degree, default centre of the Netherlands, EU daylight-saving rule.
- Plants stay `PlantInstance` with a built-in species catalogue; no custom species in this phase.
- A shed and neighbouring houses are context volumes, not editable buildings.

Decisions (Bas, answered):

1. **Roof.** Dormers and hips deferred; a derived roof shows in 3D now. The inner ridge (top) height of the
   attic is 2.95 m: use it as the default for the derived roof and check it against the attic ceiling planes.
2. **Neighbouring houses.** Not needed: no neighbour shadow blocks. Context volumes stay for the user's own
   shed or outbuildings only.
3. **Plants.** Deferred. The species are not known yet; ship the built-in catalogue only.
4. **Location.** Used only for sun position and shadows. Bas supplied exact coordinates. The repo and Pages
   site are public, so the coordinates must NOT appear in source, fixtures, docs or tests. The source default
   stays the centre of the Netherlands. Bas enters the location in the app; it is rounded to 0.1 degree
   (about 10 km, no visible effect on the sun) and stored only in his local project. If he wants finer
   precision later, raise it to two decimals; still never commit it.

## Acceptance criteria

- Garden mode can be entered from the floor switcher and left again, returning to the same floor. The
  ground floor shows as a solid, snappable footprint.
- A plot boundary can be drawn with typed edge lengths, edited and undone; north can be set by typing and by
  dragging the arrow.
- Zones of each kind can be drawn as polygons and rectangles, edited by vertex, given a material, elevation
  and raised height; their area shows in the inspector and on the plan. A self-intersecting polygon is
  refused.
- A fence, a hedge, a garden wall and edging can be drawn and edited; a hedge takes a species.
- A context volume with a gable top can be placed; it appears in 3D and casts shadows.
- A cadastral image can be imported on the plot and calibrated.
- Plants can be picked from the catalogue (searched in Dutch and English), placed, moved and deleted, each
  in one undo step. The growth slider changes their size in 2D and 3D; the date changes their season.
- With sun on, the sun compass, the 2D shadow overlay and the 3D shadows follow the date and time; at
  night there are no shadows and the scene darkens. The 2D shadow of a box of known height has the expected
  length (tested).
- The sun-hours map shows bands and a legend for the chosen date, and a plant's sun hint uses it.
- The house has a roof in 3D derived from the attic's ceiling planes.
- A project with a full garden survives export, import and reload with no data change; a v4 file opens and
  migrates.
- Typecheck, lint, format, unit tests and Playwright tests pass; the initial JS stays under 250 KB gzip and
  grows by at most 2 KB in this phase.

## Testing

**Unit (Vitest, pure domain):**

- Sun: altitude at solar noon for latitude 52 on 21 June (about 61.4 degrees), the equinox (about 38) and
  21 December (about 14.6), within 0.5 degree; sunrise azimuth on 21 June about 50 degrees (north-east),
  within 1.5; a value from the NOAA calculator for one arbitrary date and time; DST boundaries on both sides
  of the March and October switches; `sunDirectionPlan` with `northDeg` 0 and 90.
- Shadows: a 1 m cube with the sun at 45 degrees gives a shadow 1 m long in the antisolar direction; a
  gable wall gives a pentagon-shaped projection; the sun below the horizon gives no polygons; an ellipsoid
  canopy projects to the expected ellipse bounds.
- Sun hours: a point 2 m north of a 10 m high wall gets 0 hours on 21 December and some hours on 21 June;
  an open plot gets the full day length (within one step).
- Growth: `s(0) = sizeAtPlanting`, monotonic, below 1, 90% at `yearsToMature` from 0, `recordedYear` in the
  past grows the plant.
- Season: deciduous by month, evergreen always full, herbaceous dormant in winter, flowering months.
- Catalogue data: every species parses, ids unique, both names present, sizes positive, `leafOut <
leafDrop`.
- Plot: polygon simplicity check, zone area, vertex insert and delete, snapping candidates from the
  footprint.
- Roof skin: saddle roof gives two faces meeting at the ridge, one-sided slope, flat roof, overhang grows
  the footprint.
- Schema: v4 to v5 migration on a frozen fixture; the migration does not mutate its input; a full garden
  round-trips through `projectFile` (synthetic data only).
- Store: `editPlot` undo and redo.

**Render units:** plant glyph paths, zone patterns, the 3D instance matrices and colours, the shadow
frustum fit and the light position from a sun vector.

**e2e (Playwright, Chromium):** `garden.spec.ts` (mode switch, boundary, zones, line elements, plants,
undo), `sun.spec.ts` (sun on, set date and time, the 2D shadow group exists and changes, 3D renders with no
console errors, night), `phase4-acceptance.spec.ts` (each acceptance line), plus screenshots for a visual
check. The bundle check runs in CI as now.

**Manual benchmark:** `scripts/bench-garden.mjs` builds a synthetic garden (house, 300 plants, four
volumes), scrubs the time in 3D in Playwright and reports frame times and the sun-hours worker time. Not a
CI gate.

## Work packages

Each package ends with typecheck, lint and its tests passing and its own commit on the phase branch
(`feat/phase-4-garden-plants`). "Owns" means only that package edits those files in this phase.

| WP  | Name                         | Owns (files)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Needs                        |
| --- | ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| 0   | Foundation                   | `src/domain/schema/{schema,migrations,factories,types,index}.ts`, `tests/unit/domain/schema/*` (v4 fixture, migration), `src/store/{projectStore,viewStore}.ts`, `src/render2d/PlanView.tsx` (lazy seam), `src/features/toolbar/{TopBar,ToolRail}.tsx`, `src/i18n/index.ts` (lazy namespace loader), main `en.json`/`nl.json` (Garden entry only), `src/features/garden/GardenPlan.tsx` and **stub files** with fixed exports for every other package, `src/domain/geometry/face3d.ts` (`Vec3`, `Face3D` types), `src/domain/furniture/types.ts` (`garden` group value only) | Phase 3 merged               |
| 1   | Sun maths                    | `src/domain/sun/{solar,time,direction,index}.ts`, `tests/unit/domain/sun/*`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | nothing                      |
| 2   | Shadows and sun hours        | `src/domain/sun/{casters,shadows,sunHours}.ts`, `src/features/garden/sun/sunHours.worker.ts`, `tests/unit/domain/sun/{shadows,sunHours}.test.ts`                                                                                                                                                                                                                                                                                                                                                                                                                             | WP0 types, WP1, WP8 contract |
| 3   | Plant catalogue and growth   | `src/domain/plants/{species,growth,season,index}.ts`, `src/data/plants/{species.json,index.ts}`, `tests/unit/domain/plants/*`                                                                                                                                                                                                                                                                                                                                                                                                                                                | nothing                      |
| 4   | Plot domain and snapping     | `src/domain/model/plot.ts` (polygon checks, areas, vertex edits, footprint, defaults by kind), `src/domain/snapping/snap.ts` (plot candidate source), `src/data/outdoorMaterials.json`, `src/data/materials.ts` (`findMaterial` merge), `src/data/catalogGarden.json` (plus its loading into the catalogue), `tests/unit/domain/plot.test.ts`                                                                                                                                                                                                                                | WP0                          |
| 5a  | 2D garden layers             | `src/features/garden/plan/*` (ground, zones, linears, volumes, plants, shadows, sun map, labels, HUD: north arrow and sun compass), `src/features/garden/plan/plantGlyphs.ts`, `tests/unit/features/garden/plan/*`                                                                                                                                                                                                                                                                                                                                                           | WP0; WP2, WP3 contracts      |
| 5b  | 2D garden tools              | `src/features/garden/tools/*` (select, boundary, zone, linear, plant, volume, `usePolygonEdit`), `src/features/garden/GardenToolRail.tsx`, `src/features/garden/GardenToolOptions.tsx`, `src/render2d/tools/useCalibrateTool.tsx` and `src/render2d/layers/PlanLayers.tsx` (underlay container), Phase 3's object tool hook (container: floor or plot), `src/i18n/locales/*/garden/tools.json`                                                                                                                                                                               | WP0, WP4                     |
| 6   | Inspectors, picker, time bar | `src/features/garden/inspector/*`, `src/features/garden/catalogue/PlantPicker.tsx`, `src/features/garden/sun/{TimeBar,SunToggle,LocationField}.tsx`, `src/i18n/locales/*/garden/{inspector,sun,catalogue}.json`                                                                                                                                                                                                                                                                                                                                                              | WP0; WP1, WP3, WP4 contracts |
| 7   | 3D garden and sun light      | `src/render3d/garden/*` (ground, zones, linears, volumes, instanced plants), `src/render3d/sun/{SunLight.tsx,shadowFrustum.ts}`, `src/render3d/Scene3D.tsx`, `tests/unit/render3d/garden*.test.ts`                                                                                                                                                                                                                                                                                                                                                                           | WP0; WP1, WP3 contracts      |
| 8   | Roof skin                    | `src/domain/model/roofSkin.ts`, `src/render3d/RoofMesh.tsx`, `tests/unit/domain/roofSkin.test.ts`                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | WP0 types                    |
| 9   | Integration, e2e, docs       | `tests/e2e/{garden,sun,phase4-acceptance}.spec.ts`, `tests/unit/domain/phase4RoundTrip.test.ts`, `scripts/bench-garden.mjs`, `docs/roadmap.md`, `docs/architecture.md`, `docs/decisions/0009-garden-mode-and-plot-schema-v5.md`, `docs/decisions/0010-sun-position-and-shadows.md`                                                                                                                                                                                                                                                                                           | all                          |

### Interface contracts

These signatures are fixed by WP0 (as stubs that throw or return empty values) so packages can work in
parallel and integrate without renegotiation:

```ts
// WP0: src/domain/geometry/face3d.ts
export interface Vec3 { x: number; y: number; z: number }          // mm, z = height above peil
export interface Face3D { points: Vec3[] }                          // planar, any winding

// WP1: src/domain/sun
export interface SunPosition { altitudeDeg: number; azimuthDeg: number } // azimuth clockwise from true north
export function sunPosition(utcMs: number, latDeg: number, lonDeg: number): SunPosition;
export function localToUtcMs(year: number, month: number, day: number, minutes: number): number; // CET/CEST
export function sunTimes(year: number, month: number, day: number, latDeg: number, lonDeg: number):
  { sunrise: number; noon: number; sunset: number } | null;        // local minutes; null = polar day/night
export function sunDirectionPlan(sun: SunPosition, northDeg: number): Vec3; // unit, towards the sun

// WP2: src/domain/sun
export type Caster = { kind: 'faces'; faces: Face3D[] } | { kind: 'ellipsoid'; center: Vec3; radii: Vec3 };
export function shadowCasters(scene: Scene, look: { growthYears: number; month: number; year: number },
  species: SpeciesIndex, roof: Face3D[]): Caster[];
export function projectShadows(casters: Caster[], sunDir: Vec3): Polygon[];
export function sunHoursGrid(casters: Caster[], input: { year: number; month: number; day: number;
  latDeg: number; lonDeg: number; northDeg: number; bounds: { min: Vec2; max: Vec2 };
  cellMm: number; stepMin: number }): { origin: Vec2; cellMm: number; cols: number; rows: number;
  hours: Float32Array };

// WP3: src/domain/plants
export type SpeciesIndex = Record<string, Species>;
export function plantSize(species: Species, plant: PlantInstance, growthYears: number, currentYear: number):
  { height: number; spread: number };
export function seasonLook(species: Species, month: number):
  { state: 'bare' | 'leafing' | 'full' | 'autumn' | 'dormant'; leafColor: string; flowerColor?: string };

// WP4: src/domain/model/plot.ts
export function polygonIssues(polygon: Polygon): Array<'too-few-points' | 'self-intersecting'>;
export function zoneDrawOrder(zones: Record<Id, Zone>): Id[];       // larger first
export function groundFootprint(building: Building): Polygon[];       // ground-floor slab outlines

// WP8: src/domain/model/roofSkin.ts
export function roofFaces(building: Building, opts: { overhangMm: number; thicknessMm: number }): Face3D[];

// WP0: src/store/projectStore.ts
editPlot: (label: string, recipe: (plot: Plot) => void) => void;
```

## Parallelisation plan

Phase 4 starts only after Phase 3 is merged and Bas has approved this design. One orchestrating session
runs the waves below, each agent in its own git worktree off the phase branch, merging back after each wave.
Agents never edit files owned by another package; when they need a change there, they report it to the
orchestrator instead.

**Wave 1 (three agents in parallel, no shared files):**

- WP0 Foundation (one agent, sonnet). Starts with the bundle check and the recovery step if needed, then
  schema v5 and migration, store fields, the lazy seam with a no-op tool, the lazy i18n loader, `Face3D`
  types, and stubs for every contract above. Ends with all tests green and the initial chunk measured.
- WP1 Sun maths (sonnet). Pure, depends on nothing.
- WP3 Plant catalogue and growth (sonnet). Pure plus data, depends on nothing. The species list waits for
  Bas's answer to open question 3; the agent starts with the generic entries and the 40 defaults.

Merge wave 1. Gate: typecheck, lint, unit tests, bundle check.

**Wave 2 (four agents in parallel):**

- WP2 Shadows and sun hours (opus: the geometry is the riskiest maths). Uses WP1 and the WP8 contract.
- WP4 Plot domain and snapping (sonnet).
- WP7 3D garden and sun light (sonnet). Uses WP1 and WP3 directly, mounts the WP8 stub.
- WP8 Roof skin (opus: clipping planes against each other).

Merge wave 2. Gate as above plus a 3D smoke test (the scene renders with a synthetic garden and sun on).

**Wave 3 (three agents in parallel):**

- WP5a 2D garden layers (sonnet). Uses WP2, WP3, WP4.
- WP5b 2D garden tools (sonnet). Uses WP4; the only package that touches `useCalibrateTool` and
  `PlanLayers.tsx`.
- WP6 Inspectors, picker, time bar (sonnet). Uses WP1, WP3, WP4.

Merge wave 3. Gate as above.

**Wave 4 (one agent, sequential):** WP9 integration: e2e specs, round-trip test, benchmark script, ADRs 0009
and 0010, roadmap and architecture updates, final bundle check. Then the `code-reviewer` and
`security-auditor` agents (opus) review the phase diff; the location rounding and the worker are the
security-relevant parts. Then a summary to Bas and a stop before Phase 5.

Critical path: WP0 then WP2 then WP5a then WP9. WP1 and WP3 are off the critical path because they run in
wave 1 alongside WP0. If time is short, the cut line is: drop the sun-hours map (WP2 `sunHours`, the worker,
the map layer and the plant sun hint) and the play button; everything else stays.
