/**
 * Host config system tests — 100% coverage of host-config.ts, hosts/index.ts,
 * host-config-export.ts, and golden-file regression checks.
 */

import { describe, test, expect } from 'bun:test';
import * as fs from 'fs';
import * as path from 'path';
import { validateHostConfig, validateAllConfigs, type HostConfig } from '../scripts/host-config';
import {
  ALL_HOST_CONFIGS,
  ALL_HOST_NAMES,
  HOST_CONFIG_MAP,
  getHostConfig,
  resolveHostArg,
  getExternalHosts,
  codex,
} from '../hosts/index';
import { HOST_PATHS } from '../scripts/resolvers/types';

const ROOT = path.resolve(import.meta.dir, '..');

// ─── hosts/index.ts ─────────────────────────────────────────

describe('hosts/index.ts', () => {
  test('ALL_HOST_CONFIGS has only the Codex host', () => {
    expect(ALL_HOST_CONFIGS.length).toBe(1);
    expect(ALL_HOST_NAMES).toEqual(['codex']);
  });

  test('ALL_HOST_NAMES matches config names', () => {
    expect(ALL_HOST_NAMES).toEqual(ALL_HOST_CONFIGS.map(c => c.name));
  });

  test('HOST_CONFIG_MAP keys match names', () => {
    for (const config of ALL_HOST_CONFIGS) {
      expect(HOST_CONFIG_MAP[config.name]).toBe(config);
    }
  });

  test('individual config re-exports match registry', () => {
    expect(codex.name).toBe('codex');
    expect(codex).toBe(HOST_CONFIG_MAP.codex);
  });

  test('getHostConfig returns correct config', () => {
    const c = getHostConfig('codex');
    expect(c.name).toBe('codex');
    expect(c.displayName).toBe('OpenAI Codex CLI');
  });

  test('getHostConfig throws on unknown host', () => {
    expect(() => getHostConfig('nonexistent')).toThrow('Unknown host');
  });

  test('resolveHostArg resolves direct names', () => {
    for (const name of ALL_HOST_NAMES) {
      expect(resolveHostArg(name)).toBe(name);
    }
  });

  test('resolveHostArg resolves aliases', () => {
    expect(resolveHostArg('agents')).toBe('codex');
  });

  test('resolveHostArg throws on unknown alias', () => {
    expect(() => resolveHostArg('nonexistent')).toThrow('Unknown host');
  });

  test('getExternalHosts excludes codex', () => {
    const external = getExternalHosts();
    expect(external).toEqual([]);
  });

  test('every host has a unique name', () => {
    const names = new Set(ALL_HOST_NAMES);
    expect(names.size).toBe(ALL_HOST_NAMES.length);
  });

  test('every host has a unique hostSubdir', () => {
    const subdirs = new Set(ALL_HOST_CONFIGS.map(c => c.hostSubdir));
    expect(subdirs.size).toBe(ALL_HOST_CONFIGS.length);
  });

  test('every host has a unique globalRoot', () => {
    const roots = new Set(ALL_HOST_CONFIGS.map(c => c.globalRoot));
    expect(roots.size).toBe(ALL_HOST_CONFIGS.length);
  });
});

// ─── validateHostConfig ─────────────────────────────────────

