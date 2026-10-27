# 0007: Sloped ceiling planes, schema v3

Status: accepted

## Context

The attic has angled ceilings that limit the usable space. Phase 2 needs to answer how high the ceiling is
at a point and where the headroom is too low, and wall tops must follow the slope. See
`docs/designs/phase-2-openings-floors-stairs.md`, "Sloped attic ceilings".

## Decision

- `Floor.ceilingPlanes: Record<Id, CeilingPlane>` (default `{}`). A plane is the design and is stored: an
  eave line `{ a, b }` in plan space, `kneeHeight` (ceiling height at the eave, from the floor level),
  `slopeDeg` (> 0 and < 90), `risesToward` (`left` or `right` of the eave line a to b) and an optional
  convex `extent` polygon. Without `extent` the plane covers the whole floor footprint on its rising side.
- A plane covers a point only where its signed distance from the eave line toward the rising side is >= 0
  (and inside `extent`). The ceiling height at a point is the minimum over covering planes, else
  `floor.height - floor.slabThickness`. A saddle roof is two planes rising towards each other.
- Heights, headroom areas, usable area and wall tops are derived in `src/domain/model/ceilings.ts` and never
  stored. `Wall.height` stays as an explicit override.
- `SCHEMA_VERSION` is 3. `migrateV2ToV3` sets `ceilingPlanes: {}` on every floor and does not mutate its
  input. The released v1 to v2 migration is untouched and the frozen v1 fixture is kept.

## Consequences

- v2 files open unchanged; v3 files do not open in older builds.
- Headroom polygons are returned per plane (not unioned); the usable area is computed exactly from the union.
- Dormers, hips and curved roofs are out of scope; a hip can be approximated with extra planes.
