# 0006: Derive floor elevation, schema v2

Status: accepted

## Context

Schema v1 stored both `Floor.elevation` and the floor-to-floor `height`. The elevation of an upper floor
follows from `floorOrder` and the heights below it, so storing it broke the rule that derived data is never
stored. Changing one floor height left the floors above it floating or overlapping.

## Decision

- Remove `Floor.elevation`. `floorElevations(building)` and `floorElevation(building, floorId)` in
  `src/domain/schema/floors.ts` derive it: the ground floor is 0, floors below it are negative, and the sum
  uses floor-to-floor heights (which already include the slab).
- `SCHEMA_VERSION` is 2. `migrateV1ToV2` strips `elevation`. The released v1 migration is untouched and a
  frozen v1 fixture is kept in the tests.
- `parseProjectFile` also checks references (walls to nodes, openings to walls, stairs to floors, `*Order`
  arrays to their maps), so a file that would crash the plan view is rejected at import.
- Opening and stair fields that Phase 2 relies on are documented in the schema comments.

## Consequences

- Changing a floor height moves every floor above it. This is the wanted behaviour.
- Files saved by the v1 app migrate on load. Files from v2 do not open in older builds.
