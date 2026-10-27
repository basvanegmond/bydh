# My Project

> Claude Code project template with structured AI context, reusable skills, and automated workflows.

## Claude Code Setup

This project uses a `.claude/` folder to give Claude Code persistent memory and automation.

| Folder / File | Purpose |
|---|---|
| `CLAUDE.md` | Project brain — Claude reads this every session |
| `.claude/settings.json` | Permissions, hooks, and model config |
| `.claude/agents/` | Specialised AI agents (code-reviewer, test-writer, security-auditor) |
| `.claude/commands/` | Slash commands: `/deploy`, `/pr-review`, `/fix-issue` |
| `.claude/hooks/` | Auto-run scripts (pre-commit checks, lint-on-save) |
| `.claude/rules/` | Guardrails scoped to specific file path patterns |
| `.claude/skills/` | Reusable AI workflows (code-review, refactor, security-audit) |

## Getting started with Claude Code

```bash
npm install -g @anthropic-ai/claude-code
cd your-project
claude
```

## Available slash commands

- `/deploy` — full pre-flight checks then deploy to production
- `/pr-review` — review current branch before raising a PR
- `/fix-issue 123` — investigate and fix GitHub issue #123

## Customising this template

1. **Update `CLAUDE.md`** with your actual tech stack, folder structure, and conventions
2. **Edit `.claude/settings.json`** to whitelist the bash commands your project uses
3. **Extend `.claude/rules/`** with guardrails for your specific file patterns
4. **Add agents** in `.claude/agents/` for roles your team needs (e.g. doc-writer, migration-helper)
5. **Add skills** in `.claude/skills/` for repeated workflows specific to your project

## Useful resources

- [Claude Code docs](https://code.claude.com/docs)
- [Official Anthropic skills repo](https://github.com/anthropics/skills)
- [Community skills](https://github.com/VoltAgent/awesome-agent-skills)
