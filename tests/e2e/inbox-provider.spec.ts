import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { test, expect, type Page } from '@playwright/test';

// This fixture uses only invented SDK state. The real Inbox tests keep native
// credentials out of traces; these deterministic lifecycle tests need no API.
const webRequire = createRequire(resolve('apps/web/package.json'));
const providerRoot = resolve(dirname(webRequire.resolve('@novu/react')), '../../..');
const { build } = createRequire(webRequire.resolve('tsx'))('esbuild');
const bundles = new Map<string, string>();
const sdkMock = `
export class Novu {
  constructor(options) {
    const state = window.providerFixture;
    state.attempts++;
    if (options.subscriber.subscriberId === 'broken') throw new Error('Fixture constructor failed');
    this.id = options.subscriber.subscriberId;
    this.listeners = new Map();
    this.disconnects = 0;
    this.cacheClears = 0;
    this.connected = false;
    this.ready = state.pending ? new Promise(resolve => { this.release = resolve; }) : Promise.resolve();
    this.socket = {
      disconnect: () => this.ready.then(() => { this.disconnects++; this.connected = false; })
    };
    this.notifications = { clearCache: () => { this.cacheClears++; } };
    state.instances.push(this);
  }
  on(name, listener) {
    const entries = this.listeners.get(name) || new Set();
    this.listeners.set(name, entries);
    entries.add(listener);
    return () => entries.delete(listener);
  }
  emit(name) {
    if (name === 'socket.connect.resolved') this.connected = true;
    for (const listener of this.listeners.get(name) || []) listener({});
  }
}
`;
const harness = `
import React, { Component, StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { NovuProvider, useNovu } from 'fixture-provider';
const state = window.providerFixture = { attempts: 0, instances: [], seen: [], pending: false, unhandled: [] };
window.addEventListener('unhandledrejection', event => state.unhandled.push(String(event.reason)));
const root = createRoot(document.getElementById('root'));
const never = new Promise(() => {});
function NeverCommits() { throw never; }
function Probe({ expected }) {
  const client = useNovu();
  state.seen.push({ expected, actual: client.id });
  return <div data-testid="client">{client.id}</div>;
}
class Boundary extends Component {
  state = { error: undefined };
  static getDerivedStateFromError(error) { return { error }; }
  render() { return this.state.error ? <div role="alert">{this.state.error.message}</div> : this.props.children; }
}
state.render = ({ kind = 'normal', id = 'first', strict = false, pending = false } = {}) => {
  state.pending = pending;
  const provider = <NovuProvider applicationIdentifier="fixture" subscriber={id}><Probe expected={id}/></NovuProvider>;
  let children = kind === 'empty' ? null : provider;
  if (kind === 'suspend') children = <Suspense fallback={<div>Waiting to commit</div>}>{provider}<NeverCommits/></Suspense>;
  children = <Boundary>{children}</Boundary>;
  if (strict) children = <StrictMode>{children}</StrictMode>;
  flushSync(() => root.render(children));
  if (kind === 'bounce') flushSync(() => root.render(null));
  return document.querySelector('[data-testid="client"]')?.textContent ?? null;
};
state.snapshot = () => ({
  attempts: state.attempts,
  seen: state.seen,
  unhandled: state.unhandled,
  instances: state.instances.map(instance => ({
    id: instance.id, disconnects: instance.disconnects, cacheClears: instance.cacheClears,
    connected: instance.connected,
    listeners: [...instance.listeners.values()].reduce((total, entries) => total + entries.size, 0)
  }))
});
`;

type Snapshot = {
  attempts: number;
  seen: { expected: string; actual: string }[];
  unhandled: string[];
  instances: {
    id: string;
    disconnects: number;
    cacheClears: number;
    connected: boolean;
    listeners: number;
  }[];
};
type BrowserFixture = {
  providerFixture: {
    render(options: {
      kind?: string;
      id?: string;
      strict?: boolean;
      pending?: boolean;
    }): string | null;
    snapshot(): Snapshot;
    instances: { release(): void; emit(name: string): void }[];
  };
};
function snapshot(page: Page) {
  return page.evaluate(() => (window as unknown as BrowserFixture).providerFixture.snapshot());
}
function render(page: Page, options: Parameters<BrowserFixture['providerFixture']['render']>[0]) {
  return page.evaluate(
    (input) => (window as unknown as BrowserFixture).providerFixture.render(input),
    options,
  );
}
async function setup(page: Page, mode: 'esm' | 'cjs') {
  let bundle = bundles.get(mode);
  if (!bundle) {
    const entry = join(
      providerRoot,
      `dist/${mode}/hooks/NovuProvider.${mode === 'esm' ? 'js' : 'cjs'}`,
    );
    const result = await build({
      stdin: { contents: harness, loader: 'jsx', resolveDir: resolve('apps/web') },
      bundle: true,
      platform: 'browser',
      format: 'iife',
      target: 'es2022',
      write: false,
      logLevel: 'silent',
      define: { 'process.env.NODE_ENV': '"development"' },
      plugins: [
        {
          name: 'mock-sdk-construction',
          setup(builder: {
            onResolve(
              options: { filter: RegExp },
              callback: () => { path: string; namespace?: string },
            ): void;
            onLoad(
              options: { filter: RegExp; namespace: string },
              callback: () => { contents: string; loader: string },
            ): void;
          }) {
            builder.onResolve({ filter: /^fixture-provider$/ }, () => ({ path: entry }));
            builder.onResolve({ filter: /^@novu\/js$/ }, () => ({
              path: 'mock-sdk',
              namespace: 'fixture',
            }));
            builder.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({
              contents: sdkMock,
              loader: 'js',
            }));
          },
        },
      ],
    });
    bundle = result.outputFiles[0].text as string;
    bundles.set(mode, bundle);
  }
  await page.setContent('<div id="root"></div>');
  await page.addScriptTag({ content: bundle });
}

