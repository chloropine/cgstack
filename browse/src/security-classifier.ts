/**
 * Security classifier — ML prompt injection detection.
 *
 * This module is optional and must stay out of the compiled browse binary.
 * It CANNOT be imported by server.ts or any other module that ends up in the
 * compiled browse binary, because @huggingface/transformers requires
 * onnxruntime-node at runtime and that native module fails to dlopen from
 * Bun's compiled-binary temp extraction dir.
 *
 * See: 2026-04-19-prompt-injection-guard.md Pre-Impl Gate 1 outcome.
 *
 * Layers:
 *   L4 (testsavant_content)   — TestSavantAI BERT-small ONNX classifier on page
 *                                snapshots and tool outputs. Detects indirect
 *                                prompt injection + jailbreak attempts.
 *   L4b (transcript_classifier) — disabled in the Codex-only fork. The local
 *                                content classifiers remain active and this
 *                                layer reports a degraded no-op signal.
 *
 * Both classifiers degrade gracefully — if the model fails to load, the layer
 * reports status 'degraded' and returns verdict 'safe' (fail-open). Browsing
 * stays functional; only the extra ML defense disappears.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { mkdirSecure } from './file-permissions';
import { THRESHOLDS, type LayerSignal } from './security';

// ─── Model location + packaging ──────────────────────────────

// Legacy name retained for bench fixture schema compatibility.
export const HAIKU_MODEL = 'gpt-5.4-mini';

/**
 * TestSavantAI prompt-injection-defender-small-v0-onnx.
 *
 * The HuggingFace repo stores model.onnx at the root, but @huggingface/transformers
 * v4 expects it under an `onnx/` subdirectory. We stage the files into the expected
 * layout at ~/.cgstack/models/testsavant-small/ on first use.
 *
 * Files (fetched from HF on first use, cached for lifetime of install):
 *   config.json
 *   tokenizer.json
 *   tokenizer_config.json
 *   special_tokens_map.json
 *   vocab.txt
 *   onnx/model.onnx  (~112MB)
 */
const MODELS_DIR = path.join(os.homedir(), '.cgstack', 'models');
const TESTSAVANT_DIR = path.join(MODELS_DIR, 'testsavant-small');
const TESTSAVANT_HF_URL = 'https://huggingface.co/testsavantai/prompt-injection-defender-small-v0-onnx/resolve/main';
const TESTSAVANT_FILES = [
  'config.json',
  'tokenizer.json',
  'tokenizer_config.json',
  'special_tokens_map.json',
  'vocab.txt',
];

// DeBERTa-v3 (ProtectAI) — OPT-IN ensemble layer. Adds architectural
// diversity: TestSavantAI-small is BERT-small fine-tuned on injection +
// jailbreak; DeBERTa-v3-base is a separate model family trained on its
// own corpus. Agreement between the two is stronger evidence than either
// alone.
//
// Size: model.onnx is 721MB (FP32). Users opt in via
// CGSTACK_SECURITY_ENSEMBLE=deberta. Not forced on every install because
// most users won't need the higher recall and 721MB download is a lot.
const DEBERTA_DIR = path.join(MODELS_DIR, 'deberta-v3-injection');
const DEBERTA_HF_URL = 'https://huggingface.co/protectai/deberta-v3-base-injection-onnx/resolve/main';
const DEBERTA_FILES = [
  'config.json',
  'tokenizer.json',
  'tokenizer_config.json',
  'special_tokens_map.json',
  'spm.model',
  'added_tokens.json',
];

function isDebertaEnabled(): boolean {
  const setting = (process.env.CGSTACK_SECURITY_ENSEMBLE ?? '').toLowerCase();
  return setting.split(',').map(s => s.trim()).includes('deberta');
}

// ─── Load state ──────────────────────────────────────────────

type LoadState = 'uninitialized' | 'loading' | 'loaded' | 'failed';

let testsavantState: LoadState = 'uninitialized';
let testsavantClassifier: any = null;
let testsavantLoadError: string | null = null;

let debertaState: LoadState = 'uninitialized';
let debertaClassifier: any = null;
let debertaLoadError: string | null = null;

