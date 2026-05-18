/**
 * Codex benchmark runner.
 *
 * Runs the same prompt through Codex and aggregates RunResult outputs + judge
 * scores into a single report.
 */

import type { ProviderAdapter, RunOpts, RunResult } from './providers/types';
import { CodexAdapter } from './providers/codex';

export interface BenchmarkInput {
  prompt: string;
  workdir: string;
  timeoutMs?: number;
  /** Adapter names to run. cgstack supports Codex only. */
  providers: Array<'codex'>;
  /** Optional Codex model override. */
  models?: Partial<Record<'codex', string>>;
  /** If true, skip unavailable Codex runs. If false, include them with error. */
  skipUnavailable?: boolean;
}

export interface BenchmarkEntry {
  provider: string;
  family: 'codex';
  available: boolean;
  unavailable_reason?: string;
  result?: RunResult;
  costUsd?: number;
  /** Judge score 0-10 across dimensions. Populated separately by the judge step. */
  qualityScore?: number;
  qualityDetails?: Record<string, number>;
}

export interface BenchmarkReport {
  prompt: string;
  workdir: string;
  startedAt: string;
  durationMs: number;
  entries: BenchmarkEntry[];
}

const ADAPTERS: Record<'codex', () => ProviderAdapter> = {
  codex: () => new CodexAdapter(),
};

export async function runBenchmark(input: BenchmarkInput): Promise<BenchmarkReport> {
  const startedAtMs = Date.now();
  const startedAt = new Date(startedAtMs).toISOString();
  const timeoutMs = input.timeoutMs ?? 300_000;

  const entries: BenchmarkEntry[] = [];
  const runPromises: Array<Promise<void>> = [];

  for (const name of input.providers) {
    const codex = ADAPTERS[name];
    if (!codex) {
      entries.push({ provider: name, family: 'codex', available: false, unavailable_reason: `unknown provider: ${name}` });
      continue;
    }
    const adapter = codex();
    const entry: BenchmarkEntry = { provider: adapter.name, family: adapter.family, available: true };
    entries.push(entry);

    runPromises.push((async () => {
      const check = await adapter.available();
      entry.available = check.ok;
      if (!check.ok) {
        entry.unavailable_reason = check.reason;
        if (input.skipUnavailable) return;
      }
      const opts: RunOpts = {
        prompt: input.prompt,
        workdir: input.workdir,
        timeoutMs,
        model: input.models?.[name],
      };
      const res = await adapter.run(opts);
      entry.result = res;
      entry.costUsd = adapter.estimateCost(res.tokens, res.modelUsed);
    })());
  }

  await Promise.allSettled(runPromises);

  return {
    prompt: input.prompt,
    workdir: input.workdir,
    startedAt,
    durationMs: Date.now() - startedAtMs,
    entries,
  };
}

export function formatTable(report: BenchmarkReport): string {
  const header = `Model                Latency   In→Out Tokens       Cost       Quality   Tool Calls   Notes`;
  const sep = '-'.repeat(header.length);
  const rows: string[] = [header, sep];
  for (const e of report.entries) {
    if (!e.available) {
      rows.push(`${pad(e.provider, 20)} ${pad('-', 9)} ${pad('-', 20)} ${pad('-', 10)} ${pad('-', 9)} ${pad('-', 12)} unavailable: ${e.unavailable_reason ?? 'unknown'}`);
      continue;
    }
    const r = e.result!;
    if (r.error) {
      rows.push(`${pad(r.modelUsed, 20)} ${pad(msToStr(r.durationMs), 9)} ${pad(`${r.tokens.input}→${r.tokens.output}`, 20)} ${pad(fmtCost(e.costUsd), 10)} ${pad('-', 9)} ${pad(String(r.toolCalls), 12)} ERROR ${r.error.code}: ${r.error.reason.slice(0, 40)}`);
      continue;
    }
    const quality = e.qualityScore !== undefined ? `${e.qualityScore.toFixed(1)}/10` : '-';
    rows.push(`${pad(r.modelUsed, 20)} ${pad(msToStr(r.durationMs), 9)} ${pad(`${r.tokens.input}→${r.tokens.output}`, 20)} ${pad(fmtCost(e.costUsd), 10)} ${pad(quality, 9)} ${pad(String(r.toolCalls), 12)}`);
  }
  return rows.join('\n');
}

export function formatJson(report: BenchmarkReport): string {
  return JSON.stringify(report, null, 2);
}

export function formatMarkdown(report: BenchmarkReport): string {
  const lines: string[] = [
    `# Benchmark report — ${report.startedAt}`,
    '',
    `**Prompt:** ${report.prompt.length > 200 ? report.prompt.slice(0, 200) + '…' : report.prompt}`,
    `**Workdir:** \`${report.workdir}\``,
    `**Total duration:** ${msToStr(report.durationMs)}`,
    '',
    '| Model | Latency | Tokens (in→out) | Cost | Quality | Tools | Notes |',
    '|-------|---------|-----------------|------|---------|-------|-------|',
  ];
  for (const e of report.entries) {
    if (!e.available) {
      lines.push(`| ${e.provider} | - | - | - | - | - | unavailable: ${e.unavailable_reason ?? 'unknown'} |`);
      continue;
    }
    const r = e.result!;
    if (r.error) {
      lines.push(`| ${r.modelUsed} | ${msToStr(r.durationMs)} | ${r.tokens.input}→${r.tokens.output} | ${fmtCost(e.costUsd)} | - | ${r.toolCalls} | ERROR ${r.error.code}: ${r.error.reason.slice(0, 80)} |`);
      continue;
    }
    const quality = e.qualityScore !== undefined ? `${e.qualityScore.toFixed(1)}/10` : '-';
    lines.push(`| ${r.modelUsed} | ${msToStr(r.durationMs)} | ${r.tokens.input}→${r.tokens.output} | ${fmtCost(e.costUsd)} | ${quality} | ${r.toolCalls} | |`);
  }
  return lines.join('\n');
}

function pad(s: string, n: number): string {
  return s.length >= n ? s.slice(0, n) : s + ' '.repeat(n - s.length);
}

function msToStr(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function fmtCost(usd?: number): string {
  if (usd === undefined) return '-';
  if (usd < 0.01) return `$${usd.toFixed(4)}`;
  return `$${usd.toFixed(2)}`;
}
