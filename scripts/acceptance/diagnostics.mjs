import { readFileSync } from 'node:fs';
const secrets = readFileSync(process.argv[2], 'utf8')
  .split('\n')
  .filter((line) => /^[A-Z_]*(PASSWORD|SECRET|TOKEN|KEY|DATABASE_URL)=/.test(line))
  .map((line) => line.slice(line.indexOf('=') + 1))
  .filter((value) => value.length >= 12)
  .sort((a, b) => b.length - a.length);
let bytes = 0,
  lines = '';
for await (const chunk of process.stdin) {
  bytes += chunk.length;
  if (bytes <= 2 * 1024 * 1024) lines += chunk.toString();
}
let count = 0;
for (let line of lines.split('\n')) {
  if (!/error|exception|failed|cannot|invalid|ERR_|EACCES|ENOENT|EADDRINUSE/i.test(line)) continue;
  if (++count > 100) break;
  for (const secret of secrets) line = line.replaceAll(secret, '[redacted]');
  if (/authorization|api.?key|password|secret|credential|cookie|cipher|jwt|token/i.test(line))
    line = '[sensitive diagnostic line omitted]';
  // Also remove opaque values whose label appeared on an earlier line.
  line = line.replace(/[A-Za-z0-9+/=_-]{32,}/g, '[redacted]');
  console.log(line.slice(0, 1000));
}