export interface ClassifierStatus {
  testsavant: 'ok' | 'degraded' | 'off';
  transcript: 'ok' | 'degraded' | 'off';
  deberta?: 'ok' | 'degraded' | 'off'; // only present when ensemble enabled
}

export function getClassifierStatus(): ClassifierStatus {
  const testsavant =
    testsavantState === 'loaded' ? 'ok' :
    testsavantState === 'failed' ? 'degraded' :
    'off';
  const transcript = 'off';
  const status: ClassifierStatus = { testsavant, transcript };
  if (isDebertaEnabled()) {
    status.deberta =
      debertaState === 'loaded' ? 'ok' :
      debertaState === 'failed' ? 'degraded' :
      'off';
  }
  return status;
}

// ─── Model download + staging ────────────────────────────────

async function downloadFile(url: string, dest: string): Promise<void> {
  const res = await fetch(url);
  if (!res.ok || !res.body) {
    throw new Error(`Failed to fetch ${url}: ${res.status} ${res.statusText}`);
  }
  const tmp = `${dest}.tmp.${process.pid}`;
  const writer = fs.createWriteStream(tmp);
  // @ts-ignore — Node stream compat
  const reader = res.body.getReader();
  let done = false;
  while (!done) {
    const chunk = await reader.read();
    if (chunk.done) { done = true; break; }
    writer.write(chunk.value);
  }
  await new Promise<void>((resolve, reject) => {
    writer.end((err?: Error | null) => (err ? reject(err) : resolve()));
  });
  fs.renameSync(tmp, dest);
}

async function ensureTestsavantStaged(onProgress?: (msg: string) => void): Promise<void> {
  mkdirSecure(path.join(TESTSAVANT_DIR, 'onnx'));

  // Small config/tokenizer files
  for (const f of TESTSAVANT_FILES) {
    const dst = path.join(TESTSAVANT_DIR, f);
    if (fs.existsSync(dst)) continue;
    onProgress?.(`downloading ${f}`);
    await downloadFile(`${TESTSAVANT_HF_URL}/${f}`, dst);
  }

  // Large model file — only download if missing. Put under onnx/ to match the
  // layout @huggingface/transformers v4 expects.
  const modelDst = path.join(TESTSAVANT_DIR, 'onnx', 'model.onnx');
  if (!fs.existsSync(modelDst)) {
    onProgress?.('downloading model.onnx (112MB) — first run only');
    await downloadFile(`${TESTSAVANT_HF_URL}/model.onnx`, modelDst);
  }
}

// ─── L4: TestSavantAI content classifier ─────────────────────

/**
 * Load the TestSavantAI classifier. Idempotent — concurrent calls share the
 * same in-flight promise. Sets state to 'loaded' on success or 'failed' on error.
 *
 * Call this at startup to warm up. First call triggers the model
 * download (~112MB from HuggingFace). Subsequent calls reuse the cached instance.
 */
let loadPromise: Promise<void> | null = null;

export function loadTestsavant(onProgress?: (msg: string) => void): Promise<void> {
  if (process.env.CGSTACK_SECURITY_OFF === '1') {
    testsavantState = 'failed';
    testsavantLoadError = 'CGSTACK_SECURITY_OFF=1 — ML classifier kill switch engaged';
    return Promise.resolve();
  }
  if (testsavantState === 'loaded') return Promise.resolve();
  if (loadPromise) return loadPromise;
  testsavantState = 'loading';
  loadPromise = (async () => {
    try {
      await ensureTestsavantStaged(onProgress);
      // Dynamic import — keeps the module boundary clean so static analyzers
      // don't pull @huggingface/transformers into compiled contexts.
      onProgress?.('initializing classifier');
      const { pipeline, env } = await import('@huggingface/transformers');
      env.allowLocalModels = true;
      env.allowRemoteModels = false;
      env.localModelPath = MODELS_DIR;
      testsavantClassifier = await pipeline(
        'text-classification',
        'testsavant-small',
        { dtype: 'fp32' },
      );
      // TestSavantAI's tokenizer_config.json ships with model_max_length
      // set to a huge placeholder (1e18) which disables automatic truncation
      // in the TextClassificationPipeline. The underlying BERT-small has
      // max_position_embeddings: 512 — passing anything longer throws a
      // broadcast error. Override via _tokenizerConfig (the internal source
      // the computed model_max_length getter reads from) so the pipeline's
      // implicit truncation: true actually kicks in.
      const tok = testsavantClassifier?.tokenizer as any;
      if (tok?._tokenizerConfig) {
        tok._tokenizerConfig.model_max_length = 512;
      }
      testsavantState = 'loaded';
    } catch (err: any) {
      testsavantState = 'failed';
      testsavantLoadError = err?.message ?? String(err);
      console.error('[security-classifier] Failed to load TestSavantAI:', testsavantLoadError);
    }
  })();
  return loadPromise;
}

