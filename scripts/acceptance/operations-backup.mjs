// Exercise the deployment CLI only against the generated, disposable acceptance project.
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import {
  appendFileSync,
  closeSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  readSync,
  readdirSync,
  realpathSync,
  rmSync,
  writeFileSync,
  writeSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseEnv } from 'node:util';
import { safeRestoreFailure } from './restore-diagnostics.mjs';

const [root, project] = process.argv.slice(2);
assert.match(root ?? '', /^\/.+\/flare-acceptance-[^/]+$/);
assert.equal(realpathSync(root), root);
assert.match(project ?? '', /^flare-acceptance-[0-9]+-[0-9]+$/);
assert.match(readFileSync(join(root, '.env'), 'utf8'), /^FLARE_ACCEPTANCE=true$/m);
process.umask(0o077);
const scratch = realpathSync(mkdtempSync(join(tmpdir(), 'flare-cold-rehearsal-')));
const target = `${project}-cold`,
  wrongTarget = `${project}-wrong`,
  tamperTarget = `${project}-tamper`,
  splitTarget = `${project}-split`;
const targets = [target, wrongTarget, tamperTarget, splitTarget];
const key = join(scratch, 'key'),
  wrongKey = join(scratch, 'wrong-key');
const archive = join(scratch, 'bundle'),
  targetRoot = join(scratch, 'restored');
const diagnostics = join(scratch, 'diagnostics');
mkdirSync(diagnostics, { mode: 0o700 });
writeFileSync(join(diagnostics, 'failure.json'), '{}', { mode: 0o600 });
writeFileSync(key, randomBytes(32), { flag: 'wx', mode: 0o600 });
writeFileSync(wrongKey, randomBytes(32), { flag: 'wx', mode: 0o600 });
const log = join(scratch, 'operations.log');
let phase = 'guard',
  cleaning = false;
const owned = new Set();
const ownedImageTags = new Set();
const started = Date.now();
function command(executable, args, options = {}) {
  try {
    return execFileSync(executable, args, {
      encoding: 'utf8',
      timeout: 600_000,
      maxBuffer: 32 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
      ...options,
    });
  } catch (error) {
    appendFileSync(log, error.stderr ?? '');
    throw new Error('Private rehearsal command failed', { cause: error });
  }
}
const docker = (...args) => command('docker', args);
const source = [
  'compose',
  '--project-name',
  project,
  '--project-directory',
  root,
  '--env-file',
  join(root, '.env'),
  '-f',
  join(root, 'docker-compose.yml'),
  '-f',
  join(root, 'docker-compose.acceptance.yml'),
];
const cli = join(root, 'scripts/operations/backup.mjs');
const sourceOptions = ['--root', root, '--project', project, '--profile', 'acceptance'];
const operation = (...args) => JSON.parse(command(process.execPath, [cli, ...args]));
const ids = (name) =>
  docker('ps', '-aq', '--filter', `label=com.docker.compose.project=${name}`)
    .trim()
    .split(/\s+/)
    .filter(Boolean);
const resources = (kind, name) =>
  docker(kind, 'ls', '-q', '--filter', `label=com.docker.compose.project=${name}`)
    .trim()
    .split(/\s+/)
    .filter(Boolean);
function absent(name, directory) {
  assert.equal(existsSync(directory), false);
  assert.deepEqual(ids(name), []);
  assert.deepEqual(resources('volume', name), []);
  assert.deepEqual(resources('network', name), []);
}
function cleanup() {
  if (cleaning) return;
  cleaning = true;
  let failed = false;
  for (const name of owned) {
    try {
      const containers = ids(name);
      if (containers.length) docker('rm', '-fv', ...containers);
      const volumes = resources('volume', name);
      if (volumes.length) docker('volume', 'rm', ...volumes);
      const networks = resources('network', name);
      if (networks.length) docker('network', 'rm', ...networks);
      absent(name, join(scratch, 'never-created'));
    } catch {
      failed = true;
    }
  }
  for (const image of ownedImageTags) {
    try {
      docker('image', 'rm', image);
    } catch {
      failed = true;
    }
  }
  rmSync(scratch, { recursive: true, force: true });
  if (failed)
    throw new Error('Disposable recovery cleanup failed; inspect the named cold rehearsal project');
}
for (const [signal, code] of [
  ['SIGINT', 130],
  ['SIGTERM', 143],
])
  process.once(signal, () => {
    try {
      cleanup();
    } finally {
      process.exit(code);
    }
  });
