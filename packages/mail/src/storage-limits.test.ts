import { PassThrough, Readable } from 'node:stream';
import { afterEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ send: vi.fn() }));
vi.mock('@aws-sdk/client-s3', async (original) => ({
  ...(await original<object>()),
  S3Client: class {
    send = mocks.send;
  },
}));
import { attachments, objectStore } from './storage.js';
import { emailSchema } from './validation.js';
afterEach(() => {
  mocks.send.mockReset();
});

it('closes an oversized stored-object stream before reading any bytes', async () => {
  const body = new PassThrough();
  body.write(Buffer.from('still arriving'));
  const iterator = vi.spyOn(body, Symbol.asyncIterator);
  mocks.send.mockResolvedValue({ Body: body, ContentLength: 1024 });
  await expect(objectStore().get('fixture', 10)).rejects.toMatchObject({ status: 413 });
  expect(iterator).not.toHaveBeenCalled();
  expect(body.destroyed).toBe(true);
});

it('bounds actual stored bytes when the declared size is missing or inaccurate', async () => {
  for (const length of [undefined, 1]) {
    const body = Readable.from([Buffer.from('12345'), Buffer.from('67890')]);
    mocks.send.mockResolvedValue({ Body: body, ContentLength: length });
    await expect(objectStore().get('fixture', 6)).rejects.toMatchObject({ status: 413 });
    expect(body.destroyed).toBe(true);
  }
});

it('closes a failed response and preserves its transport error', async () => {
  const failure = new Error('Interrupted object download');
  const body = Readable.from(
    (async function* () {
      yield Buffer.from('ok');
      throw failure;
    })(),
  );
  mocks.send.mockResolvedValue({ Body: body });
  await expect(objectStore().get('fixture', 10)).rejects.toBe(failure);
  expect(body.destroyed).toBe(true);
});

it('accepts an exact-limit object and rejects invalid limits before an S3 request', async () => {
  const body = Readable.from([Buffer.from('hello')]);
  mocks.send.mockResolvedValue({ Body: body, ContentLength: 5 });
  await expect(objectStore().get('fixture', 5)).resolves.toEqual(Buffer.from('hello'));
  mocks.send.mockClear();
  for (const limit of [NaN, Infinity, -1, 0.5, Number.MAX_SAFE_INTEGER + 1])
    await expect(objectStore().get('fixture', limit)).rejects.toMatchObject({ status: 422 });
  expect(mocks.send).not.toHaveBeenCalled();
});

it('accepts large outgoing base64 attachments up to the unchanged decoded limit without a regex stack overflow', async () => {
  const bytes = Buffer.alloc(10 * 1024 * 1024, 0x71);
  const input = emailSchema.parse({
    from: 'sender@example.test',
    to: ['reader@example.net'],
    subject: 'Large attachment',
    text: 'Fixture',
    attachments: [{ filename: 'large.bin', content: bytes.toString('base64') }],
  });
  const decoded = await attachments(input);
  expect(decoded[0]!.content.equals(bytes)).toBe(true);
  await expect(
    attachments({
      ...input,
      attachments: [...input.attachments, { filename: 'extra.bin', content: 'YQ==' }],
    }),
  ).rejects.toMatchObject({ status: 422 });
  await expect(
    attachments({
      ...input,
      attachments: [
        { ...input.attachments[0]!, content: `${input.attachments[0]!.content!.slice(0, -4)}!===` },
      ],
    }),
  ).rejects.toMatchObject({ status: 422 });
});
