import { GetEmailIdentityCommand, SESv2Client } from '@aws-sdk/client-sesv2';
import { z } from 'zod';
import {
  dmarcEvidenceSchema,
  domainsAlign,
  evidenceFresh,
  normalizeDomain,
  organizationalDomain,
} from './dmarc.js';
import type { DnsRecord } from './domains.js';

const dnsName = z
  .string()
  .trim()
  .toLowerCase()
  .max(253)
  .regex(/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/);
export const sesIdentityEvidenceSchema = z
  .object({
    identity_verified: z.boolean(),
    mail_from_domain: dnsName,
    status: z.enum(['PENDING', 'SUCCESS', 'FAILED', 'TEMPORARY_FAILURE']),
    behavior_on_mx_failure: z.enum(['USE_DEFAULT_VALUE', 'REJECT_MESSAGE']),
    checked_at: z.string().datetime(),
  })
  .strict();
/** An operator attestation of trusted received headers, never an automatic DNS or cryptographic result. */
export const providerEvidenceSchema = z
  .object({
    kind: z.literal('received_headers'),
    provenance: z.literal('operator_attested_receiver_headers'),
    transport_instance: z.string().min(1).max(256),
    proof_reference: z
      .string()
      .min(1)
      .max(1024)
      .regex(/^[^\r\n\0]+$/),
    checked_at: z.string().datetime(),
    header_from_domain: dnsName,
    dkim_domain: dnsName,
    dkim_pass: z.boolean(),
    mail_from_domain: dnsName,
    spf_pass: z.boolean(),
    dmarc_pass: z.boolean(),
    ses: sesIdentityEvidenceSchema.optional(),
  })
  .strict();
