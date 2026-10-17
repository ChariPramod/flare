import { afterEach, describe, expect, it } from 'vitest';
import {
  chmod,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash, randomBytes } from 'node:crypto';
import {
  backup,
  restore,
  main,
  isolatedCompose,
  createRunner,
} from '../../scripts/operations/backup.mjs';
import {
  decryptFile,
  encryptFile,
  readKey,
  validateTar,
} from '../../scripts/operations/backup-crypto.mjs';

type RunOptions = { input?: string; output?: string; cleanup?: boolean };
type Container = {
  Id: string;
  Image: string;
  Config: { Env: string[]; Labels: Record<string, string> };
  Mounts: { Type: string; Name?: string; Destination?: string; Source?: string; RW: boolean }[];
  State: { Running: boolean; ExitCode: number };
  HostConfig: { PortBindings: Record<string, unknown> };
  NetworkSettings: { Networks: Record<string, unknown> };
};
type FixtureConfig = {
  name: string;
  volumes: Record<string, { name: string }>;
  services: Record<
    string,
    {
      image?: string;
      environment: Record<string, string>;
      command?: string[];
      entrypoint?: string[];
    }
  >;
};
const dirs: string[] = [];
afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});
async function scratch() {
  const dir = await realpath(await mkdtemp(join(tmpdir(), 'flare-backup-test-')));
  dirs.push(dir);
  return dir;
}
function tarEntry(name: string, value = Buffer.from('fixture'), type = '0') {
  const header = Buffer.alloc(512);
  header.write(name, 0, 100);
  header.write('0000600\0', 100);
  header.write('0000000\0', 108);
  header.write('0000000\0', 116);
  header.write(value.length.toString(8).padStart(11, '0') + '\0', 124);
  header.write('00000000000\0', 136);
  header.fill(32, 148, 156);
  header.write(type, 156);
  header.write('ustar\0', 257);
  header.write('00', 263);
  header.write(
    header
      .reduce((sum, byte) => sum + byte, 0)
      .toString(8)
      .padStart(6, '0') + '\0 ',
    148,
  );
  return Buffer.concat([header, value, Buffer.alloc((512 - (value.length % 512)) % 512)]);
}
const safeTar = () => Buffer.concat([tarEntry('./fixture'), Buffer.alloc(1024)]);
const digest = (value: string) => `sha256:${createHash('sha256').update(value).digest('hex')}`;
const definitions = {
  postgres: ['postgres-data', '/var/lib/postgresql/data', 'postgres:17.7-alpine'],
  redis: ['redis-data', '/data', 'redis:7.4.7-alpine'],
  minio: ['minio-data', '/data', 'flare-minio:RELEASE.2025-10-15T17-29-55Z'],
  'postal-mariadb': ['postal-data', '/var/lib/mysql', 'mariadb:11.4.9'],
  'novu-mongodb': ['novu-mongo-data', '/data/db', 'mongo:8.0.17'],
  'novu-redis': ['novu-redis-data', '/data', 'redis:7.4.7-alpine'],
};
async function fixture(profile = 'local') {
  const dir = await scratch(),
    root = join(dir, 'deployment'),
    project = 'flare-source';
  await mkdir(root);
  const privateFiles = [
    '.env',
    'docker-compose.yml',
    'ops/certs/postal-public.pem',
    'ops/certs/relay.key',
    'ops/postal/config/postal.yml',
    'ops/postal/config/signing.key',
    'packages/db/migrations/0001_fixture.sql',
    ...(profile.startsWith('staging')
      ? [
          'docker-compose.staging.yml',
          'ops/staging/Caddyfile',
          ...(profile === 'staging-inbound' ? ['ops/staging/postal-inbound.yml'] : []),
        ]
      : []),
  ];
  for (const path of privateFiles) {
    await mkdir(join(root, path, '..'), { recursive: true });
    await writeFile(join(root, path), 'fixture', { mode: 0o600 });
  }
  const keyFile = join(dir, 'key');
  await writeFile(keyFile, randomBytes(32), { mode: 0o600 });
  const options = {
    root,
    project,
    profile,
    keyFile,
    output: join(dir, 'encrypted'),
    maintenance: true,
  };
  const files = [
    join(root, 'docker-compose.yml'),
    ...(profile.startsWith('staging')
      ? [
          join(root, 'docker-compose.staging.yml'),
          ...(profile === 'staging-inbound' ? [join(root, 'ops/staging/postal-inbound.yml')] : []),
        ]
      : []),
  ];
  const logical = [
    ...Object.values(definitions).map(([name]) => name),
    'postal-config-data',
    ...(profile.startsWith('staging') ? ['staging-caddy-data', 'staging-caddy-config'] : []),
  ];
  const config: FixtureConfig = {
    name: project,
    volumes: Object.fromEntries(logical.map((name) => [name, { name: `${project}_${name}` }])),
    services: {},
  };
  const source: Container[] = [];
  const password = 'literal-$TOKEN-${VAR}-#-"quote"-\\slash';
  const environments: Record<string, Record<string, string>> = {
    postgres: { POSTGRES_PASSWORD: password, POSTGRES_USER: 'flare', POSTGRES_DB: 'flare' },
    redis: {},
    'novu-redis': {},
    minio: { MINIO_ROOT_USER: 'flare', MINIO_ROOT_PASSWORD: password },
    'postal-mariadb': { MARIADB_ROOT_PASSWORD: password, MARIADB_DATABASE: 'postal' },
    'novu-mongodb': { MONGO_INITDB_ROOT_USERNAME: 'root', MONGO_INITDB_ROOT_PASSWORD: password },
  };
  for (const [service, [name, target, image]] of Object.entries(definitions)) {
    const environment = environments[service];
    config.services[service] = {
      image,
      environment,
      ...(['redis', 'novu-redis'].includes(service)
        ? { command: ['redis-server', '--appendonly', 'yes', '--maxmemory-policy', 'noeviction'] }
        : {}),
      ...(service === 'minio'
        ? { command: ['server', '/data', '--console-address', ':9001'] }
        : {}),
    };
    source.push({
      Id: digest(service).slice(7),
      Image: digest(image),
      Config: {
        Env: Object.entries(environment).map(([key, value]) => `${key}=${value}`),
        Labels: {
          'com.docker.compose.project': project,
          'com.docker.compose.service': service,
          'com.docker.compose.project.working_dir': root,
          'com.docker.compose.project.config_files': files.join(','),
        },
      },
      Mounts: [{ Type: 'volume', Name: `${project}_${name}`, Destination: target, RW: true }],
      State: { Running: true, ExitCode: 0 },
      HostConfig: { PortBindings: {} },
      NetworkSettings: { Networks: { [`${project}_default`]: {} } },
    });
  }
  config.services['postal-config'] = { environment: {} };
  source.push({
    ...source[0],
    Id: digest('postal-config').slice(7),
    Config: {
      Env: [],
      Labels: { ...source[0].Config.Labels, 'com.docker.compose.service': 'postal-config' },
    },
    Mounts: logical
      .filter((name) => name.startsWith('postal-config') || name.startsWith('staging-'))
      .map((name) => ({ Type: 'volume', Name: `${project}_${name}`, RW: true })),
    State: { Running: false, ExitCode: 0 },
  });
  const calls: { args: string[]; options: RunOptions }[] = [],
    volumeLabels: Record<string, Record<string, string>> = {};
  let restored: Container[] = [],
    networkLabels: Record<string, string> = {},
    guard = false;
  const state = {
    failCopy: false,
    failStart: false,
    missingImage: false,
    foreign: false,
    existingTarget: false,
    remote: false,
    unsafeTar: false,
    concurrentVolume: false,
  };
  function labels(args: string[]) {
    return Object.fromEntries(
      args.flatMap((value, index) =>
        value === '--label' ? [args[index + 1].split(/=(.*)/s).slice(0, 2)] : [],
      ),
    );
  }
  const runner = {
    async run(args: string[], runOptions: RunOptions = {}) {
      calls.push({ args, options: runOptions });
      if (args[0] === 'context')
        return JSON.stringify([
          {
            Endpoints: {
              docker: { Host: state.remote ? 'tcp://remote:2376' : 'unix:///fixture/docker.sock' },
            },
          },
        ]);
      if (args[0] === 'info')
        return JSON.stringify({ ID: 'fixture-engine', OSType: 'linux', Architecture: 'aarch64' });
      if (args[0] === 'compose' && args.includes('config')) return JSON.stringify(config);
      if (args[0] === 'compose' && args.includes('stop')) {
        for (const container of source) container.State.Running = false;
        for (const container of restored) container.State.Running = false;
        return '';
      }
      if (args[0] === 'compose' && args.includes('up')) {
        if (state.failStart) throw new Error('fixture startup failed');
        const target = args[args.indexOf('--project-name') + 1];
        restored = source.slice(0, 6).map((container) => ({
          ...container,
          Id: digest(`restored-${container.Id}`).slice(7),
          Config: {
            ...container.Config,
            Labels: { ...container.Config.Labels, 'com.docker.compose.project': target },
          },
          NetworkSettings: { Networks: { [`${target}_isolated`]: {} } },
        }));
        return '';
      }
      if (args[0] === 'ps') {
        if (args.join(' ').includes('flare-target'))
          return (state.existingTarget ? [source[0]] : restored)
            .map((container) => container.Id)
            .join('\n');
        return source.map((container) => container.Id).join('\n');
      }
      if (args[0] === 'inspect')
        return JSON.stringify(
          [...source, ...restored].filter((container) => args.includes(container.Id)),
        );
      if (args[0] === 'image') {
        if (state.missingImage) throw new Error('missing image');
        return JSON.stringify([
          {
            Id: args[2].startsWith('sha256:') ? args[2] : digest(args[2]),
            Architecture: 'arm64',
            Os: 'linux',
          },
        ]);
      }
      if (args[0] === 'volume' && args[1] === 'ls')
        return args.includes('--filter')
          ? logical.map((name) => `${project}_${name}`).join('\n')
          : Object.keys(volumeLabels).join('\n');
      if (args[0] === 'volume' && args[1] === 'inspect')
        return JSON.stringify([
          {
            Driver: 'local',
            Options: {},
            Labels: volumeLabels[args[2]] ?? {
              'com.docker.compose.project': project,
              'com.docker.compose.volume': args[2].slice(project.length + 1),
            },
          },
        ]);
      if (args[0] === 'volume' && args[1] === 'create') {
        volumeLabels[args.at(-1)!] = state.concurrentVolume ? {} : labels(args);
        return args.at(-1)!;
      }
      if (args[0] === 'network' && args[1] === 'ls') return '';
      if (args[0] === 'network' && args[1] === 'create') {
        networkLabels = labels(args);
        return 'network';
      }
      if (args[0] === 'network' && args[1] === 'inspect')
        return JSON.stringify([{ Internal: true, Labels: networkLabels }]);
      if (args[0] === 'create') {
        if (guard) throw new Error('guard already exists');
        guard = true;
        return 'a'.repeat(64);
      }
      if (args[0] === 'rm') {
        if (args.includes('a'.repeat(64))) {
          expect(args).toEqual(['rm', '-v', 'a'.repeat(64)]);
          guard = false;
        }
        return '';
      }
      if (args[0] === 'run') {
        if (state.failCopy) throw new Error('fixture collection failed');
        if (runOptions.output)
          await writeFile(
            runOptions.output,
            state.unsafeTar
              ? Buffer.concat([tarEntry('../escape'), Buffer.alloc(1024)])
              : safeTar(),
            { mode: 0o600 },
          );
        return '';
      }
      throw new Error(`Unhandled fixture command: ${args.join(' ')}`);
    },
  };
  return {
    dir,
    root,
    options,
    keyFile,
    runner,
    calls,
    state,
    source,
    config,
    volumeLabels,
    target: {
      archive: options.output,
      keyFile,
      targetRoot: join(dir, 'restore'),
      targetProject: 'flare-target',
      isolated: true,
    },
  };
}
const mutating = (args: string[]) =>
  args[0] === 'run' ||
  args[0] === 'create' ||
  ['create', 'up', 'stop', 'rm'].some((value) => args.includes(value));

