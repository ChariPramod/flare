import { describe, expect, it } from 'vitest';
import {
  loadConfig,
  percentile,
  remember,
  assertExactReceipts,
} from '../../scripts/acceptance/sustained-load-helpers.mjs';

describe('sustained acceptance evidence', () => {
  it('bounds workload duration, latency, and memory overrides before starting', () => {
    expect(loadConfig({}).seconds).toBe(180);
    expect(loadConfig({ ACCEPTANCE_SOAK_SECONDS: '600' }).seconds).toBe(600);
    for (const value of ['119', '1801', 'NaN', '1e20', '180.1', ''])
      expect(() => loadConfig({ ACCEPTANCE_SOAK_SECONDS: value })).toThrow();
    expect(() => loadConfig({ ACCEPTANCE_MEMORY_MAX_BYTES: '-1' })).toThrow();
    expect(() => loadConfig({ ACCEPTANCE_SOAK_P95_MS: 'Infinity' })).toThrow();
  });
  it('uses nearest-rank latency percentiles without mutating admission samples', () => {
    const input = [100, 10, 30, 20];
    expect(percentile(input, 0.5)).toBe(20);
    expect(percentile(input, 0.95)).toBe(100);
    expect(input).toEqual([100, 10, 30, 20]);
    expect(() => percentile([], 0.95)).toThrow();
  });
  it('retains logical identity across concurrent retries and rejects conflicting acknowledgments', () => {
    const operations = new Map();
    remember(operations, 'one', 'id-1');
    remember(operations, 'one', 'id-1');
    expect(operations.size).toBe(1);
    expect(() => remember(operations, 'one', 'id-2')).toThrow('second identity');
    expect(() => remember(operations, 'two', undefined)).toThrow();
  });
  it('detects SMTP loss and duplicate receipts independently of provider-attempt rows', () => {
    const messages = [{ Subject: 'a' }, { Subject: 'b' }, { Subject: 'unrelated' }];
    expect(() => assertExactReceipts(['a', 'b'], messages)).not.toThrow();
    expect(() => assertExactReceipts(['a', 'b', 'lost'], messages)).toThrow('missing');
    expect(() => assertExactReceipts(['a', 'b'], [...messages, { Subject: 'a' }])).toThrow(
      'duplicate',
    );
    expect(() => assertExactReceipts(['a', 'a'], messages)).toThrow('unique');
  });
});

import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

it('rejects non-disposable targets and invalid configuration before a worker can be stopped', () => {
  const root = mkdtempSync(join(tmpdir(), 'flare-acceptance-soak-test-'));
  const fakeBin = join(root, 'bin');
  mkdirSync(fakeBin);
  const log = join(root, 'docker-touched');
  writeFileSync(join(fakeBin, 'docker'), `#!/bin/sh\ntouch '${log}'\nexit 1\n`, { mode: 0o700 });
  try {
    writeFileSync(join(root, '.env'), 'FLARE_ACCEPTANCE=false\n');
    const run = (path: string, project: string, seconds = '180') =>
      spawnSync('/bin/bash', ['scripts/acceptance/sustained-load.sh', path, project], {
        env: {
          ...process.env,
          PATH: `${fakeBin}:${process.env.PATH}`,
          ACCEPTANCE_SOAK_SECONDS: seconds,
        },
        encoding: 'utf8',
      });
    expect(run('/tmp/staging', 'flare-acceptance-1-2').status).not.toBe(0);
    expect(run(root, 'staging').status).not.toBe(0);
    expect(run(root, 'flare-acceptance-1-2').status).not.toBe(0);
    writeFileSync(join(root, '.env'), 'FLARE_ACCEPTANCE=true\n');
    expect(run(root, 'flare-acceptance-1-2', '0').status).not.toBe(0);
    expect(existsSync(log)).toBe(false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
