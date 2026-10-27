# 0005: Normalised scene graph, derived geometry, Zod as source of truth

- Status: accepted (2026-10-27)
- Decision: entities live in `Record<Id, T>` maps with UUIDs; walls share nodes; rooms store metadata plus an anchor point; outlines, polygons and areas are derived. Zod schemas define the file format and TypeScript types are inferred from them. Files carry `schemaVersion` and are migrated before validation.
- Consequences: small Immer patches for undo/redo, stable JSON diffs, no stale derived data, and validated imports with readable error paths.
