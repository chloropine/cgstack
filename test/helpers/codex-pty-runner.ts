/**
 * Lightweight Codex PTY helpers used by the paid E2E harness.
 *
 * cgstack is Codex-only, so this module exposes the test-facing primitives
 * around a Codex subprocess and keeps the free helper tests importable.
 */

import * as fs from 'fs';

export function stripAnsi(s: string): string {
  return s
    .replace(/\x1b\[[?=>]?[0-9;: ]*[a-zA-Z]/g, '')
    .replace(/\x1b\][^\x07\x1b]*(\x07|\x1b\\)/g, '')
    .replace(/\x1b[()][AB012]/g, '')
    .replace(/\x1b[78=>M]/g, '');
}

export function resolveCodexBinary(): string | null {
  const override = process.env.BROWSE_TERMINAL_BINARY || process.env.CGSTACK_CODEX_BIN;
  if (override && fs.existsSync(override)) return override;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const which = (Bun as any).which?.('codex');
  if (which) return which;
  const home = process.env.HOME || '';
  for (const candidate of [
    '/opt/homebrew/bin/codex',
    '/usr/local/bin/codex',
    `${home}/.local/bin/codex`,
    `${home}/.bun/bin/codex`,
    `${home}/.npm-global/bin/codex`,
  ]) {
    try {
      fs.accessSync(candidate, fs.constants.X_OK);
      return candidate;
    } catch {
      // keep searching
    }
  }
  return null;
}

