import { BadGatewayException, BadRequestException } from '@nestjs/common';
import { z } from 'zod';

type Engine = (path: string, method?: string, body?: unknown) => Promise<unknown>;
const integration = z.object({
  _id: z.string().min(1),
  active: z.boolean(),
  primary: z.boolean().default(false),
});

function result(value: unknown) {
  const parsed = integration.safeParse(value);
  if (!parsed.success) throw new BadGatewayException('Invalid Novu integration response');
  return parsed.data;
}

export async function applyPrimary(
  engine: Engine,
  value: unknown,
  requested: boolean,
  channel: string,
) {
  let remote = result(value);
  // Novu has primary selection only for email/SMS. Other channels retain its state.
  if (requested && ['email', 'sms'].includes(channel) && !remote.primary)
    remote = result(
      await engine(`/v1/integrations/${encodeURIComponent(remote._id)}/set-primary`, 'POST'),
    );
  return remote;
}

export async function createEngineIntegration(
  engine: Engine,
  input: {
    identifier: string;
    name: string;
    provider: string;
    channel: string;
    credentials: Record<string, unknown>;
    active: boolean;
    primary: boolean;
    conditions?: unknown;
  },
) {
  if (input.primary && !input.active && ['email', 'sms'].includes(input.channel))
    throw new BadRequestException('A primary integration must be active');
  const body = {
    identifier: input.identifier,
    name: input.name,
    providerId: input.provider,
    channel: input.channel,
    credentials: input.credentials,
    active: input.active,
    conditions: input.conditions,
  };
  let existingId: string | undefined;
  if (input.channel === 'in_app' && input.provider === 'novu') {
    const environment = z
      .object({ _id: z.string().min(1) })
      .safeParse(await engine('/v1/environments/me'));
    const integrations = z
      .array(
        z.object({
          _id: z.string().min(1),
          _environmentId: z.string(),
          providerId: z.string(),
          channel: z.string(),
        }),
      )
      .safeParse(await engine('/v1/integrations'));
    if (!environment.success || !integrations.success)
      throw new BadGatewayException('Invalid Novu environment/integration response');
    existingId = integrations.data.find(
      (item) =>
        item._environmentId === environment.data._id &&
        item.channel === 'in_app' &&
        item.providerId === 'novu',
    )?._id;
  }
  const remote = existingId
    ? await engine(`/v1/integrations/${encodeURIComponent(existingId)}`, 'PUT', body)
    : await engine('/v1/integrations', 'POST', body);
  return applyPrimary(engine, remote, input.primary, input.channel);
}