/**
 * Scan text content for prompt injection. Intended for page snapshots, tool
 * outputs, and other untrusted content blocks.
 *
 * Returns a LayerSignal. On load failure or classification error, returns
 * confidence=0 with status flagged degraded — the ensemble combiner in
 * security.ts then falls through to 'safe' (fail-open by design).
 *
 * Note: TestSavantAI returns {label: 'INJECTION'|'SAFE', score: 0-1}. When
 * label is 'SAFE', we return confidence=0 to the combiner. When label is
 * 'INJECTION', we return the score directly.
 */
/**
 * Strip HTML tags and collapse whitespace. TestSavantAI was trained on
 * plain text, not markup — feeding it raw HTML massively reduces recall
 * because all the tag noise dilutes the injection signal. Callers that
 * already have plain text (page snapshot innerText, tool output strings)
 * get no-op behavior; callers with HTML get the markup stripped.
 */
function htmlToPlainText(input: string): string {
  // Fast path: if no angle brackets, it's already plain text.
  if (!input.includes('<')) return input;
  return input
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, ' ') // drop script/style bodies entirely
    .replace(/<[^>]+>/g, ' ')                               // drop tags
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

export async function scanPageContent(text: string): Promise<LayerSignal> {
  if (!text || text.length === 0) {
    return { layer: 'testsavant_content', confidence: 0 };
  }
  if (testsavantState !== 'loaded') {
    return { layer: 'testsavant_content', confidence: 0, meta: { degraded: true } };
  }
  try {
    // Normalize to plain text first — the classifier is trained on natural
    // language, not HTML markup. A page with an injection buried in tag
    // soup won't fire until we strip the noise.
    const plain = htmlToPlainText(text);
    // Character-level cap to avoid pathological memory use. The pipeline
    // applies tokenizer truncation at 512 tokens (the BERT-small context
    // limit — enforced via the model_max_length override in loadTestsavant)
    // so the 4000-char cap is just a cheap upper bound. Real-world
    // injection signals land in the first few hundred tokens anyway.
    const input = plain.slice(0, 4000);
    const raw = await testsavantClassifier(input);
    const top = Array.isArray(raw) ? raw[0] : raw;
    const label = top?.label ?? 'SAFE';
    const score = Number(top?.score ?? 0);
    if (label === 'INJECTION') {
      return { layer: 'testsavant_content', confidence: score, meta: { label } };
    }
    return { layer: 'testsavant_content', confidence: 0, meta: { label, safeScore: score } };
  } catch (err: any) {
    testsavantState = 'failed';
    testsavantLoadError = err?.message ?? String(err);
    return { layer: 'testsavant_content', confidence: 0, meta: { degraded: true, error: testsavantLoadError } };
  }
}

// ─── L4c: DeBERTa-v3 ensemble (opt-in) ───────────────────────

async function ensureDebertaStaged(onProgress?: (msg: string) => void): Promise<void> {
  mkdirSecure(path.join(DEBERTA_DIR, 'onnx'));
  for (const f of DEBERTA_FILES) {
    const dst = path.join(DEBERTA_DIR, f);
    if (fs.existsSync(dst)) continue;
    onProgress?.(`deberta: downloading ${f}`);
    await downloadFile(`${DEBERTA_HF_URL}/${f}`, dst);
  }
  const modelDst = path.join(DEBERTA_DIR, 'onnx', 'model.onnx');
  if (!fs.existsSync(modelDst)) {
    onProgress?.('deberta: downloading model.onnx (721MB) — first run only');
    await downloadFile(`${DEBERTA_HF_URL}/model.onnx`, modelDst);
  }
}

