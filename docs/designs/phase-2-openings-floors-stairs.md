# Phase 2 design: doors, windows, floors and stairs

Status: draft for review (2026-10-27). Nothing in this document is built yet.

## Goal

After Phase 2, Bas can trace the real house on three floors and place the doors, windows and stairs that
exist today. The roadmap's "done when" line is: swing arcs show in 2D and holes show in 3D.

## What exists today

- Walls, rooms, snapping, undo/redo, storage and the 2D/3D views are built and merged (Phases 0 and 1).
- The scene schema (v2) already has `Opening` (door or window on a wall), `Stair` and `Floor` shapes. The
  floor elevation is derived (`floorElevations`, ADR 0006).
- The editor can only work on the ground floor. There is no way to add a floor, place an opening or place a
  stair. Walls are drawn as solid prisms in 3D.
- `fitOpenings` and `normalizeFloor` already keep openings inside their wall when walls are split or
  resized. The 3D wall is a single prism, so openings need new geometry (ADR 0002 chose procedural slicing,
  not CSG).

## Scope

In scope:

1. Place, edit, move and delete doors and windows. Door operations: swing, double swing, sliding, pocket,
   doorway (no leaf). Window operations: fixed, tilt-turn, casement, sliding, top-hung.
2. Show openings in 2D (gap in the wall, swing arc, sliding track, window lines) and in 3D (hole through the
   wall with a frame, leaf or glass).
3. Add, rename, re-height, delete and switch floors. Show the floor below as a faint "ghost"
   in 2D. Show all floors stacked in 3D, with a control to hide floors above the active one.
4. Place and edit stairs (straight, quarter-turn, half-turn, spiral). Show the stair on both floors it
   connects. Cut a hole in the upper floor's slab where the stair arrives.
5. Floor slabs in 3D, derived from the walls, with the stair holes cut out.

Out of scope (later phases): sloped ceilings and roofs (Phase 4 optional item), arched openings, furniture
(Phase 3), curtains, door hardware, building-to-plot transforms (`Building.position` stays 0).

## Design

### Openings

**Placement.** A door tool and a window tool, each with a width/height preset (Dutch defaults: door 930 x
2315 mm, window 1200 x 1200 mm at 900 mm sill; changeable per opening). While the pointer moves, the tool
finds the nearest wall within a pixel tolerance, projects the pointer onto it and shows a preview. A click
creates the opening. The result is clamped by `fitOpenings`, so it never overlaps another opening and keeps at
least 100 mm of wall at each end. If no free position fits, the tool shows the preview in red and does not
create it.

**Moving.** The select tool can drag an opening along its wall and onto another wall of the same floor.
Dragging is one undo step (a transaction). Flip buttons in the inspector change `hinge` and `opensTo`.

**Inspector.** Width, height, sill height, operation, hinge, opens-to, frame colour. Numbers accept typed
values in the user's units, like the wall inspector.

**Derived wall pieces.** A pure function `wallPieces(wall, outline, openings)` returns, for each wall, the
solid parts of the wall: full-height pieces between openings, a piece below each sill and a piece above each
head. The 2D view draws only the pieces that reach the floor (so the opening shows as a gap), and the 3D view
extrudes every piece. One function feeds both views, so they cannot disagree. Nothing derived is stored.

**2D symbols.** `OpeningSymbol` draws, on top of the wall gap:

- swing door: leaf line plus a quarter-circle arc on the `opensTo` side, hinge at the `hinge` end;
- double swing: two half-width leaves with two arcs;
- sliding: a leaf rectangle offset into the wall plus a track line; pocket: the same, with the leaf hidden
  inside the wall;
- doorway: the gap only;
- windows: three parallel lines across the gap (frame and glass), with a sash line for casement or
  tilt-turn.

**3D geometry.** For each opening: a frame (four boxes), and for doors a leaf (swing doors rotated to a
default 0 degrees, i.e. closed; open-door preview is not in this phase), for windows a glass pane. Colours
come from `frameColor` and the leaf finish.

### Floors

**Floor management.** A floor panel lists the floors top to bottom with add-above, add-below, rename,
height and delete. A new floor is empty; a "copy walls from the floor below" option helps tracing because
the house has the same outer walls on each level. Deleting a floor asks for confirmation, lists what is lost
(walls, rooms, stairs) and is one undo step. Changing a floor height moves all floors above it (derived
elevation).

**Switching.** The active floor id lives in `viewStore` (already so). Switching changes which floor the 2D
view shows and edits.

**Ghost floor.** The 2D view draws the floor below at 25% opacity, as outlines only, non-interactive and not
snappable. A toggle turns it off. The floor above is not shown.

**3D stack.** The 3D view draws every floor at its derived elevation. A control cycles between "all floors",
"up to the active floor" and "active floor only".

### Stairs

**Footprint.** `stairGeometry(stair)` (pure, in `src/domain/model/stairs.ts`) derives the step polygons, the
walking-line arrow and the overall outline from the stair record, using `position`, `rotationDeg`, `width`,
`runLength`, `steps`, `shape` and `turn`. Quarter and half-turn stairs use winder-free landings: a square
landing at the turn, with the remaining steps split between the two flights.

**Tool.** The stair tool takes two clicks: the bottom of the run and its direction. Shape, width and step
count are set in the inspector. The default step count comes from the floor-to-floor height divided by a
target riser of 180 mm, rounded. The inspector shows the resulting riser and tread depth and warns when the
riser is above 200 mm or the tread below 220 mm (Dutch building rules of thumb; a warning, not a block).

**Two floors.** A stair belongs to the building and links `fromFloorId` to `toFloorId`. It is drawn on the
lower floor as a full stair with an "up" arrow and on the upper floor as a dashed outline with a "down" arrow.

