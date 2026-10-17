import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { lstat, open, readFile, rm } from 'node:fs/promises';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';

const MAGIC = Buffer.from('FLAREBK1');
export const MAX_ARTIFACT_BYTES = 1024 ** 4;
const fail = (message) => {
  throw new Error(message);
};

export async function readKey(path) {
  const info = await lstat(path);
  if (
    !info.isFile() ||
    info.isSymbolicLink() ||
    info.uid !== process.getuid() ||
    (info.mode & 0o077) !== 0 ||
    info.size !== 32
  )
    fail('Backup key must be an existing owner-only regular 32-byte file owned by this user');
  return readFile(path);
}

export async function fingerprint(path) {
  const hash = createHash('sha256');
  let size = 0;
  for await (const chunk of createReadStream(path)) {
    size += chunk.length;
    if (size > MAX_ARTIFACT_BYTES) fail('Artifact exceeds bounded size');
    hash.update(chunk);
  }
  return { size, sha256: hash.digest('hex') };
}

export async function encryptFile(source, destination, key, name) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(Buffer.from(`flare-backup-v1:${name}`));
  const file = await open(destination, 'wx', 0o600);
  await file.write(Buffer.concat([MAGIC, iv]));
  await file.close();
  try {
    await pipeline(
      createReadStream(source),
      cipher,
      createWriteStream(destination, { flags: 'a' }),
    );
    const append = await open(destination, 'a');
    try {
      await append.write(cipher.getAuthTag());
      await append.sync();
    } finally {
      await append.close();
    }
    return await fingerprint(source);
  } catch (error) {
    await rm(destination, { force: true });
    throw error;
  }
}

export async function decryptFile(source, destination, key, name) {
  const info = await lstat(source);
  if (
    !info.isFile() ||
    info.isSymbolicLink() ||
    info.size < 36 ||
    info.size > MAX_ARTIFACT_BYTES + 36
  )
    fail('Invalid encrypted artifact');
  const file = await open(source, 'r');
  const header = Buffer.alloc(20);
  const tag = Buffer.alloc(16);
  try {
    await file.read(header, 0, 20, 0);
    await file.read(tag, 0, 16, info.size - 16);
  } finally {
    await file.close();
  }
  if (!header.subarray(0, 8).equals(MAGIC)) fail('Unsupported encrypted artifact');
  const decipher = createDecipheriv('aes-256-gcm', key, header.subarray(8));
  decipher.setAAD(Buffer.from(`flare-backup-v1:${name}`));
  decipher.setAuthTag(tag);
  const destinationFile = await open(destination, 'wx', 0o600);
  await destinationFile.close();
  try {
    const input =
      info.size === 36 ? [] : createReadStream(source, { start: 20, end: info.size - 17 });
    await pipeline(input, decipher, createWriteStream(destination, { flags: 'w', mode: 0o600 }));
    return await fingerprint(destination);
  } catch {
    await rm(destination, { force: true });
    const error = new Error('Backup authentication failed; nothing was restored');
    error.code = 'authentication-failed';
    throw error;
  }
}

function octal(buffer) {
  const text = buffer.toString('ascii').replace(/\0.*$/s, '').trim();
  if (!/^[0-7]+$/.test(text)) fail('Unsupported archive number');
  const number = Number.parseInt(text, 8);
  if (!Number.isSafeInteger(number) || number < 0 || number > MAX_ARTIFACT_BYTES)
    fail('Invalid archive number');
  return number;
}
function safePath(value) {
  const path = value.replace(/^\.\//, '').replace(/\/$/, '');
  if (path === '' || path === '.') return '';
  if (
    path.length > 4096 ||
    path.startsWith('/') ||
    path.includes('\\') ||
    path.includes('\0') ||
    [...path].some(
      (character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127,
    ) ||
    path.split('/').some((part) => !part || part === '.' || part === '..')
  )
    fail('Unsafe archive member path');
  return path;
}

// The pinned Alpine helper writes POSIX/BusyBox TAR, with GNU long-name entries.
// Reject links, devices, sockets and unsupported extensions before extracting into an empty volume.
export async function validateTar(path) {
  const members = new Set(),
    files = new Set(),
    requiredDirectories = new Set();
  let pending = Buffer.alloc(0),
    remaining = 0,
    longName = null,
    capture = false,
    captured = [],
    count = 0,
    ended = false,
    zeros = 0;
  const inspector = new Transform({
    transform(chunk, _encoding, callback) {
      try {
        pending = Buffer.concat([pending, chunk]);
        while (pending.length >= 512) {
          const block = pending.subarray(0, 512);
          pending = pending.subarray(512);
          if (remaining > 0) {
            if (capture) captured.push(block.subarray(0, Math.min(remaining, 512)));
            remaining -= Math.min(remaining, 512);
            if (remaining === 0 && capture) {
              longName = Buffer.concat(captured).toString('utf8').replace(/\0.*$/s, '');
              if (!longName) fail('Empty long archive name');
              safePath(longName);
              capture = false;
              captured = [];
            }
            continue;
          }
          if (block.every((byte) => byte === 0)) {
            zeros++;
            if (zeros >= 2) ended = true;
            continue;
          }
          if (ended || zeros) fail('Unexpected archive data after end marker');
          if (++count > 1_000_000) fail('Too many archive members');
          const sum = block.reduce(
            (total, byte, index) => total + (index >= 148 && index < 156 ? 32 : byte),
            0,
          );
          if (sum !== octal(block.subarray(148, 156))) fail('Invalid archive header checksum');
          const type = String.fromCharCode(block[156]);
          const size = octal(block.subarray(124, 136));
          const name = block.subarray(0, 100).toString('utf8').replace(/\0.*$/s, '');
          const prefix = block.subarray(345, 500).toString('utf8').replace(/\0.*$/s, '');
          if (type === 'L') {
            if (longName !== null || size < 1 || size > 8192) fail('Invalid long archive name');
            capture = true;
            remaining = size;
            continue;
          }
          if (!['0', '\0', '5'].includes(type))
            fail('Archive links, special files and extensions are forbidden');
          if (!name) fail('Empty archive member name');
          safePath(prefix ? `${prefix}/${name}` : name);
          const member = safePath(longName ?? (prefix ? `${prefix}/${name}` : name));
          longName = null;
          if (type === '5' && size !== 0) fail('Directory archive data is forbidden');
          if (members.has(member)) fail('Duplicate archive member');
          if (type !== '5' && (!member || requiredDirectories.has(member)))
            fail('Conflicting archive file and directory');
          const components = member.split('/');
          for (let index = 1; index < components.length; index++) {
            const parent = components.slice(0, index).join('/');
            if (files.has(parent)) fail('Conflicting archive file ancestor');
            requiredDirectories.add(parent);
          }
          members.add(member);
          if (type !== '5') files.add(member);
          remaining = size;
        }
        callback();
      } catch (error) {
        callback(error);
      }
    },
  });
  await pipeline(createReadStream(path), inspector);
  if (pending.length || remaining || longName !== null || !ended) fail('Truncated archive');
}
