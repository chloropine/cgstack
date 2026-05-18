# Current Project Status

Updated: 2026-05-18

## Current Repo State

- Repository: `cgstack`
- Branch: `main`
- Remote tracking: `origin/main`
- Working tree before this file: clean
- Package version: `1.40.0.0`
- Runtime target: OpenAI Codex only
- Primary purpose: Codex skills, browser tooling, and role-based engineering workflows for planning, review, QA, release, documentation, security, retrospectives, and context handoff.

## Latest Completed Milestone

The latest completed milestone is the Codex-only fork/port documentation and runtime cleanup. Recent commits show the project has moved away from legacy gstack/Claude assumptions and now documents Codex installation, skill invocation, compatibility, and workflow usage.

Latest commit at orientation time:

- `c11a733 docs: use Codex dollar syntax for skill invocation`

## Latest Commits

- `c11a733 docs: use Codex dollar syntax for skill invocation`
- `87d9b34 docs: clarify platform compatibility`
- `abda3a0 docs: explain changes from gstack`
- `45c1bdd docs: add cgstack rationale and demo workflow`
- `e900101 docs: describe cgstack fork and Codex port`
- `f5b57e4 refactor: finish Codex-only cgstack runtime`
- `e00057b docs: clarify cgstack fork origin`
- `a008818 chore: fork cgstack for Codex only`
- `026751e v1.40.0.0 fix wave: gbrain sync hardening (8 community PRs + migration) (#1547)`
- `33cb471 v1.39.2.0 feat: GSTACK_* env-shim for Conductor + gbrain/gstack setup docs (#1534)`

## Uncommitted Changes

At orientation time, `git status --short --branch` reported:

```text
## main...origin/main
```

After this context compaction, the expected uncommitted change is this file:

- `docs/99-current-project-status.md`

## Open TODOs

From `TODOS.md`.

### Current

- Keep generated Codex skills in sync with `SKILL.md.tmpl` sources.
- Re-run the full Bun test suite after Bun is installed in the workspace.
- Refresh `bun.lock` with Bun after dependency and package metadata cleanup.
- Review paid E2E tests and remove any remaining assumptions from deleted non-Codex paths.

### Later

- Tighten Codex model overlay tests around current OpenAI model behavior.
- Improve CGStack Browser diagnostics for missing Codex CLI auth.
- Add a small release checklist that verifies `origin`, generated skill output, package metadata, and documentation in one command.

## Validation Commands

Core commands documented by the repo:

```bash
bun install
bun run gen:skill-docs
bun run build
bun test
bun run test:windows
bun run skill:check
```

Additional package scripts available:

```bash
bun run test
bun run test:free
bun run test:evals
bun run test:evals:all
bun run test:e2e
bun run test:e2e:all
bun run test:gate
bun run test:periodic
bun run test:codex
bun run test:codex:all
bun run test:audit
bun run slop
bun run slop:diff
```

## Safe Next Step

Continue from the repository files, not chat history. Before feature or refactor work, run a baseline check:

```bash
bun run test
bun run skill:check
```

If work touches skill templates or generated skills, edit the `.tmpl` source, then run:

```bash
bun run gen:skill-docs
bun run build
```