describe('deployment backup encryption and archive boundaries', () => {
  it('streams authenticated roundtrip, uses independent IVs and preserves owner-only files', async () => {
    const dir = await scratch(),
      key = randomBytes(32),
      input = join(dir, 'input');
    await writeFile(input, randomBytes(1024 * 1024 + 17));
    await encryptFile(input, join(dir, 'one'), key, 'one');
    await encryptFile(input, join(dir, 'two'), key, 'two');
    expect((await readFile(join(dir, 'one'))).subarray(8, 20)).not.toEqual(
      (await readFile(join(dir, 'two'))).subarray(8, 20),
    );
    await decryptFile(join(dir, 'one'), join(dir, 'plain'), key, 'one');
    // Native byte equality avoids enumerating a million Buffer entries in the matcher.
    expect((await readFile(join(dir, 'plain'))).equals(await readFile(input))).toBe(true);
    expect((await lstat(join(dir, 'plain'))).mode & 0o777).toBe(0o600);
  });
  it.each(['wrong-key', 'tamper', 'wrong-artifact'])(
    'rejects %s and removes unauthenticated plaintext',
    async (mode) => {
      const dir = await scratch(),
        key = randomBytes(32),
        input = join(dir, 'input'),
        encrypted = join(dir, 'encrypted'),
        plain = join(dir, 'plain');
      await writeFile(input, randomBytes(4096));
      await encryptFile(input, encrypted, key, 'volume');
      if (mode === 'tamper') {
        const bytes = await readFile(encrypted);
        bytes[30] ^= 1;
        await writeFile(encrypted, bytes);
      }
      await expect(
        decryptFile(
          encrypted,
          plain,
          mode === 'wrong-key' ? randomBytes(32) : key,
          mode === 'wrong-artifact' ? 'another' : 'volume',
        ),
      ).rejects.toMatchObject({ code: 'authentication-failed' });
      await expect(lstat(plain)).rejects.toMatchObject({ code: 'ENOENT' });
    },
  );
  it('never deletes pre-existing encrypt/decrypt destinations', async () => {
    const dir = await scratch(),
      key = randomBytes(32),
      input = join(dir, 'input'),
      encrypted = join(dir, 'encrypted'),
      existing = join(dir, 'existing');
    await writeFile(input, 'fixture');
    await writeFile(existing, 'preserve');
    await encryptFile(input, encrypted, key, 'fixture');
    await expect(encryptFile(input, existing, key, 'fixture')).rejects.toMatchObject({
      code: 'EEXIST',
    });
    await expect(decryptFile(encrypted, existing, key, 'fixture')).rejects.toMatchObject({
      code: 'EEXIST',
    });
    expect(await readFile(existing, 'utf8')).toBe('preserve');
  });
  it('requires an owner-only, nonsymlink, exact-length external key', async () => {
    const dir = await scratch(),
      key = join(dir, 'key');
    await writeFile(key, randomBytes(32), { mode: 0o600 });
    expect(await readKey(key)).toHaveLength(32);
    await chmod(key, 0o640);
    await expect(readKey(key)).rejects.toThrow('owner-only');
    await chmod(key, 0o600);
    await symlink(key, join(dir, 'alias'));
    await expect(readKey(join(dir, 'alias'))).rejects.toThrow('owner-only');
    await writeFile(key, 'short');
    await expect(readKey(key)).rejects.toThrow('32-byte');
  });
  it.each(['../escape', '/absolute', 'nested/../../escape', 'nested\\escape', 'nested\nfile'])(
    'rejects unsafe TAR path %j',
    async (name) => {
      const dir = await scratch(),
        path = join(dir, 'archive');
      await writeFile(path, Buffer.concat([tarEntry(name), Buffer.alloc(1024)]));
      await expect(validateTar(path)).rejects.toThrow();
    },
  );
  it.each(['1', '2', '3', '4', '6', 'x', 'g'])(
    'rejects TAR link/device/extension %s',
    async (type) => {
      const dir = await scratch(),
        path = join(dir, 'archive');
      await writeFile(
        path,
        Buffer.concat([tarEntry('./fixture', Buffer.alloc(0), type), Buffer.alloc(1024)]),
      );
      await expect(validateTar(path)).rejects.toThrow();
    },
  );
  it('rejects empty GNU long-name override and truncated archive', async () => {
    const dir = await scratch(),
      path = join(dir, 'archive');
    await writeFile(
      path,
      Buffer.concat([
        tarEntry('././@LongLink', Buffer.from('\0'), 'L'),
        tarEntry('../escape'),
        Buffer.alloc(1024),
      ]),
    );
    await expect(validateTar(path)).rejects.toThrow('Empty long');
    await writeFile(path, safeTar().subarray(0, 700));
    await expect(validateTar(path)).rejects.toThrow('Truncated');
  });
});

