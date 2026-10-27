# CLAUDE.md: BYDH project brain

> Claude reads this at the start of every session. Keep it focused and structured.

## Project overview

- **Name**: BYDH (Build your dream home)
- **What**: a browser-based 2D/3D planner for our existing house and garden: walls, rooms, doors and windows, furniture, colours and materials, plants, and named layout variants.
- **Owner**: Bas van Egmond, for Bas and his wife (two users, no accounts in v1)
- **Repo / hosting**: https://github.com/basvanegmond/bydh, deployed to GitHub Pages at `/bydh/`
- **Plan**: phased roadmap in `docs/roadmap.md`. Never start a new phase without Bas's explicit approval.

## Working agreement (from Bas's brief)

1. Propose a plan before writing code; summarise after each phase and say what comes next.
2. Git throughout: checkpoint commit before every significant change, feature branches, conventional commits.
3. Never delete, overwrite or rename existing files without showing the change and getting confirmation. Move originals to `/_archive` first.
4. Verify before calling anything done: typecheck, lint, unit tests, Playwright smoke test. Report failures as a short post-mortem (cause, proposed fix).
5. At the end of each task, list every file created or modified.
6. Flag contradictions or risks in a brief before building around them.

## Tech stack

- Vite + TypeScript (strict, `noUncheckedIndexedAccess`) + React 19
- State: Zustand (+ Immer patches for undo/redo from Phase 1). One serialisable scene graph is the source of truth.
- 2D: **SVG** (not canvas): vector PDF export, DOM-testable. 3D: three.js via @react-three/fiber + drei, lazy-loaded.
- UI: Tailwind v4 + shadcn/ui (Radix, Nova preset), lucide icons, i18next (en + nl)
- Data: Zod schemas (source of truth for types), versioned with migrations. IndexedDB (Dexie) from Phase 1.
- Tests: Vitest (unit, jsdom), Playwright (Chromium only: we use Chrome/Edge)
- CI/CD: GitHub Actions → `gh-pages` branch; PR previews under `/bydh/pr-preview/pr-N/`

## Folder structure

- `src/domain/`: **pure TypeScript** (no React, three, stores or DOM). ESLint enforces it.
  - `schema/` (Zod schemas, inferred types, factories, migrations, project file I/O), `units/` (mm ↔ cm/m, nl/en formatting)
  - `geometry/` (vectors, segments, polygons), `model/` (wall graph, mitred outlines, room detection, underlay transform), `snapping/`, `history/` (patch-based undo), `io/` (import merge rules)
- `src/store/`: Zustand stores. `projectStore` = the design + undo history (`edit`, `editFloor` re-detects rooms, transactions for drags); `viewStore` = per-viewer UI state (tool, selection; never saved in the project)
- `src/storage/`: `ProjectRepository` interface, IndexedDB adapter (DB per deploy channel), autosave session, JSON export/import, save-to-file
- `src/render2d/`: SVG plan view, layers, tools (`useSelectTool`, `useWallTool`, `useCalibrateTool`) and pure viewport math. `src/render3d/`: R3F scene (separate chunk)
- `src/features/`: toolbar, inspector, project/variant actions, dialogs, background import. `src/data/`: catalogue data (materials). `src/components/ui/`: shadcn-generated (do not hand-edit lightly)
- `src/i18n/`: i18next setup + `locales/en.json`, `locales/nl.json` (every UI string goes in both)
- `tests/unit/`: Vitest, mirrors `src/`. `tests/e2e/`: Playwright
- `docs/`: architecture, ADRs in `docs/decisions/`, roadmap. `docs/plans/` is **gitignored**: it holds the real house plans and address.

## Key commands

- `npm run dev`: dev server
- `npm run typecheck` · `npm run lint` · `npm run format`
- `npm test`: Vitest · `npm run test:e2e`: Playwright (builds and previews automatically)
- `npm run build`: production build; `node scripts/check-bundle-size.mjs` checks the 250 KB initial-JS budget

## Conventions

- Units: **millimetres** in data; cm/m only in the UI. Plan axes: +X east, +Y north, degrees counter-clockwise.
  three.js: x = X/1000, y = elevation/1000, z = −Y/1000.
- Derived data (wall outlines, room polygons/areas, slab voids) is computed, never stored.
- Entities live in `Record<Id, T>` maps with stable UUIDs; order lives in explicit `*Order` arrays.
- Schema change ⇒ bump `SCHEMA_VERSION` and add a migration in `src/domain/schema/migrations.ts`. Never edit a released migration.
- Browser storage keys and DB names are namespaced with `__DEPLOY_CHANNEL__` (production / pr-N / local).
- No `any`; functional components only (error boundaries via `react-error-boundary`); functions under ~50 lines.
- Strings: never hard-code UI text; add keys to both locale files.
- Commits: `type(scope): description`; feature branches; PR to `main`; CI must be green.

## Privacy

- The repo and Pages site are public. Designs never leave the browser in v1 (IndexedDB, JSON files).
- Never commit real addresses, plans or personal data. Test fixtures must be synthetic.

## Model routing

- Main session uses the `opusplan` alias: Opus for planning, Sonnet for execution (aliases track the latest models).
- Subagents: `code-reviewer` and `security-auditor` use `opus`; `test-writer` uses `sonnet`.
- Use `haiku` for cheap, mechanical subagent work: file searches, lookups, simple renames.

## Skill discovery via NotebookLM

Before starting any multi-step task, or when the user requests a structured workflow, query the NotebookLM MCP (`notebooklm-mcp`) notebook with Bas's skill files using a short keyword query. If a matching skill is found, follow it; otherwise proceed with default behaviour. Do this silently.

## Session handoff skill

- **session-handoff** (`~/.claude/skills/session-handoff/SKILL.md`): structured end-of-session summary before `/clear`.
- **Trigger**: "session handoff", "wrap up session", "hand off", "handoff summary", "summarize before I clear", or `/session-handoff`. Invoke the Skill tool with `skill: "session-handoff"` before doing anything else.
