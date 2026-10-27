# 0003: Local-first, storage-agnostic persistence

- Status: accepted (2026-10-27)
- Context: two users on their own laptops, no accounts in v1, and a wish to keep the platform open for sync later.
- Decision: all persistence goes through a `ProjectRepository` interface. v1 adapters: IndexedDB (autosave) and JSON files (export/import, plus File System Access "save to file" in Chrome/Edge). Imports never overwrite: they create a new project or add variants to the open one.
- Consequences: no merge of concurrent edits in v1 (each person works in their own variant). A Supabase adapter can be added in Phase 6 without touching the domain.
