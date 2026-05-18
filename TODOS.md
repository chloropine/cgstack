# CGStack TODOs

This backlog tracks cgstack as a Codex-only project. It intentionally omits
non-Codex host work.

## Current

- Keep generated Codex skills in sync with `SKILL.md.tmpl` sources.
- Re-run the full Bun test suite after Bun is installed in the workspace.
- Refresh `bun.lock` with Bun after dependency and package metadata cleanup.
- Review paid E2E tests and remove any remaining assumptions from deleted
  non-Codex paths.

## Later

- Tighten Codex model overlay tests around current OpenAI model behavior.
- Improve CGStack Browser diagnostics for missing Codex CLI auth.
- Add a small release checklist that verifies `origin`,
  generated skill output, package metadata, and documentation in one command.