function stopped() {
  const found = ids(project);
  assert.ok(found.length > 0);
  const info = JSON.parse(docker('inspect', ...found));
  assert.ok(
    info.every((item) => !item.State.Running && !item.State.Restarting && !item.State.Paused),
  );
}
function postalDump(compose) {
  return docker(
    ...compose,
    'exec',
    '-T',
    'postal-mariadb',
    'sh',
    '-ec',
    `
    export MYSQL_PWD="$MARIADB_ROOT_PASSWORD"
    databases=$(mariadb -uroot -N -e "SELECT SCHEMA_NAME FROM information_schema.SCHEMATA WHERE SCHEMA_NAME NOT IN ('mysql','information_schema','performance_schema','sys') ORDER BY SCHEMA_NAME")
    test -n "$databases"
    for database in $databases; do case "$database" in *[!a-zA-Z0-9_-]*) exit 1;; esac; done
    mariadb-dump -uroot --single-transaction --routines --events --triggers --hex-blob --skip-comments --skip-dump-date --order-by-primary --complete-insert --databases $databases
  `,
  );
}
function mongo(compose, name) {
  const id = docker(...compose, 'ps', '-q', 'novu-mongodb').trim();
  docker('cp', join(root, 'scripts/acceptance/restore-mongo.js'), `${id}:/tmp/restore-mongo.js`);
  writeFileSync(
    join(scratch, `mongo-${name}.json`),
    docker(
      ...compose,
      'exec',
      '-T',
      'novu-mongodb',
      'sh',
      '-ec',
      'mongosh --quiet --username root --password "$MONGO_INITDB_ROOT_PASSWORD" --authenticationDatabase admin --file /tmp/restore-mongo.js',
    ),
  );
}
function redisEvidence(compose) {
  for (const service of ['redis', 'novu-redis']) {
    assert.equal(
      docker(
        ...compose,
        'exec',
        '-T',
        service,
        'redis-cli',
        '--raw',
        'CONFIG',
        'GET',
        'appendonly',
      ).trim(),
      'appendonly\nyes',
    );
    for (const db of ['0', '2'])
      assert.equal(
        docker(
          ...compose,
          'exec',
          '-T',
          service,
          'redis-cli',
          '-n',
          db,
          'GET',
          'acceptance:restore',
        ).trim(),
        `${project}/${service}/${db}`,
      );
  }
}
function flipArtifact() {
  const path = join(archive, 'artifacts/postgres-data.enc');
  const fd = openSync(path, 'r+'),
    byte = Buffer.alloc(1);
  try {
    assert.equal(readSync(fd, byte, 0, 1, 64), 1);
    byte[0] ^= 1;
    writeSync(fd, byte, 0, 1, 64);
  } finally {
    closeSync(fd);
  }
}
function rejectedRestore(name, directory, keyFile) {
  let error;
  try {
    operation(
      'restore',
      '--archive',
      archive,
      '--key-file',
      keyFile,
      '--target-root',
      directory,
      '--target-project',
      name,
      '--isolated',
    );
  } catch (caught) {
    error = caught;
  }
  assert.ok(error, 'Authentication must reject the archive');
  const diagnostic = JSON.parse(String(error.cause?.stderr ?? '').trim());
  assert.equal(diagnostic.errorCode, 'authentication-failed');
  absent(name, directory);
}
async function waitStores(compose) {
  const probes = [
    ['postgres', 'pg_isready', '-U', 'flare', '-d', 'flare'],
    ['redis', 'redis-cli', 'ping'],
    ['novu-redis', 'redis-cli', 'ping'],
    ['minio', 'curl', '-fsS', 'http://localhost:9000/minio/health/live'],
    ['postal-mariadb', 'healthcheck.sh', '--connect', '--innodb_initialized'],
    [
      'novu-mongodb',
      'sh',
      '-ec',
      'mongosh --quiet --username root --password "$MONGO_INITDB_ROOT_PASSWORD" --eval "db.adminCommand({ping:1}).ok"',
    ],
  ];
  const deadline = Date.now() + 180_000;
  for (const probe of probes) {
    while (true) {
      try {
        docker(...compose, 'exec', '-T', ...probe);
        break;
      } catch {
        assert.ok(Date.now() < deadline, 'Isolated store readiness deadline');
      }
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
}
try {
  for (const name of targets) {
    absent(name, join(scratch, name));
    owned.add(name);
  }
  const api = docker(...source, 'ps', '-aq', 'flare-api').trim();
  const [apiInfo] = JSON.parse(docker('inspect', api));
  assert.equal(apiInfo.Config.Labels['com.docker.compose.project'], project);
  const apiImage = apiInfo.Image;
  // The preceding logical drill leaves fixture DNS/Mailpit running; stop the entire
  // guarded project before bringing back only stores for the independent capture.
  phase = 'source-stop';
  docker(...source, 'stop', '--timeout', '120');
  stopped();
  phase = 'source-stores-start';
  docker(
    ...source,
    'up',
    '-d',
    '--no-deps',
    '--no-recreate',
    '--wait',
    '--wait-timeout',
    '180',
    'postgres',
    'redis',
    'novu-redis',
    'minio',
    'novu-mongodb',
    'postal-mariadb',
  );
  phase = 'source-mongo';
  mongo(source, 'capture');
  const verify = (network, env, mode) =>
    docker(
      'run',
      '--rm',
      '--network',
      network,
      '--env-file',
      env,
      '-v',
      `${scratch}:/restore${mode === 'verify' ? ':ro' : ''}`,
      '-v',
      `${diagnostics}:/diagnostics`,
      '--user',
      'root',
      '--entrypoint',
      'node',
      apiImage,
      'scripts/acceptance/restore-manifest.mjs',
      mode,
    );
  phase = 'source-manifest';
  verify(`${project}_default`, join(root, '.env'), 'capture');
  phase = 'source-postal';
  const postal = createHash('sha256').update(postalDump(source)).digest('hex');
  const configFingerprint = (name) =>
    docker(
      'run',
      '--rm',
      '--network',
      'none',
      '--read-only',
      '--mount',
      `type=volume,src=${name}_postal-config-data,dst=/snapshot,readonly`,
      '--entrypoint',
      'sh',
      'postgres:17.7-alpine',
      '-ec',
      'cd /snapshot; find . -type f -exec sha256sum {} \\; | sort',
    );
  phase = 'source-postal-config';
  const postalConfig = configFingerprint(project);
  phase = 'encrypted-backup';
  assert.equal(operation('plan', ...sourceOptions).status, 'plan');
  assert.equal(
    operation('backup', ...sourceOptions, '--output', archive, '--key-file', key, '--maintenance')
      .status,
    'backed-up-source-stopped',
  );
  stopped();
  phase = 'wrong-key-rejection';
  rejectedRestore(wrongTarget, join(scratch, 'wrong'), wrongKey);
  phase = 'tamper-rejection';
  flipArtifact();
  try {
    rejectedRestore(tamperTarget, join(scratch, 'tampered'), key);
  } finally {
    flipArtifact();
  }
  phase = 'isolated-restore';
  const result = operation(
    'restore',
    '--archive',
    archive,
    '--key-file',
    key,
    '--target-root',
    targetRoot,
    '--target-project',
    target,
    '--isolated',
  );
  assert.equal(result.status, 'restored-isolated');
  assert.equal(result.project, target);
  assert.equal(result.root, targetRoot);
  assert.equal(result.composeFile, join(targetRoot, 'compose.restore.json'));
  assert.equal(result.privateRoot, join(targetRoot, 'private'));
  assert.equal(result.network, `${target}_isolated`);
  assert.equal(JSON.parse(docker('network', 'inspect', result.network))[0].Internal, true);
  const restored = JSON.parse(docker('inspect', ...ids(target)));
  assert.equal(restored.length, 6);
  assert.deepEqual(
    restored.map((item) => item.Config.Labels['com.docker.compose.service']).sort(),
    ['minio', 'novu-mongodb', 'novu-redis', 'postal-mariadb', 'postgres', 'redis'],
  );
  for (const item of restored) {
    assert.deepEqual(Object.keys(item.HostConfig.PortBindings ?? {}), []);
    assert.deepEqual(Object.keys(item.NetworkSettings.Networks), [result.network]);
  }
  function privateFiles(relative = '') {
    for (const entry of readdirSync(join(result.privateRoot, relative), { withFileTypes: true })) {
      const path = join(relative, entry.name);
      if (entry.isDirectory()) privateFiles(path);
      else {
        assert.ok(entry.isFile());
        assert.deepEqual(
          readFileSync(join(result.privateRoot, path)),
          readFileSync(join(root, path)),
        );
      }
    }
  }
  privateFiles();
  assert.equal(configFingerprint(target), postalConfig);
  const restoredCompose = [
    'compose',
    '--project-name',
    target,
    '--project-directory',
    targetRoot,
    '-f',
    result.composeFile,
  ];
  await waitStores(restoredCompose);
  phase = 'restored-evidence';
  mongo(restoredCompose, 'verify');
  assert.deepEqual(
    readFileSync(join(scratch, 'mongo-capture.json')),
    readFileSync(join(scratch, 'mongo-verify.json')),
  );
  assert.equal(createHash('sha256').update(postalDump(restoredCompose)).digest('hex'), postal);
  redisEvidence(restoredCompose);
  verify(result.network, join(result.privateRoot, '.env'), 'verify');
  stopped();
  // Reuse only the already restored, owned disposable volumes as a populated
  // split-profile source. The original acceptance project remains stopped.
  const splitStarted = Date.now();
  phase = 'split-source-stop';
  docker(...restoredCompose, 'stop', '--timeout', '120');
  const sourceContainers = JSON.parse(docker('inspect', ...ids(target)));
  assert.ok(sourceContainers.every((item) => !item.State.Running && item.State.ExitCode === 0));
  docker('rm', '-v', ...sourceContainers.map((item) => item.Id));
  const splitRoot = result.privateRoot;
  const splitProfile = 'staging-split-web-inbound';
  const splitFiles = [
    'docker-compose.yml',
    'docker-compose.staging.yml',
    'docker-compose.staging-split-web.yml',
    'ops/staging/postal-inbound.yml',
  ];
  for (const path of [
    ...splitFiles.slice(1),
    'ops/staging/Caddyfile',
    'ops/staging/Caddyfile.split-web',
  ]) {
    mkdirSync(join(splitRoot, path, '..'), { recursive: true, mode: 0o700 });
    cpSync(join(root, path), join(splitRoot, path));
  }
  mkdirSync(join(splitRoot, 'packages/db'), { recursive: true, mode: 0o700 });
  cpSync(join(root, 'packages/db/migrations'), join(splitRoot, 'packages/db/migrations'), {
    recursive: true,
  });
  let splitEnv = readFileSync(join(splitRoot, '.env'), 'utf8');
  const forwardingKey = parseEnv(splitEnv).FLARE_DASHBOARD_PROXY_SECRET;
  assert.match(forwardingKey ?? '', /^fdp_[A-Za-z0-9+/]{43}=$/);
  for (const [name, value] of Object.entries({
    STAGING_WEB_MODE: 'vercel',
    STAGING_DASHBOARD_HOST: 'dashboard.split.invalid',
    STAGING_API_HOST: 'api.split.invalid',
    STAGING_WS_HOST: 'ws.split.invalid',
    STAGING_TRACKING_HOST: 'tracking.split.invalid',
    STAGING_ACME_EMAIL: 'operations@example.invalid',
    STAGING_SUBNET: '172.30.250.0/24',
    STAGING_PROXY_IP: '172.30.250.10',
    WEB_ORIGIN: 'https://dashboard.split.invalid',
    PUBLIC_API_URL: 'https://api.split.invalid',
    TRACKING_URL: 'https://api.split.invalid',
    NOVU_PUBLIC_API_URL: 'https://dashboard.split.invalid/novu',
    NOVU_PUBLIC_WS_URL: 'https://ws.split.invalid',
    FLARE_DASHBOARD_INBOX_WS: 'true',
    NOVU_WS_URL: 'http://novu-ws:3002',
  })) {
    splitEnv = splitEnv.replace(new RegExp(`^${name}=.*\\n?`, 'gm'), '');
    splitEnv += `\n${name}=${value}\n`;
  }
  writeFileSync(join(splitRoot, '.env'), splitEnv, { mode: 0o600 });
  const splitSource = [
    'compose',
    '--project-name',
    target,
    '--project-directory',
    splitRoot,
    '--env-file',
    join(splitRoot, '.env'),
    ...splitFiles.flatMap((path) => ['-f', join(splitRoot, path)]),
  ];
  // This private tag is used only to create a stopped API container so backup
  // validates the loaded forwarding key. It never starts the application.
  const apiTag = `${target}-flare-api`;
  assert.equal(docker('image', 'ls', '-q', apiTag).trim(), '');
  ownedImageTags.add(apiTag);
  docker('image', 'tag', apiImage, apiTag);
  phase = 'split-ingress-image';
  // The separate staging-config CI job has a different daemon. Fetch only this
  // pinned ingress image; its container is created for mount checks, never run.
  docker('pull', 'caddy:2.10.2-alpine');
  phase = 'split-source-create';
  docker(
    ...splitSource,
    'up',
    '--no-start',
    '--no-build',
    '--pull',
    'never',
    '--no-deps',
    'postgres',
    'redis',
    'novu-redis',
    'minio',
    'novu-mongodb',
    'postal-mariadb',
    'postal-config',
    'ingress',
    'flare-api',
  );
  const splitContainers = JSON.parse(docker('inspect', ...ids(target)));
  assert.equal(splitContainers.length, 9);
  assert.ok(splitContainers.every((item) => !item.State.Running && !item.State.Restarting));
  const caddyCanaries = new Map();
  for (const volume of ['staging-caddy-data', 'staging-caddy-config']) {
    const canary = randomBytes(16).toString('hex');
    caddyCanaries.set(volume, canary);
    docker(
      'run',
      '--rm',
      '--network',
      'none',
      '--read-only',
      '--mount',
      `type=volume,src=${target}_${volume},dst=/snapshot`,
      '--entrypoint',
      'sh',
      'postgres:17.7-alpine',
      '-ec',
      'printf %s "$1" > /snapshot/acceptance-canary',
      'sh',
      canary,
    );
  }
  const splitOptions = ['--root', splitRoot, '--project', target, '--profile', splitProfile];
  const splitArchive = join(scratch, 'split-bundle');
  phase = 'split-profile-plan';
  assert.equal(operation('plan', ...splitOptions).volumeCount, 9);
  let wrongProfileRejected = false;
  try {
    operation('plan', '--root', splitRoot, '--project', target, '--profile', 'staging-split-web');
  } catch {
    wrongProfileRejected = true;
  }
  assert.ok(wrongProfileRejected, 'Source labels bind the exact optional receiving overlay');
  phase = 'split-encrypted-backup';
  assert.equal(
    operation(
      'backup',
      ...splitOptions,
      '--output',
      splitArchive,
      '--key-file',
      key,
      '--maintenance',
    ).artifacts,
    10,
  );
  for (const path of ['manifest.enc', 'artifacts/private-config.enc'])
    assert.equal(
      readFileSync(join(splitArchive, path)).includes(Buffer.from(forwardingKey)),
      false,
    );
  phase = 'split-isolated-restore';
  const splitResult = operation(
    'restore',
    '--archive',
    splitArchive,
    '--key-file',
    key,
    '--target-root',
    join(scratch, 'split-restored'),
    '--target-project',
    splitTarget,
    '--isolated',
  );
  assert.equal(splitResult.status, 'restored-isolated');
  assert.equal(splitResult.volumes.length, 9);
  const splitRestored = JSON.parse(docker('inspect', ...ids(splitTarget)));
  assert.equal(splitRestored.length, 6);
  assert.equal(JSON.parse(docker('network', 'inspect', splitResult.network))[0].Internal, true);
  for (const item of splitRestored) {
    assert.deepEqual(Object.keys(item.HostConfig.PortBindings ?? {}), []);
    assert.deepEqual(Object.keys(item.NetworkSettings.Networks), [splitResult.network]);
  }
  for (const path of [
    '.env',
    ...splitFiles,
    'ops/staging/Caddyfile',
    'ops/staging/Caddyfile.split-web',
  ])
    assert.equal(
      readFileSync(join(splitResult.privateRoot, path)).equals(readFileSync(join(splitRoot, path))),
      true,
    );
  assert.equal(
    parseEnv(readFileSync(join(splitResult.privateRoot, '.env'), 'utf8'))
      .FLARE_DASHBOARD_PROXY_SECRET === forwardingKey,
    true,
  );
  for (const [volume, canary] of caddyCanaries)
    assert.equal(
      docker(
        'run',
        '--rm',
        '--network',
        'none',
        '--read-only',
        '--mount',
        `type=volume,src=${splitTarget}_${volume},dst=/snapshot,readonly`,
        '--entrypoint',
        'cat',
        'postgres:17.7-alpine',
        '/snapshot/acceptance-canary',
      ),
      canary,
    );
  const splitRestoredCompose = [
    'compose',
    '--project-name',
    splitTarget,
    '--project-directory',
    splitResult.root,
    '-f',
    splitResult.composeFile,
  ];
  await waitStores(splitRestoredCompose);
  phase = 'split-restored-evidence';
  mongo(splitRestoredCompose, 'verify');
  assert.equal(
    readFileSync(join(scratch, 'mongo-capture.json')).equals(
      readFileSync(join(scratch, 'mongo-verify.json')),
    ),
    true,
  );
  assert.equal(createHash('sha256').update(postalDump(splitRestoredCompose)).digest('hex'), postal);
  assert.equal(configFingerprint(splitTarget), postalConfig);
  redisEvidence(splitRestoredCompose);
  verify(splitResult.network, join(splitResult.privateRoot, '.env'), 'verify');
  assert.ok(JSON.parse(docker('inspect', ...ids(target))).every((item) => !item.State.Running));
  stopped();
  console.log(
    `Split-web cold restore rehearsal passed in ${Math.round((Date.now() - splitStarted) / 1000)}s: exact ordered profile, nine volumes, six isolated stores, encrypted forwarding key and retained Caddy assets. No ingress or delivery service started.`,
  );
  console.log(
    `Encrypted cold restore rehearsal passed in ${Math.round((Date.now() - started) / 1000)}s: authenticated rejection before resource creation, six isolated stores, private configuration, Postal volume, tenant isolation, secrets and object bytes. Source remains stopped.`,
  );
} catch {
  console.error(
    `Encrypted cold restore rehearsal failed during ${phase}; private evidence will be removed. No source delivery processes were restarted.`,
  );
  const diagnostic = safeRestoreFailure(join(diagnostics, 'failure.json'));
  if (diagnostic) console.error(diagnostic);
  process.exitCode = 1;
} finally {
  try {
    cleanup();
  } catch {
    console.error('Disposable cold restore cleanup failed; inspect the named fixture resources.');
    process.exitCode = 1;
  }
}
