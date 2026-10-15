import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import nodemailer from 'nodemailer';
import { createRelay } from '../src/server.js';
import type { RelayDependencies } from '../src/server.js';

export async function startRelayFixture(
  dependencies: Pick<RelayDependencies, 'authenticate' | 'submit'>,
) {
  const directory = mkdtempSync(join(tmpdir(), 'flare-policy-relay-'));
  let relay: ReturnType<typeof createRelay> | undefined;
  try {
    execFileSync(
      'openssl',
      [
        'req',
        '-x509',
        '-newkey',
        'rsa:2048',
        '-nodes',
        '-keyout',
        join(directory, 'key.pem'),
        '-out',
        join(directory, 'cert.pem'),
        '-days',
        '1',
        '-subj',
        '/CN=localhost',
        '-addext',
        'subjectAltName=DNS:localhost',
      ],
      { stdio: 'ignore' },
    );
    const ca = readFileSync(join(directory, 'cert.pem'));
    relay = createRelay({
      ...dependencies,
      cert: ca,
      key: readFileSync(join(directory, 'key.pem')),
    });
    const server = relay;
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', () => {
        server.removeListener('error', reject);
        resolve();
      });
    });
    const address = relay.server.address();
    if (!address || typeof address === 'string') throw new Error('Missing relay listener');
    const port = address.port;
    return {
      async send(token: string, mail: nodemailer.SendMailOptions) {
        const client = nodemailer.createTransport({
          host: '127.0.0.1',
          port,
          secure: false,
          requireTLS: true,
          auth: { user: 'flare', pass: token },
          tls: { ca, servername: 'localhost' },
          connectionTimeout: 5000,
          greetingTimeout: 5000,
          socketTimeout: 10000,
        });
        try {
          return await client.sendMail(mail);
        } finally {
          client.close();
        }
      },
      async close() {
        await new Promise<void>((resolve) => server.close(resolve));
        rmSync(directory, { recursive: true, force: true });
      },
    };
  } catch (error) {
    relay?.close();
    rmSync(directory, { recursive: true, force: true });
    throw error;
  }
}
