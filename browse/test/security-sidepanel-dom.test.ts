/**
 * Sidepanel DOM smoke tests for the terminal-only Codex surface.
 *
 * It boots the Terminal pane, mints SSE/PTY sessions, and renders browse
 * activity from /activity/stream.
 */

import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import * as fs from 'fs';
import * as path from 'path';
import { chromium, type Browser, type Page } from 'playwright';

const EXTENSION_DIR = path.resolve(import.meta.dir, '..', '..', 'extension');
const SIDEPANEL_URL = `file://${EXTENSION_DIR}/sidepanel.html`;

const CHROMIUM_AVAILABLE = (() => {
  try {
    const exe = chromium.executablePath();
    return !!exe && fs.existsSync(exe);
  } catch {
    return false;
  }
})();

async function installStubsBeforeLoad(page: Page): Promise<void> {
  await page.addInitScript(() => {
    (window as any).chrome = {
      runtime: {
        sendMessage: (req: any, cb: any) => {
          const payload =
            req?.type === 'getToken'
              ? { token: 'test-token' }
              : { connected: true, port: 34567, token: 'test-token' };
          if (typeof cb === 'function') {
            setTimeout(() => cb(payload), 0);
            return undefined;
          }
          return Promise.resolve(payload);
        },
        lastError: null,
        onMessage: { addListener: () => {} },
      },
      tabs: {
        query: (_q: any, cb: any) => setTimeout(() => cb([{ id: 1, url: 'https://example.com' }]), 0),
        onActivated: { addListener: () => {} },
        onUpdated: { addListener: () => {} },
      },
    };

    const eventSources: any[] = [];
    (window as any).__emitCgstackEvent = (type: string, payload: any) => {
      for (const source of eventSources) {
        for (const cb of source.listeners[type] || []) {
          cb({ data: JSON.stringify(payload) });
        }
      }
    };
    (window as any).EventSource = class {
      listeners: Record<string, Function[]> = {};
      url: string;
      constructor(url: string) {
        this.url = url;
        eventSources.push(this);
      }
      addEventListener(type: string, cb: Function) {
        this.listeners[type] ||= [];
        this.listeners[type].push(cb);
      }
      close() {}
    };

    window.fetch = async function (input: any) {
      const url = String(input);
      if (url.endsWith('/health')) {
        return new Response(JSON.stringify({
          status: 'healthy',
          token: 'test-token',
          mode: 'headed',
          chatEnabled: false,
          security: { status: 'degraded', layers: {}, lastUpdated: '' },
          terminalPort: null,
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      if (url.endsWith('/sse-session')) {
        return new Response(JSON.stringify({ expiresAt: Date.now() + 60000, cookie: 'cgstack_sse' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (url.endsWith('/pty-session')) {
        return new Response(JSON.stringify({ error: 'terminal-agent not ready' }), {
          status: 503,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (url.endsWith('/refs')) {
        return new Response(JSON.stringify({ refs: [], url: 'https://example.com', mode: 'headed' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (url.endsWith('/command')) {
        return new Response('ok', { status: 200 });
      }
      return new Response('{}', { status: 200 });
    } as any;
  });
}

let browser: Browser | null = null;

beforeAll(async () => {
  if (!CHROMIUM_AVAILABLE) return;
  browser = await chromium.launch({
    headless: true,
    chromiumSandbox: false,
    args: ['--no-sandbox'],
  });
}, 30000);

afterAll(async () => {
  if (browser) {
    try { await browser.close(); } catch {}
  }
});

describe('sidepanel terminal-only DOM', () => {
  test.skipIf(!CHROMIUM_AVAILABLE)('Terminal pane is active and legacy security shield stays hidden', async () => {
    const context = await browser!.newContext();
    try {
      const page = await context.newPage();
      await installStubsBeforeLoad(page);
      await page.goto(SIDEPANEL_URL);
      await page.waitForSelector('#tab-terminal.active', { timeout: 5000 });

      const shieldDisplay = await page.$eval('#security-shield', (el) =>
        window.getComputedStyle(el).display,
      );
      expect(shieldDisplay).toBe('none');
      expect(await page.locator('#command-input').count()).toBe(0);
      expect(await page.locator('#send-btn').count()).toBe(0);
    } finally {
      await context.close();
    }
  }, 15000);

  test.skipIf(!CHROMIUM_AVAILABLE)('activity SSE events render in the debug activity feed', async () => {
    const context = await browser!.newContext();
    try {
      const page = await context.newPage();
      await installStubsBeforeLoad(page);
      await page.goto(SIDEPANEL_URL);
      await page.waitForFunction(() => typeof (window as any).__emitCgstackEvent === 'function');

      await page.evaluate(() => {
        (window as any).__emitCgstackEvent('activity', {
          id: 1,
          type: 'command_start',
          command: 'goto',
          args: ['https://example.com'],
          timestamp: new Date().toISOString(),
          url: 'https://example.com',
        });
      });

      await page.waitForFunction(
        () => document.querySelector('.activity-entry .entry-command')?.textContent === 'goto',
        { timeout: 5000 },
      );
      const command = await page.textContent('.activity-entry .entry-command');
      const args = await page.textContent('.activity-entry .entry-args');
      expect(command).toBe('goto');
      expect(args).toContain('https://example.com');
    } finally {
      await context.close();
    }
  }, 15000);
});
