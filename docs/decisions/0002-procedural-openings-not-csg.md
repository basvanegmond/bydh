# 0002: Procedural wall slicing for openings instead of CSG

- Status: accepted (2026-10-27)
- Context: the brief proposed three-bvh-csg to cut door and window holes in 3D walls.
- Decision: build each wall as solid pieces around its openings (below sill, above head, between openings) in pure TypeScript.
- Consequences: deterministic, unit-testable geometry and no CSG cost on every edit. CSG stays an option for non-rectangular (arched) openings later.
