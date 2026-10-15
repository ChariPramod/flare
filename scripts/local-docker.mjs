// Read-only prerequisite for destructive, disposable container test suites.
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export function inspectLocalDocker(
  env = process.env,
  run = (args) =>
    execFileSync('docker', args, { env, encoding: 'utf8', stdio: 'pipe', timeout: 15000 }),
) {
  try {
    // DOCKER_CONTEXT overrides DOCKER_HOST. Resolve exactly what the CLI will use.
    const endpoint =
      env.DOCKER_HOST && !env.DOCKER_CONTEXT
        ? env.DOCKER_HOST
        : run(['context', 'inspect', '--format', '{{.Endpoints.docker.Host}}']).trim();
    if (!/^unix:\/\/\/[^\r\n]+$/.test(endpoint))
      return { ok: false, code: 'local-docker-required' };
    const info = JSON.parse(run(['info', '--format', '{{json .}}']));
    if (info.OSType !== 'linux') return { ok: false, code: 'linux-containers-required' };
    run(['compose', 'version', '--short']);
    return { ok: true, code: 'local-docker-ready' };
  } catch {
    return { ok: false, code: 'docker-unavailable' };
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = inspectLocalDocker();
  console.log(JSON.stringify(result));
  if (!result.ok) {
    console.error(
      'Start a local Linux Docker engine with Compose v2 and select its local Unix-socket context. Remote Docker test targets are refused.',
    );
    process.exitCode = 1;
  }
}
