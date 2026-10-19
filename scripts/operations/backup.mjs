#!/usr/bin/env node
import { createHash, randomBytes } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import {
  chmod,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { parseEnv } from 'node:util';
import { pipeline } from 'node:stream/promises';
import {
  decryptFile,
  encryptFile,
  readKey,
  validateTar,
  MAX_ARTIFACT_BYTES,
} from './backup-crypto.mjs';

const die = (message) => {
  throw new Error(message);
};
const STORES = {
  postgres: {
    volume: 'postgres-data',
    target: '/var/lib/postgresql/data',
    image: 'postgres:17.7-alpine',
  },
  redis: {
    volume: 'redis-data',
    target: '/data',
    image: 'redis:7.4.7-alpine',
    command: ['redis-server', '--appendonly', 'yes', '--maxmemory-policy', 'noeviction'],
  },
  minio: {
    volume: 'minio-data',
    target: '/data',
    image: 'flare-minio:RELEASE.2025-10-15T17-29-55Z',
    command: ['server', '/data', '--console-address', ':9001'],
  },
  'postal-mariadb': { volume: 'postal-data', target: '/var/lib/mysql', image: 'mariadb:11.4.9' },
  'novu-mongodb': { volume: 'novu-mongo-data', target: '/data/db', image: 'mongo:8.0.17' },
  'novu-redis': {
    volume: 'novu-redis-data',
    target: '/data',
    image: 'redis:7.4.7-alpine',
    command: ['redis-server', '--appendonly', 'yes', '--maxmemory-policy', 'noeviction'],
  },
};
const BASE_VOLUMES = [
  ...Object.values(STORES).map((item) => item.volume),
  'postal-config-data',
].sort();
const STORE_ENVIRONMENT = {
  postgres: ['POSTGRES_USER', 'POSTGRES_PASSWORD', 'POSTGRES_DB'],
  redis: [],
  minio: ['MINIO_ROOT_USER', 'MINIO_ROOT_PASSWORD'],
  'postal-mariadb': ['MARIADB_ROOT_PASSWORD', 'MARIADB_DATABASE'],
  'novu-mongodb': ['MONGO_INITDB_ROOT_USERNAME', 'MONGO_INITDB_ROOT_PASSWORD'],
  'novu-redis': [],
};
function validateStoreEnvironment(service, environment) {
  for (const [key, value] of Object.entries(environment))
    if (
      !STORE_ENVIRONMENT[service].includes(key) ||
      typeof value !== 'string' ||
      /[\r\n\0]/.test(value)
    )
      die('Unsupported store environment');
}
const PROFILES = {
  local: ['docker-compose.yml'],
  staging: ['docker-compose.yml', 'docker-compose.staging.yml'],
  acceptance: ['docker-compose.yml', 'docker-compose.acceptance.yml'],
  'staging-inbound': [
    'docker-compose.yml',
    'docker-compose.staging.yml',
    'ops/staging/postal-inbound.yml',
  ],
  'staging-split-web': [
    'docker-compose.yml',
    'docker-compose.staging.yml',
    'docker-compose.staging-split-web.yml',
  ],
  'staging-split-web-inbound': [
    'docker-compose.yml',
    'docker-compose.staging.yml',
    'docker-compose.staging-split-web.yml',
    'ops/staging/postal-inbound.yml',
  ],
};
const splitProfile = (profile) =>
  profile === 'staging-split-web' || profile === 'staging-split-web-inbound';
const profileAssets = (profile) => [
  ...(profile.startsWith('staging') ? ['ops/staging/Caddyfile'] : []),
  ...(splitProfile(profile) ? ['ops/staging/Caddyfile.split-web'] : []),
];
function splitConfiguration(files, profile) {
  if (!splitProfile(profile)) return;
  const environment = parseEnv(Buffer.from(files['.env'], 'base64').toString('utf8'));
  const key = environment.FLARE_DASHBOARD_PROXY_SECRET;
  if (
    environment.STAGING_WEB_MODE !== 'vercel' ||
    typeof key !== 'string' ||
    !/^fdp_[A-Za-z0-9+/]{43}=$/.test(key) ||
    Buffer.from(key.slice(4), 'base64').toString('base64') !== key.slice(4)
  )
    die(
      'Split-web recovery requires its explicit mode and dedicated forwarding key in private .env',
    );
  return environment;
}
const COMPOSE_LABEL = 'com.docker.compose.';
const MAX_JSON = 32 * 1024 * 1024;
function inside(root, path) {
  const rel = relative(root, path);
  return rel === '' || (!rel.startsWith('../') && rel !== '..' && !isAbsolute(rel));
}
function exactKeys(object, keys) {
  return JSON.stringify(Object.keys(object).sort()) === JSON.stringify([...keys].sort());
}
function json(text) {
  try {
    return JSON.parse(text);
  } catch {
    return die('Invalid Docker or backup metadata');
  }
}
function projectName(value) {
  if (!/^[a-z][a-z0-9-]{2,62}$/.test(value ?? ''))
    die('Explicit lowercase project name required (3–63 characters)');
  return value;
}
async function absent(path) {
  try {
    await lstat(path);
    die('Target already exists; refusing overwrite');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}
async function regular(path, limit = MAX_JSON) {
  const stat = await lstat(path);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > limit)
    die('Expected bounded regular file, never a symbolic link');
  return stat;
}
async function canonical(path) {
  if (!isAbsolute(path ?? '') || resolve(path) !== path || (await realpath(path)) !== path)
    die('An absolute canonical path without symbolic links is required');
  return path;
}
async function newPath(path) {
  if (!isAbsolute(path ?? '') || resolve(path) !== path) die('An absolute new path is required');
  await canonical(dirname(path));
  await absent(path);
  return path;
}
function volumeNames(profile) {
  return [
    ...BASE_VOLUMES,
    ...(profile.startsWith('staging') ? ['staging-caddy-data', 'staging-caddy-config'] : []),
  ].sort();
}

export function createRunner() {
  const children = new Set();
  let aborted = false;
  return {
    assertActive() {
      if (aborted) die('Operation interrupted');
    },
    abort() {
      aborted = true;
      for (const child of children) child.kill('SIGTERM');
    },
    async run(args, options = {}) {
      if (aborted && !options.cleanup) die('Operation interrupted');
      return new Promise((resolveRun, reject) => {
        const child = spawn('docker', args, {
          stdio: [options.input ? 'pipe' : 'ignore', 'pipe', 'pipe'],
          env: process.env,
        });
        children.add(child);
        let output = [],
          bytes = 0,
          failure;
        child.stderr.on('data', () => {}); // Docker can print interpolated credentials; never forward diagnostics.
        const transfer = options.output
          ? pipeline(child.stdout, createWriteStream(options.output, { flags: 'wx', mode: 0o600 }))
          : Promise.resolve();
        if (!options.output)
          child.stdout.on('data', (chunk) => {
            bytes += chunk.length;
            if (bytes > MAX_JSON) {
              failure = new Error('Docker output exceeds bound');
              child.kill();
            } else output.push(chunk);
          });
        const input = options.input
          ? pipeline(createReadStream(options.input), child.stdin)
          : Promise.resolve();
        child.on('error', (error) => {
          failure = error;
        });
        child.on('close', async (code) => {
          children.delete(child);
          try {
            await Promise.all([transfer, input]);
            if (failure || code !== 0)
              die('Docker operation failed; private command output withheld');
            resolveRun(Buffer.concat(output).toString('utf8'));
          } catch (error) {
            reject(error);
          }
        });
        // Observe stream rejection immediately while awaiting process exit.
        transfer.catch(() => child.kill());
        input.catch(() => child.kill());
      });
    },
  };
}
async function runHelper(runner, args, options = {}) {
  const name = `flare-operations-${randomBytes(16).toString('hex')}`;
  try {
    return await runner.run(['run', '--pull', 'never', '--name', name, ...args], options);
  } finally {
    try {
      await runner.run(['rm', '-f', name], { cleanup: true });
    } catch {
      /* --rm may already have removed this exact owned helper. */
    }
  }
}
async function localDocker(runner) {
  if (process.env.DOCKER_HOST && !process.env.DOCKER_HOST.startsWith('unix://'))
    die('Remote Docker endpoints are forbidden');
  const context = json(await runner.run(['context', 'inspect']));
  if (context.length !== 1 || !context[0]?.Endpoints?.docker?.Host?.startsWith('unix://'))
    die('A local Unix Docker endpoint is required');
  const info = json(await runner.run(['info', '--format', '{{json .}}']));
  if (info.OSType !== 'linux' || !info.ID) die('A local Linux Docker engine is required');
  return {
    id: info.ID,
    architecture: info.Architecture,
    operatingSystem: info.OSType,
    desktop: info.OperatingSystem === 'Docker Desktop',
  };
}
async function containers(runner, filters = []) {
  const ids = (await runner.run(['ps', '-aq', ...filters])).trim().split(/\s+/).filter(Boolean);
  return ids.length ? json(await runner.run(['inspect', ...ids])) : [];
}
async function inspectImage(runner, reference) {
  const images = json(await runner.run(['image', 'inspect', reference]));
  if (
    images.length !== 1 ||
    !/^sha256:[a-f0-9]{64}$/.test(images[0].Id) ||
    images[0].Os !== 'linux'
  )
    die('Required local pinned image is unavailable');
  return { id: images[0].Id, architecture: images[0].Architecture, os: images[0].Os, reference };
}
async function listPrivate(root, profile) {
  // Checking only the final file misses symlinks in ancestors such as root/ops.
  await canonical(join(root, 'ops'));
  const paths = ['.env', ...PROFILES[profile], ...profileAssets(profile)];
  async function visit(path) {
    await canonical(join(root, path));
    const stat = await lstat(join(root, path));
    if (stat.isSymbolicLink()) die('Private configuration cannot contain symbolic links');
    if (stat.isDirectory()) {
      for (const name of (await readdir(join(root, path))).sort()) await visit(`${path}/${name}`);
    } else if (stat.isFile() && stat.size <= 16 * 1024 * 1024) paths.push(path);
    else die('Private configuration contains unsupported files');
    if (paths.length > 4096) die('Too many private configuration files');
  }
  await visit('ops/certs');
  await visit('ops/postal/config');
  const files = {};
  let bytes = 0;
  for (const path of paths) {
    await canonical(join(root, path));
    await regular(join(root, path), 16 * 1024 * 1024);
    const value = await readFile(join(root, path));
    bytes += value.length;
    if (bytes > MAX_JSON / 2) die('Private configuration exceeds size bound');
    files[path] = value.toString('base64');
  }
  if (
    !files['ops/postal/config/postal.yml'] ||
    !files['ops/postal/config/signing.key'] ||
    !files['ops/certs/postal-public.pem']
  )
    die('Required private Postal configuration is missing');
  return files;
}
export function allowedBind(root, profile, mount, definition, engine) {
  // Desktop sometimes exposes its VM path in inspect (not the Compose host path).
  // Normalize only its known prefix, and still require the exact declared mount.
  const source =
    engine.desktop && mount.Source.startsWith(`/host_mnt${root}/`)
      ? mount.Source.slice('/host_mnt'.length)
      : mount.Source;
  if (resolve(source) !== source) return false;
  if (
    !(definition.volumes ?? []).some(
      (item) =>
        item.type === 'bind' &&
        item.source === source &&
        item.target === mount.Destination &&
        Boolean(item.read_only) === (mount.RW === false),
    )
  )
    return false;
  const readOnly = mount.RW === false;
  const fixed = ['ops/postal/config', 'ops/certs'];
  if (fixed.some((path) => inside(join(root, path), source))) return readOnly === true;
  const ingressAsset = splitProfile(profile)
    ? 'ops/staging/Caddyfile.split-web'
    : profile.startsWith('staging')
      ? 'ops/staging/Caddyfile'
      : undefined;
  if (ingressAsset && source === join(root, ingressAsset))
    return readOnly && mount.Destination === '/etc/caddy/Caddyfile';
  return (
    profile === 'acceptance' &&
    (inside(join(root, 'acceptance'), source) ||
      source === join(root, 'scripts/acceptance/postal-native.rb'))
  );
}
function envMap(values = []) {
  return Object.fromEntries(
    values.map((value) => {
      const index = value.indexOf('=');
      return [value.slice(0, index), value.slice(index + 1)];
    }),
  );
}

export async function inspectSource(options, runner = createRunner()) {
  const root = await canonical(options.root),
    project = projectName(options.project),
    profile = options.profile;
  if (!Object.hasOwn(PROFILES, profile)) die('Choose an explicit reviewed Compose backup profile');
  if (
    profile === 'acceptance' &&
    (!/^flare-acceptance-[0-9]+-[0-9]+$/.test(project) ||
      !/^FLARE_ACCEPTANCE=true$/m.test(await readFile(join(root, '.env'), 'utf8')))
  )
    die('Acceptance profile requires the disposable acceptance marker and project');
  const files = PROFILES[profile].map((file) => join(root, file));
  for (const file of files) {
    await canonical(file);
    await regular(file);
  }
  const privateFiles = await listPrivate(root, profile);
  const splitEnvironment = splitConfiguration(privateFiles, profile);
  const engine = await localDocker(runner);
  const compose = [
    'compose',
    '--project-name',
    project,
    '--project-directory',
    root,
    '--env-file',
    join(root, '.env'),
    ...files.flatMap((file) => ['-f', file]),
  ];
  const config = json(await runner.run([...compose, 'config', '--format', 'json']));
  if (splitEnvironment) {
    const ingress = config.services?.ingress;
    if (
      config.services?.['flare-api']?.environment?.FLARE_DASHBOARD_PROXY_SECRET !==
        splitEnvironment.FLARE_DASHBOARD_PROXY_SECRET ||
      !(ingress?.volumes ?? []).some(
        (mount) =>
          mount.type === 'bind' &&
          mount.source === join(root, 'ops/staging/Caddyfile.split-web') &&
          mount.target === '/etc/caddy/Caddyfile' &&
          mount.read_only === true,
      )
    )
      die('Split-web runtime does not match its private forwarding key and ingress asset');
  }
  const logicalVolumes = volumeNames(profile);
  if (config.name !== project || !exactKeys(config.volumes ?? {}, logicalVolumes))
    die('Reviewed Compose volume/project identity mismatch');
  const volumes = {};
  for (const name of logicalVolumes) {
    const declared = config.volumes[name];
    if (declared.external || declared.name !== `${project}_${name}`)
      die('External or renamed volumes are forbidden');
    volumes[name] = declared.name;
  }
  const existingVolumes = (
    await runner.run(['volume', 'ls', '-q', '--filter', `label=${COMPOSE_LABEL}project=${project}`])
  )
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (JSON.stringify(existingVolumes.sort()) !== JSON.stringify(Object.values(volumes).sort()))
    die('Source project has missing or unknown volumes');
  for (const [name, actual] of Object.entries(volumes)) {
    const [volume] = json(await runner.run(['volume', 'inspect', actual]));
    if (
      volume?.Driver !== 'local' ||
      Object.keys(volume?.Options ?? {}).length ||
      volume?.Labels?.[`${COMPOSE_LABEL}project`] !== project ||
      volume?.Labels?.[`${COMPOSE_LABEL}volume`] !== name
    )
      die('Volume ownership or driver mismatch');
  }
  const all = await containers(runner);
  const selected = all.filter(
    (container) => container.Config?.Labels?.[`${COMPOSE_LABEL}project`] === project,
  );
  if (!selected.length) die('No verified source containers exist');
  const seen = new Set();
  const stores = {};
  const runtime = {};
  const emptyMongoMounts = [];
  for (const container of all) {
    const labels = container.Config?.Labels ?? {},
      belongs = labels[`${COMPOSE_LABEL}project`] === project;
    if (!belongs) {
      if (
        container.Mounts?.some(
          (mount) =>
            mount.Type === 'volume' && Object.values(volumes).includes(mount.Name) && mount.RW,
        )
      )
        die('Source volume has a foreign writable mount');
      continue;
    }
    const service = labels[`${COMPOSE_LABEL}service`],
      definition = config.services?.[service];
    if (
      !definition ||
      seen.has(service) ||
      labels[`${COMPOSE_LABEL}project.working_dir`] !== root ||
      labels[`${COMPOSE_LABEL}project.config_files`] !== files.join(',')
    )
      die('Container Compose identity mismatch');
    seen.add(service);
    const environment = envMap(container.Config.Env);
    for (const [key, value] of Object.entries(definition.environment ?? {}))
      if (environment[key] !== String(value))
        die(
          'Runtime environment differs from private Compose configuration; reconcile before backup',
        );
    runtime[service] = { image: container.Image, environment };
    if (
      splitEnvironment &&
      service === 'ingress' &&
      !(container.Mounts ?? []).some(
        (mount) =>
          mount.Type === 'bind' &&
          mount.Destination === '/etc/caddy/Caddyfile' &&
          (mount.Source === join(root, 'ops/staging/Caddyfile.split-web') ||
            (engine.desktop &&
              mount.Source === `/host_mnt${join(root, 'ops/staging/Caddyfile.split-web')}`)) &&
          allowedBind(root, profile, mount, definition, engine),
      )
    )
      die('Split-web ingress runtime is missing its exact read-only configuration mount');
    for (const mount of container.Mounts ?? []) {
      if (mount.Type === 'volume' && !Object.values(volumes).includes(mount.Name)) {
        if (
          service === 'novu-mongodb' &&
          mount.Destination === '/data/configdb' &&
          /^[a-f0-9]{64}$/.test(mount.Name) &&
          mount.RW
        )
          emptyMongoMounts.push(mount.Name);
        else die('Unreviewed container volume');
      }
      if (mount.Type === 'bind' && !allowedBind(root, profile, mount, definition, engine))
        die('Unreviewed or writable deployment bind mount');
      if (!['volume', 'bind', 'tmpfs'].includes(mount.Type)) die('Unsupported container mount');
    }
    if (STORES[service]) {
      const spec = STORES[service];
      validateStoreEnvironment(service, definition.environment ?? {});
      if (
        definition.entrypoint != null ||
        JSON.stringify(definition.command ?? null) !== JSON.stringify(spec.command ?? null)
      )
        die('Unsupported store command; cold recovery requires the reviewed data locations');
      if (
        definition.image !== spec.image ||
        !(container.Mounts ?? []).some(
          (mount) =>
            mount.Name === volumes[spec.volume] && mount.Destination === spec.target && mount.RW,
        )
      )
        die('Store image or mount mismatch');
      const image = await inspectImage(runner, spec.image);
      if (image.id !== container.Image)
        die('Running store image differs from current pinned image');
      stores[service] = { image, environment: definition.environment ?? {} };
    }
  }
  for (const container of all.filter(
    (item) => item.Config?.Labels?.[`${COMPOSE_LABEL}project`] !== project,
  ))
    if (container.Mounts?.some((mount) => emptyMongoMounts.includes(mount.Name) && mount.RW))
      die('Mongo configuration volume has a foreign writer');
  if (!exactKeys(stores, Object.keys(STORES)))
    die('All six store containers must exist before backup');
  if (splitEnvironment && (!seen.has('flare-api') || !seen.has('ingress')))
    die('Split-web API and ingress containers must exist before backup');
  for (const volume of Object.values(volumes))
    if (!selected.some((container) => container.Mounts?.some((mount) => mount.Name === volume)))
      die('A source volume has no reviewed container mount');
  const helper = stores.postgres.image;
  const migrations = {};
  for (const name of (await readdir(join(root, 'packages/db/migrations'))).sort()) {
    if (!name.endsWith('.sql')) continue;
    await regular(join(root, 'packages/db/migrations', name));
    migrations[name] = createHash('sha256')
      .update(await readFile(join(root, 'packages/db/migrations', name)))
      .digest('hex');
  }
  return {
    root,
    project,
    profile,
    compose,
    engine,
    stores,
    helper,
    runtime,
    volumes,
    migrations,
    privateFiles,
    containers: selected.map((container) => container.Id),
    emptyMongoMounts,
    sourceRevision:
      /^FLARE_SOURCE_REVISION=([a-f0-9]{40})$/m.exec(
        Buffer.from(privateFiles['.env'], 'base64').toString('utf8'),
      )?.[1] ?? null,
  };
}
async function ensureStopped(source, runner) {
  const selected = await containers(runner, [
    '--filter',
    `label=${COMPOSE_LABEL}project=${source.project}`,
  ]);
  if (
    JSON.stringify(selected.map((item) => item.Id).sort()) !==
      JSON.stringify([...source.containers].sort()) ||
    selected.some((item) => item.State?.Running || item.State?.Restarting || item.State?.Paused)
  )
    die('Maintenance source changed or is still running; no consistent backup was made');
  for (const item of selected)
    if (
      item.State?.OOMKilled ||
      (STORES[item.Config.Labels[`${COMPOSE_LABEL}service`]] && item.State?.ExitCode !== 0)
    )
      die('Store did not shut down cleanly; inspect it before a cold backup');
}
async function privateScratch() {
  const path = await mkdtemp(join(tmpdir(), 'flare-operations-'));
  await chmod(path, 0o700);
  return path;
}
function safeResult(source) {
  return {
    status: 'plan',
    profile: source.profile,
    project: source.project,
    root: source.root,
    volumeCount: Object.keys(source.volumes).length,
    services: Object.keys(source.runtime).sort(),
    maintenance: 'All project containers stop; source is never restarted automatically',
    consistency: 'Cold, same-engine-image volume snapshot; external acceptance remains uncertain',
  };
}

export async function backup(options, runner = createRunner()) {
  if (!options.maintenance) die('Explicit --maintenance acknowledgment is required');
  const keyPath = await canonical(options.keyFile),
    key = await readKey(keyPath);
  const output = await newPath(options.output);
  if (inside(options.root, keyPath) || inside(output, keyPath) || inside(options.root, output))
    die('Keep backup key and output outside the deployment, separately');
  const source = await inspectSource(options, runner);
  const scratch = await privateScratch();
  const lock = join(source.root, '.flare-operations-maintenance');
  let locked = false,
    created = false;
  try {
    await mkdir(lock, { mode: 0o700 });
    locked = true;
    await mkdir(output, { mode: 0o700 });
    created = true;
    await mkdir(join(output, 'artifacts'), { mode: 0o700 });
    await runner.run([...source.compose, 'stop', '--timeout', '120']);
    await ensureStopped(source, runner);
    // Re-read all identities and private settings after stopping, before the first volume read.
    const confirmed = await inspectSource(options, runner);
    if (JSON.stringify(confirmed) !== JSON.stringify(source))
      die('Deployment configuration changed during maintenance');
    for (const volume of source.emptyMongoMounts) {
      const [metadata] = json(await runner.run(['volume', 'inspect', volume]));
      if (metadata?.Driver !== 'local' || Object.keys(metadata?.Options ?? {}).length)
        die('Mongo anonymous configuration volume uses an unsupported driver');
      await runHelper(runner, [
        '--rm',
        '--network',
        'none',
        '--read-only',
        '--mount',
        `type=volume,src=${volume},dst=/snapshot,readonly`,
        '--entrypoint',
        '/bin/sh',
        source.helper.id,
        '-ec',
        'test -z "$(find /snapshot -mindepth 1 -print -quit)"',
      ]);
    }
    const artifacts = [];
    for (const [name, volume] of Object.entries(source.volumes)) {
      const tar = join(scratch, `${name}.tar`);
      await ensureStopped(source, runner);
      await runHelper(
        runner,
        [
          '--rm',
          '--network',
          'none',
          '--read-only',
          '--security-opt',
          'no-new-privileges:true',
          '--mount',
          `type=volume,src=${volume},dst=/snapshot,readonly`,
          '--entrypoint',
          '/bin/tar',
          source.helper.id,
          '-C',
          '/snapshot',
          '-cf',
          '-',
          '.',
        ],
        { output: tar },
      );
      await validateTar(tar);
      artifacts.push({
        name,
        kind: 'volume',
        ...(await encryptFile(tar, join(output, 'artifacts', `${name}.enc`), key, name)),
      });
      await rm(tar);
    }
    const privatePath = join(scratch, 'private-config.json');
    await writeFile(privatePath, JSON.stringify(source.privateFiles), { mode: 0o600, flag: 'wx' });
    artifacts.push({
      name: 'private-config',
      kind: 'configuration',
      ...(await encryptFile(
        privatePath,
        join(output, 'artifacts/private-config.enc'),
        key,
        'private-config',
      )),
    });
    await ensureStopped(source, runner);
    if (JSON.stringify(await inspectSource(options, runner)) !== JSON.stringify(source))
      die('Deployment changed during snapshot capture');
    const manifest = {
      version: 1,
      createdAt: new Date().toISOString(),
      id: randomBytes(16).toString('hex'),
      source: {
        root: source.root,
        project: source.project,
        profile: source.profile,
        engine: source.engine,
        revision: source.sourceRevision,
      },
      stores: source.stores,
      helper: source.helper,
      runtime: source.runtime,
      migrations: source.migrations,
      artifacts,
    };
    const manifestPath = join(scratch, 'manifest.json');
    await writeFile(manifestPath, JSON.stringify(manifest), { mode: 0o600, flag: 'wx' });
    await encryptFile(manifestPath, join(output, 'manifest.enc'), key, 'manifest');
    // A signal can arrive during the final encryption with no Docker child active.
    runner.assertActive?.();
    return {
      ...safeResult(source),
      status: 'backed-up-source-stopped',
      archive: output,
      artifacts: artifacts.length,
      createdAt: manifest.createdAt,
    };
  } catch (error) {
    if (created) await rm(output, { recursive: true, force: true });
    throw error;
  } finally {
    key.fill(0);
    await rm(scratch, { recursive: true, force: true });
    if (locked) await rm(lock, { recursive: true, force: true });
  }
}

function validateManifest(manifest) {
  if (
    manifest?.version !== 1 ||
    !Object.hasOwn(PROFILES, manifest.source?.profile ?? '') ||
    !/^\d{4}-\d\d-\d\dT/.test(manifest.createdAt ?? '') ||
    !/^[a-f0-9]{32}$/.test(manifest.id ?? '')
  )
    die('Unsupported backup manifest');
  projectName(manifest.source.project);
  if (!exactKeys(manifest.stores ?? {}, Object.keys(STORES)) || !Array.isArray(manifest.artifacts))
    die('Incomplete backup manifest');
  const names = [...volumeNames(manifest.source.profile), 'private-config'].sort();
  if (
    JSON.stringify(manifest.artifacts.map((artifact) => artifact.name).sort()) !==
    JSON.stringify(names)
  )
    die('Backup artifact set is missing, duplicated or unknown');
  for (const artifact of manifest.artifacts) {
    if (
      artifact.kind !== (artifact.name === 'private-config' ? 'configuration' : 'volume') ||
      !Number.isSafeInteger(artifact.size) ||
      artifact.size < 0 ||
      artifact.size > MAX_ARTIFACT_BYTES ||
      !/^[a-f0-9]{64}$/.test(artifact.sha256)
    )
      die('Invalid backup artifact metadata');
  }
  for (const [service, store] of Object.entries(manifest.stores)) {
    if (
      store.image?.reference !== STORES[service].image ||
      !/^sha256:[a-f0-9]{64}$/.test(store.image?.id) ||
      store.image.os !== 'linux' ||
      !['amd64', 'arm64'].includes(store.image.architecture) ||
      !store.environment ||
      typeof store.environment !== 'object' ||
      Array.isArray(store.environment)
    )
      die('Unexpected store identity');
    validateStoreEnvironment(service, store.environment);
  }
  if (manifest.helper?.id !== manifest.stores.postgres.image.id)
    die('Unreviewed backup helper image');
  return manifest;
}
async function validatePrivate(path, profile) {
  await regular(path, MAX_JSON);
  const files = json(await readFile(path, 'utf8'));
  if (
    !files ||
    Array.isArray(files) ||
    typeof files !== 'object' ||
    Object.keys(files).length > 4096
  )
    die('Invalid private configuration');
  const required = [
    '.env',
    ...PROFILES[profile],
    'ops/postal/config/postal.yml',
    'ops/postal/config/signing.key',
    'ops/certs/postal-public.pem',
    ...profileAssets(profile),
  ];
  if (required.some((name) => !Object.hasOwn(files, name))) die('Incomplete private configuration');
  for (const [path, content] of Object.entries(files)) {
    if (
      (!required.includes(path) &&
        !path.startsWith('ops/certs/') &&
        !path.startsWith('ops/postal/config/')) ||
      path.length > 4096 ||
      path.split('/').some((part) => !part || part === '.' || part === '..') ||
      path.includes('\\') ||
      [...path].some((character) => character.charCodeAt(0) < 32) ||
      typeof content !== 'string' ||
      !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(content)
    )
      die('Unsafe private configuration path or content');
  }
  splitConfiguration(files, profile);
  return files;
}
async function freshResources(runner, project) {
  if ((await containers(runner, ['--filter', `label=${COMPOSE_LABEL}project=${project}`])).length)
    die('Restore project containers already exist');
  const volumes = (await runner.run(['volume', 'ls', '--format', '{{.Name}}'])).trim().split(/\s+/);
  const networks = (await runner.run(['network', 'ls', '--format', '{{.Name}}']))
    .trim()
    .split(/\s+/);
  if (
    volumes.some((name) => name.startsWith(`${project}_`)) ||
    networks.includes(`${project}_isolated`)
  )
    die('Restore project resources already exist');
}
export function isolatedCompose(manifest, project) {
  const services = {};
  for (const [service, spec] of Object.entries(STORES))
    services[service] = {
      image: manifest.stores[service].image.id,
      pull_policy: 'never',
      restart: 'no',
      environment: Object.fromEntries(
        Object.entries(manifest.stores[service].environment).map(([key, value]) => [
          key,
          value.replaceAll('$', () => '$$'),
        ]),
      ),
      ...(spec.command ? { command: spec.command } : {}),
      volumes: [`${spec.volume}:${spec.target}`],
      networks: { isolated: { aliases: [service] } },
      security_opt: ['no-new-privileges:true'],
    };
  return {
    name: project,
    services,
    volumes: Object.fromEntries(
      volumeNames(manifest.source.profile).map((name) => [name, { name: `${project}_${name}` }]),
    ),
    networks: { isolated: { internal: true, name: `${project}_isolated` } },
  };
}
export async function restore(options, runner = createRunner()) {
  if (!options.isolated) die('Explicit --isolated acknowledgment is required');
  const archive = await canonical(options.archive),
    keyPath = await canonical(options.keyFile),
    key = await readKey(keyPath);
  const root = await newPath(options.targetRoot),
    project = projectName(options.targetProject);
  if (inside(archive, keyPath) || inside(root, keyPath) || inside(archive, root))
    die('Keep backup, key and new restore target separate');
  const scratch = await privateScratch();
  let created = false,
    composeFile,
    guard;
  const operation = randomBytes(16).toString('hex');
  try {
    if (
      JSON.stringify((await readdir(archive)).sort()) !==
      JSON.stringify(['artifacts', 'manifest.enc'])
    )
      die('Unexpected backup directory contents');
    await canonical(join(archive, 'artifacts'));
    const manifestPath = join(scratch, 'manifest.json');
    await regular(join(archive, 'manifest.enc'), MAX_JSON + 36);
    await decryptFile(join(archive, 'manifest.enc'), manifestPath, key, 'manifest');
    await regular(manifestPath, MAX_JSON);
    const manifest = validateManifest(json(await readFile(manifestPath, 'utf8')));
    if (project === manifest.source.project || root === manifest.source.root)
      die('Restore must not reuse source project or root');
    if (
      JSON.stringify((await readdir(join(archive, 'artifacts'))).sort()) !==
      JSON.stringify(manifest.artifacts.map((artifact) => `${artifact.name}.enc`).sort())
    )
      die('Backup artifact files are missing or unexpected');
    for (const artifact of manifest.artifacts) {
      const path = join(scratch, artifact.name);
      const actual = await decryptFile(
        join(archive, 'artifacts', `${artifact.name}.enc`),
        path,
        key,
        artifact.name,
      );
      if (actual.sha256 !== artifact.sha256 || actual.size !== artifact.size)
        die('Authenticated backup checksum mismatch');
      if (artifact.kind === 'volume') await validateTar(path);
    }
    const privateFiles = await validatePrivate(
      join(scratch, 'private-config'),
      manifest.source.profile,
    );
    await localDocker(runner);
    for (const store of Object.values(manifest.stores)) {
      const image = await inspectImage(runner, store.image.id);
      if (
        image.id !== store.image.id ||
        image.architecture !== store.image.architecture ||
        image.os !== store.image.os
      )
        die('Exact source store image/platform unavailable locally; restore cannot upgrade images');
    }
    await freshResources(runner, project);
    // Docker reserves a container name atomically across users/processes on this engine.
    // It is never started; a second restore cannot race the target existence checks.
    guard = (
      await runner.run([
        'create',
        '--pull',
        'never',
        '--name',
        `${project}-restore-guard`,
        '--network',
        'none',
        '--label',
        `io.flare.backup.operation=${operation}`,
        '--entrypoint',
        '/bin/true',
        manifest.helper.id,
      ])
    ).trim();
    if (!/^[a-f0-9]{64}$/.test(guard)) die('Invalid restore guard identity');
    await freshResources(runner, project);
    await absent(root);
    await mkdir(root, { mode: 0o700 });
    created = true;
    await mkdir(join(root, 'private'), { mode: 0o700 });
    for (const [path, value] of Object.entries(privateFiles)) {
      const destination = join(root, 'private', path);
      await mkdir(dirname(destination), { recursive: true, mode: 0o700 });
      await writeFile(destination, Buffer.from(value, 'base64'), { flag: 'wx', mode: 0o600 });
    }
    const network = `${project}_isolated`;
    await runner.run([
      'network',
      'create',
      '--internal',
      '--label',
      `${COMPOSE_LABEL}project=${project}`,
      '--label',
      `${COMPOSE_LABEL}network=isolated`,
      '--label',
      `io.flare.backup.operation=${operation}`,
      network,
    ]);
    const [networkInfo] = json(await runner.run(['network', 'inspect', network]));
    if (
      networkInfo.Internal !== true ||
      networkInfo.Labels?.['io.flare.backup.operation'] !== operation
    )
      die('Restore network is not isolated');
    for (const artifact of manifest.artifacts.filter((item) => item.kind === 'volume')) {
      const volume = `${project}_${artifact.name}`;
      await runner.run([
        'volume',
        'create',
        '--label',
        `${COMPOSE_LABEL}project=${project}`,
        '--label',
        `${COMPOSE_LABEL}volume=${artifact.name}`,
        '--label',
        `io.flare.backup.operation=${operation}`,
        volume,
      ]);
      const [createdVolume] = json(await runner.run(['volume', 'inspect', volume]));
      if (createdVolume.Labels?.['io.flare.backup.operation'] !== operation)
        die('Restore volume was concurrently claimed; refusing overwrite');
      await runHelper(
        runner,
        [
          '--rm',
          '-i',
          '--network',
          'none',
          '--read-only',
          '--security-opt',
          'no-new-privileges:true',
          '--mount',
          `type=volume,src=${volume},dst=/restore`,
          '--entrypoint',
          '/bin/tar',
          manifest.helper.id,
          '-C',
          '/restore',
          '-xf',
          '-',
        ],
        { input: join(scratch, artifact.name) },
      );
    }
    composeFile = join(root, 'compose.restore.json');
    await writeFile(
      composeFile,
      JSON.stringify(isolatedCompose(manifest, project, root), null, 2),
      { mode: 0o600, flag: 'wx' },
    );
    await runner.run([
      'compose',
      '--project-name',
      project,
      '--project-directory',
      root,
      '-f',
      composeFile,
      'up',
      '-d',
      '--no-build',
      '--pull',
      'never',
    ]);
    const restored = await containers(runner, [
      '--filter',
      `label=${COMPOSE_LABEL}project=${project}`,
    ]);
    if (
      restored.length !== 6 ||
      restored.some(
        (item) =>
          !Object.hasOwn(STORES, item.Config.Labels[`${COMPOSE_LABEL}service`]) ||
          Object.keys(item.HostConfig?.PortBindings ?? {}).length ||
          Object.keys(item.NetworkSettings?.Networks ?? {}).some((name) => name !== network),
      )
    )
      die('Unexpected restored container or network exposure');
    const result = {
      status: 'restored-isolated',
      project,
      root,
      composeFile,
      privateRoot: join(root, 'private'),
      volumes: volumeNames(manifest.source.profile).map((name) => `${project}_${name}`),
      network,
      backupCreatedAt: manifest.createdAt,
      sourceUntouched: true,
      deliveryServicesStarted: false,
    };
    await writeFile(join(root, 'result.json'), JSON.stringify(result, null, 2) + '\n', {
      mode: 0o600,
      flag: 'wx',
    });
    runner.assertActive?.();
    return result;
  } catch (error) {
    // Preserve new target volumes for inspection, but fail closed by stopping any stores we created.
    if (created) await rm(join(root, 'result.json'), { force: true });
    if (created && composeFile) {
      try {
        await runner.run(
          [
            'compose',
            '--project-name',
            project,
            '--project-directory',
            root,
            '-f',
            composeFile,
            'stop',
            '--timeout',
            '120',
          ],
          { cleanup: true },
        );
      } catch {
        /* Report failure; never restart or erase recovery evidence. */
      }
    }
    throw error;
  } finally {
    key.fill(0);
    await rm(scratch, { recursive: true, force: true });
    if (guard && /^[a-f0-9]{64}$/.test(guard)) {
      try {
        // The helper image declares a data VOLUME even though this guard never starts.
        await runner.run(['rm', '-v', guard], { cleanup: true });
      } catch {
        /* Stopped ownership guard may be inspected after failure. */
      }
    }
  }
}
export async function main(args, runner = createRunner()) {
  const [command, ...rest] = args;
  const options = {};
  const names = {
    '--root': 'root',
    '--project': 'project',
    '--profile': 'profile',
    '--output': 'output',
    '--key-file': 'keyFile',
    '--archive': 'archive',
    '--target-root': 'targetRoot',
    '--target-project': 'targetProject',
  };
  for (let index = 0; index < rest.length; index++) {
    const flag = rest[index],
      name =
        names[flag] ??
        (flag === '--maintenance' ? 'maintenance' : flag === '--isolated' ? 'isolated' : null);
    if (!name || Object.hasOwn(options, name)) die('Unknown or duplicate operation argument');
    if (name === 'maintenance' || name === 'isolated') options[name] = true;
    else {
      const value = rest[++index];
      if (!value || value.startsWith('--')) die('Missing operation argument');
      options[name] = value;
    }
  }
  const allowed =
    command === 'plan'
      ? ['root', 'project', 'profile']
      : command === 'backup'
        ? ['root', 'project', 'profile', 'output', 'keyFile', 'maintenance']
        : command === 'restore'
          ? ['archive', 'keyFile', 'targetRoot', 'targetProject', 'isolated']
          : [];
  if (!allowed.length || Object.keys(options).some((key) => !allowed.includes(key)))
    die('Use plan, backup or restore with explicit reviewed operation arguments');
  if (command === 'plan') return safeResult(await inspectSource(options, runner));
  return command === 'backup' ? backup(options, runner) : restore(options, runner);
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.umask(0o077);
  const runner = createRunner();
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => runner.abort());
  main(process.argv.slice(2), runner)
    .then((result) => console.log(JSON.stringify(result)))
    .catch((error) => {
      console.error(
        JSON.stringify({
          errorCode: error.code === 'authentication-failed' ? error.code : 'operations-failed',
          message: `${error.message}. Source is never automatically restarted; inspect maintenance state before manual resume.`,
        }),
      );
      process.exitCode = 1;
    });
}