for (const mode of ['esm', 'cjs'] as const) {
  test(`${mode} Inbox provider does not bootstrap an abandoned render or pre-microtask unmount`, async ({
    page,
  }) => {
    await setup(page, mode);
    await render(page, { kind: 'suspend' });
    await expect(page.getByText('Waiting to commit', { exact: true })).toBeVisible();
    expect((await snapshot(page)).attempts).toBe(0);
    await render(page, { kind: 'empty' });
    await render(page, { kind: 'bounce' });
    expect((await snapshot(page)).attempts).toBe(0);
  });

  test(`${mode} Inbox provider creates one committed StrictMode client and isolates replacement access`, async ({
    page,
  }) => {
    await setup(page, mode);
    await render(page, { strict: true });
    await expect(page.getByTestId('client')).toHaveText('first');
    expect((await snapshot(page)).attempts).toBe(1);
    await render(page, { strict: true });
    expect((await snapshot(page)).attempts).toBe(1);
    expect(await render(page, { strict: true, id: 'replacement' })).toBeNull();
    await expect(page.getByTestId('client')).toHaveText('replacement');
    const state = await snapshot(page);
    expect(state.attempts).toBe(2);
    expect(state.seen.every((entry) => entry.expected === entry.actual)).toBe(true);
    await expect.poll(async () => (await snapshot(page)).instances[0].listeners).toBe(0);
    expect((await snapshot(page)).instances[0].disconnects).toBeGreaterThanOrEqual(1);
    expect((await snapshot(page)).instances[0].cacheClears).toBe(1);
    expect(state.unhandled).toEqual([]);
  });

  test(`${mode} Inbox provider returns constructor failures to its error boundary`, async ({
    page,
  }) => {
    await setup(page, mode);
    await render(page, { id: 'broken', strict: true });
    await expect(page.getByRole('alert')).toHaveText('Fixture constructor failed');
    const state = await snapshot(page);
    expect(state.attempts).toBe(1);
    expect(state.instances).toEqual([]);
    expect(state.unhandled).toEqual([]);
  });

  test(`${mode} Inbox provider retires pending clients and bounds guards for a hung bootstrap`, async ({
    page,
  }) => {
    await page.clock.install();
    await setup(page, mode);
    await render(page, { pending: true });
    await expect(page.getByTestId('client')).toHaveText('first');
    await render(page, { kind: 'empty' });
    expect((await snapshot(page)).instances[0].listeners).toBe(3);
    await page.evaluate(() => {
      const instance = (window as unknown as BrowserFixture).providerFixture.instances[0];
      instance.emit('session.initialize.resolved');
      instance.emit('socket.connect.pending');
      instance.emit('socket.connect.resolved');
      instance.release();
    });
    await expect.poll(async () => (await snapshot(page)).instances[0].listeners).toBe(0);
    expect((await snapshot(page)).instances[0].connected).toBe(false);
    await render(page, { id: 'hung', pending: true });
    await expect(page.getByTestId('client')).toHaveText('hung');
    await render(page, { kind: 'empty' });
    expect((await snapshot(page)).instances[1].listeners).toBe(3);
    await page.clock.fastForward(20001);
    expect((await snapshot(page)).instances[1].listeners).toBe(0);
    await page.evaluate(() =>
      (window as unknown as BrowserFixture).providerFixture.instances[1].release(),
    );
    await expect
      .poll(async () => (await snapshot(page)).instances[1].disconnects)
      .toBeGreaterThan(0);
    const state = await snapshot(page);
    expect(state.instances[1].cacheClears).toBe(1);
    expect(state.instances[1].connected).toBe(false);
    expect(state.unhandled).toEqual([]);
  });
}
