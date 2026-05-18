/**
 * Model taxonomy — neutral module with no imports from hosts/ or resolvers/.
 *
 * Model families supported by Codex model overlays in model-overlays/{family}.md.
 * The default is 'codex'. Users may pass an OpenAI model family explicitly.
 */

export const ALL_MODEL_NAMES = [
  'codex',
  'gpt',
  'gpt-5.4',
  'gpt-5.4-mini',
  'o-series',
] as const;

export type Model = (typeof ALL_MODEL_NAMES)[number];

/**
 * Resolve a model argument from CLI input to a known Model family.
 *
 * Precedence rules:
 * 1. Exact match against ALL_MODEL_NAMES → return as-is.
 * 2. Family heuristics for common variants:
 *    - `gpt-5.4-mini`, `gpt-5.4-turbo`, `gpt-5.4-*` → `gpt-5.4`
 *    - `gpt-*` (anything else GPT) → `gpt`
 *    - `o3`, `o4`, `o4-mini`, `o1`, `o1-mini`, `o1-pro` → `o-series`
 *    - `gpt-5.4-mini`, `gpt-5.4-*` → `gpt-5.4`
 * 3. Unknown input → returns null (caller decides: error, or fall back).
 *
 * The resolver file in model-overlays/{model}.md applies further fallback
 * (e.g., missing gpt-5.4.md falls back to gpt.md). This function only
 * normalizes CLI input to a family name.
 */
export function resolveModel(input: string): Model | null {
  const s = input.trim();
  if (!s) return null;

  // Exact match first
  if ((ALL_MODEL_NAMES as readonly string[]).includes(s)) {
    return s as Model;
  }

  // Family heuristics
  if (/^gpt-5\.4-mini(-|$)/.test(s)) return 'gpt-5.4-mini';
  if (/^gpt-5\.4(-|$)/.test(s)) return 'gpt-5.4';
  if (/^gpt(-|$)/.test(s)) return 'gpt';
  if (/^o[0-9]+(-|$)/.test(s)) return 'o-series';
  if (/^codex(-|$)/.test(s)) return 'codex';

  return null;
}

/**
 * Validate a string against ALL_MODEL_NAMES. Used by host-config validators
 * when a HostConfig declares `defaultModel`. Returns an error message or null
 * if valid.
 */
export function validateModel(input: string): string | null {
  if ((ALL_MODEL_NAMES as readonly string[]).includes(input)) return null;
  return `'${input}' is not a known model. Use ${ALL_MODEL_NAMES.join(', ')}.`;
}