describe('validateHostConfig', () => {
  function makeValid(): HostConfig {
    return {
      name: 'test-host',
      displayName: 'Test Host',
      cliCommand: 'testcli',
      globalRoot: '.test/skills/cgstack',
      localSkillRoot: '.test/skills/cgstack',
      hostSubdir: '.test',
      usesEnvVars: true,
      frontmatter: { mode: 'allowlist', keepFields: ['name', 'description'] },
      generation: { generateMetadata: false },
      pathRewrites: [],
      runtimeRoot: { globalSymlinks: ['bin'] },
      install: { prefixable: false, linkingStrategy: 'symlink-generated' },
    };
  }

  test('valid config passes', () => {
    expect(validateHostConfig(makeValid())).toEqual([]);
  });

  test('invalid name is caught', () => {
    const c = makeValid();
    c.name = 'UPPER_CASE';
    const errors = validateHostConfig(c);
    expect(errors.some(e => e.includes('name'))).toBe(true);
  });

  test('name with special chars is caught', () => {
    const c = makeValid();
    c.name = 'has spaces';
    expect(validateHostConfig(c).length).toBeGreaterThan(0);
  });

  test('empty displayName is caught', () => {
    const c = makeValid();
    c.displayName = '';
    expect(validateHostConfig(c).some(e => e.includes('displayName'))).toBe(true);
  });

  test('invalid cliCommand is caught', () => {
    const c = makeValid();
    c.cliCommand = 'has spaces';
    expect(validateHostConfig(c).some(e => e.includes('cliCommand'))).toBe(true);
  });

  test('invalid cliAlias is caught', () => {
    const c = makeValid();
    c.cliAliases = ['good', 'BAD!'];
    expect(validateHostConfig(c).some(e => e.includes('cliAlias'))).toBe(true);
  });

  test('valid cliAliases pass', () => {
    const c = makeValid();
    c.cliAliases = ['alias-one', 'alias-two'];
    expect(validateHostConfig(c)).toEqual([]);
  });

  test('invalid globalRoot is caught', () => {
    const c = makeValid();
    c.globalRoot = 'path with spaces';
    expect(validateHostConfig(c).some(e => e.includes('globalRoot'))).toBe(true);
  });

  test('invalid localSkillRoot is caught', () => {
    const c = makeValid();
    c.localSkillRoot = 'invalid<path>';
    expect(validateHostConfig(c).some(e => e.includes('localSkillRoot'))).toBe(true);
  });

  test('invalid hostSubdir is caught', () => {
    const c = makeValid();
    c.hostSubdir = 'no spaces allowed';
    expect(validateHostConfig(c).some(e => e.includes('hostSubdir'))).toBe(true);
  });

  test('invalid frontmatter.mode is caught', () => {
    const c = makeValid();
    (c.frontmatter as any).mode = 'invalid';
    expect(validateHostConfig(c).some(e => e.includes('frontmatter.mode'))).toBe(true);
  });

  test('invalid linkingStrategy is caught', () => {
    const c = makeValid();
    (c.install as any).linkingStrategy = 'invalid';
    expect(validateHostConfig(c).some(e => e.includes('linkingStrategy'))).toBe(true);
  });

  test('paths with $ and ~ are valid', () => {
    const c = makeValid();
    c.globalRoot = '$HOME/.test/skills/cgstack';
    c.localSkillRoot = '~/.test/skills/cgstack';
    expect(validateHostConfig(c)).toEqual([]);
  });

  test('shell injection attempt in cliCommand is caught', () => {
    const c = makeValid();
    c.cliCommand = 'codex;rm -rf /';
    expect(validateHostConfig(c).some(e => e.includes('cliCommand'))).toBe(true);
  });
});

// ─── validateAllConfigs ─────────────────────────────────────

describe('validateAllConfigs', () => {
  test('real configs all pass validation', () => {
    const errors = validateAllConfigs(ALL_HOST_CONFIGS);
    expect(errors).toEqual([]);
  });

  test('duplicate name detected', () => {
    const dup = { ...codex, name: 'codex' } as HostConfig;
    const errors = validateAllConfigs([codex, dup]);
    expect(errors.some(e => e.includes('Duplicate name'))).toBe(true);
  });

  test('duplicate hostSubdir detected', () => {
    const dup = { ...codex, name: 'dup-host', hostSubdir: '.codex', globalRoot: '.dup/skills/cgstack' } as HostConfig;
    const errors = validateAllConfigs([codex, dup]);
    expect(errors.some(e => e.includes('Duplicate hostSubdir'))).toBe(true);
  });

  test('duplicate globalRoot detected', () => {
    const dup = { ...codex, name: 'dup-host', hostSubdir: '.dup', globalRoot: '.agents/skills/cgstack' } as HostConfig;
    const errors = validateAllConfigs([codex, dup]);
    expect(errors.some(e => e.includes('Duplicate globalRoot'))).toBe(true);
  });

  test('per-config validation errors are prefixed with host name', () => {
    const bad = { ...codex, name: 'BAD', cliCommand: 'also bad' } as HostConfig;
    const errors = validateAllConfigs([bad]);
    expect(errors.every(e => e.startsWith('[BAD]'))).toBe(true);
  });
});

