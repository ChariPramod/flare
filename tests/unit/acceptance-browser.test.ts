import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomBytes, randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import { acceptanceBrowserEnvironment } from '../../scripts/acceptance/browser.mjs';

function withFixture(
  run: (fixture: {
    path: string;
    directory: string;
    password: string;
    proxySecret: string;
    writeEnv: (overrides?: Record<string, string>) => void;
  }) => void,
) {
  const directory = mkdtempSync(join(tmpdir(), 'flare-acceptance-browser-'));
  const path = join(directory, '.env');
  const password = randomBytes(32).toString('base64url');
  const proxySecret = `fdp_${randomBytes(32).toString('base64')}`;
  const writeEnv = (overrides: Record<string, string> = {}) =>
    writeFileSync(
      path,
      Object.entries({
        FLARE_ACCEPTANCE: 'true',
        FLARE_DASHBOARD_PROXY_SECRET: proxySecret,
        WEB_ORIGIN: 'http://127.0.0.1:3000',
        PUBLIC_API_URL: 'http://127.0.0.1:4000',
        NOVU_PUBLIC_API_URL: 'http://127.0.0.1:3000/novu',
        NOVU_PUBLIC_WS_URL: 'http://127.0.0.1:3002',
        SEED_OWNER_EMAIL: 'owner@example.test',
        SEED_OWNER_PASSWORD: password,
        SEED_SUBSCRIBER_EMAIL: 'reader@example.test',
        ...overrides,
      })
        .map(([key, value]) => `${key}=${value}`)
        .join('\n'),
      { mode: 0o600 },
    );
  try {
    mkdirSync(join(directory, 'acceptance'));
    writeEnv();
    writeFileSync(
      join(directory, 'acceptance/fixtures.json'),
      JSON.stringify({
        inbound: randomUUID(),
        redrive: randomUUID(),
        largeInbound: randomUUID(),
        largeAttachment: randomUUID(),
        largeRawSha256: 'a'.repeat(64),
        largeRawBytes: 14000000,
      }),
      { mode: 0o600 },
    );
    writeFileSync(
      join(directory, 'acceptance/operator.json'),
      JSON.stringify({ id: randomUUID() }),
      { mode: 0o600 },
    );
    run({ path, directory, password, proxySecret, writeEnv });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

it('pins acceptance browsers to the generated IPv4 origin and private fixtures', () => {
  withFixture(({ path, directory, password, proxySecret }) => {
    const result = acceptanceBrowserEnvironment(path, 'flare-acceptance-123-456', {
      E2E_BROWSER_CHANNEL: 'chrome',
      E2E_EMAIL: 'unrelated@example.test',
      E2E_OPERATOR_FIXTURE: '/unrelated/operator.json',
      E2E_DASHBOARD_PROXY_SECRET: 'unrelated',
    });
    expect(result).toMatchObject({
      E2E_BASE_URL: 'http://127.0.0.1:3000',
      E2E_EMAIL: 'owner@example.test',
      E2E_OPERATOR_FIXTURE: join(directory, 'acceptance/operator.json'),
      E2E_ACCEPTANCE_DIRECTORY: directory,
      E2E_ACCEPTANCE_PROJECT: 'flare-acceptance-123-456',
      E2E_ACCEPTANCE: 'true',
      E2E_BROWSER_CHANNEL: 'chrome',
      PLAYWRIGHT_NO_COPY_PROMPT: '1',
    });
    // Keep generated credentials out of assertion diffs.
    expect(result.E2E_PASSWORD === password).toBe(true);
    expect(result.E2E_DASHBOARD_PROXY_SECRET === proxySecret).toBe(true);
  });
});

it('rejects inherited destinations before credentials can reach a different service', () => {
  withFixture(({ path }) => {
    for (const E2E_BASE_URL of [
      '',
      'http://localhost:3000',
      'http://[::1]:3000',
      'https://staging.example.test',
      'http://127.0.0.1:3000/other',
    ])
      expect(() =>
        acceptanceBrowserEnvironment(path, 'flare-acceptance-123-456', { E2E_BASE_URL }),
      ).toThrow('IPv4 loopback origins');
    expect(
      acceptanceBrowserEnvironment(path, 'flare-acceptance-123-456', {
        E2E_BASE_URL: 'http://127.0.0.1:3000',
      }).E2E_BASE_URL,
    ).toBe('http://127.0.0.1:3000');
  });
});

it('requires all browser-facing origins to match the generated disposable target', () => {
  withFixture(({ path, writeEnv }) => {
    for (const overrides of [
      { WEB_ORIGIN: 'http://localhost:3000' },
      { PUBLIC_API_URL: 'http://localhost:4000' },
      { WEB_ORIGIN: 'http://127.0.0.1:3000/' },
      { WEB_ORIGIN: 'http://user@127.0.0.1:3000' },
      { NOVU_PUBLIC_API_URL: 'http://localhost:3000/novu' },
      { NOVU_PUBLIC_WS_URL: 'http://localhost:3002' },
    ]) {
      writeEnv(overrides);
      expect(() => acceptanceBrowserEnvironment(path, 'flare-acceptance-123-456', {})).toThrow(
        'IPv4 loopback origins',
      );
    }
  });
});

it('requires a disposable marker, project and completed message fixtures', () => {
  withFixture(({ path, directory, writeEnv }) => {
    writeEnv({ FLARE_ACCEPTANCE: 'false' });
    expect(() => acceptanceBrowserEnvironment(path, 'flare-acceptance-123-456', {})).toThrow(
      'disposable acceptance',
    );
    writeEnv();
    for (const project of ['', 'flare', 'flare-acceptance-production'])
      expect(() => acceptanceBrowserEnvironment(path, project, {})).toThrow(
        'disposable acceptance',
      );
    for (const fixtures of [{}, { inbound: randomUUID(), redrive: 'missing' }]) {
      writeFileSync(join(directory, 'acceptance/fixtures.json'), JSON.stringify(fixtures));
      expect(() => acceptanceBrowserEnvironment(path, 'flare-acceptance-123-456', {})).toThrow(
        'fixtures must be prepared',
      );
    }
  });
});

it('rejects missing operator fixtures or seed credentials before launching browsers', () => {
  withFixture(({ path, directory, writeEnv }) => {
    writeEnv({ SEED_OWNER_PASSWORD: '' });
    expect(() => acceptanceBrowserEnvironment(path, 'flare-acceptance-123-456', {})).toThrow(
      'fixtures must be prepared',
    );
    writeEnv();
    rmSync(join(directory, 'acceptance/operator.json'));
    expect(() => acceptanceBrowserEnvironment(path, 'flare-acceptance-123-456', {})).toThrow();
  });
});

it('requires a private generated gateway signing key before launching the SDK bridge', () => {
  withFixture(({ path, writeEnv }) => {
    for (const value of ['', 'missing', `fdp_${'a'.repeat(44)}`]) {
      writeEnv({ FLARE_DASHBOARD_PROXY_SECRET: value });
      expect(() => acceptanceBrowserEnvironment(path, 'flare-acceptance-123-456', {})).toThrow(
        'gateway signing key must be generated privately',
      );
    }
  });
});
