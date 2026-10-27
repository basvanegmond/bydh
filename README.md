# BYDH: Build your dream home

A browser-based planner for designing a home and garden together: draw the floor plan in 2D, walk through it in 3D, furnish and colour it, and compare layout variants. English and Dutch.

**Live app:** https://basvanegmond.github.io/bydh/

> Status: Phase 0 (foundations). The editor shell, 2D plan canvas and 3D view are in place; drawing walls arrives in Phase 1. See [docs/roadmap.md](docs/roadmap.md).

## Privacy: read this first

- **GitHub Pages is public.** Anyone with the URL can open the app, and this repository's code is public too.
- **Your designs are not public.** In v1 nothing is sent to a server: projects live in your own browser (IndexedDB) and in JSON files you export yourself. The public site only serves the app.
- Browser storage can be cleared (for example by "clear browsing data"). **Export your project to JSON regularly**; that file is the real backup and the way to share a design with each other.
- Never commit real addresses, floor plans or other personal data to this repo. `docs/plans/` is git-ignored for exactly that reason.

### If you want the app itself behind a password

GitHub Pages cannot password-protect a site. Alternatives:

| Option                               | Cost                             | Notes                                                                  |
| ------------------------------------ | -------------------------------- | ---------------------------------------------------------------------- |
| Cloudflare Pages + Cloudflare Access | Free for small teams             | Email one-time-PIN login limited to your addresses; native PR previews |
| Vercel with Password Protection      | Paid add-on on top of a Pro plan | Simple shared password; check current pricing                          |
| Netlify with password protection     | Paid plan                        | Site-wide password                                                     |

The app is a static build (`npm run build` → `dist/`), so it runs on any of these without code changes. Set `BASE_PATH=/` when the site is served from a domain root.

## Develop

Requirements: Node 24+ and npm.

```bash
npm install
npm run dev          # http://localhost:5173
npm test             # unit tests (Vitest)
npm run test:e2e     # browser tests (Playwright, Chromium)
npm run lint && npm run typecheck
```

Every push to `main` deploys to GitHub Pages. Every pull request gets a preview at `/bydh/pr-preview/pr-<number>/`.

## Tech

Vite, React 19, TypeScript (strict), Tailwind v4 + shadcn/ui, Zustand, Zod, three.js via React Three Fiber, i18next. The 2D plan is SVG; the 3D view is lazy-loaded. See [docs/architecture.md](docs/architecture.md) and the decision records in [docs/decisions/](docs/decisions/).

## Claude Code setup

This repo is developed with Claude Code. `CLAUDE.md` is the project brief Claude reads every session; `.claude/` holds agents, commands, hooks and rules. Replaced template files are kept in `_archive/`.
