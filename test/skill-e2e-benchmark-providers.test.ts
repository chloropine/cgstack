/**
 * Codex benchmark adapter E2E.
 *
 * Periodic tier: runs under EVALS=1. This hits a real `codex exec --json`
 * process and verifies parsing, timeout handling, and benchmark aggregation.
 */

import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { CodexAdapter } from './helpers/providers/codex';
import { runBenchmark } from './helpers/benchmark-runner';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const evalsEnabled = !!process.env.EVALS;
const describeIfEvals = evalsEnabled ? describe : describe.skip;
const PROMPT = 'Reply with exactly this text and nothing else: ok';
const codex = new CodexAdapter();
let workdir: string;

describeIfEvals('Codex benchmark adapter (live)', () => {
  beforeAll(() => {
    workdir = fs.mkdtempSync(path.join(os.tmpdir(), 'bench-e2e-'));
  });

  afterAll(() => {
    if (workdir && fs.existsSync(workdir)) {
      fs.rmSync(workdir, { recursive: true, force: true });
    }
  });

  test('available() returns structured ok/reason', async () => {
    const check = await codex.available();
    expect(check).toHaveProperty('ok');
    if (!check.ok) {
      expect(typeof check.reason).toBe('string');
      expect(check.reason!.length).toBeGreaterThan(0);
    }
  });

  test('trivial prompt produces parseable output', async () => {
    const check = await codex.available();
    if (!check.ok) {
      process.stderr.write(`\nCodex live smoke: SKIPPED - ${check.reason}\n`);
      return;
    }
    const result = await codex.run({ prompt: PROMPT, workdir, timeoutMs: 120_000 });
    if (result.error) {
      throw new Error(`Codex errored: ${result.error.code} - ${result.error.reason}`);
    }
    expect(typeof result.output).toBe('string');
    expect(result.tokens.input).toBeGreaterThanOrEqual(0);
    expect(result.tokens.output).toBeGreaterThanOrEqual(0);
    expect(result.durationMs).toBeGreaterThan(0);
    expect(typeof result.modelUsed).toBe('string');
  }, 150_000);

  test('timeout error surfaces as error.code without throwing', async () => {
    const check = await codex.available();
    if (!check.ok) {
      process.stderr.write(`\nTimeout smoke: SKIPPED - ${check.reason}\n`);
      return;
    }
    const result = await codex.run({ prompt: PROMPT, workdir, timeoutMs: 100 });
    expect(result.error).toBeDefined();
    expect(['timeout', 'unknown', 'binary_missing']).toContain(result.error!.code);
    expect(result.durationMs).toBeGreaterThan(0);
  }, 30_000);

  test('runBenchmark returns a Codex entry', async () => {
    const report = await runBenchmark({
      prompt: PROMPT,
      workdir,
      providers: ['codex'],
      timeoutMs: 120_000,
      skipUnavailable: false,
    });
    expect(report.entries).toHaveLength(1);
    expect(report.entries[0].family).toBe('codex');
    if (report.entries[0].available) {
      expect(report.entries[0].result).toBeDefined();
    } else {
      expect(typeof report.entries[0].unavailable_reason).toBe('string');
    }
  }, 150_000);
});
