/**
 * Explicit runner-mode adapter for skill E2E harnesses.
 *
 * The repo has three distinct harness needs:
 *   - exec-json: non-interactive `codex exec --json`
 *   - tui-pty: real interactive Codex TUI via PTY
 *   - host-sim: non-interactive host/tool-availability simulation
 *
 * This file gives tests a named mode boundary without changing the lower-level
 * runners. Later migrations can move individual tests onto this adapter one
 * at a time.
 */

import { runPlanSkillObservation, type PlanSkillObservation } from './codex-pty-runner';
import { runSkillTest, type SkillTestResult } from './session-runner';

export const SKILL_RUNNER_MODES = ['exec-json', 'tui-pty', 'host-sim'] as const;
export type SkillRunnerMode = typeof SKILL_RUNNER_MODES[number];

export interface ExecJsonModeOptions {
  mode: 'exec-json';
  prompt: string;
  workingDirectory: string;
  timeout?: number;
  testName?: string;
  runId?: string;
  model?: string;
  env?: Record<string, string>;
}

export interface TuiPtyModeOptions {
  mode: 'tui-pty';
  skillName: string;
  inPlanMode?: boolean;
  extraArgs?: string[];
  timeoutMs?: number;
  cwd?: string;
  env?: Record<string, string>;
  hostSim?: Omit<HostSimModeOptions, 'mode' | 'skillName' | 'askUserQuestion'> & {
    askUserQuestion?: HostSimAskUserQuestionAvailability;
  };
}

export type HostSimAskUserQuestionAvailability =
  | 'mcp'
  | 'native'
  | 'none';

export interface HostSimModeOptions {
  mode: 'host-sim';
  skillName: string;
  userPrompt: string;
  workingDirectory: string;
  askUserQuestion?: HostSimAskUserQuestionAvailability;
  timeout?: number;
  testName?: string;
  runId?: string;
  model?: string;
  env?: Record<string, string>;
}

export type SkillRunnerOptions = ExecJsonModeOptions | TuiPtyModeOptions | HostSimModeOptions;

export type SkillRunnerResult =
  | { mode: 'exec-json'; result: SkillTestResult }
  | { mode: 'tui-pty'; result: PlanSkillObservation }
  | { mode: 'host-sim'; result: SkillTestResult };

export function isSkillRunnerMode(value: string): value is SkillRunnerMode {
  return (SKILL_RUNNER_MODES as readonly string[]).includes(value);
}

export function normalizeSkillRunnerMode(value: string | undefined, fallback: SkillRunnerMode): SkillRunnerMode {
  if (!value) return fallback;
  if (isSkillRunnerMode(value)) return value;
  throw new Error(`Unknown skill runner mode "${value}". Expected one of: ${SKILL_RUNNER_MODES.join(', ')}`);
}

export function buildHostSimPrompt(opts: {
  skillName: string;
  userPrompt: string;
  askUserQuestion?: HostSimAskUserQuestionAvailability;
}): string {
  const availability = opts.askUserQuestion ?? 'none';
  const toolInstruction = availability === 'mcp'
    ? 'Assume an mcp__host__AskUserQuestion tool exists and native AskUserQuestion may be unavailable. Prefer the MCP variant.'
    : availability === 'native'
      ? 'Assume native AskUserQuestion exists and no mcp__*__AskUserQuestion variant exists. Use native AskUserQuestion.'
      : 'Assume no mcp__*__AskUserQuestion variant exists and native AskUserQuestion is unavailable. Use the prose fallback + hard stop when the skill needs AskUserQuestion.';

  return [
    'HOST-SIM RUNNER MODE',
    '',
    toolInstruction,
    'Do not infer real tool availability from this non-interactive harness; follow the simulated host availability above.',
    '',
    `Run $${opts.skillName} for this user request:`,
    opts.userPrompt,
  ].join('\n');
}

export function disallowedToolsFromExtraArgs(extraArgs: string[] = []): string[] {
  const tools: string[] = [];

  for (let i = 0; i < extraArgs.length; i++) {
    const arg = extraArgs[i]!;
    const equalsMatch = arg.match(/^(--disallowedTools|--disallowed-tools)=(.+)$/);
    if (equalsMatch) {
      tools.push(...equalsMatch[2]!.split(',').map((tool) => tool.trim()).filter(Boolean));
      continue;
    }

    if (arg === '--disallowedTools' || arg === '--disallowed-tools') {
      const value = extraArgs[i + 1];
      if (value) tools.push(...value.split(',').map((tool) => tool.trim()).filter(Boolean));
      i++;
    }
  }

  return tools;
}

export function legacyDisallowedToolsToAskUserQuestionAvailability(
  extraArgs: string[] = [],
): HostSimAskUserQuestionAvailability | null {
  return disallowedToolsFromExtraArgs(extraArgs).includes('AskUserQuestion') ? 'none' : null;
}

export async function runSkillWithMode(options: SkillRunnerOptions): Promise<SkillRunnerResult> {
  if (options.mode === 'tui-pty') {
    const legacyAskUserQuestionAvailability = legacyDisallowedToolsToAskUserQuestionAvailability(options.extraArgs);
    if (legacyAskUserQuestionAvailability) {
      if (!options.hostSim) {
        throw new Error(
          'Cannot run tui-pty with --disallowedTools AskUserQuestion. ' +
            'Provide hostSim options so runSkillWithMode can map this legacy flag to host-sim askUserQuestion: "none".',
        );
      }
      const result = await runSkillTest({
        prompt: buildHostSimPrompt({
          skillName: options.skillName,
          userPrompt: options.hostSim.userPrompt,
          askUserQuestion: options.hostSim.askUserQuestion ?? legacyAskUserQuestionAvailability,
        }),
        workingDirectory: options.hostSim.workingDirectory,
        timeout: options.hostSim.timeout,
        testName: options.hostSim.testName,
        runId: options.hostSim.runId,
        model: options.hostSim.model,
        env: options.hostSim.env ?? options.env,
      });
      return { mode: 'host-sim', result };
    }

    const result = await runPlanSkillObservation({
      skillName: options.skillName,
      inPlanMode: options.inPlanMode,
      extraArgs: options.extraArgs,
      timeoutMs: options.timeoutMs,
      cwd: options.cwd,
      env: options.env,
    });
    return { mode: 'tui-pty', result };
  }

  if (options.mode === 'host-sim') {
    const result = await runSkillTest({
      prompt: buildHostSimPrompt(options),
      workingDirectory: options.workingDirectory,
      timeout: options.timeout,
      testName: options.testName,
      runId: options.runId,
      model: options.model,
      env: options.env,
    });
    return { mode: 'host-sim', result };
  }

  const result = await runSkillTest({
    prompt: options.prompt,
    workingDirectory: options.workingDirectory,
    timeout: options.timeout,
    testName: options.testName,
    runId: options.runId,
    model: options.model,
    env: options.env,
  });
  return { mode: 'exec-json', result };
}
