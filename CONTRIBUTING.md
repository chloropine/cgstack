# Contributing to cgstack

cgstack is Codex-only. Contributions should keep the project focused on the
OpenAI Codex CLI, `.agents/skills/` source output, and `~/.codex/skills/`
runtime installs.

## Setup

```bash
git clone https://github.com/chloropine/cgstack.git
cd cgstack
bun install
bin/dev-setup
```

`bin/dev-setup` links this checkout into the local development skill tree so
Codex reads your working copy. Use `bin/dev-teardown` when you want to return
to the global install.

## Daily Workflow

```bash
bin/dev-setup
bun run gen:skill-docs
bun run build
bun test
bin/dev-teardown
```

SKILL.md files are generated from `.tmpl` templates. Edit templates and source
resolvers, then regenerate. Do not hand-edit generated skill output unless you
are intentionally repairing generated artifacts as part of a migration.

## Codex Boundaries

- Do not add support for non-Codex agents, hosts, or model wrappers.
- Do not reintroduce legacy host install paths.
- Keep persistent user state under `~/.cgstack`.
- Keep Codex skill installs under `~/.codex/skills`.
- Keep repo-local generated skills under `.agents/skills`.

## Tests

The free suite is:

```bash
bun test
```

E2E tests that invoke Codex are gated by `EVALS=1`:

```bash
EVALS=1 bun run test:e2e
```

Use `OPENAI_API_KEY` only for code paths that directly call OpenAI APIs. The
Codex CLI normally uses its own local authentication.
