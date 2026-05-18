/**
 * Regression: sidebar layout invariants for the terminal-only surface.
 *
 * Terminal is the sole primary surface; Activity / Refs / Inspector are
 * debug overlays.
 *
 * This file locks the load-bearing invariants of that layout so a
 * future refactor can't silently re-introduce the old surface or break
 * the new one.
 */

import { describe, test, expect } from 'bun:test';
import * as fs from 'fs';
import * as path from 'path';

const HTML = fs.readFileSync(path.join(import.meta.dir, '../../extension/sidepanel.html'), 'utf-8');
const JS = fs.readFileSync(path.join(import.meta.dir, '../../extension/sidepanel.js'), 'utf-8');
const TERM_JS = fs.readFileSync(path.join(import.meta.dir, '../../extension/sidepanel-terminal.js'), 'utf-8');
const MANIFEST = JSON.parse(fs.readFileSync(path.join(import.meta.dir, '../../extension/manifest.json'), 'utf-8'));

describe('sidebar: chat tab + nav are removed, Terminal is sole primary surface', () => {
  test('No primary-tab nav element exists', () => {
    expect(HTML).not.toContain('class="primary-tabs"');
    expect(HTML).not.toContain('data-pane="chat"');
    expect(HTML).not.toContain('data-pane="terminal"');
  });

  test('No <main id="tab-chat"> pane', () => {
    expect(HTML).not.toMatch(/<main[^>]*id="tab-chat"/);
    expect(HTML).not.toContain('id="chat-messages"');
    expect(HTML).not.toContain('id="chat-loading"');
    expect(HTML).not.toContain('id="chat-welcome"');
  });

  test('No chat input / send button / experimental banner', () => {
    expect(HTML).not.toContain('class="command-bar"');
    expect(HTML).not.toContain('id="command-input"');
    expect(HTML).not.toContain('id="send-btn"');
    expect(HTML).not.toContain('id="stop-agent-btn"');
    expect(HTML).not.toContain('id="experimental-banner"');
  });

  test('No clear-chat button in footer', () => {
    expect(HTML).not.toContain('id="clear-chat"');
  });

  test('Terminal pane is .active by default and has the toolbar', () => {
    expect(HTML).toMatch(/<main[^>]*id="tab-terminal"[^>]*class="tab-content active"/);
    expect(HTML).toContain('id="terminal-toolbar"');
    expect(HTML).toContain('id="terminal-restart-now"');
  });

  test('Quick-actions buttons (Cleanup / Screenshot / Cookies) survive in the terminal toolbar', () => {
    // Garry explicitly wanted these kept after the chat rip — they drive
    // browser actions, not chat.
    expect(HTML).toContain('id="chat-cleanup-btn"');
    expect(HTML).toContain('id="chat-screenshot-btn"');
    expect(HTML).toContain('id="chat-cookies-btn"');
    // They live inside the terminal toolbar now (siblings of the Restart
    // button), not as a separate strip below all panes.
    const toolbarStart = HTML.indexOf('id="terminal-toolbar"');
    const toolbarEnd = HTML.indexOf('</div>', toolbarStart);
    const toolbarBlock = HTML.slice(toolbarStart, toolbarEnd + 6);
    expect(toolbarBlock).toContain('id="chat-cleanup-btn"');
    expect(toolbarBlock).toContain('id="chat-screenshot-btn"');
    expect(toolbarBlock).toContain('id="chat-cookies-btn"');
  });
});

describe('sidepanel.js: chat helpers ripped, terminal-injection helper survives', () => {
  test('No primary-tab click handler', () => {
    expect(JS).not.toContain("querySelectorAll('.primary-tab')");
    expect(JS).not.toContain('activePrimaryPaneId');
  });

  test('No chat polling, sendMessage, sendChat, stopAgent, or pollTabs', () => {
    expect(JS).not.toContain('chatPollInterval');
    expect(JS).not.toContain('function sendMessage');
    expect(JS).not.toContain('function pollChat');
    expect(JS).not.toContain('function pollTabs');
    expect(JS).not.toContain('function switchChatTab');
    expect(JS).not.toContain('function stopAgent');
    expect(JS).not.toContain('function applyChatEnabled');
    expect(JS).not.toContain('function showSecurityBanner');
  });

  test('Cleanup runs through the live PTY', () => {
    // The Cleanup handler injects the prompt straight into codex's PTY
    // via cgstackInjectToTerminal.
    const cleanup = JS.slice(JS.indexOf('async function runCleanup'));
    expect(cleanup).toContain('window.cgstackInjectToTerminal');
    expect(cleanup).not.toContain('/side' + 'bar-command');
    expect(cleanup).not.toContain('add' + 'Chat' + 'Entry');
  });

  test('Inspector "Send to Code" routes through the live PTY', () => {
    const sendBtn = JS.slice(JS.indexOf('inspectorSendBtn.addEventListener'));
    expect(sendBtn).toContain('window.cgstackInjectToTerminal');
    expect(sendBtn).not.toContain("type: 'sidebar-command'");
  });

  test('updateConnection no longer kicks off chat / tab polling', () => {
    const update = JS.slice(JS.indexOf('function updateConnection'), JS.indexOf('function updateConnection') + 1500);
    expect(update).not.toContain('chatPollInterval');
    expect(update).not.toContain('tabPollInterval');
    expect(update).not.toContain('pollChat');
    expect(update).not.toContain('pollTabs');
    // BUT must still expose the bootstrap globals for sidepanel-terminal.js.
    expect(update).toContain('window.cgstackServerPort');
    expect(update).toContain('window.cgstackAuthToken');
  });
});

