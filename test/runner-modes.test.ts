import { describe, expect, test } from 'bun:test';
import {
  buildHostSimPrompt,
  disallowedToolsFromExtraArgs,
  isSkillRunnerMode,
  legacyDisallowedToolsToAskUserQuestionAvailability,
  normalizeSkillRunnerMode,
  runSkillWithMode,
  SKILL_RUNNER_MODES,
} from './helpers/runner-modes';

describe('skill runner modes', () => {
  test('declares the three explicit harness modes', () => {
    expect(SKILL_RUNNER_MODES).toEqual(['exec-json', 'tui-pty', 'host-sim']);
    expect(isSkillRunnerMode('exec-json')).toBe(true);
    expect(isSkillRunnerMode('tui-pty')).toBe(true);
    expect(isSkillRunnerMode('host-sim')).toBe(true);
    expect(isSkillRunnerMode('pty')).toBe(false);
  });

  test('normalizes mode env values with an explicit fallback', () => {
    expect(normalizeSkillRunnerMode(undefined, 'tui-pty')).toBe('tui-pty');
    expect(normalizeSkillRunnerMode('exec-json', 'tui-pty')).toBe('exec-json');
    expect(() => normalizeSkillRunnerMode('unknown', 'tui-pty')).toThrow(/Unknown skill runner mode/);
  });

  test('host-sim prompt models no AskUserQuestion variant as prose fallback', () => {
    const prompt = buildHostSimPrompt({
      skillName: 'office-hours',
      userPrompt: 'I have an idea for a product.',
      askUserQuestion: 'none',
    });

    expect(prompt).toContain('HOST-SIM RUNNER MODE');
    expect(prompt).toContain('no mcp__*__AskUserQuestion variant exists');
    expect(prompt).toContain('native AskUserQuestion is unavailable');
    expect(prompt).toContain('prose fallback + hard stop');
    expect(prompt).toContain('Run $office-hours');
  });

  test('host-sim prompt can model MCP and native AskUserQuestion paths', () => {
    expect(buildHostSimPrompt({
      skillName: 'plan-ceo-review',
      userPrompt: 'Review the plan.',
      askUserQuestion: 'mcp',
    })).toContain('mcp__host__AskUserQuestion tool exists');

    expect(buildHostSimPrompt({
      skillName: 'plan-ceo-review',
      userPrompt: 'Review the plan.',
      askUserQuestion: 'native',
    })).toContain('native AskUserQuestion exists');
  });

  test('parses legacy disallowed tool arguments', () => {
    expect(disallowedToolsFromExtraArgs(['--disallowedTools', 'AskUserQuestion'])).toEqual(['AskUserQuestion']);
    expect(disallowedToolsFromExtraArgs(['--disallowed-tools=AskUserQuestion,Bash'])).toEqual([
      'AskUserQuestion',
      'Bash',
    ]);
    expect(disallowedToolsFromExtraArgs(['--model', 'gpt-5.4'])).toEqual([]);
  });

  test('maps legacy AskUserQuestion blocks to host-sim none availability', () => {
    expect(legacyDisallowedToolsToAskUserQuestionAvailability([
      '--disallowedTools',
      'AskUserQuestion',
    ])).toBe('none');
    expect(legacyDisallowedToolsToAskUserQuestionAvailability(['--disallowedTools', 'Bash'])).toBeNull();
  });

  test('requires host-sim metadata before mapping legacy AskUserQuestion blocks', async () => {
    await expect(runSkillWithMode({
      mode: 'tui-pty',
      skillName: 'office-hours',
      extraArgs: ['--disallowedTools', 'AskUserQuestion'],
    })).rejects.toThrow(/Provide hostSim options/);
  });
});
