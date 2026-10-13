/** Verify the original UTF-8 body before JSON parsing. Compatible with Svix headers. */
export async function verifyWebhook(
  secret: string,
  body: string,
  headers: Record<string, string>,
  options: { now?: number; tolerance?: number } = {},
) {
  const values = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
  const id = values['svix-id'],
    stamp = values['svix-timestamp'],
    signatures = values['svix-signature'];
  const now = options.now ?? Math.floor(Date.now() / 1000),
    tolerance = options.tolerance ?? 300;
  if (
    !id ||
    !stamp ||
    !/^\d+$/.test(stamp) ||
    !signatures ||
    Math.abs(now - Number(stamp)) > tolerance
  )
    throw new Error('Invalid or expired webhook signature');
  const encoded = secret.replace(/^whsec_/, '');
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) throw new Error('Invalid webhook secret');
  const key = await crypto.subtle.importKey(
    'raw',
    Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0)),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify'],
  );
  const message = new TextEncoder().encode(`${id}.${stamp}.${body}`);
  for (const entry of signatures.split(/\s+/)) {
    const [version, value] = entry.split(',');
    if (version !== 'v1' || !value || !/^[A-Za-z0-9+/]+={0,2}$/.test(value)) continue;
    try {
      if (
        await crypto.subtle.verify(
          'HMAC',
          key,
          Uint8Array.from(atob(value), (c) => c.charCodeAt(0)),
          message,
        )
      )
        return JSON.parse(body) as unknown;
    } catch {
      /* Continue across rotating signatures. */
    }
  }
  throw new Error('Invalid webhook signature');
}
