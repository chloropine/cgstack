# cgstack

Use Codex as a full engineering staff: CEO, Designer, Eng Manager, QA, Release
Manager, and Doc Engineer.

cgstack is a Codex-only AI engineering workflow pack. It installs OpenAI Codex
skills, a fast Chromium browser tool, and role-based workflows for planning,
reviewing, testing, documenting, and shipping software.

## About This Fork

cgstack is a fork and Codex port of Garry Tan's original
[gstack](https://github.com/garrytan/gstack) project.

The original gstack was built around Claude Code. cgstack keeps the opinionated
engineering workflow idea, but ports the repository to OpenAI Codex and removes
legacy Claude Code and multi-agent host support. In this fork, Codex is the only
supported runtime.

The port includes Codex skill generation, `~/.codex/skills/` installation,
`AGENTS.md` project guidance, Codex CLI invocation paths, and a Codex-focused
browser/terminal integration.

## What Changed From gstack?

cgstack is not a compatibility layer. It is a Codex-only fork.

- **Claude Code support was removed**: skills, setup paths, docs, and runtime
  assumptions now target Codex only.
- **Codex skill installation is first-class**: generated skills install under
  `~/.codex/skills/`, with flat slash-command names like `/review` and `/qa`.
- **Project guidance moved to `AGENTS.md`**: cgstack uses Codex's project
  instruction file instead of `CLAUDE.md`.
- **Invocation paths were rewritten for Codex**: model handoffs, review flows,
  probes, and benchmark adapters call Codex CLI behavior rather than Claude
  Code behavior.
- **The browser sidebar is terminal-first**: the old chat/agent sidebar surface
  was removed; the visible browser integration now pairs with a Codex terminal.
- **Legacy host abstraction was dropped**: there is no multi-host matrix to keep
  in sync. Codex is the supported runtime.
- **Docs and tests were regenerated around cgstack**: README, architecture docs,
  generated skills, and validation tests now describe the Codex port.

## Why cgstack?

Codex is strong at implementation, but real software work needs more than raw
code generation. cgstack gives Codex a repeatable operating system for product
thinking, planning, review, QA, release, documentation, and post-ship learning.

- **Role-based workflows**: specialized skills act like a CEO, designer, eng
  manager, QA lead, release manager, security reviewer, and docs engineer.
- **Codex-native runtime**: no Claude Code compatibility layer, no multi-host
  adapter surface, and no legacy invocation paths.
- **Real browser tooling**: browser QA, screenshots, cookie setup, scraping,
  and live app inspection run through the bundled Chromium tooling.
- **Project memory and handoff**: context, learnings, plans, retros, and
  release notes can be saved and restored across sessions.
- **Opinionated defaults**: the skills push for better plans, clearer tradeoffs,
  stronger tests, and production-focused review before code lands.

## Demo Workflow

After installing cgstack, open Codex in a project repo and use the skills as a
software delivery loop:

```text
/office-hours I want to build a small billing dashboard for usage-based pricing.
```

Use the result to sharpen the product direction, then ask for planning review:

```text
/plan-ceo-review docs/designs/billing-dashboard.md
/plan-eng-review docs/designs/billing-dashboard.md
/plan-design-review docs/designs/billing-dashboard.md
```

Implement the plan with Codex, then run review and browser QA:

```text
/review
/qa
```

When the branch is ready:

```text
/document-release
/ship
```

For live browser work, launch the visible browser integration:

```text
/open-cgstack-browser
```

## Install

Requirements: OpenAI Codex CLI, Git, and Bun v1.0+.

```bash
git clone --single-branch --depth 1 https://github.com/chloropine/cgstack.git ~/.cgstack/repos/cgstack
cd ~/.cgstack/repos/cgstack
./setup
```

The installer builds the browser binary, generates Codex-format skills under
`.agents/skills/`, and installs runtime links under `~/.codex/skills/`.

## Compatibility

cgstack supports macOS, Linux, and Windows.

- **macOS and Linux**: full local setup and test workflow are supported with
  Codex CLI, Git, and Bun.
- **Windows**: supported through the Windows-safe path. Install Node.js as well
  as Bun; the browser server uses a Node-compatible bundle on Windows.
- **Codex only**: cgstack does not support Claude Code or other AI coding
  runtimes.

## Team Mode

From the root of a project that should require cgstack:

```bash
(cd ~/.cgstack/repos/cgstack && ./setup --team)
~/.cgstack/repos/cgstack/bin/cgstack-team-init required
git add AGENTS.md
git commit -m "require cgstack for AI-assisted work"
```

Use `optional` instead of `required` if the project should recommend cgstack
without requiring it.

## Core Skills

| Skill | Purpose |
|-------|---------|
| `/office-hours` | Reframe a product idea before implementation. |
| `/plan-ceo-review` | Founder-level scope and strategy review. |
| `/plan-eng-review` | Architecture, data flow, edge cases, and tests. |
| `/plan-design-review` | Design review before code. |
| `/autoplan` | Runs the plan review pipeline. |
| `/review` | Pre-landing code review focused on production bugs. |
| `/investigate` | Root-cause debugging with a no-fix-before-investigation rule. |
| `/qa` | Browser-based QA with fixes and verification. |
| `/qa-only` | Browser-based QA report without edits. |
| `/ship` | Test, review, push, and prepare a PR. |
| `/land-and-deploy` | Merge, wait for CI/deploy, and verify production health. |
| `/browse` | Headless Chromium browser control. |
| `/open-cgstack-browser` | Visible browser with sidebar and cookie tooling. |
| `/document-release` | Update docs for shipped changes. |
| `/document-generate` | Generate missing docs from code. |
| `/cso` | OWASP Top 10 + STRIDE security audit. |
| `/benchmark` | Performance regression checks. |
| `/learn` | Manage project learnings. |
| `/context-save` | Save working context. |
| `/context-restore` | Restore saved context. |

## Development

```bash
bun install
bun run gen:skill-docs
bun run build
bun test
```

Generated `SKILL.md` files come from `SKILL.md.tmpl` templates. Edit templates,
then run `bun run gen:skill-docs` to regenerate Codex output.

For local development:

```bash
bin/dev-setup
# edit templates or source
bin/dev-teardown
```

## Uninstall

```bash
~/.cgstack/repos/cgstack/bin/cgstack-uninstall
```

Manual cleanup, if needed:

```bash
rm -rf ~/.codex/skills/cgstack*
rm -rf ~/.cgstack/repos/cgstack
```