export type ProviderEvidence = z.infer<typeof providerEvidenceSchema>;
export interface ReadinessDomain {
  name: string;
  status: string;
  sending: boolean;
  checked_at: unknown;
  records: unknown;
  dmarc_evidence: unknown;
}
export interface ReadinessOptions {
  production: boolean;
  transportInstance: string;
  provider: string;
  evidence: unknown;
  revokedAt?: unknown;
}
export function postalReturnPath(name: string) {
  const prefix = z
    .string()
    .regex(/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/)
    .parse(process.env.POSTAL_RETURN_PATH_PREFIX ?? 'psrp');
  return `${prefix}.${normalizeDomain(name)}`;
}
export function evaluateSendingReadiness(
  domain: ReadinessDomain,
  options: ReadinessOptions,
  now = Date.now(),
) {
  const blockers: string[] = [];
  if (domain.status !== 'verified') blockers.push('domain_unverified');
  if (!domain.sending) blockers.push('sending_disabled');
  // Development is explicitly not production readiness. Parent sandbox admission
  // still requires its allowlist, and must never use this result to promote a tenant.
  if (!options.production)
    return { ready: blockers.length === 0, blockers, dkim_aligned: null, spf_aligned: null };
  if (!evidenceFresh(domain.checked_at, now)) blockers.push('dns_evidence_stale');
  const records = Array.isArray(domain.records) ? (domain.records as DnsRecord[]) : [];
  if (!records.some((record) => record.purpose === 'dkim' && record.status === 'verified'))
    blockers.push('dkim_dns_unverified');
  const dmarc = dmarcEvidenceSchema.safeParse(domain.dmarc_evidence);
  if (!dmarc.success || dmarc.data.status !== 'verified') blockers.push('dmarc_unverified');
  else {
    if (!evidenceFresh(dmarc.data.checked_at, now)) blockers.push('dmarc_evidence_stale');
    const expected = dmarc.data.inherited
      ? organizationalDomain(domain.name)
      : normalizeDomain(domain.name);
    if (dmarc.data.record_domain !== expected) blockers.push('dmarc_evidence_mismatch');
  }
  const proof = providerEvidenceSchema.safeParse(options.evidence);
  if (options.revokedAt !== null && options.revokedAt !== undefined)
    blockers.push('transport_evidence_revoked');
  if (!proof.success) blockers.push('transport_evidence_missing');
  let dkimAligned: boolean | null = null,
    spfAligned: boolean | null = null;
  if (proof.success) {
    const evidence = proof.data;
    if (evidence.transport_instance !== options.transportInstance)
      blockers.push('transport_evidence_mismatch');
    if (!evidenceFresh(evidence.checked_at, now)) blockers.push('transport_evidence_stale');
    if (evidence.header_from_domain !== normalizeDomain(domain.name))
      blockers.push('sender_evidence_mismatch');
    if (!evidence.dkim_pass) blockers.push('dkim_not_passing');
    if (!evidence.spf_pass) blockers.push('spf_not_passing');
    if (!evidence.dmarc_pass) blockers.push('dmarc_not_passing');
    if (dmarc.success && dmarc.data.status === 'verified') {
      dkimAligned =
        evidence.dkim_pass &&
        domainsAlign(domain.name, evidence.dkim_domain, dmarc.data.adkim ?? 'r');
      spfAligned =
        evidence.spf_pass &&
        domainsAlign(domain.name, evidence.mail_from_domain, dmarc.data.aspf ?? 'r');
      if (!dkimAligned && !spfAligned) blockers.push('dmarc_unaligned');
    }
    if (options.provider === 'postal') {
      if (
        !records.some(
          (record) =>
            record.purpose === 'spf' &&
            record.name === normalizeDomain(domain.name) &&
            record.status === 'verified',
        )
      )
        blockers.push('postal_spf_unverified');
      const expected = postalReturnPath(domain.name);
      if (evidence.mail_from_domain !== expected) blockers.push('postal_return_path_mismatch');
      if (
        !records.some(
          (record) =>
            record.purpose === 'return_path' &&
            record.type === 'CNAME' &&
            record.name === expected &&
            normalizeDomain(record.value) ===
              normalizeDomain(
                process.env.POSTAL_RETURN_PATH ?? process.env.POSTAL_HOSTNAME ?? 'postal.localhost',
              ) &&
            record.status === 'verified',
        )
      )
        blockers.push('postal_return_path_unverified');
    } else if (options.provider === 'ses') {
      const ses = evidence.ses;
      if (
        !ses ||
        !ses.identity_verified ||
        ses.status !== 'SUCCESS' ||
        ses.behavior_on_mx_failure !== 'REJECT_MESSAGE' ||
        ses.mail_from_domain !== evidence.mail_from_domain ||
        !evidenceFresh(ses.checked_at, now)
      )
        blockers.push('ses_mail_from_unverified');
      // SES requires a subdomain of the verified identity for custom MAIL FROM.
      if (!evidence.mail_from_domain.endsWith(`.${normalizeDomain(domain.name)}`))
        blockers.push('ses_mail_from_mismatch');
    } else if (options.provider !== 'smtp') blockers.push('transport_unsupported');
  }
  return {
    ready: blockers.length === 0,
    blockers: [...new Set(blockers)],
    dkim_aligned: dkimAligned,
    spf_aligned: spfAligned,
  };
}
export interface SesIdentityResponse {
  VerifiedForSendingStatus?: boolean;
  MailFromAttributes?: {
    MailFromDomain?: string;
    MailFromDomainStatus?: string;
    BehaviorOnMxFailure?: string;
  };
}
/** Read-only SES identity probe. Its result is provider configuration evidence, not delivery evidence. */
export async function checkSesIdentity(
  name: string,
  region: string,
  lookup?: (name: string) => Promise<SesIdentityResponse>,
  now = Date.now(),
) {
  const client = lookup ? undefined : new SESv2Client({ region, maxAttempts: 1 });
  try {
    const result = lookup
      ? await lookup(name)
      : await client!.send(new GetEmailIdentityCommand({ EmailIdentity: name }), {
          abortSignal: AbortSignal.timeout(5000),
        });
    const parsed = sesIdentityEvidenceSchema.safeParse({
      identity_verified: result.VerifiedForSendingStatus === true,
      mail_from_domain: result.MailFromAttributes?.MailFromDomain,
      status: result.MailFromAttributes?.MailFromDomainStatus,
      behavior_on_mx_failure: result.MailFromAttributes?.BehaviorOnMxFailure,
      checked_at: new Date(now).toISOString(),
    });
    if (!parsed.success)
      return { status: 'failed' as const, checked_at: new Date(now).toISOString(), evidence: null };
    const evidence = parsed.data;
    return {
      status:
        evidence.identity_verified &&
        evidence.status === 'SUCCESS' &&
        evidence.behavior_on_mx_failure === 'REJECT_MESSAGE' &&
        evidence.mail_from_domain.endsWith(`.${normalizeDomain(name)}`)
          ? ('verified' as const)
          : ('failed' as const),
      checked_at: evidence.checked_at,
      evidence,
    };
  } catch {
    return {
      status: 'temporary_failure' as const,
      checked_at: new Date(now).toISOString(),
      evidence: null,
    };
  } finally {
    client?.destroy();
  }
}
export function sesMailFromRecords(mailFromDomain: string, region: string): DnsRecord[] {
  dnsName.parse(mailFromDomain);
  z.string()
    .regex(/^[a-z]{2}(?:-[a-z]+)+-\d$/)
    .parse(region);
  return [
    {
      type: 'MX',
      name: mailFromDomain,
      value: `feedback-smtp.${region}.amazonses.com`,
      purpose: 'return_path',
      required: true,
      status: 'pending',
    },
    {
      type: 'TXT',
      name: mailFromDomain,
      value: 'v=spf1 include:amazonses.com ~all',
      purpose: 'spf',
      required: true,
      status: 'pending',
    },
  ];
}
