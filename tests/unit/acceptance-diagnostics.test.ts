import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
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
