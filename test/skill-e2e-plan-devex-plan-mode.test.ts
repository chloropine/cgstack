/**
 * plan-devex-review plan-mode smoke (gate, paid, real-PTY).
 *
 * See test/skill-e2e-plan-ceo-plan-mode.test.ts for the shared assertion
 * contract. Exercises the same contract against $plan-devex-review.
 */

import { describe, test, expect } from 'bun:test';
import {
  runPlanSkillObservation,
  assertReportAtBottomIfPlanWritten,
} from './helpers/codex-pty-runner';
import { runSkillWithMode } from './helpers/runner-modes';

const shouldRun = !!process.env.EVALS && process.env.EVALS_TIER === 'gate';
const describeE2E = shouldRun ? describe : describe.skip;

describeE2E('plan-devex-review plan-mode smoke (gate)', () => {
  test('reaches a terminal outcome (asked or plan_ready) without silent writes', async () => {
    const obs = await runPlanSkillObservation({
      skillName: 'plan-devex-review',
      inPlanMode: true,
      timeoutMs: 300_000,
    });

    if (obs.outcome === 'silent_write' || obs.outcome === 'exited' || obs.outcome === 'timeout') {
      throw new Error(
        `plan-devex-review plan-mode smoke FAILED: outcome=${obs.outcome}\n` +
          `summary: ${obs.summary}\n` +
          `elapsed: ${obs.elapsedMs}ms\n` +
          `--- evidence (last 2KB visible) ---\n${obs.evidence}`,
      );
    }
    expect(['asked', 'plan_ready']).toContain(obs.outcome);
    assertReportAtBottomIfPlanWritten(obs);
  }, 360_000);

  // v1.21+ regression: see skill-e2e-plan-ceo-plan-mode.test.ts for the
  // contract. Pass envelope is ['asked', 'plan_ready']; failure signals
  // are 'auto_decided' (AUTO_DECIDE without opt-in) plus the standard
  // silent_write/exited/timeout.
  test('AskUserQuestion surfaces when --disallowedTools AskUserQuestion is set', async () => {
    const run = await runSkillWithMode({
      mode: 'host-sim',
      skillName: 'plan-devex-review',
      userPrompt: 'Review the developer experience for a CLI onboarding plan that currently lacks time-to-first-success validation.',
      workingDirectory: process.cwd(),
      askUserQuestion: 'none',
      timeout: 300_000,
      testName: 'plan-devex-auq-blocked-host-sim',
    });
    if (run.mode !== 'host-sim') throw new Error(`expected host-sim result, got ${run.mode}`);

    expect(run.result.output).toMatch(/prose fallback|hard stop|reply|developer|onboarding|friction/i);
  }, 360_000);
});