describe('sidepanel-terminal.js: eager auto-connect + injection API', () => {
  test('Exposes window.cgstackInjectToTerminal for cross-pane use', () => {
    expect(TERM_JS).toContain('window.cgstackInjectToTerminal');
    // Returns false when no live session, true when bytes go out.
    const inject = TERM_JS.slice(TERM_JS.indexOf('window.cgstackInjectToTerminal'));
    expect(inject).toContain('return false');
    expect(inject).toContain('return true');
    expect(inject).toContain('ws.readyState !== WebSocket.OPEN');
  });

  test('Auto-connects on init (no keypress required)', () => {
    expect(TERM_JS).not.toContain('function onAnyKey');
    expect(TERM_JS).not.toContain("addEventListener('keydown'");
    expect(TERM_JS).toContain('function tryAutoConnect');
  });

  test('Repaint hook fires when Terminal pane becomes visible', () => {
    // The chat-tab rip removed cgstack:primary-tab-changed; we use a
    // MutationObserver on #tab-terminal's class attr instead. The
    // observer must call repaintIfLive when the .active class returns.
    expect(TERM_JS).toContain('MutationObserver');
    expect(TERM_JS).toContain("attributeFilter: ['class']");
    expect(TERM_JS).toContain('repaintIfLive');
    const repaint = TERM_JS.slice(TERM_JS.indexOf('function repaintIfLive'));
    expect(repaint).toContain('fitAddon && fitAddon.fit()');
    expect(repaint).toContain('term.refresh');
    expect(repaint).toContain("type: 'resize'");
  });

  test('No auto-reconnect on close (Restart is user-initiated)', () => {
    const closeOnly = TERM_JS.slice(
      TERM_JS.indexOf("ws.addEventListener('close'"),
      TERM_JS.indexOf("ws.addEventListener('error'"),
    );
    expect(closeOnly).not.toContain('setTimeout');
    expect(closeOnly).not.toContain('tryAutoConnect');
    expect(closeOnly).not.toContain('connect()');
  });

  test('forceRestart helper closes ws, disposes xterm, returns to IDLE', () => {
    expect(TERM_JS).toContain('function forceRestart');
    const fn = TERM_JS.slice(TERM_JS.indexOf('function forceRestart'));
    expect(fn).toContain('ws && ws.close()');
    expect(fn).toContain('term.dispose()');
    expect(fn).toContain('STATE.IDLE');
    expect(fn).toContain('tryAutoConnect()');
  });

  test('Both restart buttons (mid-session and ENDED) call forceRestart', () => {
    expect(TERM_JS).toContain("els.restart?.addEventListener('click', forceRestart)");
    expect(TERM_JS).toContain("els.restartNow?.addEventListener('click', forceRestart)");
  });
});

