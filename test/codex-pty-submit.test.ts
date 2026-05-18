/**
 * Codex TUI PTY submit self-test.
 *
 * This intentionally isolates the lowest-level question for the real-PTY
 * harness: can we launch the interactive Codex TUI, type into the composer,
 * submit it, and observe the TUI leave composer state?
 *
 * It is opt-in because it drives a real Codex session and may make a model
 * request. Run with:
 *
 *   EVALS=1 CGSTACK_CODEX_PTY_SELFTEST=1 bun test test/codex-pty-submit.test.ts
 *   EVALS=1 CGSTACK_CODEX_PTY_PROBE=1 bun test test/codex-pty-submit.test.ts
 */

import { describe, expect, test } from 'bun:test';
import { launchCodexPty, resolveCodexBinary } from './helpers/codex-pty-runner';

const shouldRunSelfTest = !!process.env.EVALS && process.env.CGSTACK_CODEX_PTY_SELFTEST === '1';
const shouldRunProbe = !!process.env.EVALS && process.env.CGSTACK_CODEX_PTY_PROBE === '1';
const describePtySelfTest = shouldRunSelfTest ? describe : describe.skip;
const describePtyProbe = shouldRunProbe ? describe : describe.skip;

type Session = Awaited<ReturnType<typeof launchCodexPty>>;

function evidenceBlock(session: Session): string {
  return [
    `codex=${resolveCodexBinary() ?? '<not found>'}`,
    session.debugSnapshot({ label: 'Codex PTY submit self-test evidence' }),
  ].join('\n');
}

async function launchProbeSession(): Promise<Session> {
  const model = process.env.EVALS_MODEL ?? 'gpt-5.4-mini';
  return launchCodexPty({
    timeoutMs: 45_000,
    rows: 40,
    cols: 120,
    extraArgs: ['-m', model],
  });
}

describePtySelfTest('Codex TUI PTY submit self-test', () => {
  test('typed composer text can be submitted with Enter', async () => {
    expect(resolveCodexBinary(), 'codex binary must be available').toBeTruthy();

    const session = await launchProbeSession();

    try {
      await session.waitForComposerReady({ timeoutMs: 45_000 });
      const marker = session.mark();
      await session.submit('Reply with exactly the token formed by joining CGSTACK, PTY, and READY with underscores. No other text.');

      await session.waitForAny(
        [
          /CGSTACK_PTY_READY/,
        ],
        { timeoutMs: 60_000, since: marker },
      ).catch((err) => {
        throw new Error(`${(err as Error).message}\n${evidenceBlock(session)}`);
      });

      const visible = session.visibleSince(marker);
      expect(
        /CGSTACK_PTY_READY/.test(visible),
        evidenceBlock(session),
      ).toBe(true);
    } finally {
      await session.close();
    }
  }, 75_000);
});

interface SubmitCandidate {
  name: string;
  write(session: Session, prompt: string): Promise<void>;
}

const SUBMIT_CANDIDATES: SubmitCandidate[] = [
  {
    name: 'plain text + LF',
    async write(session, prompt) {
      session.send(prompt);
      await Bun.sleep(250);
      session.send('\n');
    },
  },
  {
    name: 'plain text + CR',
    async write(session, prompt) {
      session.send(prompt);
      await Bun.sleep(250);
      session.send('\r');
    },
  },
  {
    name: 'plain text + CRLF',
    async write(session, prompt) {
      session.send(prompt);
      await Bun.sleep(250);
      session.send('\r\n');
    },
  },
  {
    name: 'plain text + keypad Enter',
    async write(session, prompt) {
      session.send(prompt);
      await Bun.sleep(250);
      session.send('\x1bOM');
    },
  },
  {
    name: 'bracketed paste + LF',
    async write(session, prompt) {
      session.send(`\x1b[200~${prompt}\x1b[201~`);
      await Bun.sleep(250);
      session.send('\n');
    },
  },
  {
    name: 'bracketed paste + CR',
    async write(session, prompt) {
      session.send(`\x1b[200~${prompt}\x1b[201~`);
      await Bun.sleep(250);
      session.send('\r');
    },
  },
  {
    name: 'bracketed paste + CRLF',
    async write(session, prompt) {
      session.send(`\x1b[200~${prompt}\x1b[201~`);
      await Bun.sleep(250);
      session.send('\r\n');
    },
  },
];

describePtyProbe('Codex TUI PTY submit sequence probe', () => {
  test('discovers a submit sequence accepted by the composer', async () => {
    expect(resolveCodexBinary(), 'codex binary must be available').toBeTruthy();

    const results: string[] = [];
    for (const [index, candidate] of SUBMIT_CANDIDATES.entries()) {
      const slug = `S${index + 1}`;
      const expected = `CGSTACK_PTY_${slug}_READY`;
      const prompt = `Reply with exactly the token formed by joining CGSTACK_PTY, ${slug}, and READY with underscores. No other text.`;
      const session = await launchProbeSession();

      try {
        await session.waitForComposerReady({ timeoutMs: 45_000 });
        const marker = session.mark();
        await candidate.write(session, prompt);
        await session.waitFor(new RegExp(expected), { timeoutMs: 20_000, since: marker });
        results.push(`${candidate.name}: PASS`);
        process.stderr.write(`\nCodex PTY submit probe:\n${results.join('\n')}\n`);
        expect(candidate.name).toBeTruthy();
        return;
      } catch (err) {
        results.push(`${candidate.name}: FAIL ${(err as Error).message.split('\n')[0]}`);
      } finally {
        await session.close();
      }
    }

    throw new Error(`No submit sequence worked.\n${results.join('\n')}`);
  }, 210_000);
});
