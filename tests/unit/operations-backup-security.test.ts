import { afterEach, describe, expect, it } from 'vitest';
import { createHash, randomBytes } from 'node:crypto';
import { mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { inspectSource, restore } from '../../scripts/operations/backup.mjs';
import { encryptFile, validateTar } from '../../scripts/operations/backup-crypto.mjs';

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

const stores = {
  postgres: 'postgres:17.7-alpine',
  redis: 'redis:7.4.7-alpine',
  minio: 'flare-minio:RELEASE.2025-10-15T17-29-55Z',
  'postal-mariadb': 'mariadb:11.4.9',
  'novu-mongodb': 'mongo:8.0.17',
  'novu-redis': 'redis:7.4.7-alpine',
};
const volumes = [
  'postgres-data',
  'redis-data',
  'minio-data',
  'postal-data',
  'novu-mongo-data',
  'novu-redis-data',
  'postal-config-data',
];

function archiveMember(name: string, type = '0') {
  const header = Buffer.alloc(512);
  header.write(name, 0, 100);
  header.write('0000600\0', 100);
  header.write('0000000\0', 108);
  header.write('0000000\0', 116);
  header.write('00000000000\0', 124);
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
  return Buffer.concat([header, Buffer.alloc(1024)]);
}

type Image = { id: string; reference: string; os: string; architecture: string };
type Manifest = {
  version: number;
  id: string;
  createdAt: string;
  source: { project: string; profile: string; root: string };
  stores: Record<string, { image: Image; environment: Record<string, string> }>;
  helper: Image;
  artifacts: { name: string; kind: string; size: number; sha256: string }[];
};
type Mutation = (data: {
  manifest: Manifest;
  privateFiles: Record<string, string>;
  bodies: Record<string, Buffer>;
}) => void;
async function signedFixture(mutate: Mutation) {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'flare-backup-security-')));
  roots.push(root);
  const key = randomBytes(32),
    keyFile = join(root, 'key'),
    archive = join(root, 'archive');
  await writeFile(keyFile, key, { mode: 0o600 });
  await mkdir(archive, { mode: 0o700 });
  await mkdir(join(archive, 'artifacts'), { mode: 0o700 });
  const privateFiles = Object.fromEntries(
    [
      '.env',
      'docker-compose.yml',
      'ops/certs/postal-public.pem',
      'ops/postal/config/postal.yml',
      'ops/postal/config/signing.key',
    ].map((path) => [path, Buffer.from('private fixture').toString('base64')]),
  );
  const image = (reference: string) => ({
    id: `sha256:${createHash('sha256').update(reference).digest('hex')}`,
    reference,
    os: 'linux',
    architecture: 'arm64',
  });
  const manifest: Manifest = {
    version: 1,
    id: randomBytes(16).toString('hex'),
    createdAt: new Date().toISOString(),
    source: { project: 'flare-original', profile: 'local', root: '/fixture/original' },
    stores: Object.fromEntries(
      Object.entries(stores).map(([name, reference]) => [
        name,
        { image: image(reference), environment: {} },
      ]),
    ),
    helper: image(stores.postgres),
    artifacts: [],
  };
  const bodies: Record<string, Buffer> = Object.fromEntries(
    volumes.map((name) => [name, Buffer.alloc(1024)]),
  );
  mutate({ manifest, privateFiles, bodies });
  bodies['private-config'] = Buffer.from(JSON.stringify(privateFiles));
  for (const [name, body] of Object.entries(bodies)) {
    const path = join(root, `${name}.plain`);
    await writeFile(path, body, { mode: 0o600 });
    manifest.artifacts.push({
      name,
      kind: name === 'private-config' ? 'configuration' : 'volume',
      ...(await encryptFile(path, join(archive, 'artifacts', `${name}.enc`), key, name)),
    });
    await rm(path);
  }
  const manifestPath = join(root, 'manifest.plain');
  await writeFile(manifestPath, JSON.stringify(manifest), { mode: 0o600 });
  await encryptFile(manifestPath, join(archive, 'manifest.enc'), key, 'manifest');
  await rm(manifestPath);
  const calls: string[][] = [];
  const runner = {
    async run(args: string[]) {
      calls.push(args);
      throw new Error('Unexpected Docker access');
    },
  };
  return {
    root,
    calls,
    runner,
    options: {
      archive,
      keyFile,
      targetRoot: join(root, 'restored'),
      targetProject: 'flare-security-target',
      isolated: true,
    },
  };
}

