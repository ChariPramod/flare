import { SMTPServer } from 'smtp-server';
import { simpleParser } from 'mailparser';
import type { AddressObject } from 'mailparser';
import { address, mailLimits, MailError } from '@flare/mail';
import type { Principal } from '@flare/shared';
export interface RelayDependencies {
  cert: Buffer;
  key: Buffer;
  authenticate(token: string): Promise<Principal>;
  submit(
    principal: Principal,
    input: unknown,
    headers: { to: string[]; cc: string[] },
  ): Promise<string>;
}
function smtpError(message: string, responseCode: number) {
  return Object.assign(new Error(message), { responseCode });
}
function visible(header: AddressObject | AddressObject[] | undefined): string[] {
  return (Array.isArray(header) ? header : header ? [header] : []).flatMap((v) =>
    v.value.flatMap((a) =>
      a.address ? [a.name ? `${a.name.replace(/[<>\r\n]/g, '')} <${a.address}>` : a.address] : [],
    ),
  );
}
export function createRelay(deps: RelayDependencies) {
  const credentials = new Map<string, string>();
  return new SMTPServer({
    name: 'flare-smtp-relay',
    banner: 'Flare authenticated submission',
    secure: false,
    cert: deps.cert,
    key: deps.key,
    minVersion: 'TLSv1.2',
    authOptional: false,
    allowInsecureAuth: false,
    authMethods: ['PLAIN', 'LOGIN'],
    size: mailLimits().mime,
    maxClients: 100,
    socketTimeout: 60_000,
    logger: false,
    onAuth(auth, session, callback) {
      if (!session.secure || !auth.password || auth.password.length > 256)
        return callback(smtpError('Authentication required over STARTTLS', 535));
      const token = auth.password;
      void deps.authenticate(token).then(
        (p) => {
          credentials.set(session.id, token);
          callback(null, { user: p.actorId });
        },
        () => callback(smtpError('Invalid API key', 535)),
      );
    },
    onRcptTo(_recipient, session, callback) {
      callback(
        session.envelope.rcptTo.length >= 50
          ? smtpError('Maximum 50 envelope recipients', 452)
          : undefined,
      );
    },
    onData(stream, session, callback) {
      const chunks: Buffer[] = [];
      let size = 0;
      stream.on('data', (chunk: Buffer) => {
        size += chunk.length;
        if (size <= mailLimits().mime) chunks.push(chunk);
      });
      stream.once('error', () => callback(smtpError('Unable to read message', 451)));
      stream.once('end', () => {
        void (async () => {
          if (stream.sizeExceeded || size > mailLimits().mime)
            throw new MailError(413, 'MIME exceeds the configured limit');
          const token = credentials.get(session.id);
          if (!token) throw new MailError(401, 'Authenticate before sending');
          const principal = await deps.authenticate(token); // Revocations also apply to already-open connections.
          const parsed = await simpleParser(Buffer.concat(chunks), {
            skipHtmlToText: true,
            skipTextToHtml: true,
            skipImageLinks: true,
            maxHtmlLengthToParse: 2_000_000,
          });
          const from = visible(parsed.from);
          if (from.length !== 1) throw new MailError(422, 'Exactly one From address is required');
          if (
            !session.envelope.mailFrom ||
            address(session.envelope.mailFrom.address) !== address(from[0]!)
          )
            throw new MailError(422, 'Envelope sender must match the From header');
          const to = session.envelope.rcptTo.map((v) => address(v.address));
          if (!to.length || to.length > 50)
            throw new MailError(422, 'Supply 1–50 envelope recipients');
          if (parsed.attachments.reduce((sum, a) => sum + a.size, 0) > mailLimits().attachments)
            throw new MailError(413, 'Combined attachments exceed the configured limit');
          const id = await deps.submit(
            principal,
            {
              from: from[0],
              to,
              reply_to: visible(parsed.replyTo).length ? visible(parsed.replyTo) : undefined,
              subject: parsed.subject ?? '',
              html: typeof parsed.html === 'string' ? parsed.html : undefined,
              text: parsed.text ?? '',
              attachments: parsed.attachments.map((a) => ({
                filename: a.filename ?? 'attachment',
                content: a.content.toString('base64'),
                content_type: a.contentType,
                content_id: a.cid || undefined,
              })),
            },
            { to: visible(parsed.to), cc: visible(parsed.cc) },
          );
          callback(null, `Accepted ${id}`);
        })().catch((error: unknown) =>
          callback(
            smtpError(
              error instanceof MailError ? error.message : 'Temporary submission failure',
              error instanceof MailError && error.status < 500 ? 550 : 451,
            ),
          ),
        );
      });
    },
    onClose(session) {
      credentials.delete(session.id);
    },
  });
}
