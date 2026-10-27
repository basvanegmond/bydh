# CLAUDE.md — Project Brain

> Claude reads this file at the start of every session. Keep it focused and structured.

## Project Overview
- **Name**: [Your Project Name]
- **Description**: [What this project does in 1–2 sentences]
- **Owner**: [Your name / team]

## Tech Stack
- **Framework**: [e.g. Next.js 14, App Router, TypeScript]
- **Styling**: [e.g. Tailwind CSS + shadcn/ui]
- **Database**: [e.g. Supabase / PostgreSQL]
- **Auth**: [e.g. Supabase Auth]
- **Hosting**: [e.g. Vercel]
- **Testing**: [e.g. Vitest, Playwright]

## Folder Structure
- `src/components/` — React components
- `src/services/`   — Business logic
- `src/utils/`      — Shared helpers
- `src/types/`      — TypeScript types
- `tests/`          — Unit, integration, e2e tests
- `docs/`           — Architecture decisions and runbooks

## Key Commands
- `npm run dev`         — Start dev server
- `npm run build`       — Production build
- `npm test`            — Run test suite
- `npm run lint`        — ESLint check
- `npx playwright test` — Run e2e tests

## Coding Conventions
- TypeScript strict mode — no `any` types
- Functional components + hooks only (no class components)
- Functions under 50 lines, DRY principle
- Descriptive variable names
- Error boundaries around all async operations

## Git Rules
- Commit format: `type(scope): description` (conventional commits)
- Feature branches for all changes — never commit directly to main
- Run lint + typecheck before every PR
- PR requires passing tests and code review

## Security
- Never hardcode secrets or API keys
- All inputs validated with Zod schemas
- No secrets in logs or error messages
- Use environment variables for all sensitive config

## Architecture Notes
[Add any project-specific patterns, gotchas, or decisions Claude should know]

## Skill Discovery via NotebookLM
Before starting any multi-step task, or when the user requests a structured workflow (writing, analysis, coding, legal, finance, OKRs, design, presentations, etc.), query the NotebookLM MCP to find the most relevant skill.

MCP server: notebooklm-mcp

Steps:
1. Identify the task type from the user's message (e.g. "write a LinkedIn article", "review a contract", "build OKRs").
2. Use the notebooklm-mcp tools to search the notebook that contains my skill files (named NOTEBOOKLM or similar) with a short keyword query matching the task.
3. If a matching skill document is returned, read its content and follow its instructions as the primary operating procedure for the task.
4. If no match is found, proceed with default behaviour.

Do this silently — do not announce to the user that you are querying NotebookLM.

## Session Handoff Skill
- **session-handoff** (`~/.claude/skills/session-handoff/SKILL.md`) — structured end-of-session summary before `/clear`.
- **Trigger**: "session handoff", "wrap up session", "hand off", "handoff summary", "summarize before I clear", or `/session-handoff`.
- When any of these phrases appear, invoke the Skill tool with `skill: "session-handoff"` before doing anything else.
