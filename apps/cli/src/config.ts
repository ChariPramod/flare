import { constants } from 'node:fs';
import { open, mkdir, rename, unlink } from 'node:fs/promises';
import { join, dirname, resolve } from 'node:path';
import { homedir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { FlareClient, FlareError } from '@pareto-labs/flare-sdk';
import type { ClientOptions } from '@pareto-labs/flare-sdk';
export const configPath = () =>
  resolve(process.env.FLARE_CONFIG ?? join(homedir(), '.config', 'flare', 'config.json'));
export async function readConfig(): Promise<ClientOptions> {
  let saved: Partial<ClientOptions> = {};
  try {
    const file = await open(configPath(), constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      const stat = await file.stat();
      if (
        !stat.isFile() ||
        (stat.mode & 0o077) !== 0 ||
        (process.getuid && stat.uid !== process.getuid()) ||
        stat.size > 65536
      )
        throw new Error(
          'Flare config must be an owned regular file with mode 0600 and at most 64 KiB',
        );
      saved = JSON.parse(await file.readFile('utf8'));
    } finally {
      await file.close();
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  const options = {
    baseUrl: process.env.FLARE_API_URL ?? saved.baseUrl ?? 'http://localhost:4000',
    apiKey: process.env.FLARE_API_KEY ?? saved.apiKey ?? '',
    environmentId: process.env.FLARE_ENVIRONMENT_ID ?? saved.environmentId ?? '',
    orgId: process.env.FLARE_ORG_ID ?? saved.orgId,
  };
  new FlareClient(options);
  return options;
}
export async function saveConfig() {
  const options = await readConfig(),
    path = configPath();
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const temporary = `${path}.${randomUUID()}.tmp`;
  const file = await open(
    temporary,
    constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL,
    0o600,
  );
  try {
    await file.writeFile(JSON.stringify(options, null, 2) + '\n');
    await file.sync();
  } finally {
    await file.close();
  }
  try {
    await rename(temporary, path);
  } catch (error) {
    await unlink(temporary);
    throw error;
  }
  return {
    path,
    baseUrl: options.baseUrl,
    environmentId: options.environmentId,
    apiKey: '[REDACTED]',
  };
}
export function safeOutput(value: unknown, secrets: string[] = []): string {
  const seen = new WeakSet<object>();
  return (
    JSON.stringify(
      value,
      (key, item: unknown) => {
        if (/password|secret|token|credential|api.?key|authorization|cookie|cipher/i.test(key))
          return '[REDACTED]';
        if (typeof item === 'string') {
          let text = item;
          for (const secret of secrets) if (secret) text = text.split(secret).join('[REDACTED]');
          return text.replace(/\b(?:fl_|whsec_)[A-Za-z0-9_+/=-]{12,}/g, '[REDACTED]');
        }
        if (item && typeof item === 'object') {
          if (seen.has(item)) return '[CIRCULAR]';
          seen.add(item);
        }
        return item;
      },
      2,
    ) ?? 'null'
  );
}
export function publicError(error: unknown) {
  return error instanceof FlareError
    ? {
        error: error.message,
        status: error.status,
        requestId: error.requestId,
        retryAfter: error.retryAfter,
      }
    : { error: error instanceof Error ? error.message : 'Operation failed' };
}
