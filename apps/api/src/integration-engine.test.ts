import { describe, expect, it, vi } from 'vitest';
import { applyPrimary, createEngineIntegration } from './integration-engine.js';

const input = {
  identifier: 'inbox',
  name: 'Inbox',
  provider: 'novu',
  channel: 'in_app',
  active: true,
  primary: true,
  credentials: {},
};

describe('pinned Novu integrations', () => {
  it('adopts only the current environment Inbox and never creates a second provider', async () => {
    const engine = vi.fn(async (path: string) => {
      if (path === '/v1/environments/me') return { _id: 'development' };
      if (path === '/v1/integrations')
        return [
          {
            _id: 'production-inbox',
            _environmentId: 'production',
            providerId: 'novu',
            channel: 'in_app',
          },
          {
            _id: 'development-inbox',
            _environmentId: 'development',
            providerId: 'novu',
            channel: 'in_app',
          },
        ];
      return { _id: 'development-inbox', active: true, primary: false };
    });
    expect(await createEngineIntegration(engine, input)).toEqual({
      _id: 'development-inbox',
      active: true,
      primary: false,
    });
    expect(engine.mock.calls.map(([path]) => path)).toEqual([
      '/v1/environments/me',
      '/v1/integrations',
      '/v1/integrations/development-inbox',
    ]);
    expect(engine).toHaveBeenLastCalledWith(
      '/v1/integrations/development-inbox',
      'PUT',
      expect.objectContaining({ identifier: 'inbox' }),
    );
  });
  it('creates an Inbox when only another environment has one', async () => {
    const engine = vi.fn(async (path: string, method?: string) => {
      if (path === '/v1/environments/me') return { _id: 'development' };
      if (method !== 'POST')
        return [
          { _id: 'other', _environmentId: 'production', providerId: 'novu', channel: 'in_app' },
        ];
      return { _id: 'new', active: true };
    });
    await createEngineIntegration(engine, input);
    expect(engine).toHaveBeenLastCalledWith('/v1/integrations', 'POST', expect.any(Object));
  });
  it('uses the native primary endpoint and persists the returned state', async () => {
    const engine = vi.fn(async () => ({ _id: 'smtp', active: true, primary: true }));
    expect(
      await applyPrimary(engine, { _id: 'smtp', active: true, primary: false }, true, 'email'),
    ).toEqual({ _id: 'smtp', active: true, primary: true });
    expect(engine).toHaveBeenCalledWith('/v1/integrations/smtp/set-primary', 'POST');
    engine.mockClear();
    expect(
      (await applyPrimary(engine, { _id: 'smtp', active: true, primary: true }, false, 'email'))
        .primary,
    ).toBe(true);
    expect(engine).not.toHaveBeenCalled();
  });
  it('rejects invalid upstream identity and inactive primary requests', async () => {
    const engine = vi.fn(async () => ({}));
    await expect(createEngineIntegration(engine, input)).rejects.toThrow('Invalid Novu');
    engine.mockClear();
    await expect(
      createEngineIntegration(engine, { ...input, channel: 'email', active: false }),
    ).rejects.toThrow('must be active');
    expect(engine).not.toHaveBeenCalled();
  });
});
