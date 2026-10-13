import nodemailer from 'nodemailer';
import type { EmailInput } from './validation.js';
import { address, mailLimits, MailError } from './validation.js';
import { trackHtml } from './tracking.js';
import { attachments } from './storage.js';
export interface SigningDomain {
  name: string;
  dkim_selector: string;
  privateKey: string;
  open_tracking: boolean;
  click_tracking: boolean;
  trackingUrl: string;
}
export async function buildMime(input: EmailInput, id: string, domain: SigningDomain, key: string) {
  const files = await attachments(input);
  const transport = nodemailer.createTransport({
    streamTransport: true,
    buffer: true,
    newline: 'windows',
  });
  const result = await transport.sendMail({
    from: input.from,
    to: input.to,
    cc: input.cc,
    replyTo: input.reply_to,
    subject: input.subject,
    text: input.text,
    html:
      input.html === undefined
        ? undefined
        : trackHtml(input.html, {
            id,
            open: domain.open_tracking,
            click: domain.click_tracking,
            baseUrl: domain.trackingUrl,
            key,
          }),
    headers: input.headers,
    attachments: files,
    messageId: `<${id}@${domain.name}>`,
    date: new Date(),
    envelope: { from: address(input.from), to: input.to.map(address) }, // Bcc exists only in the persisted envelope, never the MIME headers.
    // SES replaces these two headers. Excluding them preserves the same DKIM
    // signature when the signed MIME is retried on a different transport.
    dkim: {
      domainName: domain.name,
      keySelector: domain.dkim_selector,
      privateKey: domain.privateKey,
      cacheDir: false,
      skipFields: 'message-id:date',
      headerFieldNames:
        'From:Sender:Reply-To:Subject:To:Cc:MIME-Version:Content-Type:Content-Transfer-Encoding:Content-ID:Content-Description:In-Reply-To:References:List-Id:List-Help:List-Unsubscribe:List-Unsubscribe-Post:List-Subscribe:List-Post:List-Owner:List-Archive',
    },
    disableFileAccess: true,
    disableUrlAccess: true,
  });
  const raw = Buffer.from(result.message as Buffer);
  if (raw.length > mailLimits().mime)
    throw new MailError(413, 'Final MIME exceeds the configured size limit');
  return { raw, files };
}
