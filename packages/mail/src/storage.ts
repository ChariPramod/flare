import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import type { LookupFunction } from 'node:net';
import { Agent, request } from 'undici';
import ipaddr from 'ipaddr.js';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { MailError, mailLimits } from './validation.js';
import type { EmailInput } from './validation.js';

export function publicAddress(ip: string) {
  try {
    const value = ipaddr.process(ip);
    return value.range() === 'unicast';
  } catch {
    return false;
  }
}
export async function downloadAttachment(url: string, limit: number): Promise<Buffer> {
  const target = new URL(url);
  if (
    !['https:', 'http:'].includes(target.protocol) ||
    target.username ||
    target.password ||
    (target.port && !['80', '443'].includes(target.port))
  )
    throw new MailError(
      422,
      'Attachment URL must use HTTP(S) on a standard port without credentials',
    );
  const hostname = target.hostname.replace(/^\[|\]$/g, '');
  const addresses = isIP(hostname)
    ? [{ address: hostname, family: isIP(hostname) }]
    : await lookup(hostname, { all: true });
  if (!addresses.length || addresses.some((v) => !publicAddress(v.address)))
    throw new MailError(422, 'Attachment URL resolves to a non-public address');
  const pinnedLookup: LookupFunction = (_hostname, options, callback) => {
    const selected = addresses[0]!;
    if (options.all) callback(null, addresses);
    else callback(null, selected.address, selected.family);
  };
  const dispatcher = new Agent({ connect: { lookup: pinnedLookup, timeout: 5000 } });
  try {
    const response = await request(target, {
      dispatcher,
      signal: AbortSignal.timeout(15000),
      headersTimeout: 5000,
      bodyTimeout: 5000,
    });
    if (response.statusCode !== 200) {
      response.body.destroy();
      throw new MailError(422, 'Attachment URL did not return 200; redirects are forbidden');
    }
    if (Number(response.headers['content-length'] ?? 0) > limit) {
      response.body.destroy();
      throw new MailError(413, 'Attachment is too large');
    }
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of response.body) {
      const buffer = Buffer.from(chunk);
      size += buffer.length;
      if (size > limit) {
        response.body.destroy();
        throw new MailError(413, 'Combined attachments exceed the limit');
      }
      chunks.push(buffer);
    }
    return Buffer.concat(chunks);
  } finally {
    await dispatcher.close();
  }
}
export interface ObjectStore {
  put(key: string, body: Buffer, contentType: string): Promise<void>;
  get(key: string, limit: number): Promise<Buffer>;
  remove(key: string): Promise<void>;
}
export function objectStore(): ObjectStore {
  const client = new S3Client({
    endpoint: process.env.S3_ENDPOINT,
    region: process.env.S3_REGION ?? 'us-east-1',
    forcePathStyle: true,
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY ?? '',
      secretAccessKey: process.env.S3_SECRET_KEY ?? '',
    },
    maxAttempts: 3,
  });
  const Bucket = process.env.S3_BUCKET ?? 'flare';
  return {
    async put(Key, Body, ContentType) {
      await client.send(new PutObjectCommand({ Bucket, Key, Body, ContentType }), {
        abortSignal: AbortSignal.timeout(30_000),
      });
    },
    async get(Key, limit) {
      const result = await client.send(new GetObjectCommand({ Bucket, Key }), {
        abortSignal: AbortSignal.timeout(30_000),
      });
      if (!result.Body || (result.ContentLength ?? 0) > limit)
        throw new MailError(413, 'Stored MIME exceeds limit');
      const chunks: Buffer[] = [];
      let size = 0;
      for await (const chunk of result.Body as AsyncIterable<Uint8Array>) {
        const buffer = Buffer.from(chunk);
        size += buffer.length;
        if (size > limit) throw new MailError(413, 'Stored MIME exceeds limit');
        chunks.push(buffer);
      }
      return Buffer.concat(chunks);
    },
    async remove(Key) {
      await client.send(new DeleteObjectCommand({ Bucket, Key }), {
        abortSignal: AbortSignal.timeout(30_000),
      });
    },
  };
}
export async function attachments(input: EmailInput) {
  let remaining = mailLimits().attachments;
  const result = [];
  for (const item of input.attachments) {
    if (
      item.content !== undefined &&
      (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(item.content) ||
        item.content.length > Math.ceil(remaining / 3) * 4)
    )
      throw new MailError(422, 'Invalid or oversized base64 attachment');
    const content =
      item.content !== undefined
        ? Buffer.from(item.content, 'base64')
        : await downloadAttachment(item.path!, remaining);
    remaining -= content.length;
    if (remaining < 0) throw new MailError(413, 'Combined attachments exceed the limit');
    result.push({
      filename: item.filename,
      content,
      contentType: item.content_type,
      cid: item.content_id,
    });
  }
  return result;
}