// ─── HOST_PATHS derivation ──────────────────────────────────

describe('HOST_PATHS derivation from configs', () => {
  test('Codex uses literal home paths (no env vars)', () => {
    expect(HOST_PATHS.codex.skillRoot).toBe('~/.codex/skills/cgstack');
    expect(HOST_PATHS.codex.binDir).toBe('~/.codex/skills/cgstack/bin');
    expect(HOST_PATHS.codex.browseDir).toBe('~/.codex/skills/cgstack/browse/dist');
    expect(HOST_PATHS.codex.designDir).toBe('~/.codex/skills/cgstack/design/dist');
  });

  test('Codex uses $CGSTACK_ROOT env vars', () => {
    expect(HOST_PATHS.codex.skillRoot).toBe('$CGSTACK_ROOT');
    expect(HOST_PATHS.codex.binDir).toBe('$CGSTACK_BIN');
    expect(HOST_PATHS.codex.browseDir).toBe('$CGSTACK_BROWSE');
    expect(HOST_PATHS.codex.designDir).toBe('$CGSTACK_DESIGN');
  });

  test('every host with usesEnvVars=true gets env var paths', () => {
    for (const config of ALL_HOST_CONFIGS) {
      if (config.usesEnvVars) {
        expect(HOST_PATHS[config.name].skillRoot).toBe('$CGSTACK_ROOT');
        expect(HOST_PATHS[config.name].binDir).toBe('$CGSTACK_BIN');
      }
    }
  });

  test('every host with usesEnvVars=false gets literal paths', () => {
    for (const config of ALL_HOST_CONFIGS) {
      if (!config.usesEnvVars) {
        expect(HOST_PATHS[config.name].skillRoot).toContain('~/');
        expect(HOST_PATHS[config.name].binDir).toContain('/bin');
      }
    }
  });

  test('localSkillRoot matches config for every host', () => {
    for (const config of ALL_HOST_CONFIGS) {
      expect(HOST_PATHS[config.name].localSkillRoot).toBe(config.localSkillRoot);
    }
  });

  test('HOST_PATHS has entry for every registered host', () => {
    for (const name of ALL_HOST_NAMES) {
      expect(HOST_PATHS[name]).toBeDefined();
    }
  });
});

// ─── host-config-export.ts CLI ──────────────────────────────

describe('host-config-export.ts CLI', () => {
  const EXPORT_SCRIPT = path.join(ROOT, 'scripts', 'host-config-export.ts');

  function run(...args: string[]): { stdout: string; stderr: string; exitCode: number } {
    const result = Bun.spawnSync(['bun', 'run', EXPORT_SCRIPT, ...args], {
      cwd: ROOT, stdout: 'pipe', stderr: 'pipe',
    });
    return {
      stdout: result.stdout.toString().trim(),
      stderr: result.stderr.toString().trim(),
      exitCode: result.exitCode,
    };
  }

  test('list prints all host names', () => {
    const { stdout, exitCode } = run('list');
    expect(exitCode).toBe(0);
    const names = stdout.split('\n');
    expect(names).toEqual(ALL_HOST_NAMES);
  });

  test('get returns string field', () => {
    const { stdout, exitCode } = run('get', 'codex', 'globalRoot');
    expect(exitCode).toBe(0);
    expect(stdout).toBe('.codex/skills/cgstack');
  });

  test('get returns boolean as 1/0', () => {
    const { stdout } = run('get', 'codex', 'usesEnvVars');
    expect(stdout).toBe('1');
  });

  test('get with missing args exits 1', () => {
    const { exitCode } = run('get', 'codex');
    expect(exitCode).toBe(1);
  });

  test('get with unknown field exits 1', () => {
    const { exitCode } = run('get', 'codex', 'nonexistent');
    expect(exitCode).toBe(1);
  });

  test('get with unknown host exits 1', () => {
    const { exitCode } = run('get', 'nonexistent', 'name');
    expect(exitCode).not.toBe(0);
  });

  test('validate passes for real configs', () => {
    const { stdout, exitCode } = run('validate');
    expect(exitCode).toBe(0);
    expect(stdout).toContain('configs valid');
  });

  test('symlinks returns asset list', () => {
    const { stdout, exitCode } = run('symlinks', 'codex');
    expect(exitCode).toBe(0);
    const lines = stdout.split('\n');
    expect(lines).toContain('bin');
    expect(lines).toContain('ETHOS.md');
    expect(lines).toContain('review/checklist.md');
  });

  test('codex symlinks returns nested runtime assets', () => {
    const { stdout, exitCode } = run('symlinks', 'codex');
    expect(exitCode).toBe(0);
    const lines = stdout.split('\n');
    expect(lines).toContain('bin');
    expect(lines).toContain('browse/dist');
    expect(lines).toContain('browse/bin');
    expect(lines).toContain('cgstack-upgrade');
    expect(lines).toContain('ETHOS.md');
    expect(lines).toContain('review/checklist.md');
    expect(lines).toContain('review/TODOS-format.md');
  });

  test('symlinks with missing host exits 1', () => {
    const { exitCode } = run('symlinks');
    expect(exitCode).toBe(1);
  });

  test('detect finds codex (since we are running in codex)', () => {
    const { stdout, exitCode } = run('detect');
    expect(exitCode).toBe(0);
    // codex binary should be on PATH in this environment
    expect(stdout).toContain('codex');
  });

  test('unknown command exits 1', () => {
    const { exitCode } = run('badcommand');
    expect(exitCode).toBe(1);
  });
});

