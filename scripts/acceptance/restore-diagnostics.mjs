import { readFileSync, writeFileSync } from 'node:fs';

// Only authored labels and explicitly approved error codes may reach CI output.
// Never serialize messages, stacks, SQL, assertion values, or store responses.
const phases = new Set([
  'postgres-fingerprints',
  'postgres-fixtures',
  'postgres-schema',
  'tenant-role',
  'tenant-visible',
  'tenant-isolation',
  'dkim-decryption',
  'novu-manifest',
  'novu-decryption',
  'novu-environment-map',
  'novu-workflow-map',
  'novu-workflow-fixture',
  'object-buckets',
  'object-upload',
  'object-list',
  'object-download',
  'object-size',
  'object-fixture',
  'manifest-write',
  'compare-data',
  'compare-policies',
  'compare-constraints',
  'compare-permissions',
  'compare-rls',
  'compare-role',
  'compare-objects',
]);
const codes = new Set([
  'assertion-failed',
  'operation-failed',
  'ECONNREFUSED',
  'ENOTFOUND',
  'ETIMEDOUT',
  'ENOENT',
  'EACCES',
  '28P01',
  '42P01',
  '42501',
  'ERR_OSSL_BAD_DECRYPT',
]);
export function recordRestoreFailure(path, mode, phase, error) {
  const code =
    error?.name === 'AssertionError'
      ? 'assertion-failed'
      : codes.has(error?.code)
        ? error.code
        : 'operation-failed';
  if (!['capture', 'verify'].includes(mode) || !phases.has(phase)) return;
  writeFileSync(path, JSON.stringify({ mode, phase, code }), { mode: 0o600 });
}
export function safeRestoreFailure(path) {
  try {
    const { mode, phase, code } = JSON.parse(readFileSync(path, 'utf8'));
    if (['capture', 'verify'].includes(mode) && phases.has(phase) && codes.has(code))
      return `Restore verifier: ${mode}/${phase}: ${code}.`;
  } catch {
    /* A missing or malformed marker never exposes the private input. */
  }
  return undefined;
}
if (process.argv[2] === '--print') {
  const message = safeRestoreFailure(process.argv[3]);
  if (message) console.error(message);
}
