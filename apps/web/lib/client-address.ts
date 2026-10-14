import { isIP } from 'node:net';

// Enable only behind an ingress that overwrites X-Flare-Client-IP, with the web
// container's exact address trusted by the API. Never relay caller-provided XFF.
export function clientAddressHeaders(
  headers: { get(name: string): string | null },
  enabled: boolean,
): Record<string, string> {
  const address = enabled ? headers.get('x-flare-client-ip') : null;
  if (!address || address.length > 45 || address.includes('%') || !isIP(address)) return {};
  return { 'x-forwarded-for': address };
}
