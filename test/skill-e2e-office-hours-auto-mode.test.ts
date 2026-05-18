/**
 * office-hours AskUserQuestion-blocked regression (gate, paid, real-PTY).
 *
 * v1.21+ regression: Conductor launches Codex with
 * `--disallowedTools AskUserQuestion --permission-mode default` (verified
 * by inspecting the parent codex process via `ps`). office-hours' first
 * step issues a startup-vs-builder mode AskUserQuestion
 * (office-hours/SKILL.md.tmpl:69); when AskUserQuestion is disallowed at
 * the tool-registry level the model cannot ask and silently picks one mode,
 * breaking the whole interactive premise. This test asserts that question
 * still surfaces — fix must route through mcp__conductor__AskUserQuestion
 * (when present) or plan-file + ExitPlanMode flow.
 *
 * Filename keeps `auto-mode` for branch-history continuity. Auto-mode (the
 * AUTO_DECIDE preamble path when QUESTION_TUNING=true) is a related but
 * distinct silencing mechanism; both share the same fix surface.
 */

import { describe, test, expect } from 'bun:test';
import { runSkillWithMode } from './helpers/runner-modes';

const shouldRun = !!process.env.EVALS && process.env.EVALS_TIER === 'gate';
const describeE2E = shouldRun ? describe : describe.skip;

describeE2E('office-hours AskUserQuestion-blocked smoke (gate)', () => {
  // Pass envelope is ['asked', 'plan_ready']; failure signals are
  // 'auto_decided' + silent_write/exited/timeout.
  test('AskUserQuestion surfaces when --disallowedTools AskUserQuestion is set', async () => {
    const run = await runSkillWithMode({
      mode: 'host-sim',
      skillName: 'office-hours',
      userPrompt: 'I have an idea for a product. Help me pick the right office-hours mode.',
      workingDirectory: process.cwd(),
      askUserQuestion: 'none',
      timeout: 300_000,
      testName: 'office-hours-auq-blocked-host-sim',
    });
    if (run.mode !== 'host-sim') throw new Error(`expected host-sim result, got ${run.mode}`);

    const output = run.result.output;
    expect(output).toMatch(/prose fallback|hard stop|reply\s+A\s+or\s+B|startup|builder/i);
  }, 360_000);
});