describe('deployment backup and isolated restore orchestration', () => {
  it('read-only plan has no Docker or filesystem mutations', async () => {
    const f = await fixture();
    const before = await readdir(f.dir);
    expect(
      await main(
        ['plan', '--root', f.root, '--project', f.options.project, '--profile', 'local'],
        f.runner,
      ),
    ).toMatchObject({ status: 'plan', volumeCount: 7 });
    expect(f.calls.some(({ args }) => mutating(args))).toBe(false);
    expect(await readdir(f.dir)).toEqual(before);
  });
  it.each([
    'remote',
    'wrong-root-label',
    'unknown-volume',
    'foreign-writer',
    'env-drift',
    'writable-bind',
    'missing-store',
  ])('rejects %s before stopping or writing output', async (failure) => {
    const f = await fixture();
    if (failure === 'remote') f.state.remote = true;
    if (failure === 'wrong-root-label')
      f.source[0].Config.Labels['com.docker.compose.project.working_dir'] = '/another';
    if (failure === 'unknown-volume') f.config.volumes.unreviewed = { name: 'external' };
    if (failure === 'foreign-writer')
      f.source.push({
        ...f.source[0],
        Id: 'foreign',
        Config: { ...f.source[0].Config, Labels: { 'com.docker.compose.project': 'foreign' } },
      });
    if (failure === 'env-drift') f.source[0].Config.Env = ['PASSWORD=drift'];
    if (failure === 'writable-bind')
      f.source[0].Mounts.push({ Type: 'bind', Source: join(f.root, 'ops/certs'), RW: true });
    if (failure === 'missing-store') f.source.splice(0, 1);
    await expect(backup(f.options, f.runner)).rejects.toThrow();
    expect(f.calls.some(({ args }) => mutating(args))).toBe(false);
    await expect(lstat(f.options.output)).rejects.toMatchObject({ code: 'ENOENT' });
  });
  it('requires maintenance acknowledgment and refuses key inside deployment', async () => {
    const f = await fixture();
    await expect(backup({ ...f.options, maintenance: false }, f.runner)).rejects.toThrow(
      'maintenance',
    );
    const internal = join(f.root, 'key');
    await writeFile(internal, randomBytes(32), { mode: 0o600 });
    await expect(backup({ ...f.options, keyFile: internal }, f.runner)).rejects.toThrow(
      'separately',
    );
    expect(f.calls).toHaveLength(0);
  });
  it.each(['copy', 'unsafe-tar', 'unclean-shutdown'])(
    'keeps source stopped and removes plaintext/output on %s failure',
    async (failure) => {
      const f = await fixture();
      if (failure === 'copy') f.state.failCopy = true;
      if (failure === 'unsafe-tar') f.state.unsafeTar = true;
      if (failure === 'unclean-shutdown') f.source[0].State.ExitCode = 137;
      await expect(backup(f.options, f.runner)).rejects.toThrow();
      expect(f.source.every((container) => !container.State.Running)).toBe(true);
      expect(
        f.calls.some(
          ({ args }) => args.includes('up') || (args[0] === 'volume' && args[1] === 'rm'),
        ),
      ).toBe(false);
      await expect(lstat(f.options.output)).rejects.toMatchObject({ code: 'ENOENT' });
      await expect(lstat(join(f.root, '.flare-operations-maintenance'))).rejects.toMatchObject({
        code: 'ENOENT',
      });
    },
  );
  it.each(['local', 'staging', 'staging-inbound'])(
    'backs up all %s state and restores six exact-image isolated stores only',
    async (profile) => {
      const f = await fixture(profile);
      const result = await backup(f.options, f.runner);
      expect(result.artifacts).toBe(profile.startsWith('staging') ? 10 : 8);
      expect(f.source.every((container) => !container.State.Running)).toBe(true);
      expect((await lstat(f.options.output)).mode & 0o777).toBe(0o700);
      f.calls.splice(0);
      const restored = await restore(f.target, f.runner);
      expect(restored).toMatchObject({
        status: 'restored-isolated',
        sourceUntouched: true,
        deliveryServicesStarted: false,
      });
      expect(await readFile(join(restored.privateRoot, '.env'), 'utf8')).toBe('fixture');
      const compose = JSON.parse(await readFile(restored.composeFile, 'utf8'));
      expect(Object.keys(compose.services)).toHaveLength(6);
      expect(compose.networks.isolated.internal).toBe(true);
      for (const [name, service] of Object.entries(compose.services) as [
        string,
        {
          ports?: string[];
          image: string;
          environment: Record<string, string>;
        },
      ][]) {
        expect(service.ports).toBeUndefined();
        expect(service.image).toMatch(/^sha256:/);
        expect(service.environment).toEqual(
          Object.fromEntries(
            Object.entries(f.config.services[name].environment).map(([key, value]) => [
              key,
              value.replaceAll('$', () => '$$'),
            ]),
          ),
        );
      }
      expect(f.calls.some(({ args }) => args.includes('pull') && !args.includes('never'))).toBe(
        false,
      );
    },
  );
  it.each(['wrong-key', 'tamper', 'missing-artifact', 'unknown-artifact'])(
    'authenticates the complete bundle before any Docker action: %s',
    async (failure) => {
      const f = await fixture();
      await backup(f.options, f.runner);
      f.calls.splice(0);
      if (failure === 'wrong-key') await writeFile(f.keyFile, randomBytes(32));
      if (failure === 'tamper') {
        const path = join(f.options.output, 'artifacts/postgres-data.enc'),
          data = await readFile(path);
        data[40] ^= 1;
        await writeFile(path, data);
      }
      if (failure === 'missing-artifact')
        await rm(join(f.options.output, 'artifacts/postgres-data.enc'));
      if (failure === 'unknown-artifact')
        await writeFile(join(f.options.output, 'artifacts/unknown.enc'), 'unknown');
      await expect(restore(f.target, f.runner)).rejects.toThrow();
      expect(f.calls).toHaveLength(0);
      await expect(lstat(f.target.targetRoot)).rejects.toMatchObject({ code: 'ENOENT' });
    },
  );
  it.each(['missing-image', 'existing-target'])(
    'refuses %s before creating restore resources',
    async (failure) => {
      const f = await fixture();
      await backup(f.options, f.runner);
      f.calls.splice(0);
      if (failure === 'missing-image') f.state.missingImage = true;
      else f.state.existingTarget = true;
      await expect(restore(f.target, f.runner)).rejects.toThrow();
      expect(f.calls.some(({ args }) => mutating(args))).toBe(false);
      await expect(lstat(f.target.targetRoot)).rejects.toMatchObject({ code: 'ENOENT' });
    },
  );
  it('retains new target after startup failure and explicitly stops only its stores', async () => {
    const f = await fixture();
    await backup(f.options, f.runner);
    f.calls.splice(0);
    f.state.failStart = true;
    await expect(restore(f.target, f.runner)).rejects.toThrow('startup');
    expect((await lstat(f.target.targetRoot)).isDirectory()).toBe(true);
    expect(Object.keys(f.volumeLabels)).toHaveLength(7);
    expect(f.calls.filter(({ args }) => args.includes('stop'))).toHaveLength(1);
    expect(f.calls.some(({ args }) => args[0] === 'volume' && args[1] === 'rm')).toBe(false);
  });
  it('does not extract into concurrently claimed target volume', async () => {
    const f = await fixture();
    await backup(f.options, f.runner);
    f.calls.splice(0);
    f.state.concurrentVolume = true;
    await expect(restore(f.target, f.runner)).rejects.toThrow('concurrently claimed');
    expect(f.calls.some(({ options }) => options.input)).toBe(false);
  });
  it('serializes simultaneous restores to the same Docker project before any target reuse', async () => {
    const f = await fixture();
    await backup(f.options, f.runner);
    f.calls.splice(0);
    let enter!: () => void, release!: () => void;
    const entered = new Promise<void>((resolve) => {
      enter = resolve;
    });
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let first = true;
    const wrapped = {
      async run(args: string[], options: RunOptions = {}) {
        const result = await f.runner.run(args, options);
        if (args[0] === 'create' && first) {
          first = false;
          enter();
          await gate;
        }
        return result;
      },
    };
    const winner = restore(f.target, wrapped);
    await entered;
    await expect(
      restore({ ...f.target, targetRoot: join(f.dir, 'other-target') }, wrapped),
    ).rejects.toThrow('guard already exists');
    await expect(lstat(join(f.dir, 'other-target'))).rejects.toMatchObject({ code: 'ENOENT' });
    release();
    await expect(winner).resolves.toMatchObject({ status: 'restored-isolated' });
    expect(f.calls.filter(({ options }) => options.input)).toHaveLength(7);
  });
  it('latches interruption even when no subprocess is running', async () => {
    const runner = createRunner();
    runner.abort();
    expect(() => runner.assertActive()).toThrow('interrupted');
    await expect(runner.run(['info'])).rejects.toThrow('interrupted');
  });
  it('refuses a symlink ancestor of the staging Caddyfile before Docker access', async () => {
    const f = await fixture('staging');
    const external = join(f.dir, 'external');
    await mkdir(external);
    await writeFile(join(external, 'Caddyfile'), 'external fixture');
    await rm(join(f.root, 'ops/staging'), { recursive: true });
    await symlink(external, join(f.root, 'ops/staging'));
    await expect(backup(f.options, f.runner)).rejects.toThrow('canonical path');
    expect(f.calls).toEqual([]);
  });
  it.each(['environment', 'command', 'entrypoint'])(
    'refuses store %s that can relocate state before maintenance',
    async (change) => {
      const f = await fixture();
      if (change === 'environment') f.config.services.postgres.environment.PGDATA = '/outside';
      if (change === 'command') f.config.services.postgres.command = ['postgres', '-D', '/outside'];
      if (change === 'entrypoint') f.config.services.postgres.entrypoint = ['/bin/sh'];
      f.source[0].Config.Env = Object.entries(f.config.services.postgres.environment).map(
        ([key, value]) => `${key}=${value}`,
      );
      await expect(backup(f.options, f.runner)).rejects.toThrow('Unsupported store');
      expect(f.calls.some(({ args }) => args.includes('stop'))).toBe(false);
    },
  );
  it('removes the completed bundle when interrupted before the final success report', async () => {
    const f = await fixture();
    await expect(
      backup(f.options, {
        ...f.runner,
        assertActive() {
          throw new Error('Operation interrupted');
        },
      }),
    ).rejects.toThrow('interrupted');
    await expect(lstat(f.options.output)).rejects.toMatchObject({ code: 'ENOENT' });
    expect(f.source.every((container) => !container.State.Running)).toBe(true);
  });
  it('does not allow caller-provided restore processes or traffic networks', () => {
    const manifest = {
      source: { profile: 'local' },
      stores: Object.fromEntries(
        Object.keys(definitions).map((service) => [
          service,
          {
            image: { id: digest(service) },
            environment: {},
            command: ['postal', 'worker'],
            ports: ['25:25'],
          },
        ]),
      ),
    };
    const compose = isolatedCompose(manifest, 'flare-target');
    expect(Object.keys(compose.services)).toEqual(Object.keys(definitions));
    expect(JSON.stringify(compose)).not.toContain('postal","worker');
    expect(JSON.stringify(compose)).not.toContain('25:25');
  });
});
