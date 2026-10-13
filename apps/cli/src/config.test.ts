import { it, expect } from 'vitest';
import { mkdtemp, writeFile, chmod, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { readConfig, saveConfig, safeOutput } from './config.js';
it('requires private owned config files, refuses symlinks, saves with mode 0600 and redacts output', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'flare-config-'));
  const old = { ...process.env };
  try {
    const key = `fl_${randomBytes(32).toString('base64url')}`;
    process.env.FLARE_CONFIG = join(dir, 'config.json');
    process.env.FLARE_API_KEY = key;
    process.env.FLARE_ENVIRONMENT_ID = '00000000-0000-4000-8000-000000000001';
    process.env.FLARE_API_URL = 'https://flare.test';
    const result = await saveConfig();
    expect(result.apiKey).toBe('[REDACTED]');
    expect((await readConfig()).apiKey).toBe(key);
    await chmod(process.env.FLARE_CONFIG, 0o644);
    await expect(readConfig()).rejects.toThrow('0600');
    await rm(process.env.FLARE_CONFIG);
    const target = join(dir, 'target');
    await writeFile(target, '{}', { mode: 0o600 });
    await symlink(target, process.env.FLARE_CONFIG);
    await expect(readConfig()).rejects.toThrow();
    expect(
      safeOutput({ token: key, nested: { password: 'password', message: key } }, [key]),
    ).not.toContain(key);
  } finally {
    process.env = old;
    await rm(dir, { recursive: true, force: true });
  }
});
