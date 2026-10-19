import { StreamableFile } from '@nestjs/common';
import type { Response } from 'express';

export function browserTransferDownload(
  bytes: Buffer,
  filename: string,
  contentType: string,
  res?: Response,
) {
  const name =
    Buffer.from(filename, 'utf8')
      .toString('utf8')
      .replace(/[\p{Cc}\p{Cf}\\/]/gu, '_')
      .slice(0, 180) || 'attachment';
  const ascii = name.replace(/[^\x20-\x7e]|["\\]/g, '_');
  const encoded = encodeURIComponent(Buffer.from(name, 'utf8').toString('utf8')).replace(
    /[!'()*]/g,
    (v) => `%${v.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  const type = /^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/i.test(contentType)
    ? contentType
    : 'application/octet-stream';
  res?.setHeader('Cache-Control', 'no-store');
  res?.setHeader('X-Content-Type-Options', 'nosniff');
  return new StreamableFile(bytes, {
    type,
    length: bytes.length,
    disposition: `attachment; filename="${ascii}"; filename*=UTF-8''${encoded}`,
  });
}