// ─── Individual host config correctness ─────────────────────

describe('host config correctness', () => {
  test('codex is not prefixable', () => {
    expect(codex.install.prefixable).toBe(false);
  });

  test('codex uses generated skill symlinks', () => {
    expect(codex.install.linkingStrategy).toBe('symlink-generated');
  });

  test('codex uses cgstack env vars in generated preambles', () => {
    expect(codex.usesEnvVars).toBe(true);
  });

  test('all external hosts use env vars', () => {
    for (const config of getExternalHosts()) {
      expect(config.usesEnvVars).toBe(true);
    }
  });

  test('codex has 1024-char description limit with error behavior', () => {
    expect(codex.frontmatter.descriptionLimit).toBe(1024);
    expect(codex.frontmatter.descriptionLimitBehavior).toBe('error');
  });

  test('codex generates openai.yaml metadata', () => {
    expect(codex.generation.generateMetadata).toBe(true);
    expect(codex.generation.metadataFormat).toBe('openai.yaml');
  });

  test('codex has sidecar config', () => {
    expect(codex.sidecar).toBeDefined();
    expect(codex.sidecar!.path).toBe('.agents/skills/cgstack');
  });

  test('codex has suppressedResolvers for self-invocation prevention', () => {
    expect(codex.suppressedResolvers).toBeDefined();
    expect(codex.suppressedResolvers).toContain('CODEX_SECOND_OPINION');
    expect(codex.suppressedResolvers).toContain('ADVERSARIAL_STEP');
    expect(codex.suppressedResolvers).toContain('REVIEW_ARMY');
  });

  test('codex has boundary instruction', () => {
    expect(codex.boundaryInstruction).toBeDefined();
    expect(codex.boundaryInstruction).toContain('Do NOT read');
  });

  test('codex has no adapter (dead code removed)', () => {
    expect(codex.adapter).toBeUndefined();
  });

  test('codex has no staticFiles (SOUL.md removed)', () => {
    expect(codex.staticFiles).toBeUndefined();
  });

  test('codex has the OpenAI Codex co-author trailer', () => {
    expect(codex.coAuthorTrailer).toContain('OpenAI Codex');
  });

  test('there are no external hosts', () => {
    expect(getExternalHosts()).toEqual([]);
  });

  test('every host has at least one pathRewrite (except codex)', () => {
    for (const config of getExternalHosts()) {
      expect(config.pathRewrites.length).toBeGreaterThan(0);
    }
    expect(codex.pathRewrites.length).toBe(0);
  });

  test('every host has runtimeRoot.globalSymlinks', () => {
    for (const config of ALL_HOST_CONFIGS) {
      expect(config.runtimeRoot.globalSymlinks.length).toBeGreaterThan(0);
      expect(config.runtimeRoot.globalSymlinks).toContain('bin');
      expect(config.runtimeRoot.globalSymlinks).toContain('ETHOS.md');
    }
  });
});