let debertaLoadPromise: Promise<void> | null = null;
export function loadDeberta(onProgress?: (msg: string) => void): Promise<void> {
  if (process.env.CGSTACK_SECURITY_OFF === '1') return Promise.resolve();
  if (!isDebertaEnabled()) return Promise.resolve();
  if (debertaState === 'loaded') return Promise.resolve();
  if (debertaLoadPromise) return debertaLoadPromise;
  debertaState = 'loading';
  debertaLoadPromise = (async () => {
    try {
      await ensureDebertaStaged(onProgress);
      onProgress?.('deberta: initializing classifier');
      const { pipeline, env } = await import('@huggingface/transformers');
      env.allowLocalModels = true;
      env.allowRemoteModels = false;
      env.localModelPath = MODELS_DIR;
      debertaClassifier = await pipeline(
        'text-classification',
        'deberta-v3-injection',
        { dtype: 'fp32' },
      );
      const tok = debertaClassifier?.tokenizer as any;
      if (tok?._tokenizerConfig) {
        tok._tokenizerConfig.model_max_length = 512;
      }
      debertaState = 'loaded';
    } catch (err: any) {
      debertaState = 'failed';
      debertaLoadError = err?.message ?? String(err);
      console.error('[security-classifier] Failed to load DeBERTa-v3:', debertaLoadError);
    }
  })();
  return debertaLoadPromise;
}

/**
 * Scan text with the DeBERTa-v3 ensemble classifier. Returns a LayerSignal
 * with layer='deberta_content'. No-op when ensemble is disabled — returns
 * confidence=0 with meta.disabled=true so combineVerdict treats it as safe.
 */
export async function scanPageContentDeberta(text: string): Promise<LayerSignal> {
  if (!isDebertaEnabled()) {
    return { layer: 'deberta_content', confidence: 0, meta: { disabled: true } };
  }
  if (!text || text.length === 0) {
    return { layer: 'deberta_content', confidence: 0 };
  }
  if (debertaState !== 'loaded') {
    return { layer: 'deberta_content', confidence: 0, meta: { degraded: true } };
  }
  try {
    const plain = htmlToPlainText(text);
    const input = plain.slice(0, 4000);
    const raw = await debertaClassifier(input);
    const top = Array.isArray(raw) ? raw[0] : raw;
    const label = top?.label ?? 'SAFE';
    const score = Number(top?.score ?? 0);
    if (label === 'INJECTION') {
      return { layer: 'deberta_content', confidence: score, meta: { label } };
    }
    return { layer: 'deberta_content', confidence: 0, meta: { label, safeScore: score } };
  } catch (err: any) {
    debertaState = 'failed';
    debertaLoadError = err?.message ?? String(err);
    return { layer: 'deberta_content', confidence: 0, meta: { degraded: true, error: debertaLoadError } };
  }
}

// ─── L4b: transcript classifier ──────────────────────────────

export interface ToolCallInput {
  tool_name: string;
  tool_input: unknown;
}

/**
 * Codex-only cgstack does not call a non-Codex model for transcript analysis.
 * Keep the exported function so callers and tests retain a stable API, but
 * return a degraded no-op signal.
 */
export async function checkTranscript(_params: {
  user_message: string;
  tool_calls: ToolCallInput[];
  tool_output?: string;
}): Promise<LayerSignal> {
  return { layer: 'transcript_classifier', confidence: 0, meta: { degraded: true, reason: 'codex_only_disabled' } };
}

// ─── Gating helper ───────────────────────────────────────────

/**
 * Should we call the transcript classifier?
 */
export function shouldRunTranscriptCheck(signals: LayerSignal[]): boolean {
  return signals.some(
    (s) => s.layer !== 'transcript_classifier' && s.confidence >= THRESHOLDS.LOG_ONLY,
  );
}
