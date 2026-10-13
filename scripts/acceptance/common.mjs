import assert from 'node:assert/strict';
import { connectDatabase } from '../../packages/db/dist/index.js';
assert.equal(
  process.env.FLARE_ACCEPTANCE,
  'true',
  'This script is limited to the disposable acceptance stack',
);
export const { client: sql } = connectDatabase(process.env.DATABASE_URL);
export const pause = (ms) => new Promise((r) => setTimeout(r, ms));
export async function until(fn, label, timeout = 120000) {
  const end = Date.now() + timeout;
  do {
    if (await fn()) return;
    await pause(1000);
  } while (Date.now() < end);
  throw new Error(`Timed out: ${label}`);
}
export async function json(url, { body, ...options } = {}) {
  const response = await fetch(url, {
    ...options,
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: { 'Content-Type': 'application/json', ...options.headers },
    redirect: 'error',
    signal: globalThis.AbortSignal.timeout(30000),
  });
  if (!response.ok)
    throw new Error(`${options.method ?? 'GET'} ${new URL(url).pathname}: HTTP ${response.status}`);
  if (response.status === 204) return null;
  const value = await response.json();
  return value.data ?? value;
}
export async function session() {
  const login = await json('http://localhost:4000/v1/auth/login', {
    method: 'POST',
    body: { email: process.env.SEED_OWNER_EMAIL, password: process.env.SEED_OWNER_PASSWORD },
  });
  const org = login.organizations[0];
  const env = org.environments.find((e) => e.name === 'Development');
  const headers = {
    Authorization: `Bearer ${login.token}`,
    'x-org-id': org.id,
    'x-environment-id': env.id,
  };
  return {
    org,
    env,
    headers,
    api: (path, method = 'GET', body) =>
      json(`http://localhost:4000/v1${path}`, { method, body, headers }),
  };
}
