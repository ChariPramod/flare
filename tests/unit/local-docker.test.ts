import { describe, expect, it, vi } from 'vitest';
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  cpSync,
  existsSync,
  symlinkSync,
  rmSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { inspectLocalDocker } from '../../scripts/local-docker.mjs';
import { integrationTargets } from '../../apps/worker/tests/targets.mjs';

describe('disposable Docker target boundaries', () => {
  const run = (args: string[]) => {
    if (args[0] === 'context') return 'unix:///var/run/docker.sock\n';
    if (args[0] === 'info') return JSON.stringify({ OSType: 'linux' });
    return '2.40.0';
  };
  it('checks a local Linux engine and the Compose plugin without creating resources', () => {
    const execute = vi.fn(run);
    expect(inspectLocalDocker({}, execute)).toEqual({ ok: true, code: 'local-docker-ready' });
    expect(execute.mock.calls.map(([args]) => args[0])).toEqual(['context', 'info', 'compose']);
  });
  it('refuses remote and TCP Docker targets before contacting the daemon', () => {
    for (const endpoint of ['ssh://operator@staging', 'tcp://localhost:2375', 'tcp://host:2376']) {
      const execute = vi.fn(run);
      expect(inspectLocalDocker({ DOCKER_HOST: endpoint }, execute).ok).toBe(false);
      expect(execute).not.toHaveBeenCalled();
    }
    const execute = vi.fn(() => 'ssh://operator@staging');
    expect(inspectLocalDocker({}, execute).code).toBe('local-docker-required');
    expect(execute).toHaveBeenCalledTimes(1);
  });
  it('honors explicit context precedence and refuses unavailable or non-Linux engines', () => {
    expect(
      inspectLocalDocker({ DOCKER_HOST: 'ssh://unused', DOCKER_CONTEXT: 'desktop-linux' }, run).ok,
    ).toBe(true);
    expect(
      inspectLocalDocker({}, () => {
        throw new Error('sensitive failure');
      }),
    ).toEqual({ ok: false, code: 'docker-unavailable' });
    expect(
      inspectLocalDocker({ DOCKER_HOST: 'unix:///socket' }, () => '{"OSType":"windows"}').code,
    ).toBe('linux-containers-required');
  });
  it('rejects inherited remote stores and alternate namespaces before destructive tests connect', () => {
    const targets = integrationTargets({});
    expect(
      integrationTargets({
        TEST_DATABASE_URL: targets.databaseUrl,
        TEST_REDIS_URL: targets.redisUrl,
      }),
    ).toEqual(targets);
    for (const env of [
      { TEST_DATABASE_URL: 'postgres://secret@staging/flare_test' },
      { TEST_DATABASE_URL: `${targets.databaseUrl}?host=staging` },
      { TEST_REDIS_URL: 'redis://staging/15' },
      { TEST_REDIS_URL: 'redis://127.0.0.1:16379/0' },
      { TEST_DATABASE_URL: '' },
    ])
      expect(() => integrationTargets(env)).toThrow('exact disposable loopback endpoints');
  });
});

function exerciseIntegration(upFails: boolean, remote = false) {
  const root = mkdtempSync(join(tmpdir(), 'flare-docker-harness-'));
  try {
    for (const folder of ['scripts', 'apps/worker/tests', 'bin'])
      mkdirSync(join(root, folder), { recursive: true });
    for (const file of [
      'scripts/integration.sh',
      'scripts/local-docker.mjs',
      'apps/worker/tests/targets.mjs',
    ])
      cpSync(file, join(root, file));
    const log = join(root, 'calls.jsonl');
    symlinkSync(process.execPath, join(root, 'bin/node'));
    writeFileSync(
      join(root, 'bin/docker'),
      `#!${process.execPath}
const fs = require('node:fs');
const args = process.argv.slice(2);
fs.appendFileSync(process.env.FIXTURE_LOG, JSON.stringify(['docker', ...args]) + '\\n');
if (args[0] === 'context') console.log('unix:///fixture.sock');
if (args[0] === 'info') console.log('{"OSType":"linux"}');
if (args.includes('up') && process.env.FIXTURE_UP_FAILS === 'true') process.exitCode = 17;
`,
      { mode: 0o700 },
    );
    writeFileSync(
      join(root, 'bin/pnpm'),
      `#!${process.execPath}
require('node:fs').appendFileSync(process.env.FIXTURE_LOG, JSON.stringify(['pnpm', ...process.argv.slice(2)]) + '\\n');
`,
      { mode: 0o700 },
    );
    const env = { ...process.env };
    for (const key of ['DOCKER_HOST', 'DOCKER_CONTEXT', 'TEST_DATABASE_URL', 'TEST_REDIS_URL'])
      delete env[key];
    const result = spawnSync('bash', ['scripts/integration.sh'], {
      cwd: root,
      env: {
        ...env,
        PATH: `${join(root, 'bin')}:${process.env.PATH}`,
        FIXTURE_LOG: log,
        FIXTURE_UP_FAILS: String(upFails),
        COMPOSE_PROJECT_NAME: 'important-existing-stack',
        ...(remote ? { DOCKER_HOST: 'ssh://staging' } : {}),
      },
      encoding: 'utf8',
      timeout: 10000,
    });
    const calls: string[][] = !existsSync(log)
      ? []
      : readFileSync(log, 'utf8')
          .trim()
          .split('\n')
          .map((line) => JSON.parse(line));
    return { status: result.status, calls, output: result.stdout + result.stderr };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

describe('integration launcher cleanup ownership', () => {
  it('runs and cleans up a unique explicit project instead of adopting a preexisting stack', () => {
    const result = exerciseIntegration(false);
    expect(result.status).toBe(0);
    const mutations = result.calls.filter((call) => call.includes('--project-name'));
    expect(mutations).toHaveLength(3);
    const projects = mutations.map((call) => call[call.indexOf('--project-name') + 1]);
    expect(new Set(projects).size).toBe(1);
    expect(projects[0]).toMatch(/^flare-integration-\d+-\d+-\d+$/);
    expect(JSON.stringify(result.calls)).not.toContain('important-existing-stack');
    expect(mutations.every((call) => call.includes('/dev/null'))).toBe(true);
    expect(result.calls).toContainEqual(['pnpm', 'test:integration']);
  });
  it('on port/startup failure cleans up only its own project and never runs destructive tests', () => {
    const result = exerciseIntegration(true);
    expect(result.status).toBe(17);
    expect(result.calls.some((call) => call[0] === 'pnpm')).toBe(false);
    const mutations = result.calls.filter((call) => call.includes('--project-name'));
    expect(mutations).toHaveLength(2);
    expect(mutations[1]).toContain('down');
    expect(mutations[0]![3]).toBe(mutations[1]![3]);
  });
  it('refuses a remote context before registering cleanup or invoking Docker mutations', () => {
    const result = exerciseIntegration(false, true);
    expect(result.status).toBe(1);
    expect(result.output).toContain('local-docker-required');
    expect(result.calls).toEqual([]);
  });
});