**Slab voids.** If `cutsVoid` is true, the stair footprint is cut out of the slab of `toFloor`. The void is
derived when the slab is built. It is not stored.

### Slabs

`floorSlab(floor, stairsArrivingHere)` (pure) returns the slab polygon of each connected group of walls
(the outer boundary, including wall thickness) with the stair footprints subtracted as holes. The 3D view
extrudes it by `slabThickness`. Room finishes still render on top, as today. A floor with no closed walls
gets no slab.

### Schema impact

No schema change is planned. `Opening`, `Stair` and `Floor` already carry every field used above. If review
finds a missing field, the change goes into schema v3 with a migration; `SCHEMA_VERSION` bumps only in that
case.

### Interaction with existing code

- `normalizeFloor` and `fitOpenings` keep openings valid when walls change. The door tool reuses
  `fitOpenings`.
- Opening edits go through `editFloor` with an exact floor id (Phase 1 hardening), so an edit can never land
  on the wrong floor.
- Floor geometry stays cached per frozen floor (`floorGeometry`). Wall pieces and slabs are added to that
  cache.
- Every new string goes into `en.json` and `nl.json`.

## Risks and open questions for Bas

1. **Wall alignment between floors.** Upper floors rarely line up exactly with the floor below. The design
   does not force alignment. The ghost floor is the only aid. Is that enough, or should walls snap to the
   ghost floor's walls?
2. **Stair shapes.** The house's real stairs are not in this document. Which shapes do you need first?
   Spiral stairs are the most work; the design lists them but they can move to a later step.
3. **Attic.** The attic has sloped ceilings. Phase 2 keeps flat ceilings, so wall heights there are wrong
   until the optional roof generator exists. Acceptable for now?
4. **Delete-floor safety.** Delete is undoable and confirmed. Is that enough, or should it also refuse when
   stairs still connect to the floor?
5. **Door presets.** The default sizes above are common Dutch sizes. Tell me if your house uses others and
   I will change the defaults.

## Acceptance criteria

- A door of each operation and a window of each operation can be placed on a wall, moved along it and to
  another wall, edited in the inspector, and deleted, each in one undo step.
- Swing arcs, sliding tracks and window lines are visible in 2D at the right size and side.
- In 3D, each opening is a hole through the wall with a frame and leaf or glass; the wall above and below
  it is solid.
- A second and third floor can be added, switched to, renamed, re-heighted and deleted. Raising the ground
  floor height moves the floors above it.
- The floor below shows as a ghost in 2D and can be switched off.
- A stair between two floors shows on both floors; the upper slab has a hole where it arrives; the 3D view
  shows the stair and the hole.
- A project with three floors, openings and stairs survives export, import and reload with no data change.
- Typecheck, lint, format, unit tests and Playwright tests pass; the initial JS stays under 250 KB gzip.

## Detailed Implementation Plan

Each step ends with typecheck, lint and tests passing and its own commit. Branch:
`feat/phase-2-openings-floors-stairs`.

1. **Wall pieces (domain).** Add `src/domain/model/openings.ts` with `wallPieces` and helpers for the
   opening's rectangle in plot space. Unit tests: no openings, one door, door at the wall end, two windows,
   window sill and head pieces, thick walls.
2. **Opening placement (domain).** Add `nearestWall(floor, point, tolerance)` and `placeOpening(floor, spec,
wallId, offset)` that returns the clamped opening or `null`. Tests: free, overlapping, too close to the
   end, wall too short.
3. **Door and window tools (UI).** Add `useOpeningTool` in `src/render2d/tools/`, add tool buttons to
   `ToolRail`, preview with a red state, and add `Tool` values and shortcuts (`D`, `N`) in `viewStore`. e2e:
   place a door and a window, undo.
4. **2D rendering.** Update the wall layer to draw `wallPieces`, add `OpeningSymbol` for all door and window
   operations, add selection and hover. Visual check with Playwright screenshots.
5. **Select and inspector for openings.** Drag along a wall and to another wall (transaction), inspector
   fields, flip buttons, delete. e2e: edit width and sill, flip a swing.
6. **3D openings.** Replace the single prism in `render3d/geometry.ts` with the pieces from step 1, add
   frames, leaves and glass. Unit test the piece geometry (vertex counts, bounds). e2e: the 3D view renders
   with a door.
7. **Floor management.** Add `floors.ts` in `src/domain/model/` with `addFloor`, `removeFloor`,
   `copyWallsFrom`, plus the floor panel in `src/features/`. Delete lists what is lost and clears stairs that
   reference the floor. Tests for each, including undo.
8. **Floor switching and ghost floor.** Floor switcher in the top bar, ghost layer in the plan view with a
   toggle, and the 3D stack modes. e2e: add a floor, draw on it, see the ghost.
9. **Stairs (domain).** Add `stairs.ts` with `stairGeometry` and `defaultStepCount`. Tests for each shape:
   step count, outline bounds, walking line, riser and tread values.
10. **Stair tool and inspector.** Two-click tool, inspector fields and riser/tread warnings, 2D symbol on
    both floors.
11. **Slabs and voids.** Add `floorSlab` and render slabs in 3D with stair holes. Tests: a square with and
    without a void, a stair outside the slab, two wall groups.
12. **Round trip and polish.** Export/import test with three floors, openings and stairs. Update
    `docs/roadmap.md`, `docs/architecture.md`, and write ADRs for the wall-pieces approach and the slab
    derivation. Check the bundle budget.
13. **Acceptance run.** Add `tests/e2e/openings-floors.spec.ts` covering each acceptance line, run the full
    suite, then summarise and wait for Bas's approval before Phase 3.