describe('server.ts: terminal-only endpoint surface', () => {
  const SERVER_SRC = fs.readFileSync(path.join(import.meta.dir, '../src/server.ts'), 'utf-8');

  test('No removed sidepanel routes exist', () => {
    const routes = [
      '/side' + 'bar-command',
      '/side' + 'bar-chat',
      '/side' + 'bar-agent/event',
      '/side' + 'bar-tabs',
      '/side' + 'bar-session',
    ];
    for (const route of routes) {
      expect(SERVER_SRC).not.toContain(`url.pathname === '${route}'`);
      expect(SERVER_SRC).not.toContain(`url.pathname === "${route}"`);
    }
    expect(SERVER_SRC).not.toContain("url.pathname.startsWith('/side" + "bar-agent/");
  });

  test('No chat-related state declarations or helpers', () => {
    // Allow the symbol names inside the rip-marker comments — but no
    // `let`, `const`, `function`, or `interface` declarations of them.
    expect(SERVER_SRC).not.toMatch(/^let agentProcess/m);
    expect(SERVER_SRC).not.toMatch(new RegExp('^let ' + 'agent' + 'Status', 'm'));
    expect(SERVER_SRC).not.toMatch(new RegExp('^let ' + 'message' + 'Queue', 'm'));
    expect(SERVER_SRC).not.toMatch(/^let sidebarSession/m);
    expect(SERVER_SRC).not.toMatch(/^const tabAgents/m);
    expect(SERVER_SRC).not.toMatch(/^function pickSidebarModel/m);
    expect(SERVER_SRC).not.toMatch(/^function processAgentEvent/m);
    expect(SERVER_SRC).not.toMatch(/^function killAgent/m);
    expect(SERVER_SRC).not.toMatch(new RegExp('^function ' + 'add' + 'Chat' + 'Entry', 'm'));
    expect(SERVER_SRC).not.toMatch(new RegExp('^interface ' + 'Chat' + 'Entry', 'm'));
    expect(SERVER_SRC).not.toMatch(new RegExp('^interface ' + 'Side' + 'barSession', 'm'));
  });

  test('/health does not surface removed queue state', () => {
    const health = SERVER_SRC.slice(SERVER_SRC.indexOf("url.pathname === '/health'"));
    const slice = health.slice(0, 2000);
    expect(slice).not.toContain('agent' + 'Status');
    expect(slice).not.toContain('message' + 'Queue');
    expect(slice).not.toContain('agentStartTime');
    // chatEnabled is hardcoded false now (older clients still see the field).
    expect(slice).toMatch(/chatEnabled:\s*false/);
    // terminalPort survives.
    expect(slice).toContain('terminalPort');
  });
});

describe('cli.ts: only terminal-agent is spawned', () => {
  const CLI_SRC = fs.readFileSync(path.join(import.meta.dir, '../src/cli.ts'), 'utf-8');

  test('No legacy agent spawn remains', () => {
    expect(CLI_SRC).not.toMatch(/Bun\.spawn\(\s*\['bun',\s*'run',\s*(?:agentScript|sidepanelAgentScript|sidebarAgentScript|chatAgentScript)\]/);
    expect(CLI_SRC).not.toMatch(/^\s*let agentScript = path\.resolve/m);
  });

  test('Terminal-agent spawn survives', () => {
    expect(CLI_SRC).toContain('terminal-agent.ts');
    expect(CLI_SRC).toMatch(/Bun\.spawn\(\['bun',\s*'run',\s*termAgentScript\]/);
  });
});

describe('files: terminal-only code owns the sidepanel agent path', () => {
  test('queue agent source is absent', () => {
    expect(fs.existsSync(path.join(import.meta.dir, '../src/side' + 'bar-agent.ts'))).toBe(false);
  });

  test('queue agent test files are absent', () => {
    expect(fs.existsSync(path.join(import.meta.dir, 'side' + 'bar-agent.test.ts'))).toBe(false);
    expect(fs.existsSync(path.join(import.meta.dir, 'side' + 'bar-agent-roundtrip.test.ts'))).toBe(false);
  });
});

describe('manifest: ws permission + xterm-safe CSP', () => {
  test('host_permissions covers ws localhost', () => {
    expect(MANIFEST.host_permissions).toContain('ws://127.0.0.1:*/');
  });

  test('host_permissions still covers http localhost', () => {
    expect(MANIFEST.host_permissions).toContain('http://127.0.0.1:*/');
  });

  test('manifest does NOT add unsafe-eval to extension_pages CSP', () => {
    const csp = MANIFEST.content_security_policy;
    if (csp && csp.extension_pages) {
      expect(csp.extension_pages).not.toContain('unsafe-eval');
    }
  });
});

describe('manifest: live tab awareness needs "tabs" permission', () => {
  // Without "tabs", chrome.tabs.query() returns tab objects with undefined
  // url/title for any site outside host_permissions (e.g., everything except
  // 127.0.0.1). snapshotTabs() then writes empty strings into tabs.json and
  // active-tab.json silently skips the write — the sidebar agent loses track
  // of what page the user is on. activeTab is too narrow (only after a user
  // gesture on the extension action) for background polling.
  test('permissions includes "tabs"', () => {
    expect(MANIFEST.permissions).toContain('tabs');
  });
});
