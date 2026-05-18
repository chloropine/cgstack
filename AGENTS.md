# cgstack — Codex Engineering Workflow

cgstack is a Codex-only collection of `SKILL.md` files and runtime tools for
software development. Skills live under `.agents/skills/` for repo-local
development and `~/.codex/skills/` for global Codex installs.

## Build Commands

```bash
bun install              # install dependencies
bun run gen:skill-docs   # regenerate Codex SKILL.md files from templates
bun run build            # generate docs and compile binaries
bun test                 # run free tests
bun run test:windows     # curated Windows-safe subset
bun run skill:check      # skill health dashboard
```

## Key Conventions

- cgstack targets OpenAI Codex only.
- `SKILL.md` files are generated from `.tmpl` templates. Edit the template, not the generated output.
- Run `bun run gen:skill-docs` after template or resolver changes.
- Runtime state lives in `~/.cgstack` unless `CGSTACK_HOME` is set.
- Codex global skill runtime lives at `~/.codex/skills/cgstack`.
- Repo-local generated skills live at `.agents/skills/cgstack-*`.
- The browser binary provides Chromium access. Use `$B <command>` in skills.
- Safety skills (`/careful`, `/freeze`, `/guard`) use advisory prose and explicit checks before risky operations.

## Available Skills

| Skill | What it does |
|-------|-------------|
| `/cgstack` | Root skill and routing index. |
| `/office-hours` | Reframes product ideas before code. |
| `/plan-ceo-review` | CEO-level scope and strategy review. |
| `/plan-eng-review` | Architecture, data flow, edge cases, and tests. |
| `/plan-design-review` | Design review with explicit quality dimensions. |
| `/plan-devex-review` | Developer experience review. |
| `/plan-tune` | Tunes question sensitivity for plan workflows. |
| `/autoplan` | Runs the plan review pipeline. |
| `/design-consultation` | Builds a design system from scratch. |
| `/design-review` | Live visual audit and fix workflow. |
| `/design-shotgun` | Generates and compares multiple design directions. |
| `/design-html` | Produces production-quality HTML/CSS from a design direction. |
| `/devex-review` | Live developer experience audit. |
| `/review` | Finds bugs and regressions before landing. |
| `/investigate` | Root-cause debugging workflow. |
| `/qa` | Browser QA with fixes and re-verification. |
| `/qa-only` | Browser QA report only. |
| `/ship` | Tests, reviews, pushes, and prepares a PR. |
| `/land-and-deploy` | Merges, waits for CI/deploy, and verifies production. |
| `/canary` | Post-deploy monitoring. |
| `/landing-report` | Read-only release queue dashboard. |
| `/benchmark` | Performance regression detection. |
| `/document-release` | Updates docs after shipping. |
| `/document-generate` | Generates missing docs from code. |
| `/setup-deploy` | Detects and records deployment configuration. |
| `/browse` | Headless Chromium browser access. |
| `/open-cgstack-browser` | Visible CGStack Browser with sidebar. |
| `/setup-browser-cookies` | Imports cookies for authenticated browser testing. |
| `/pair-agent` | Shares the browser with another Codex session-like client through a scoped token. |
| `/scrape` | Extracts data from web pages. |
| `/skillify` | Turns repeatable scraping flows into browser skills. |
| `/cso` | OWASP Top 10 + STRIDE security audit. |
| `/retro` | Engineering retrospective. |
| `/health` | Code quality dashboard. |
| `/learn` | Manages project learnings. |
| `/context-save` | Saves working context. |
| `/context-restore` | Restores saved context. |
| `/setup-gbrain` | Sets up optional GBrain memory integration. |
| `/sync-gbrain` | Syncs code and memory into GBrain. |
| `/careful` | Warns before destructive commands. |
| `/freeze` | Restricts edits to a selected path. |
| `/guard` | Enables careful + freeze. |
| `/unfreeze` | Removes edit restrictions. |
| `/make-pdf` | Builds a PDF from Markdown. |
| `/cgstack-upgrade` | Updates cgstack. |
