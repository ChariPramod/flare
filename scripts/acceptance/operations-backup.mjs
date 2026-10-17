// Exercise the deployment CLI only against the generated, disposable acceptance project.
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import {
  appendFileSync,
  closeSync,
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

const [root, project] = process.argv.slice(2);
assert.match(root ?? '', /^\/.+\/flare-acceptance-[^/]+$/);
assert.equal(realpathSync(root), root);
assert.match(project ?? '', /^flare-acceptance-[0-9]+-[0-9]+$/);
assert.match(readFileSync(join(root, '.env'), 'utf8'), /^FLARE_ACCEPTANCE=true$/m);
process.umask(0o077);
const scratch = realpathSync(mkdtempSync(join(tmpdir(), 'flare-cold-rehearsal-')));
const target = `${project}-cold`,
  wrongTarget = `${project}-wrong`,
  tamperTarget = `${project}-tamper`;
const targets = [target, wrongTarget, tamperTarget];
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
  docker(...source, 'stop', '--timeout', '120');
  stopped();
  phase = 'source-evidence';
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
  verify(`${project}_default`, join(root, '.env'), 'capture');
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
  for (const service of ['redis', 'novu-redis']) {
    assert.equal(
      docker(
        ...restoredCompose,
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
          ...restoredCompose,
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
  verify(result.network, join(result.privateRoot, '.env'), 'verify');
  stopped();
  console.log(
    `Encrypted cold restore rehearsal passed in ${Math.round((Date.now() - started) / 1000)}s: authenticated rejection before resource creation, six isolated stores, private configuration, Postal volume, tenant isolation, secrets and object bytes. Source remains stopped.`,
  );
} catch {
  console.error(
    `Encrypted cold restore rehearsal failed during ${phase}; private evidence will be removed. No source delivery processes were restarted.`,
  );
  process.exitCode = 1;
} finally {
  try {
    cleanup();
  } catch {
    console.error('Disposable cold restore cleanup failed; inspect the named fixture resources.');
    process.exitCode = 1;
  }
}
