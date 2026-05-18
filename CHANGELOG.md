# Changelog

## Unreleased

## 1.40.0.1

- Added Codex AskUserQuestion fallback handling so workflows can ask via MCP,
  native tools, or a prose hard stop depending on host capability.
- Hardened the Codex TUI PTY test harness with real Enter submission,
  composer-readiness checks, explicit runner modes, and debug snapshots for
  timeout failures.

- Initialized cgstack as a Codex-only workflow stack.
- Switched install and generation paths to Codex conventions:
  `~/.codex/skills/cgstack` and `.agents/skills`.
- Removed legacy host support and old multi-agent documentation.