function shellQuote(arg: string): string {
  return `'${arg.replace(/'/g, `'\\''`)}'`;
}

export interface CodexPtyOptions {
  permissionMode?: 'plan' | 'default' | 'acceptEdits' | 'bypassPermissions' | 'auto' | 'dontAsk' | null;
  extraArgs?: string[];
  cols?: number;
  rows?: number;
  cwd?: string;
  env?: Record<string, string>;
  timeoutMs?: number;
}

export interface CodexPtySession {
  send(data: string): void;
  sendKey(key: 'Enter' | 'Up' | 'Down' | 'Esc' | 'Tab' | 'ShiftTab' | 'CtrlC'): void;
  submit(text: string, opts?: { dismissAutocomplete?: boolean }): Promise<void>;
  rawOutput(): string;
  visibleText(): string;
  debugSnapshot(opts?: { label?: string; expected?: Array<RegExp | string>; since?: number; tailBytes?: number }): string;
  mark(): number;
  visibleSince(marker?: number): string;
  waitForComposerReady(opts?: { timeoutMs?: number; pollMs?: number; since?: number }): Promise<void>;
  waitForAny(
    patterns: Array<RegExp | string>,
    opts?: { timeoutMs?: number; pollMs?: number; since?: number },
  ): Promise<{ matched: RegExp | string; index: number }>;
  waitFor(pattern: RegExp | string, opts?: { timeoutMs?: number; pollMs?: number; since?: number }): Promise<void>;
  pid(): number | undefined;
  exited(): boolean;
  exitCode(): number | null;
  close(): Promise<void>;
}

export async function launchCodexPty(opts: CodexPtyOptions = {}): Promise<CodexPtySession> {
  const codex = resolveCodexBinary();
  if (!codex) throw new Error('codex binary not found');

  const args = [...(opts.extraArgs || [])];
  if (opts.permissionMode === 'plan') args.unshift('--ask-for-approval', 'on-request');
  if (!args.includes('--no-alt-screen')) args.push('--no-alt-screen');

  let raw = '';
  let code: number | null = null;
  const decoder = new TextDecoder();

  // Interactive Codex requires a TTY. Bun.spawn({ stdin: 'pipe' }) is enough
  // for `codex exec`, but the TUI exits with "stdin is not a terminal".
  // Prefer Bun's native PTY support; fall back to util-linux `script` on
  // runtimes that do not expose it.
  let proc: any;
  let terminal: any = null;
  try {
    proc = (Bun as any).spawn([codex, ...args], {
      cwd: opts.cwd || process.cwd(),
      env: { ...process.env, TERM: 'xterm-256color', ...(opts.env || {}) },
      terminal: {
        rows: opts.rows ?? 40,
        cols: opts.cols ?? 120,
        data(_terminal: any, chunk: Buffer) {
          raw += decoder.decode(chunk, { stream: true });
        },
      },
    });
    terminal = proc.terminal;
  } catch {
    const script = process.platform === 'win32'
      ? null
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      : ((Bun as any).which?.('script') as string | undefined | null);
    const spawnArgs = script
      ? [
          script,
          '-qfec',
          `stty cols ${opts.cols ?? 120} rows ${opts.rows ?? 40}; exec ${[codex, ...args].map(shellQuote).join(' ')}`,
          '/dev/null',
        ]
      : [codex, ...args];

    proc = Bun.spawn(spawnArgs, {
      cwd: opts.cwd || process.cwd(),
      env: { ...process.env, ...(opts.env || {}) },
      stdin: 'pipe',
      stdout: 'pipe',
      stderr: 'pipe',
    });
  }

  const collect = async (stream: ReadableStream<Uint8Array> | null) => {
    if (!stream) return;
    const reader = stream.getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        raw += decoder.decode(value, { stream: true });
      }
    } catch {
      // Process may be killed by timeout or close().
    }
  };
  collect(proc.stdout);
  collect(proc.stderr);
  proc.exited.then((exitCode) => { code = exitCode; }).catch(() => { code = -1; });

  const stdin = proc.stdin;
  const session: CodexPtySession = {
    send(data: string) {
      try {
        if (typeof terminal?.write === 'function') terminal.write(Buffer.from(data));
        else if (typeof stdin?.write === 'function') stdin.write(data.replace(/\r/g, '\n'));
      } catch {}
    },
    sendKey(key) {
      const map: Record<typeof key, string> = {
        Enter: '\r',
        Up: '\x1b[A',
        Down: '\x1b[B',
        Esc: '\x1b',
        Tab: '\t',
        ShiftTab: '\x1b[Z',
        CtrlC: '\x03',
      };
      this.send(map[key]);
    },
    async submit(text: string, submitOpts = {}) {
      this.send(text);
      await Bun.sleep(250);
      if (submitOpts.dismissAutocomplete) {
        this.sendKey('Esc');
        await Bun.sleep(250);
      }
      this.sendKey('Enter');
    },
    rawOutput: () => raw,
    visibleText: () => stripAnsi(raw),
    debugSnapshot(snapshotOpts = {}) {
      const visible = stripAnsi(raw);
      return formatCodexPtyDebugSnapshot({
        label: snapshotOpts.label,
        expected: snapshotOpts.expected,
        visible,
        raw,
        since: snapshotOpts.since,
        tailBytes: snapshotOpts.tailBytes,
        pid: proc.pid,
        exitCode: code,
        cwd: opts.cwd || process.cwd(),
        args,
      });
    },
    mark: () => stripAnsi(raw).length,
    visibleSince(marker = 0) {
      return stripAnsi(raw).slice(marker);
    },
    async waitForComposerReady(waitOpts = {}) {
      const timeoutMs = waitOpts.timeoutMs ?? opts.timeoutMs ?? 60_000;
      const pollMs = waitOpts.pollMs ?? 100;
      const start = Date.now();
      while (Date.now() - start < timeoutMs) {
        const visible = waitOpts.since == null ? this.visibleText() : this.visibleSince(waitOpts.since);
        if (isComposerReadyVisible(visible)) return;
        await Bun.sleep(pollMs);
      }
      throw new Error(this.debugSnapshot({
        label: 'Timed out waiting for Codex composer readiness',
        since: waitOpts.since,
      }));
    },
    async waitForAny(patterns, waitOpts = {}) {
      const timeoutMs = waitOpts.timeoutMs ?? opts.timeoutMs ?? 60_000;
      const pollMs = waitOpts.pollMs ?? 100;
      const start = Date.now();
      while (Date.now() - start < timeoutMs) {
        const visible = waitOpts.since == null ? this.visibleText() : this.visibleSince(waitOpts.since);
        const index = patterns.findIndex((p) => typeof p === 'string' ? visible.includes(p) : p.test(visible));
        if (index >= 0) return { matched: patterns[index]!, index };
        await Bun.sleep(pollMs);
      }
      throw new Error(this.debugSnapshot({
        label: 'Timed out waiting for patterns',
        expected: patterns,
        since: waitOpts.since,
      }));
    },
    async waitFor(pattern, waitOpts) {
      await this.waitForAny([pattern], waitOpts);
    },
    pid: () => proc.pid,
    exited: () => code !== null,
    exitCode: () => code,
    async close() {
      try {
        if (typeof terminal?.close === 'function') terminal.close();
        else if (typeof stdin?.end === 'function') stdin.end();
      } catch {}
      try { proc.kill(); } catch {}
      await proc.exited.catch(() => {});
    },
  };
  return session;
}

export function isPlanReadyVisible(visible: string): boolean {
  if (/ready to execute|would you like to proceed|exit plan mode/i.test(visible)) return true;
  return /readytoexecute|wouldyouliketoproceed|exitplanmode/i.test(visible.replace(/\s+/g, ''));
}

export function isPermissionDialogVisible(visible: string): boolean {
  return /allow|approve|permission|do you want to proceed/i.test(visible) &&
    /(command|edit|write|file|tool|bash|exec)/i.test(visible);
}

export function isComposerReadyVisible(visible: string): boolean {
  const tail = visible.slice(-3000).replace(/\s+/g, ' ');
  const promptIndex = tail.lastIndexOf('›');
  if (promptIndex < 0) return false;
  const promptTail = tail.slice(promptIndex);
  if (/tab to queue message/i.test(promptTail)) return false;
  return /›.{0,240}(?:gpt-|o\d|codex|model:).*?·\s*(?:~|\/|\.)/i.test(promptTail);
}

export function summarizeCodexPtyVisibleState(visible: string): string {
  const tail = visible.slice(-4096);
  const compactTail = tail.replace(/\s+/g, ' ');
  const signals: string[] = [];

  if (!visible.trim()) signals.push('empty-output');
  if (/booting MCP server/i.test(tail)) signals.push('booting-mcp');
  if (/esc to interrupt/i.test(tail)) signals.push('interruptible-status');
  if (/tab to queue message/i.test(tail)) signals.push('composer-queued');
  if (isComposerReadyVisible(visible)) signals.push('composer-ready');
  if (isPermissionDialogVisible(tail)) signals.push('permission-dialog');
  if (isPlanReadyVisible(tail)) signals.push('plan-ready');
  if (isNumberedOptionListVisible(tail)) {
    const labels = parseNumberedOptions(tail).map((option) => `${option.index}:${option.label}`).join(' | ');
    signals.push(labels ? `numbered-options(${labels})` : 'numbered-options');
  }
  if (/\breply\s+(?:with\s+)?[A-Z]\s+or\s+[A-Z]\b/i.test(compactTail)) signals.push('prose-choice-reply-letter');
  if (/\b(?:completed|done)\b/i.test(tail)) signals.push('completion-word');
  if (/\b(?:thinking|working|running|reading|writing)\b/i.test(tail)) signals.push('agent-active-text');

  return signals.length > 0 ? signals.join(', ') : 'unknown';
}

export function formatCodexPtyDebugSnapshot(opts: {
  label?: string;
  expected?: Array<RegExp | string>;
  visible: string;
  raw: string;
  since?: number;
  tailBytes?: number;
  pid?: number;
  exitCode?: number | null;
  cwd?: string;
  args?: string[];
}): string {
  const tailBytes = opts.tailBytes ?? 3000;
  const visibleWindow = opts.since == null ? opts.visible : opts.visible.slice(opts.since);
  const expected = opts.expected?.map((pattern) => pattern instanceof RegExp ? pattern.toString() : JSON.stringify(pattern));
  const header = opts.label ?? 'Codex PTY debug snapshot';
  return [
    header,
    `state: ${summarizeCodexPtyVisibleState(visibleWindow || opts.visible)}`,
    `pid: ${opts.pid ?? '<unknown>'}`,
    `exit_code: ${opts.exitCode ?? '<running>'}`,
    `cwd: ${opts.cwd ?? '<unknown>'}`,
    `args: ${JSON.stringify(opts.args ?? [])}`,
    `visible_chars: ${opts.visible.length}`,
    `raw_chars: ${opts.raw.length}`,
    opts.since == null ? null : `since_marker: ${opts.since}`,
    expected && expected.length > 0 ? `expected: ${expected.join(', ')}` : null,
    `--- visible tail (${tailBytes} chars) ---`,
    opts.visible.slice(-tailBytes),
    `--- raw tail (${tailBytes} chars, JSON escaped) ---`,
    JSON.stringify(opts.raw.slice(-tailBytes)),
  ].filter((line): line is string => line !== null).join('\n');
}

export function isNumberedOptionListVisible(visible: string): boolean {
  return parseNumberedOptions(visible).length >= 2 || /(?:^|\n).{0,80}❯\s*\d+\./.test(visible);
}

export interface UnsupportedCodexTuiArg {
  flag: string;
  value?: string;
  reason: string;
}

export function findUnsupportedCodexTuiArgs(extraArgs: string[] = []): UnsupportedCodexTuiArg[] {
  const unsupported: UnsupportedCodexTuiArg[] = [];

  for (let i = 0; i < extraArgs.length; i++) {
    const arg = extraArgs[i]!;
    const equalsMatch = arg.match(/^(--disallowedTools|--disallowed-tools)=(.+)$/);
    if (equalsMatch) {
      unsupported.push({
        flag: equalsMatch[1]!,
        value: equalsMatch[2]!,
        reason: 'Codex TUI tests cannot emulate disabled tool registries through CLI flags.',
      });
      continue;
    }

    if (arg === '--disallowedTools' || arg === '--disallowed-tools') {
      unsupported.push({
        flag: arg,
        value: extraArgs[i + 1],
        reason: 'Codex TUI tests cannot emulate disabled tool registries through CLI flags.',
      });
      i++;
    }
  }

  return unsupported;
}

export function assertCodexTuiArgsSupported(extraArgs: string[] = []): void {
  const unsupported = findUnsupportedCodexTuiArgs(extraArgs);
  if (unsupported.length === 0) return;

  const details = unsupported
    .map((arg) => arg.value ? `${arg.flag} ${arg.value}` : arg.flag)
    .join(', ');
  throw new Error(
    `Unsupported Codex TUI argument(s): ${details}.\n` +
      'Do not pass disabled-tool flags to runPlanSkillObservation(); they used to be silently stripped. ' +
      'Use runner mode host-sim with askUserQuestion: "none" for AskUserQuestion-blocked coverage.',
  );
}

export const MODE_RE = /\b(HOLD SCOPE|SCOPE EXPANSION|SELECTIVE EXPANSION|SCOPE REDUCTION)\b/i;
export const TAIL_SCAN_BYTES = 1500;

export function parseNumberedOptions(visible: string): Array<{ index: number; label: string }> {
  const tail = visible.slice(-4096);
  const lines = tail.split('\n');
  let anchor = -1;
  for (let i = lines.length - 1; i >= 0; i--) {
    if (/^\s*(?:❯\s*)?1\.\s+/.test(lines[i]!) || /❯\s*1\.\s+/.test(lines[i]!)) {
      anchor = i;
      break;
    }
  }
  if (anchor < 0) return [];

  const out: Array<{ index: number; label: string }> = [];
  let expected = 1;
  for (let i = anchor; i < lines.length; i++) {
    const line = lines[i]!;
    const match = line.match(/(?:^|\s|❯)\s*(\d+)\.\s+(.+)$/);
    if (!match) {
      if (out.length > 0) break;
      continue;
    }
    const index = Number(match[1]);
    if (index !== expected) break;
    out.push({ index, label: match[2]!.trim() });
    expected++;
  }
  return out.length >= 2 ? out : [];
}

export function optionsSignature(options: Array<{ index: number; label: string }>): string {
  return options
    .slice()
    .sort((a, b) => a.index - b.index)
    .map((o) => `${o.index}:${o.label}`)
    .join('|');
}

export function planFileHasDecisionsSection(planFile: string): boolean {
  try {
    return /^##\s+Decisions\b/im.test(fs.readFileSync(planFile, 'utf-8'));
  } catch {
    return false;
  }
}

export function assertReportAtBottomIfPlanWritten(obs: { planFile?: string; evidence: string; outcome?: string }): void {
  if (!obs.planFile || !fs.existsSync(obs.planFile)) return;
  const content = fs.readFileSync(obs.planFile, 'utf-8').trimEnd();
  if (!/##\s+CGSTACK REVIEW REPORT[\s\S]*$/.test(content)) {
    throw new Error(`Plan file is missing final CGSTACK REVIEW REPORT.\n${obs.evidence}`);
  }
}

export interface PlanSkillObservation {
  outcome: 'asked' | 'plan_ready' | 'completion_summary' | 'silent_write' | 'timeout' | 'exited';
  summary: string;
  elapsedMs: number;
  evidence: string;
  planFile?: string;
}

export async function runPlanSkillObservation(opts: {
  skillName: string;
  inPlanMode?: boolean;
  extraArgs?: string[];
  timeoutMs?: number;
  cwd?: string;
  env?: Record<string, string>;
}): Promise<PlanSkillObservation> {
  const start = Date.now();
  const extraArgs = [...(opts.extraArgs || [])];
  assertCodexTuiArgsSupported(extraArgs);
  const session = await launchCodexPty({
    cwd: opts.cwd,
    env: opts.env,
    timeoutMs: opts.timeoutMs,
    permissionMode: opts.inPlanMode ? 'plan' : undefined,
    extraArgs,
  });
  let stage = 'launching Codex TUI';
  let submittedMarker: number | undefined;
  try {
    stage = 'waiting for composer readiness';
    await session.waitForComposerReady({ timeoutMs: 45_000 });
    submittedMarker = session.mark();
    stage = `submitting $${opts.skillName}`;
    await session.submit(`$${opts.skillName}`, { dismissAutocomplete: true });
    stage = `waiting for $${opts.skillName} terminal signal`;
    const hit = await session.waitForAny([/❯\s*1\./, /ready to execute/i, /completed|done/i], {
      timeoutMs: opts.timeoutMs ?? 120_000,
      since: submittedMarker,
    });
    const evidence = session.visibleSince(submittedMarker).slice(-3000);
    if (String(hit.matched).includes('ready')) {
      return { outcome: 'plan_ready', summary: 'plan-ready prompt observed', elapsedMs: Date.now() - start, evidence };
    }
    if (isNumberedOptionListVisible(evidence)) {
      return { outcome: 'asked', summary: 'numbered option prompt observed', elapsedMs: Date.now() - start, evidence };
    }
    return { outcome: 'completion_summary', summary: 'completion marker observed', elapsedMs: Date.now() - start, evidence };
  } catch (err) {
    const visible = session.visibleSince(submittedMarker);
    const state = summarizeCodexPtyVisibleState(visible || session.visibleText());
    const message = (err as Error).message.split('\n')[0] || String(err);
    return {
      outcome: session.exited() ? 'exited' : 'timeout',
      summary: `${stage}: ${message} (state: ${state})`,
      elapsedMs: Date.now() - start,
      evidence: session.debugSnapshot({
        label: `runPlanSkillObservation failed during ${stage}`,
        since: submittedMarker,
        expected: [/❯\s*1\./, /ready to execute/i, /completed|done/i],
      }),
    };
  } finally {
    await session.close();
  }
}

export interface AskUserQuestionFingerprint {
  signature: string;
  promptSnippet: string;
  preReview: boolean;
  options: Array<{ index: number; label: string }>;
}

export interface PlanSkillCountingResult {
  outcome: 'plan_ready' | 'completion_summary' | 'ceiling_reached' | 'timeout' | 'exited';
  step0Count: number;
  reviewCount: number;
  fingerprints: AskUserQuestionFingerprint[];
  elapsedMs: number;
  evidence: string;
}

export async function runPlanSkillCounting(opts: {
  skillName: string;
  slashCommand: string;
  followUpPrompt?: string;
  isLastStep0AUQ?: (fingerprint: AskUserQuestionFingerprint) => boolean;
  reviewCountCeiling?: number;
  firstAUQPick?: (options: Array<{ index: number; label: string }>) => number;
  cwd?: string;
  timeoutMs?: number;
  env?: Record<string, string>;
}): Promise<PlanSkillCountingResult> {
  const obs = await runPlanSkillObservation({
    skillName: opts.skillName,
    cwd: opts.cwd,
    timeoutMs: opts.timeoutMs,
    env: opts.env,
  });
  const options = parseNumberedOptions(obs.evidence);
  const fingerprint = options.length
    ? [{ signature: optionsSignature(options), promptSnippet: options.map((o) => o.label).join(' / '), preReview: true, options }]
    : [];
  return {
    outcome: obs.outcome === 'asked' ? 'completion_summary' : obs.outcome === 'plan_ready' ? 'plan_ready' : 'timeout',
    step0Count: fingerprint.length,
    reviewCount: 0,
    fingerprints: fingerprint,
    elapsedMs: obs.elapsedMs,
    evidence: obs.evidence,
  };
}

export function ceoStep0Boundary(fingerprint: AskUserQuestionFingerprint): boolean {
  return /skip\s+interview|branch\s+diff|describe.*inline|scope/i.test(fingerprint.promptSnippet);
}

export function engStep0Boundary(fingerprint: AskUserQuestionFingerprint): boolean {
  return /architecture|data\s+flow|edge\s+cases|tests|plan/i.test(fingerprint.promptSnippet);
}

export function designStep0Boundary(fingerprint: AskUserQuestionFingerprint): boolean {
  return /visual|hierarchy|spacing|color|typography|motion|design/i.test(fingerprint.promptSnippet);
}

export function devexStep0Boundary(fingerprint: AskUserQuestionFingerprint): boolean {
  return /persona|hello\s+world|friction|magical|developer/i.test(fingerprint.promptSnippet);
}

export function assertReviewReportAtBottom(content: string): {
  ok: boolean;
  reason?: string;
  trailingHeadings?: string[];
} {
  const marker = content.lastIndexOf('## CGSTACK REVIEW REPORT');
  if (marker < 0) return { ok: false, reason: 'is missing CGSTACK REVIEW REPORT' };
  const trailing = content
    .slice(marker + '## CGSTACK REVIEW REPORT'.length)
    .split('\n')
    .filter((line) => /^#{1,2}\s+/.test(line.trim()));
  if (trailing.length > 0) {
    return { ok: false, reason: 'has headings after CGSTACK REVIEW REPORT', trailingHeadings: trailing };
  }
  return { ok: true };
}

export interface PlanSkillFloorResult {
  outcome: 'auq_observed' | 'plan_ready' | 'completion_summary' | 'timeout' | 'exited';
  summary: string;
  elapsedMs: number;
  evidence: string;
}

export async function runPlanSkillFloorCheck(opts: {
  skillName: string;
  slashCommand: string;
  followUpPrompt?: string;
  cwd?: string;
  timeoutMs?: number;
  env?: Record<string, string>;
}): Promise<PlanSkillFloorResult> {
  const obs = await runPlanSkillObservation({
    skillName: opts.skillName,
    cwd: opts.cwd,
    timeoutMs: opts.timeoutMs,
    env: opts.env,
  });
  return {
    outcome: obs.outcome === 'asked' ? 'auq_observed' : obs.outcome,
    summary: obs.summary,
    elapsedMs: obs.elapsedMs,
    evidence: obs.evidence,
  };
}
