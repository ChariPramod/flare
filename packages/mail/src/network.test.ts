import { generateKeyPairSync, sign } from 'node:crypto';
import { afterEach, describe, it, expect, vi } from 'vitest';
const network = vi.hoisted(() => ({
  lookup: vi.fn(),
  request: vi.fn(),
  agentOptions: undefined as unknown,
  close: vi.fn(),
}));
vi.mock('node:dns/promises', () => ({ lookup: network.lookup }));
vi.mock('undici', () => ({
  Agent: class {
    constructor(options: unknown) {
      network.agentOptions = options;
    }
    close = network.close;
  },
  request: network.request,
}));
import { downloadAttachment } from './storage.js';
import { verifySns, snsCanonical } from './events.js';
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  network.lookup.mockReset();
  network.request.mockReset();
});
describe('attachment DNS pinning', () => {
  it('pins the validated DNS result without a second lookup', async () => {
    network.lookup
      .mockResolvedValueOnce([{ address: '1.1.1.1', family: 4 }])
      .mockResolvedValueOnce([{ address: '127.0.0.1', family: 4 }]);
    network.request.mockResolvedValue({
      statusCode: 200,
      headers: {},
      body: (async function* () {
        yield Buffer.from('hello');
      })(),
    });
    expect((await downloadAttachment('https://files.example.com/a', 100)).toString()).toBe('hello');
    const pinned = network.agentOptions as {
      connect: {
        lookup: (
          host: string,
          options: object,
          callback: (error: unknown, address: unknown) => void,
        ) => void;
      };
    };
    const callback = vi.fn();
    pinned.connect.lookup('files.example.com', {}, callback);
    expect(callback).toHaveBeenCalledWith(null, '1.1.1.1', 4);
    expect(network.lookup).toHaveBeenCalledTimes(1);
  });
  it('rejects mixed public/private DNS answers and never follows redirects', async () => {
    network.lookup.mockResolvedValue([
      { address: '1.1.1.1', family: 4 },
      { address: '10.0.0.1', family: 4 },
    ]);
    await expect(downloadAttachment('https://files.example.com/a', 100)).rejects.toThrow(
      'non-public',
    );
    expect(network.request).not.toHaveBeenCalled();
    network.lookup.mockResolvedValue([{ address: '1.1.1.1', family: 4 }]);
    const destroy = vi.fn();
    network.request.mockResolvedValue({
      statusCode: 302,
      headers: { location: 'http://127.0.0.1/' },
      body: { destroy },
    });
    await expect(downloadAttachment('https://files.example.com/a', 100)).rejects.toThrow(
      'redirects',
    );
    expect(network.request).toHaveBeenCalledTimes(1);
    expect(destroy).toHaveBeenCalled();
  });
});
describe('SNS trust and integrity', () => {
  const pair = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { format: 'pem', type: 'spki' },
    privateKeyEncoding: { format: 'pem', type: 'pkcs8' },
  });
  const base = {
    Type: 'Notification' as const,
    Message: '{"notificationType":"Delivery"}',
    MessageId: 'example-id',
    TopicArn: 'arn:aws:sns:us-east-1:123456789012:ses',
    Timestamp: '2026-10-12T12:00:00Z',
    SignatureVersion: '2' as const,
    Signature: '',
    SigningCertURL: 'https://sns.us-east-1.amazonaws.com/SimpleNotificationService-example.pem',
  };
  it('accepts a valid signature and rejects modified payloads, topics, and certificate URLs', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(pair.publicKey));
    vi.stubGlobal('fetch', fetcher);
    const signed = {
      ...base,
      Signature: sign('RSA-SHA256', Buffer.from(snsCanonical(base)), pair.privateKey).toString(
        'base64',
      ),
    };
    await expect(verifySns(signed, [base.TopicArn])).resolves.toBeUndefined();
    fetcher.mockResolvedValue(new Response(pair.publicKey));
    await expect(verifySns({ ...signed, Message: 'tampered' }, [base.TopicArn])).rejects.toThrow(
      'signature',
    );
    await expect(verifySns(signed, [])).rejects.toThrow('topic');
    await expect(
      verifySns(
        { ...signed, SigningCertURL: 'https://sns.us-east-1.amazonaws.com.evil.example/key.pem' },
        [base.TopicArn],
      ),
    ).rejects.toThrow('certificate URL');
    await expect(
      verifySns({ ...signed, SigningCertURL: 'http://127.0.0.1/key.pem' }, [base.TopicArn]),
    ).rejects.toThrow('certificate URL');
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});
