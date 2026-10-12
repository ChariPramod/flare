import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  scrypt,
  timingSafeEqual,
} from 'node:crypto';

export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');
export function createApiKey() {
  const token = `fl_${randomBytes(32).toString('base64url')}`;
  return { token, hash: hashToken(token), prefix: token.slice(0, 11) };
}
export function encrypt(value: string, key: string, scope: string): string {
  const bytes = Buffer.from(key, 'base64');
  if (bytes.length !== 32) throw new Error('Encryption key must be 32 bytes');
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', bytes, iv);
  cipher.setAAD(Buffer.from(scope));
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return [
    'v1',
    iv.toString('base64url'),
    cipher.getAuthTag().toString('base64url'),
    encrypted.toString('base64url'),
  ].join('.');
}
export function decrypt(value: string, key: string, scope: string): string {
  const [version, iv, tag, data] = value.split('.');
  if (version !== 'v1' || !iv || !tag || !data) throw new Error('Invalid encrypted value');
  const cipher = createDecipheriv(
    'aes-256-gcm',
    Buffer.from(key, 'base64'),
    Buffer.from(iv, 'base64url'),
  );
  cipher.setAAD(Buffer.from(scope));
  cipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([cipher.update(Buffer.from(data, 'base64url')), cipher.final()]).toString(
    'utf8',
  );
}
const derive = (password: string, salt: Buffer) =>
  new Promise<Buffer>((resolve, reject) =>
    scrypt(password, salt, 64, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }, (error, key) =>
      error ? reject(error) : resolve(key),
    ),
  );
export async function hashPassword(password: string): Promise<string> {
  if (password.length < 12 || password.length > 256)
    throw new Error('Password must contain 12–256 characters');
  const salt = randomBytes(16);
  return `scrypt:${salt.toString('hex')}:${(await derive(password, salt)).toString('hex')}`;
}
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [algorithm, salt, hash] = stored.split(':');
  if (algorithm !== 'scrypt' || !salt || !hash || password.length > 256) return false;
  const expected = Buffer.from(hash, 'hex');
  const actual = await derive(password, Buffer.from(salt, 'hex'));
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
export function newTotpSecret(): string {
  const bytes = randomBytes(20);
  let bits = '';
  for (const byte of bytes) bits += byte.toString(2).padStart(8, '0');
  return bits
    .match(/.{5}/g)!
    .map((chunk) => alphabet[parseInt(chunk, 2)])
    .join('');
}
export function totp(secret: string, counter: number): string {
  const bits = [...secret]
    .map((character) => {
      const index = alphabet.indexOf(character);
      if (index < 0) throw new Error('Invalid TOTP secret');
      return index.toString(2).padStart(5, '0');
    })
    .join('');
  const key = Buffer.from(bits.match(/.{8}/g)!.map((byte) => parseInt(byte, 2)));
  const time = Buffer.alloc(8);
  time.writeBigUInt64BE(BigInt(counter));
  const hash = createHmac('sha1', key).update(time).digest();
  const offset = hash[hash.length - 1]! & 15;
  return ((hash.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).toString().padStart(6, '0');
}
export function verifyTotp(
  secret: string,
  code: string,
  lastCounter = -1,
  now = Date.now(),
): number | null {
  if (!/^\d{6}$/.test(code)) return null;
  const counter = Math.floor(now / 30_000);
  for (const delta of [-1, 0, 1]) {
    const candidate = counter + delta;
    if (
      candidate > lastCounter &&
      timingSafeEqual(Buffer.from(code), Buffer.from(totp(secret, candidate)))
    )
      return candidate;
  }
  return null;
}