describe('independent authenticated backup input review', () => {
  it.each([
    [
      ['./same', '0'],
      ['same', '0'],
    ],
    [
      ['./same/', '5'],
      ['same', '0'],
    ],
    [
      ['parent', '0'],
      ['parent/child', '0'],
    ],
    [
      ['parent/child', '0'],
      ['parent', '0'],
    ],
  ])('refuses duplicate or conflicting archive members %j', async (...members) => {
    const root = await realpath(await mkdtemp(join(tmpdir(), 'flare-backup-security-')));
    roots.push(root);
    const archive = join(root, 'conflict.tar');
    await writeFile(
      archive,
      Buffer.concat([
        ...members.map(([name, type]) => archiveMember(name, type).subarray(0, 512)),
        Buffer.alloc(1024),
      ]),
    );
    await expect(validateTar(archive)).rejects.toThrow(/duplicate|conflict/i);
  });

  it('refuses private configuration reached through an ancestor symlink before Docker access', async () => {
    const root = await realpath(await mkdtemp(join(tmpdir(), 'flare-backup-security-')));
    roots.push(root);
    const deployment = join(root, 'deployment'),
      outside = join(root, 'outside');
    await mkdir(deployment);
    await mkdir(join(outside, 'certs'), { recursive: true });
    await mkdir(join(outside, 'postal/config'), { recursive: true });
    await writeFile(join(deployment, '.env'), 'fixture');
    await writeFile(join(deployment, 'docker-compose.yml'), 'fixture');
    for (const path of [
      'certs/postal-public.pem',
      'postal/config/postal.yml',
      'postal/config/signing.key',
    ])
      await writeFile(join(outside, path), 'private fixture');
    await symlink(outside, join(deployment, 'ops'));
    const calls: string[][] = [];
    const runner = {
      async run(args: string[]) {
        calls.push(args);
        throw new Error('Unexpected Docker access');
      },
    };
    await expect(
      inspectSource(
        { root: deployment, project: 'flare-security-source', profile: 'local' },
        runner,
      ),
    ).rejects.toThrow(/symbolic|canonical/i);
    expect(calls).toHaveLength(0);
  });

  it.each([
    'ops/certs/../../outside',
    'ops/postal/config/../../../outside',
    '/absolute',
    'ops/certs/nested\\escape',
    'ops/certs/line\nbreak',
  ])('refuses authenticated private path %j before touching Docker', async (path) => {
    const fixture = await signedFixture(({ privateFiles }) => {
      privateFiles[path] = Buffer.from('unsafe').toString('base64');
    });
    await expect(restore(fixture.options, fixture.runner)).rejects.toThrow(
      'Unsafe private configuration',
    );
    expect(fixture.calls).toHaveLength(0);
    await expect(readFile(fixture.options.targetRoot)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it.each(['../outside', '/absolute'])(
    'refuses authenticated volume traversal %j before touching Docker',
    async (path) => {
      const fixture = await signedFixture(({ bodies }) => {
        bodies['postgres-data'] = archiveMember(path);
      });
      await expect(restore(fixture.options, fixture.runner)).rejects.toThrow('Unsafe archive');
      expect(fixture.calls).toHaveLength(0);
    },
  );

  it.each(['1', '2', '3', '4', '6'])(
    'refuses authenticated link/device type %s before touching Docker',
    async (type) => {
      const fixture = await signedFixture(({ bodies }) => {
        bodies['postgres-data'] = archiveMember('entry', type);
      });
      await expect(restore(fixture.options, fixture.runner)).rejects.toThrow('forbidden');
      expect(fixture.calls).toHaveLength(0);
    },
  );

  it('refuses a different authenticated helper identity before touching Docker', async () => {
    const fixture = await signedFixture(({ manifest }) => {
      manifest.helper.id = `sha256:${'0'.repeat(64)}`;
    });
    await expect(restore(fixture.options, fixture.runner)).rejects.toThrow(
      'Unreviewed backup helper',
    );
    expect(fixture.calls).toHaveLength(0);
  });

  it('refuses authenticated environment injection before touching Docker', async () => {
    const fixture = await signedFixture(({ manifest }) => {
      manifest.stores.postgres.environment.POSTGRES_PASSWORD = 'value\nINJECTED=value';
    });
    await expect(restore(fixture.options, fixture.runner)).rejects.toThrow(
      'Unsupported store environment',
    );
    expect(fixture.calls).toHaveLength(0);
  });
});
