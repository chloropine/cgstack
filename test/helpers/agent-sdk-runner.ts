/**
 * Compatibility shim for older E2E tests that used the Agent SDK harness.
 *
 * cgstack is Codex-only now, so this runner delegates to `codex exec` and keeps
 * the small helper surface those tests import.
 */

import { spawnSync } from 'child_process';
import { resolveCodexBinary } from './codex-pty-runner';

export { resolveCodexBinary };

export function passThroughNonAskUserQuestion(_toolName: string, input: Record<string, unknown>) {
  return { behavior: 'allow' as const, updatedInput: input };
}

export async function runAgentSdkTest(opts: {
  userPrompt: string;
  workingDirectory: string;
  maxTurns?: number;
  pathToCodexCodeExecutable?: string;
  canUseTool?: (toolName: string, input: Record<string, unknown>) => unknown;
  allowedTools?: string[];
  systemPrompt?: unknown;
}): Promise<{ stdout: string; stderr: string; exitCode: number; skipped?: boolean }> {
  const binary = opts.pathToCodexCodeExecutable || resolveCodexBinary();
  if (!binary) {
    return {
      stdout: '',
      stderr: 'codex binary not found',
      exitCode: 127,
      skipped: true,
    };
  }

  const result = spawnSync(binary, ['exec', opts.userPrompt, '-C', opts.workingDirectory, '--skip-git-repo-check'], {
    cwd: opts.workingDirectory,
    encoding: 'utf-8',
    timeout: Math.max(1, opts.maxTurns ?? 10) * 60_000,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  return {
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    exitCode: result.status ?? -1,
  };
}
