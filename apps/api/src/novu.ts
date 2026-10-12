import { BadGatewayException, ServiceUnavailableException } from '@nestjs/common';
import { withTenant } from '@flare/db';
import { decrypt } from '@flare/shared';
import type { Tenant } from '@flare/shared';
import { config, sql } from './context.js';
export async function novuKey(tenant: Tenant) {
  const [environment] = await withTenant(
    sql,
    tenant,
    (tx) => tx`select novu_key_cipher from environments where id = ${tenant.environmentId}`,
  );
  if (!environment?.novu_key_cipher)
    throw new ServiceUnavailableException('Configure this environment’s Novu API key');
  return decrypt(
    String(environment.novu_key_cipher),
    config.FLARE_ENCRYPTION_KEY,
    `${tenant.orgId}/${tenant.environmentId}`,
  );
}
export async function novu(
  tenant: Tenant,
  path: string,
  method = 'GET',
  body?: unknown,
  idempotencyKey?: string,
): Promise<unknown> {
  const secret = await novuKey(tenant);
  let response: Response;
  try {
    response = await fetch(`${process.env.NOVU_API_URL ?? 'http://novu-api:3000'}${path}`, {
      method,
      headers: {
        Authorization: `ApiKey ${secret}`,
        'Content-Type': 'application/json',
        ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
      redirect: 'error',
    });
  } catch {
    throw new BadGatewayException('Novu is unavailable');
  }
  if (!response.ok)
    throw new BadGatewayException({
      message: 'Novu rejected the request',
      upstream_status: response.status,
    });
  if (response.status === 204) return { success: true };
  const json = (await response.json()) as { data?: unknown };
  return json.data ?? json;
}
