import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { spawnSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const ROOT = path.resolve(import.meta.dir, '..');
const UNINSTALL = path.join(ROOT, 'bin', 'cgstack-uninstall');

describe('cgstack-uninstall', () => {
  test('syntax check passes', () => {
    const result = spawnSync('bash', ['-n', UNINSTALL], { stdio: 'pipe' });
    expect(result.status).toBe(0);
  });

  test('--help prints usage and exits 0', () => {
    const result = spawnSync('bash', [UNINSTALL, '--help'], { stdio: 'pipe' });
    expect(result.status).toBe(0);
    const output = result.stdout.toString();
    expect(output).toContain('cgstack-uninstall');
    expect(output).toContain('--force');
    expect(output).toContain('--keep-state');
  });

  test('unknown flag exits with error', () => {
    const result = spawnSync('bash', [UNINSTALL, '--bogus'], {
      stdio: 'pipe',
      env: { ...process.env, HOME: '/nonexistent' },
    });
    expect(result.status).toBe(1);
    expect(result.stderr.toString()).toContain('Unknown option');
  });

  describe('integration tests with mock layout', () => {
    let tmpDir: string;
    let mockHome: string;
    let mockGitRoot: string;

    beforeEach(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cgstack-uninstall-test-'));
      mockHome = path.join(tmpDir, 'home');
      mockGitRoot = path.join(tmpDir, 'repo');

      // Create mock cgstack install layout
      fs.mkdirSync(path.join(mockHome, '.codex', 'skills', 'cgstack'), { recursive: true });
      fs.writeFileSync(path.join(mockHome, '.codex', 'skills', 'cgstack', 'SKILL.md'), 'test');

      // Create per-skill symlinks (both old unprefixed and new prefixed)
      fs.symlinkSync('cgstack/review', path.join(mockHome, '.codex', 'skills', 'review'));
      fs.symlinkSync('cgstack/ship', path.join(mockHome, '.codex', 'skills', 'cgstack-ship'));

      // Create a non-cgstack symlink (should NOT be removed)
      fs.mkdirSync(path.join(mockHome, '.codex', 'skills', 'other-tool'), { recursive: true });

      // Create state directory
      fs.mkdirSync(path.join(mockHome, '.cgstack', 'projects'), { recursive: true });
      fs.writeFileSync(path.join(mockHome, '.cgstack', 'config.json'), '{}');

      // Create mock git repo
      fs.mkdirSync(mockGitRoot, { recursive: true });
      spawnSync('git', ['init', '-b', 'main'], { cwd: mockGitRoot, stdio: 'pipe' });
    });

    afterEach(() => {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    test('--force removes global Codex skills and state', () => {
      const result = spawnSync('bash', [UNINSTALL, '--force'], {
        stdio: 'pipe',
        env: {
          ...process.env,
          HOME: mockHome,
          CGSTACK_DIR: path.join(mockHome, '.codex', 'skills', 'cgstack'),
          CGSTACK_STATE_DIR: path.join(mockHome, '.cgstack'),
        },
        cwd: mockGitRoot,
      });

      expect(result.status).toBe(0);
      const output = result.stdout.toString();
      expect(output).toContain('cgstack uninstalled');

      // Global skill dir should be removed
      expect(fs.existsSync(path.join(mockHome, '.codex', 'skills', 'cgstack'))).toBe(false);

      // Per-skill symlinks pointing into cgstack/ should be removed
      expect(fs.existsSync(path.join(mockHome, '.codex', 'skills', 'review'))).toBe(false);
      expect(fs.existsSync(path.join(mockHome, '.codex', 'skills', 'cgstack-ship'))).toBe(false);

      // Non-cgstack tool should still exist
      expect(fs.existsSync(path.join(mockHome, '.codex', 'skills', 'other-tool'))).toBe(true);

      // State should be removed
      expect(fs.existsSync(path.join(mockHome, '.cgstack'))).toBe(false);
    });

    test('--keep-state preserves state directory', () => {
      const result = spawnSync('bash', [UNINSTALL, '--force', '--keep-state'], {
        stdio: 'pipe',
        env: {
          ...process.env,
          HOME: mockHome,
          CGSTACK_DIR: path.join(mockHome, '.codex', 'skills', 'cgstack'),
          CGSTACK_STATE_DIR: path.join(mockHome, '.cgstack'),
        },
        cwd: mockGitRoot,
      });

      expect(result.status).toBe(0);

      // Skills should be removed
      expect(fs.existsSync(path.join(mockHome, '.codex', 'skills', 'cgstack'))).toBe(false);

      // State should still exist
      expect(fs.existsSync(path.join(mockHome, '.cgstack'))).toBe(true);
      expect(fs.existsSync(path.join(mockHome, '.cgstack', 'config.json'))).toBe(true);
    });

    test('clean system outputs nothing to remove', () => {
      const cleanHome = path.join(tmpDir, 'clean-home');
      fs.mkdirSync(cleanHome, { recursive: true });

      const result = spawnSync('bash', [UNINSTALL, '--force'], {
        stdio: 'pipe',
        env: {
          ...process.env,
          HOME: cleanHome,
          CGSTACK_DIR: path.join(cleanHome, 'nonexistent'),
          CGSTACK_STATE_DIR: path.join(cleanHome, '.cgstack'),
        },
        cwd: mockGitRoot,
      });

      expect(result.status).toBe(0);
      expect(result.stdout.toString()).toContain('Nothing to remove');
    });

    test('upgrade path: prefixed install + uninstall cleans both old and new symlinks', () => {
      // Simulate the state after setup --no-prefix followed by setup (with prefix):
      // Both old unprefixed and new prefixed symlinks exist
      // (mockHome already has both 'review' and 'cgstack-ship' symlinks)

      const result = spawnSync('bash', [UNINSTALL, '--force'], {
        stdio: 'pipe',
        env: {
          ...process.env,
          HOME: mockHome,
          CGSTACK_DIR: path.join(mockHome, '.codex', 'skills', 'cgstack'),
          CGSTACK_STATE_DIR: path.join(mockHome, '.cgstack'),
        },
        cwd: mockGitRoot,
      });

      expect(result.status).toBe(0);

      // Both old (review) and new (cgstack-ship) symlinks should be gone
      expect(fs.existsSync(path.join(mockHome, '.codex', 'skills', 'review'))).toBe(false);
      expect(fs.existsSync(path.join(mockHome, '.codex', 'skills', 'cgstack-ship'))).toBe(false);

      // Non-cgstack should survive
      expect(fs.existsSync(path.join(mockHome, '.codex', 'skills', 'other-tool'))).toBe(true);
    });
  });
});
