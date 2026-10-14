import { expect, it } from 'vitest';
import { clientAddressHeaders } from './client-address';

it('forwards only an explicitly enabled single IP from the ingress-owned header', () => {
  const headers = new Headers({
    'x-flare-client-ip': '203.0.113.10',
    'x-forwarded-for': '198.51.100.2, 198.51.100.3',
    'x-real-ip': '198.51.100.4',
  });
  expect(clientAddressHeaders(headers, false)).toEqual({});
  expect(clientAddressHeaders(headers, true)).toEqual({ 'x-forwarded-for': '203.0.113.10' });
  headers.delete('x-flare-client-ip');
  expect(clientAddressHeaders(headers, true)).toEqual({});
});

it('rejects chains, hostnames and malformed addresses while supporting IPv6', () => {
  for (const address of [
    '203.0.113.1, 203.0.113.2',
    'untrusted.test',
    '1.2.3.999',
    '[::1]',
    '::1%eth0',
  ])
    expect(clientAddressHeaders(new Headers({ 'x-flare-client-ip': address }), true)).toEqual({});
  expect(clientAddressHeaders(new Headers({ 'x-flare-client-ip': '2001:db8::1' }), true)).toEqual({
    'x-forwarded-for': '2001:db8::1',
  });
});
