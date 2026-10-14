import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { it, expect } from 'vitest';
it('limits acceptance diagnostics to redacted errors without generated credentials or opaque values', () => {
  const directory = mkdtempSync(join(tmpdir(), 'flare-diagnostics-'));
  try {
    const secret = randomBytes(32).toString('hex'),
      token = randomBytes(32).toString('base64url');
    const env = join(directory, '.env');
    writeFileSync(env, `JWT_SECRET=${secret}\n`, { mode: 0o600 });
    const output = execFileSync(process.execPath, ['scripts/acceptance/diagnostics.mjs', env], {
      encoding: 'utf8',
      input: `Routine informational message\nError: ${secret}\nError: authorization Bearer ${token}\nError: opaque value ${token}\nError: ENOENT /opt/relay.crt\n`,
    });
    expect(output).not.toContain(secret);
    expect(output).not.toContain(token);
    expect(output).not.toContain('Routine informational');
    expect(output).toContain('ENOENT /opt/relay.crt');
    expect(output).toContain('[redacted]');
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

it('prints only allowlisted restore failure fields and rejects malformed or untrusted markers', () => {
  const directory = mkdtempSync(join(tmpdir(), 'flare-restore-diagnostics-'));
  const marker = join(directory, 'failure.json');
  const secret = randomBytes(32).toString('hex');
  const print = () => {
    const result = spawnSync(
      process.execPath,
      ['scripts/acceptance/restore-diagnostics.mjs', '--print', marker],
      { encoding: 'utf8' },
    );
    expect(result.status).toBe(0);
    expect(result.stdout).toBe('');
    return result.stderr;
  };
  try {
    writeFileSync(
      marker,
      JSON.stringify({
        mode: 'verify',
        phase: 'tenant-isolation',
        code: 'assertion-failed',
        message: secret,
        sql: `select '${secret}'`,
      }),
    );
    expect(print()).toBe('Restore verifier: verify/tenant-isolation: assertion-failed.\n');
    for (const input of [
      { mode: secret, phase: 'tenant-isolation', code: 'assertion-failed' },
      { mode: 'verify', phase: secret, code: 'assertion-failed' },
      { mode: 'verify', phase: 'tenant-isolation', code: secret },
      null,
    ]) {
      writeFileSync(marker, JSON.stringify(input));
      expect(print()).toBe('');
    }
    writeFileSync(marker, secret);
    expect(print()).toBe('');
    rmSync(marker);
    expect(print()).toBe('');
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
