/**
 * Unit tests for the benchmark runner.
 *
 * Mocks Codex runs to verify:
 * - Unavailable runs are skipped or marked depending on flag
 * - Run errors don't abort report formatting
 * - Output formatters (table, json, markdown) produce non-empty strings
 *
 * Does NOT exercise live Codex — see the Codex E2E tests for that.
 */

import { test, expect } from 'bun:test';
import { formatTable, formatJson, formatMarkdown, type BenchmarkReport } from './helpers/benchmark-runner';
import { estimateCostUsd, PRICING } from './helpers/pricing';
import { missingTools, TOOL_COMPATIBILITY } from './helpers/tool-map';

test('estimateCostUsd returns 0 for unknown model (no crash)', () => {
  const cost = estimateCostUsd({ input: 1000, output: 500 }, 'unknown-model-7b');
  expect(cost).toBe(0);
});

test('estimateCostUsd computes correctly for known Codex model', () => {
  // gpt-5.4: $2.50/MTok input, $10/MTok output
  // 1M input + 0.5M output = $2.50 + $5.00 = $7.50
  const cost = estimateCostUsd({ input: 1_000_000, output: 500_000 }, 'gpt-5.4');
  expect(cost).toBeCloseTo(7.50, 2);
});

test('estimateCostUsd applies cached input discount alongside uncached input', () => {
  // tokens.input is uncached-only; tokens.cached is disjoint cache-reads at 10%.
  // 0 uncached input, 1M cached -> 10% of $2.50 = $0.25
  const cost1 = estimateCostUsd({ input: 0, output: 0, cached: 1_000_000 }, 'gpt-5.4');
  expect(cost1).toBeCloseTo(0.25, 2);
  // 500K uncached input + 500K cached -> $1.25 + $0.125 = $1.375
  const cost2 = estimateCostUsd({ input: 500_000, output: 0, cached: 500_000 }, 'gpt-5.4');
  expect(cost2).toBeCloseTo(1.375, 3);
});

test('PRICING table covers the key model families', () => {
  expect(PRICING['gpt-5.4']).toBeDefined();
  expect(PRICING['gpt-5.4-mini']).toBeDefined();
  expect(PRICING['o3']).toBeDefined();
  expect(PRICING['o4-mini']).toBeDefined();
});

test('missingTools reports unsupported tools for Codex CLI runs', () => {
  expect(missingTools('codex', ['Edit', 'Glob', 'Grep'])).toEqual(['Edit', 'Glob', 'Grep']);
  expect(missingTools('codex', ['Bash', 'Read'])).toEqual([]);
});

test('TOOL_COMPATIBILITY is populated for Codex', () => {
  expect(TOOL_COMPATIBILITY.codex).toBeDefined();
});

test('formatTable handles a report with mixed success/error/unavailable entries', () => {
  const report: BenchmarkReport = {
    prompt: 'test prompt',
    workdir: '/tmp',
    startedAt: '2026-04-16T20:00:00Z',
    durationMs: 1500,
    entries: [
      {
        provider: 'codex',
        family: 'codex',
        available: true,
        result: {
          output: 'ok',
          tokens: { input: 100, output: 200 },
          durationMs: 800,
          toolCalls: 3,
          modelUsed: 'gpt-5.4',
        },
        costUsd: 0.0165,
        qualityScore: 9.2,
      },
      {
        provider: 'codex',
        family: 'codex',
        available: true,
        result: {
          output: '',
          tokens: { input: 0, output: 0 },
          durationMs: 200,
          toolCalls: 0,
          modelUsed: 'gpt-5.4',
          error: { code: 'auth', reason: 'codex login required' },
        },
      },
      {
        provider: 'codex',
        family: 'codex',
        available: false,
        unavailable_reason: 'codex not on PATH',
      },
    ],
  };

  const table = formatTable(report);
  expect(table).toContain('gpt-5.4');
  expect(table).toContain('ERROR auth');
  expect(table).toContain('unavailable');
  expect(table).toContain('9.2/10');
});

test('formatJson produces parseable JSON', () => {
  const report: BenchmarkReport = {
    prompt: 'x',
    workdir: '/tmp',
    startedAt: '2026-04-16T20:00:00Z',
    durationMs: 100,
    entries: [],
  };
  const json = formatJson(report);
  const parsed = JSON.parse(json);
  expect(parsed.prompt).toBe('x');
  expect(parsed.entries).toEqual([]);
});

test('formatMarkdown produces a table header', () => {
  const report: BenchmarkReport = {
    prompt: 'x',
    workdir: '/tmp',
    startedAt: '2026-04-16T20:00:00Z',
    durationMs: 100,
    entries: [],
  };
  const md = formatMarkdown(report);
  expect(md).toContain('# Benchmark report');
  expect(md).toContain('| Model | Latency |');
});
