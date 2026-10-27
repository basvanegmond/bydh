# Architecture

## Overview

BYDH is a static single-page app. There is no backend in v1: the browser holds everything.

```
             ┌───────────────── src/domain (pure TypeScript) ─────────────────┐
             │ schema (Zod) · units · geometry · model · snapping · history · io│
             └───────────────▲──────────────────────────────▲─────────────────┘
                             │ pure functions                │
   ┌──────────── src/store ──┴─────────┐             ┌──────┴──────────┐
   │ projectStore: the design (undoable) │◀── edits ──│ features / tools │
   │ viewStore: per-viewer UI state      │            └─────────────────┘
   └───────┬───────────────────┬────────┘
           │ same scene graph  │
   ┌───────▼──────┐    ┌───────▼────────┐        ┌───────────────────────┐
   │ render2d     │    │ render3d       │        │ storage (Phase 1)     │
   │ SVG plan     │    │ R3F, lazy chunk│        │ IndexedDB · JSON file │
   └──────────────┘    └────────────────┘        └───────────────────────┘
```

## Key rules

1. **One scene graph.** 2D and 3D both render from the project store, so they cannot drift apart.
2. **Domain is pure.** `src/domain` has no React, three.js, store or DOM imports (ESLint `no-restricted-imports`). Geometry, snapping, room detection and serialisation are unit-tested without a browser.
3. **Store data, derive geometry.** Walls share `WallNode`s; openings are hosted on walls by offset; rooms store a name, finish and an anchor point. Outlines, room polygons and areas are computed from that and never saved.
4. **Millimetres everywhere.** Display units are formatting only.
5. **Versioned files.** Every project file carries `schemaVersion`; `migrateToCurrent` upgrades old files before Zod validation.

## Data model

See `src/domain/schema/schema.ts`. Hierarchy:

`ProjectFile → Project → Variant[] → Scene → { Plot, Building[] → Floor[] → walls, openings, rooms, objects, plants, underlays, dimensions }`

The project `Library` (materials, palettes, own catalogue items, asset references) is shared by all variants.

## Derived geometry (Phase 2)

Nothing derived is stored. These pure functions in `src/domain/model/` compute it from the scene:

- **Wall pieces** (`wallPieces` in `openings.ts`): the solid parts of each wall (full-height pieces between openings, a piece below each sill and above each head), with tops clipped by `wallCeilingHook`. The 2D plan draws the pieces that reach the floor; the 3D scene extrudes all of them. One function feeds both views, so they cannot disagree. See ADR 0008.
- **Slabs** (`floorSlabs` in `slabs.ts`): one slab per connected group of walls (outer boundary, wall thickness included), with the footprint of every stair that arrives on the floor and has `cutsVoid` subtracted as a hole.
- **Ceiling planes** (`ceilings.ts`): `Floor.ceilingPlanes` are stored (they are the design). `ceilingHeightAt`, wall tops, headroom areas and usable area are derived. See ADR 0007.
- **Floor geometry cache** (`floorGeometry.ts`): wall outlines and room geometry are computed once per frozen (committed) floor object in a `WeakMap`, shared by the 2D plan, the 3D scene and the inspector. Drafts are never cached.
- **Floor elevations** (`floorElevations`): derived from `floorOrder` and floor heights, so changing a height moves every floor above it.
- **Schema v3**: adds `Floor.ceilingPlanes` (the v2 to v3 migration sets `{}`).

## Data flow

- **Edit**: a tool calls a store action → the action applies a pure domain operation through Immer and records patches for undo (Phase 1).
- **Render**: components select from the store; memoised selectors compute derived geometry.
- **Persist** (Phase 1): debounced autosave to IndexedDB, namespaced per deploy channel; explicit JSON export/import (assets embedded as base64); "Import as new project" or "Add as variant".

## Deploy channels

`DEPLOY_CHANNEL` (`production`, `pr-<n>`, `local`) is compiled in as `__DEPLOY_CHANNEL__` and used to namespace browser storage. PR previews share the `basvanegmond.github.io` origin with production, so without this a preview with a newer schema could migrate real data.

## External dependencies

| Dependency                         | Why                                                              |
| ---------------------------------- | ---------------------------------------------------------------- |
| React 19, Vite                     | UI and build                                                     |
| Zustand (+ Immer)                  | Small, serialisable store; patches for undo/redo                 |
| Zod                                | Runtime validation of imported files; source of TypeScript types |
| three.js, @react-three/fiber, drei | 3D view                                                          |
| Tailwind v4, shadcn/ui (Radix)     | Accessible UI components                                         |
| i18next                            | English and Dutch                                                |
| Vitest, Playwright                 | Unit and browser tests                                           |

Decisions are recorded in [decisions/](decisions/).
