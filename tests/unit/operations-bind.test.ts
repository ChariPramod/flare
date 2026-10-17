import { expect, it } from 'vitest';
import { allowedBind } from '../../scripts/operations/backup.mjs';

const root = '/private/var/fixture';
const source = `${root}/ops/postal/config`;
const definition = { volumes: [{ type: 'bind', source, target: '/source', read_only: true }] };
const mount = { Source: source, Destination: '/source', RW: false };
it('accepts only the declared private mount with its exact access and destination', () => {
  expect(allowedBind(root, 'local', mount, definition, {})).toBe(true);
  expect(allowedBind(root, 'local', { ...mount, RW: true }, definition, {})).toBe(false);
  expect(allowedBind(root, 'local', { ...mount, Destination: '/elsewhere' }, definition, {})).toBe(
    false,
  );
  expect(allowedBind(root, 'local', mount, { volumes: [] }, {})).toBe(false);
});
it('maps Desktop VM paths only when the host path exactly matches the reviewed declaration', () => {
  const desktopMount = { ...mount, Source: `/host_mnt${source}` };
  expect(allowedBind(root, 'local', desktopMount, definition, { desktop: true })).toBe(true);
  expect(allowedBind(root, 'local', desktopMount, definition, { desktop: false })).toBe(false);
  expect(
    allowedBind(
      root,
      'local',
      { ...desktopMount, Source: `${desktopMount.Source}/other` },
      definition,
      { desktop: true },
    ),
  ).toBe(false);
  expect(
    allowedBind(
      root,
      'local',
      { ...desktopMount, Source: `/host_mnt${root}/../fixture/ops/postal/config` },
      definition,
      { desktop: true },
    ),
  ).toBe(false);
});
it('does not expand writable fixture mounts into ordinary deployments', () => {
  const fixtureMount = { Source: `${root}/acceptance`, Destination: '/acceptance', RW: true };
  const fixtureDefinition = {
    volumes: [
      { type: 'bind', source: fixtureMount.Source, target: '/acceptance', read_only: false },
    ],
  };
  expect(allowedBind(root, 'acceptance', fixtureMount, fixtureDefinition, {})).toBe(true);
  expect(allowedBind(root, 'staging', fixtureMount, fixtureDefinition, {})).toBe(false);
});
