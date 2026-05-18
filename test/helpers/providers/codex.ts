import type { ProviderAdapter, RunOpts, RunResult, AvailabilityCheck } from './types';
import { estimateCostUsd } from '../pricing';
import { execFileSync, spawnSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

/**
 * Codex adapter — wraps `codex exec --json` and normalizes its JSONL output.
 */
export class CodexAdapter implements ProviderAdapter {
  readonly name = 'codex';
  readonly family = 'codex' as const;

  async available(): Promise<AvailabilityCheck> {
    const res = spawnSync('sh', ['-c', 'command -v codex'], { timeout: 2000 });
    if (res.status !== 0) {
      return { ok: false, reason: 'codex not found on PATH. Install: npm i -g @openai/codex' };
    }

    const codexDir = path.join(os.homedir(), '.codex');
    if (!fs.existsSync(codexDir)) {
      return { ok: false, reason: 'No ~/.codex/ found. Run `codex login` to authenticate via ChatGPT.' };
    }
    return { ok: true };
  }

  async run(opts: RunOpts): Promise<RunResult> {
    const start = Date.now();
    const args = ['exec', opts.prompt, '-C', opts.workdir, '-s', 'read-only', '--skip-git-repo-check', '--json'];
    if (opts.model) args.push('-m', opts.model);
    if (opts.extraArgs) args.push(...opts.extraArgs);

    try {
      const out = execFileSync('codex', args, {
        cwd: opts.workdir,
        timeout: opts.timeoutMs,
        encoding: 'utf-8',
        maxBuffer: 32 * 1024 * 1024,
      });
      const parsed = this.parseJsonl(out);
      return {
        output: parsed.output,
        tokens: parsed.tokens,
        durationMs: Date.now() - start,
        toolCalls: parsed.toolCalls,
        modelUsed: parsed.modelUsed || opts.model || 'gpt-5.4',
      };
    } catch (err: unknown) {
      const durationMs = Date.now() - start;
      const e = err as { code?: string; stderr?: Buffer; signal?: string; message?: string };
      const stderr = e.stderr?.toString() ?? '';
      if (e.signal === 'SIGTERM' || e.code === 'ETIMEDOUT') {
        return this.emptyResult(durationMs, { code: 'timeout', reason: `exceeded ${opts.timeoutMs}ms` }, opts.model);
      }
      if (/unauthorized|auth|login/i.test(stderr)) {
        return this.emptyResult(durationMs, { code: 'auth', reason: stderr.slice(0, 400) }, opts.model);
      }
      if (/rate[- ]?limit|429/i.test(stderr)) {
        return this.emptyResult(durationMs, { code: 'rate_limit', reason: stderr.slice(0, 400) }, opts.model);
      }
      return this.emptyResult(durationMs, { code: 'unknown', reason: (e.message ?? stderr ?? 'unknown').slice(0, 400) }, opts.model);
    }
  }

  estimateCost(tokens: { input: number; output: number; cached?: number }, model?: string): number {
    return estimateCostUsd(tokens, model ?? 'gpt-5.4');
  }

  private parseJsonl(raw: string): { output: string; tokens: { input: number; output: number }; toolCalls: number; modelUsed?: string } {
    let output = '';
    let input = 0;
    let out = 0;
    let toolCalls = 0;
    let modelUsed: string | undefined;
    for (const line of raw.split('\n')) {
      const s = line.trim();
      if (!s) continue;
      try {
        const obj = JSON.parse(s);
        if (obj.type === 'item.completed' && obj.item) {
          if (obj.item.type === 'agent_message' && typeof obj.item.text === 'string') {
            output += (output ? '\n' : '') + obj.item.text;
          } else if (obj.item.type === 'command_execution') {
            toolCalls += 1;
          }
        } else if (obj.type === 'turn.completed') {
          const u = obj.usage ?? {};
          input += u.input_tokens ?? 0;
          out += u.output_tokens ?? 0;
          if (obj.model) modelUsed = obj.model;
        }
      } catch {
        // Skip malformed lines.
      }
    }
    return { output, tokens: { input, output: out }, toolCalls, modelUsed };
  }

  private emptyResult(durationMs: number, error: RunResult['error'], model?: string): RunResult {
    return {
      output: '',
      tokens: { input: 0, output: 0 },
      durationMs,
      toolCalls: 0,
      modelUsed: model ?? 'gpt-5.4',
      error,
    };
  }
}
