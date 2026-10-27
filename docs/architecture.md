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
