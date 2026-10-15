import nodemailer from 'nodemailer';
import { SESv2Client, SendEmailCommand, GetConfigurationSetCommand } from '@aws-sdk/client-sesv2';
import { z } from 'zod';
import { parseNamedTransports, transportInstanceIdentity } from './routes.js';
import type { TransportInstanceIdentity } from './routes.js';
export interface Delivery {
  raw: Buffer;
  from: string;
  to: string[];
  requireTls: boolean;
}
export interface Acceptance {
  ids: Record<string, string>;
  accepted: string[];
  rejected: string[];
  retryableRejected?: string[];
  diagnostics?: TransportDiagnostics;
}
export interface TransportDiagnostics {
  classification: 'transient_refusal' | 'permanent_refusal' | 'acceptance_unknown';
  http_status?: number;
  smtp_status?: number;
  error_code?: string;
  retry_after_seconds?: number;
}
export interface TransportAdapter {
  name: string;
  instance?: TransportInstanceIdentity;
  sandbox?: boolean;
  supportsRequiredTls(): Promise<boolean>;
  send(message: Delivery): Promise<Acceptance>;
}
export class TransportError extends Error {
  constructor(
    message: string,
    public kind: 'transient' | 'permanent' | 'ambiguous',
    public diagnostics: TransportDiagnostics = {
      classification:
        kind === 'transient'
          ? 'transient_refusal'
          : kind === 'permanent'
            ? 'permanent_refusal'
            : 'acceptance_unknown',
    },
  ) {
    super(message);
  }
}
export function transportError(error: unknown): TransportError {
  if (error instanceof TransportError) return error;
  const detail = error as {
    code?: string;
    responseCode?: number;
    $metadata?: { httpStatusCode?: number };
    name?: string;
    cause?: { code?: string };
    $response?: { headers?: Record<string, string> };
  };
  const status = detail?.responseCode ?? detail?.$metadata?.httpStatusCode;
  const code = detail?.code ?? detail?.cause?.code ?? detail?.name ?? '';
  // A lost connection after DATA/request upload cannot prove whether the provider accepted it.
  const kind = ['ThrottlingException', 'TooManyRequestsException'].includes(code)
    ? 'transient'
    : status
      ? detail.responseCode
        ? status >= 400 && status < 500
          ? 'transient'
          : status >= 500 && status < 600
            ? 'permanent'
            : 'ambiguous'
        : status === 429
          ? 'transient'
          : status >= 400 && status < 500 && ![408, 409].includes(status)
            ? 'permanent'
            : 'ambiguous'
      : ['ECONNREFUSED', 'ENOTFOUND', 'EAI_AGAIN'].includes(code)
        ? 'transient'
        : 'ambiguous';
  return new TransportError(
    `Transport ${/^[A-Za-z0-9_-]{1,80}$/.test(code) ? code : 'failure'}${status ? ` (${status})` : ''}`,
    kind,
    {
      classification:
        kind === 'transient'
          ? 'transient_refusal'
          : kind === 'permanent'
            ? 'permanent_refusal'
            : 'acceptance_unknown',
      ...(status ? { [detail.responseCode ? 'smtp_status' : 'http_status']: status } : {}),
      ...(/^[A-Za-z0-9_-]{1,80}$/.test(code) ? { error_code: code } : {}),
      ...(kind === 'transient'
        ? { retry_after_seconds: retryAfterSeconds(detail.$response?.headers?.['retry-after']) }
        : {}),
    },
  );
}
export function retryAfterSeconds(value?: string | null, now = Date.now()) {
  if (!value) return 0;
  const seconds = /^\d+$/.test(value.trim()) ? Number(value) : (Date.parse(value) - now) / 1000;
  return Number.isFinite(seconds) ? Math.min(86400, Math.max(0, Math.ceil(seconds))) : 0;
}
export class PostalAdapter implements TransportAdapter {
  name = 'postal';
  constructor(
    private url: string,
    private key: string,
  ) {}
  async supportsRequiredTls() {
    return false;
  } // Postal 3.3.7 raw API has no per-message mandatory outbound TLS option.
  async send(message: Delivery): Promise<Acceptance> {
    try {
      const response = await fetch(`${this.url.replace(/\/$/, '')}/api/v1/send/raw`, {
        method: 'POST',
        headers: { 'X-Server-API-Key': this.key, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mail_from: message.from,
          rcpt_to: message.to,
          data: message.raw.toString('base64'),
        }),
        redirect: 'error',
        signal: AbortSignal.timeout(30_000),
      });
      if (!response.ok)
        throw transportError({
          name: 'PostalHttpError',
          $metadata: { httpStatusCode: response.status },
          $response: { headers: { 'retry-after': response.headers.get('retry-after') ?? '' } },
        });
      const result = z
        .object({ status: z.string(), data: z.unknown() })
        .parse(await response.json());
      if (result.status !== 'success')
        throw new TransportError('Postal rejected the message', 'permanent');
      const data = z
        .object({
          messages: z.record(
            z.object({ id: z.union([z.string(), z.number()]), token: z.string() }),
          ),
        })
        .parse(result.data);
      const ids = Object.fromEntries(
        Object.entries(data.messages).map(([email, info]) => [email.toLowerCase(), info.token]),
      );
      if (message.to.some((recipient) => !ids[recipient]))
        throw new TransportError('Postal acceptance omitted a recipient identifier', 'ambiguous');
      return {
        ids,
        accepted: message.to.filter((v) => ids[v]),
        rejected: message.to.filter((v) => !ids[v]),
      };
    } catch (error) {
      throw transportError(error);
    }
  }
}
export class SesAdapter implements TransportAdapter {
  name = 'ses';
  private client: SESv2Client;
  constructor(
    region: string,
    private configurationSet?: string,
    credentials?: { accessKeyId: string; secretAccessKey: string; sessionToken?: string },
  ) {
    this.client = new SESv2Client({
      region,
      maxAttempts: 1,
      ...(credentials ? { credentials } : {}),
    });
  }
  async supportsRequiredTls() {
    if (!this.configurationSet) return false;
    const config = await this.client.send(
      new GetConfigurationSetCommand({ ConfigurationSetName: this.configurationSet }),
      { abortSignal: AbortSignal.timeout(5000) },
    );
    return config.DeliveryOptions?.TlsPolicy === 'REQUIRE';
  }
  async send(message: Delivery): Promise<Acceptance> {
    try {
      const result = await this.client.send(
        new SendEmailCommand({
          FromEmailAddress: message.from,
          Destination: { ToAddresses: message.to },
          Content: { Raw: { Data: message.raw } },
          ConfigurationSetName: this.configurationSet,
        }),
        { abortSignal: AbortSignal.timeout(30_000) },
      );
      if (!result.MessageId)
        throw new TransportError('SES returned no message identifier', 'ambiguous');
      return {
        ids: Object.fromEntries(message.to.map((v) => [v, result.MessageId!])),
        accepted: message.to,
        rejected: [],
      };
    } catch (error) {
      throw transportError(error);
    }
  }
}
export class SmtpAdapter implements TransportAdapter {
  name = 'smtp';
  constructor(
    private options: {
      host: string;
      port: number;
      secure: boolean;
      user?: string;
      pass?: string;
      deliveryTlsRequired: boolean;
    },
  ) {}
  async supportsRequiredTls() {
    return this.options.deliveryTlsRequired;
  }
  async send(message: Delivery): Promise<Acceptance> {
    const transport = nodemailer.createTransport({
      host: this.options.host,
      port: this.options.port,
      secure: this.options.secure,
      requireTLS: message.requireTls,
      auth: this.options.user ? { user: this.options.user, pass: this.options.pass } : undefined,
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 30_000,
    });
    try {
      const result = await transport.sendMail({
        raw: message.raw,
        envelope: { from: message.from, to: message.to },
      });
      const accepted = result.accepted.map(String).map((v) => v.toLowerCase());
      const failures =
        (result as { rejectedErrors?: { responseCode?: number; recipient?: string }[] })
          .rejectedErrors ?? [];
      const retryableRejected = failures
        .filter(
          (error) =>
            Number(error.responseCode) >= 400 &&
            Number(error.responseCode) < 500 &&
            error.recipient,
        )
        .map((error) => String(error.recipient).toLowerCase());
      return {
        ids: Object.fromEntries(accepted.map((v) => [v, result.messageId])),
        accepted,
        rejected: result.rejected
          .map(String)
          .map((v) => v.toLowerCase())
          .filter((v) => !retryableRejected.includes(v)),
        retryableRejected,
      };
    } catch (error) {
      throw transportError(error);
    } finally {
      transport.close();
    }
  }
}
export function configuredTransports(): TransportAdapter[] {
  if (process.env.MAIL_SANDBOX === 'true') {
    const host = process.env.SMTP_HOST ?? '';
    const port = Number(process.env.SMTP_PORT ?? 1025);
    if (
      process.env.MAIL_TRANSPORTS ||
      (process.env.TRANSPORT_PRIORITY || process.env.TRANSPORT) !== 'smtp' ||
      !['mailpit', 'localhost', '127.0.0.1', '::1'].includes(host) ||
      !(port === 1025 || (port === 11025 && host !== 'mailpit')) ||
      process.env.SMTP_SECURE === 'true' ||
      process.env.SMTP_USER ||
      process.env.SMTP_PASSWORD
    )
      throw new Error(
        'MAIL_SANDBOX requires only unauthenticated Mailpit SMTP at an approved local host on port 1025 (or loopback port 11025)',
      );
    const sandbox: TransportAdapter = new SmtpAdapter({
      host,
      port,
      secure: false,
      deliveryTlsRequired: false,
    });
    sandbox.sandbox = true;
    return [sandbox];
  }
  if (process.env.MAIL_TRANSPORTS) {
    return parseNamedTransports(process.env.MAIL_TRANSPORTS).map((instance) => {
      const identity = transportInstanceIdentity(instance);
      const secret = (reference: string) => {
        const value = process.env[reference];
        if (!value) throw new Error(`Missing mail transport environment reference: ${reference}`);
        return value;
      };
      let adapter: TransportAdapter;
      if (instance.kind === 'postal')
        adapter = new PostalAdapter(instance.url, secret(instance.api_key_env));
      else if (instance.kind === 'ses')
        adapter = new SesAdapter(instance.region, instance.configuration_set, {
          accessKeyId: secret(instance.access_key_id_env),
          secretAccessKey: secret(instance.secret_access_key_env),
          ...(instance.session_token_env
            ? { sessionToken: secret(instance.session_token_env) }
            : {}),
        });
      else
        adapter = new SmtpAdapter({
          host: instance.host,
          port: instance.port,
          secure: instance.secure,
          deliveryTlsRequired: instance.delivery_tls_required,
          user: instance.username_env ? secret(instance.username_env) : undefined,
          pass: instance.password_env ? secret(instance.password_env) : undefined,
        });
      adapter.instance = identity;
      adapter.sandbox = false;
      return adapter;
    });
  }
  const order = (process.env.TRANSPORT_PRIORITY || process.env.TRANSPORT || 'postal')
    .split(',')
    .map((v) => v.trim());
  if (new Set(order).size !== order.length) throw new Error('Transport priorities must be unique');
  return order.map((name) => {
    if (name === 'postal')
      return new PostalAdapter(
        z.string().url().parse(process.env.POSTAL_API_URL),
        z.string().min(1).parse(process.env.POSTAL_API_KEY),
      );
    if (name === 'ses')
      return new SesAdapter(
        process.env.AWS_REGION ?? 'us-east-1',
        process.env.SES_CONFIGURATION_SET,
      );
    if (name === 'smtp')
      return new SmtpAdapter({
        host: z.string().min(1).parse(process.env.SMTP_HOST),
        port: Number(process.env.SMTP_PORT ?? 587),
        secure: process.env.SMTP_SECURE === 'true',
        user: process.env.SMTP_USER || undefined,
        pass: process.env.SMTP_PASSWORD || undefined,
        deliveryTlsRequired: process.env.SMTP_DELIVERY_TLS_REQUIRED === 'true',
      });
    throw new Error(`Unknown transport: ${name}`);
  });
}
