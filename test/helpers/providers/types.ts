/**
 * Provider adapter interface for Codex benchmark runs.
 */

export interface RunOpts {
  /** The prompt to send to Codex. */
  prompt: string;
  /** Working directory passed to Codex. */
  workdir: string;
  /** Hard wall-clock timeout in ms. Default: 300000 (5 min). */
  timeoutMs: number;
  /** Specific OpenAI model, optional. */
  model?: string;
  /** Extra Codex CLI flags. */
  extraArgs?: string[];
}

export interface TokenUsage {
  input: number;
  output: number;
  /** Cached input tokens. Undefined if Codex doesn't report it. */
  cached?: number;
}

export type RunError =
  | 'auth'
  | 'timeout'
  | 'rate_limit'
  | 'binary_missing'
  | 'unknown';

export interface RunResult {
  /** Codex textual output for the prompt. */
  output: string;
  /** Normalized token usage. 0s if unreported. */
  tokens: TokenUsage;
  /** Wall-clock duration. */
  durationMs: number;
  /** Count of tool/function calls made during the run. */
  toolCalls: number;
  /** Actual model ID Codex reports using. */
  modelUsed: string;
  /** If the run failed, error code + human reason. output/tokens may be partial. */
  error?: { code: RunError; reason: string };
}

export interface AvailabilityCheck {
  ok: boolean;
  /** When !ok: short reason shown to user. Includes install / login hint. */
  reason?: string;
}

export type Family = 'codex';

export interface ProviderAdapter {
  readonly name: 'codex';
  readonly family: Family;
  available(): Promise<AvailabilityCheck>;
  run(opts: RunOpts): Promise<RunResult>;
  estimateCost(tokens: TokenUsage, model?: string): number;
}
