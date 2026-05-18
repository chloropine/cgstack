# CGStack Skills

CGStack is a Codex-only skill bundle. Source templates live in this repository,
and `bun run gen:skill-docs --host codex` generates the Codex sidecar output in
`.agents/skills/`.

## Plan

| Skill | Purpose |
| --- | --- |
| `$office-hours` | Reframe a product idea before implementation. |
| `$plan-ceo-review` | Product strategy and scope review. |
| `$plan-eng-review` | Architecture, edge cases, and test review. |
| `$plan-design-review` | Plan-stage UI/UX review. |
| `$plan-devex-review` | Plan-stage developer experience review. |
| `$plan-tune` | Tune AskUserQuestion sensitivity. |
| `$autoplan` | Run the plan review chain. |
| `$design-consultation` | Produce a design system direction. |

## Build And Review

| Skill | Purpose |
| --- | --- |
| `$review` | Pre-landing code review. |
| `$investigate` | Root-cause debugging. |
| `$qa` | Browser-backed QA with fixes. |
| `$qa-only` | Browser-backed QA report only. |
| `$design-review` | Live visual audit and fix loop. |
| `$design-shotgun` | Generate design variants and compare them. |
| `$design-html` | Generate production-quality HTML/CSS. |
| `$devex-review` | Live developer experience audit. |
| `$scrape` | Extract page data using the browser tool. |
| `$skillify` | Turn a successful scrape flow into a reusable skill. |

## Release

| Skill | Purpose |
| --- | --- |
| `$ship` | Run checks, prepare release work, and open PRs. |
| `$land-and-deploy` | Land approved work and verify deployment. |
| `$canary` | Post-deploy monitoring. |
| `$landing-report` | Ship queue status. |
| `$document-release` | Update docs after shipping. |
| `$document-generate` | Generate Diataxis docs from code. |
| `$setup-deploy` | Configure deploy detection. |
| `$cgstack-upgrade` | Upgrade CGStack. |

## Operations

| Skill | Purpose |
| --- | --- |
| `$context-save` | Save working context. |
| `$context-restore` | Restore saved context. |
| `$learn` | Manage local learnings. |
| `$retro` | Team retro and shipping health. |
| `$health` | Code quality dashboard. |
| `$benchmark` | Performance regression checks. |
| `$cso` | Security audit. |
| `$setup-gbrain` | Configure gbrain memory sync. |
| `$sync-gbrain` | Refresh gbrain with repository context. |

## Browser And Utility

| Skill | Purpose |
| --- | --- |
| `$browse` | Headless Chromium control. |
| `$open-cgstack-browser` | Launch the visible CGStack Browser. |
| `$setup-browser-cookies` | Import cookies for authenticated browser testing. |
| `$pair-agent` | Pair another Codex session with the browser. |
| `$careful` | Warn before destructive commands. |
| `$freeze` | Restrict file edits to one directory. |
| `$guard` | Enable careful and freeze together. |
| `$unfreeze` | Remove the edit restriction. |
| `$make-pdf` | Render Markdown to PDF. |
