import { describe, test, expect, beforeEach, afterEach } from 'bun:test';

/**
 * Regression test for the TDZ (Temporal Dead Zone) bug at the codex-CLI-missing
 * early return inside checkTranscript's Promise executor.
 *
 * Original bug:
 *   const codex = resolveCodexCommand();
 *   if (!codex) return finish({...});     // ← TDZ: finish not yet declared
 *   const p = spawn(...);
 *   let done = false;
 *   const finish = (...) => {...};          // ← declared HERE, too late
 *
 * Fix: hoist `let done` + `const finish` above the resolveCodexCommand call.
 *
 * This test exercises the outer guard (checkMiniAvailable returning false when
 * codex CLI is not on PATH), which is the realistic runtime path. The TDZ
 * itself was inside the spawn Promise — only reachable in a TOCTOU window if
 * codex went missing between checkMiniAvailable and the spawn call. The fix
 * makes that window safe regardless. This test guards against regression by
 * proving the missing-CLI flow returns the expected degraded signal without
 * throwing.
 */
describe('security-classifier: missing codex CLI degraded path', () => {
  let origPath: string | undefined;
  let origGstackCodexBin: string | undefined;
  let origCodexBin: string | undefined;

  beforeEach(() => {
    origPath = process.env.PATH;
    origGstackCodexBin = process.env.CGSTACK_CODEX_BIN;
    origCodexBin = process.env.CODEX_BIN;
    // Force resolveCodexCommand() to fail: clear PATH AND override env vars
    // (resolveCodexCommand honors CGSTACK_CODEX_BIN
    // and CODEX_BIN before falling back to Bun.which(PATH)).
    process.env.PATH = '/nonexistent';
    delete process.env.CGSTACK_CODEX_BIN;
    delete process.env.CODEX_BIN;
  });

  afterEach(() => {
    if (origPath === undefined) delete process.env.PATH;
    else process.env.PATH = origPath;
    if (origGstackCodexBin !== undefined) process.env.CGSTACK_CODEX_BIN = origGstackCodexBin;
    if (origCodexBin !== undefined) process.env.CODEX_BIN = origCodexBin;
  });

  test('checkTranscript returns degraded signal without throwing when codex CLI is unavailable', async () => {
    // Fresh import so miniAvailableCache isn't already populated from a prior test.
    // Bun's module cache is per-test-file; this fresh import path stays clean.
    const { checkTranscript } = await import('../src/security-classifier');

    const result = await checkTranscript({
      user_message: 'hello',
      tool_calls: [],
    });

    // Assert via JSON serialization to bypass any TS narrowing quirks on
    // result.meta (Record<string, unknown>).
    const serialized = JSON.stringify(result);
    expect(serialized).toContain('"layer":"transcript_classifier"');
    expect(serialized).toContain('"confidence":0');
    expect(serialized).toContain('"degraded":true');
    // Reason must indicate the CLI was missing or the spawn failed — proves the
    // early-return / spawn-path returned a structured signal without throwing.
    expect(serialized).toMatch(/"reason":"(codex_only_disabled|codex_cli_not_found|spawn_error|exit_)/);
  });
});
