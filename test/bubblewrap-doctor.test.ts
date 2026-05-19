import { describe, test, expect, afterEach } from 'bun:test';
import { spawnSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const ROOT = path.resolve(import.meta.dir, '..');
const DOCTOR = path.join(ROOT, 'bin', 'cgstack-bubblewrap-doctor');

const tmpDirs: string[] = [];

function mkTmpDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cgstack-bwrap-doctor-test-'));
  tmpDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tmpDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe('cgstack-bubblewrap-doctor', () => {
  test('--help prints usage', () => {
    const result = spawnSync(DOCTOR, ['--help'], { encoding: 'utf-8' });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Usage: cgstack-bubblewrap-doctor');
    expect(result.stdout).toContain('CGSTACK_BWRAP_BIN');
  });

  const linuxTest = os.platform() === 'linux' ? test : test.skip;

  linuxTest('prints actionable diagnostics when bwrap fails', () => {
    const tmpDir = mkTmpDir();
    const fakeBwrap = path.join(tmpDir, 'bwrap');
    fs.writeFileSync(fakeBwrap, '#!/usr/bin/env bash\necho "fake bwrap failure" >&2\nexit 42\n');
    fs.chmodSync(fakeBwrap, 0o755);

    const result = spawnSync(DOCTOR, [], {
      encoding: 'utf-8',
      env: { ...process.env, CGSTACK_BWRAP_BIN: fakeBwrap },
    });
    const combined = `${result.stdout}\n${result.stderr}`;

    expect(result.status).toBe(1);
    expect(combined).toContain('cgstack bubblewrap preflight: failed');
    expect(combined).toContain("bwrap --unshare-user --unshare-net --dev-bind / / sh -c 'true'");
    expect(combined).toContain('fake bwrap failure');
    expect(combined).toContain('kernel.apparmor_restrict_unprivileged_userns=');
    expect(combined).toContain('kernel.unprivileged_userns_clone=');
    expect(combined).toContain('user.max_user_namespaces=');
  });
});
