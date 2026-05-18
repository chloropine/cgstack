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

## Install

Requirements: OpenAI Codex CLI, Git, Bun v1.0+, and Node.js on Windows.

```bash
git clone --single-branch --depth 1 https://github.com/chloropine/cgstack.git ~/.cgstack/repos/cgstack
cd ~/.cgstack/repos/cgstack
./setup
```

The installer builds the browser binary, generates Codex-format skills under
`.agents/skills/`, and installs runtime links under `~/.codex/skills/`.

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
