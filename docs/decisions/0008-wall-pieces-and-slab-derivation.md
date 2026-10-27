# 0008: Wall pieces and slab derivation

Status: accepted

## Context

Phase 2 adds openings, stairs and several floors. The 2D plan must show a gap where a door or window is,
and the 3D view must show a hole with a frame and leaf or glass. Upper floors need a slab with a hole where a
stair arrives. See `docs/designs/phase-2-openings-floors-stairs.md` and ADR 0002 (procedural openings, no CSG).

## Decision

- `wallPieces(floor, wall, openings, ceilingHeightAt)` returns the solid parts of a wall: full-height pieces
  between openings, a piece below each sill and a piece above each head. Tops follow the ceiling planes.
  Both views are built from these pieces: 2D draws the pieces that reach the floor, 3D extrudes all of them.
- `floorSlabs(floor, arrivingStairs)` derives one slab per connected group of walls (outer boundary, wall
  thickness included) and subtracts the footprint of each stair with `cutsVoid` that arrives on the floor
  (`toFloorId`) as a hole, when it lies fully inside the slab. A floor without a closed wall loop has no slab.
- Nothing derived is stored. Pieces, slabs, voids, wall outlines and headroom are computed from walls,
  openings, stairs and ceiling planes. Outlines and rooms are cached per frozen floor object in `floorGeometry`.

## Consequences

- 2D and 3D cannot disagree about where a wall is open, and moving a wall, opening or stair updates slabs and
  holes with no extra bookkeeping.
- Files stay small and cannot hold stale geometry; the round-trip test compares derived data before and after
  export and import.
- A stair that crosses the slab edge makes no hole (it is ignored, not clipped). Revisit if the real house needs it.
- Derived results are recomputed on every committed edit of a floor; the per-floor cache keeps this cheap.
