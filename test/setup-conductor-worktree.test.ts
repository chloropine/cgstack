import { describe, test, expect } from 'bun:test';
import { spawnSync } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

const ROOT = path.resolve(import.meta.dir, '..');
const SETUP_SCRIPT = path.join(ROOT, 'setup');

describe('setup: Codex skill install layout', () => {
  test('direct ~/.codex/skills/cgstack installs are migrated before runtime root creation', () => {
    const content = fs.readFileSync(SETUP_SCRIPT, 'utf-8');
    const migrateDef = content.indexOf('migrate_direct_codex_install()');
    const migrateCall = content.indexOf('migrate_direct_codex_install "$SOURCE_CGSTACK_DIR" "$CODEX_CGSTACK"');
    const rootCall = content.indexOf('create_codex_runtime_root "$SOURCE_CGSTACK_DIR" "$CODEX_CGSTACK"');
    expect(migrateDef).toBeGreaterThan(-1);
    expect(migrateCall).toBeGreaterThan(migrateDef);
    expect(rootCall).toBeGreaterThan(migrateCall);
  });

  test('runtime root is rebuilt before links are created', () => {
    const content = fs.readFileSync(SETUP_SCRIPT, 'utf-8');
    expect(content).toContain('if [ -L "$codex_cgstack" ]; then');
    expect(content).toContain('rm -f "$codex_cgstack"');
    expect(content).toContain('elif [ -d "$codex_cgstack" ] && [ "$codex_cgstack" != "$cgstack_dir" ]; then');
    expect(content).toContain('rm -rf "$codex_cgstack"');
  });

  test('flat skill linking preserves user-owned real directories and cleans managed prefixed aliases', () => {
    const content = fs.readFileSync(SETUP_SCRIPT, 'utf-8');
    expect(content).toContain('_cleanup_skill_entry "$skills_dir/cgstack-$skill_name"');
    expect(content).toContain('if [ -L "$target" ] || [ ! -e "$target" ]; then');
    expect(content).toContain('_link_or_copy "$skill_dir" "$target"');
  });

  // Reproduce the BSD/macOS `ln -snf` behavior that caused the original
  // install bug, then verify the current flat-link guard avoids calling ln
  // for existing real user-owned skill directories.
  test('BSD ln -snf into an existing real dir creates a child symlink (bug reproduces)', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cgstack-setup-guard-'));
    try {
      const source = path.join(tmp, 'source-worktree');
      const dest = path.join(tmp, 'dest-real-dir');
      fs.mkdirSync(source);
      fs.mkdirSync(dest);
      const result = spawnSync('ln', ['-snf', source, dest], { encoding: 'utf-8' });
      expect(result.status).toBe(0);
      const leaked = path.join(dest, path.basename(source));
      expect(fs.existsSync(leaked)).toBe(true);
      expect(fs.lstatSync(leaked).isSymbolicLink()).toBe(true);
      expect(fs.readlinkSync(leaked)).toBe(source);
      expect(fs.lstatSync(dest).isSymbolicLink()).toBe(false);
      expect(fs.lstatSync(dest).isDirectory()).toBe(true);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  test('flat skill guard skips an existing real directory', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cgstack-setup-guard-'));
    try {
      const source = path.join(tmp, 'source-skill');
      const target = path.join(tmp, 'user-skill-dir');
      fs.mkdirSync(source);
      fs.mkdirSync(target);
      const script = `
        set -e
        skill_dir='${source}'
        target='${target}'
        if [ -L "$target" ] || [ ! -e "$target" ]; then
          ln -snf "$skill_dir" "$target"
          echo "LINKED"
        else
          echo "SKIP"
        fi
      `;
      const result = spawnSync('bash', ['-c', script], { encoding: 'utf-8' });
      expect(result.status).toBe(0);
      expect(result.stdout.trim()).toBe('SKIP');
      const leaked = path.join(target, path.basename(source));
      expect(fs.existsSync(leaked)).toBe(false);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  test('flat skill guard links fresh targets and retargets symlinks', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cgstack-setup-guard-'));
    try {
      const source = path.join(tmp, 'new-source');
      const oldSource = path.join(tmp, 'old-source');
      const freshTarget = path.join(tmp, 'fresh-target');
      const symlinkTarget = path.join(tmp, 'symlink-target');
      fs.mkdirSync(source);
      fs.mkdirSync(oldSource);
      fs.symlinkSync(oldSource, symlinkTarget);
      const script = `
        set -e
        for target in '${freshTarget}' '${symlinkTarget}'; do
          skill_dir='${source}'
          if [ -L "$target" ] || [ ! -e "$target" ]; then
            ln -snf "$skill_dir" "$target"
          fi
        done
      `;
      const result = spawnSync('bash', ['-c', script], { encoding: 'utf-8' });
      expect(result.status).toBe(0);
      expect(fs.lstatSync(freshTarget).isSymbolicLink()).toBe(true);
      expect(fs.readlinkSync(freshTarget)).toBe(source);
      expect(fs.readlinkSync(symlinkTarget)).toBe(source);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});
