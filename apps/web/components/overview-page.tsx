'use client';
import Link from 'next/link';
import {
  ArrowRight,
  CheckCircle2,
  CircleHelp,
  Globe,
  Inbox,
  Mail,
  ShieldCheck,
  Workflow,
} from 'lucide-react';
import { date, useApi } from '../lib/api';
import type { Session } from '../lib/api';
import { Badge, Button, ErrorBox, Loading, PageHeader } from './ui';

type SendingPolicy = {
  state: 'pending_review' | 'approved' | 'suspended';
  daily_limit: number;
  per_minute_limit: number;
  usage: { reserved: number; sent_24h: number };
  feedback: { recipients_24h: number; hard_bounces: number; complaints: number; unknown: number };
};
type Domain = {
  id: string;
  name: string;
  status: string;
  sending: boolean;
  checked_at: string | null;
  readiness?: { blockers: string[]; transports: { ready: boolean; blockers: string[] }[] };
};
type Email = {
  id: string;
  subject: string;
  status: string;
  created_at: string;
  hold_reason: string | null;
  next_attempt_at: string | null;
};

function Unavailable({ label, retry }: { label: string; retry: () => void }) {
  return (
    <div className="overview-unavailable">
      <CircleHelp size={18} aria-hidden="true" />
      <p>{label} unavailable. Try again to check the current state.</p>
      <Button className="compact" onClick={retry}>
        Retry
      </Button>
    </div>
  );
}

export function OverviewPage({
  session,
  environmentName,
}: {
  session: Session;
  environmentName: string;
}) {
  const policy = useApi<SendingPolicy>('sending-policy', 30000);
  const domains = useApi<Domain[]>('domains', 30000);
  const emails = useApi<Email[]>('emails', 30000);
  const writable = session.principal.role !== 'viewer';
  // Never use retained query data to suggest a current successful state after a failed refresh.
  const currentPolicy = policy.error ? undefined : policy.data;
  const currentDomains = domains.error ? undefined : domains.data;
  const currentEmails = emails.error ? undefined : emails.data;
  const readyDomains = currentDomains?.filter(
    (domain) =>
      domain.sending &&
      domain.readiness?.blockers.length === 0 &&
      domain.readiness.transports.some((transport) => transport.ready),
  );
  const attention = currentEmails
    ?.filter((email) => ['held', 'failed'].includes(email.status))
    .slice(0, 5);
  const used = currentPolicy ? currentPolicy.usage.reserved + currentPolicy.usage.sent_24h : 0;
  const progress = currentPolicy?.daily_limit
    ? Math.min(100, (used / currentPolicy.daily_limit) * 100)
    : 0;
  const policyLabel =
    currentPolicy?.state === 'approved'
      ? 'Approved'
      : currentPolicy?.state === 'suspended'
        ? 'Sending paused'
        : 'Awaiting review';
  return (
    <div className="overview-page">
      <PageHeader
        title="Overview"
        description={`Your notification workspace at a glance. You’re viewing ${environmentName}.`}
        actions={
          <Link className="button" href="/activity">
            View activity <ArrowRight size={15} aria-hidden="true" />
          </Link>
        }
      />
      <section className="overview-welcome" aria-labelledby="overview-welcome-title">
        <div>
          <span className="eyebrow">WORKSPACE PULSE</span>
          <h2 id="overview-welcome-title">A clear view of your next delivery.</h2>
          <p>Check sender readiness, follow messages and keep your team’s notifications moving.</p>
        </div>
        <div className="overview-environment">
          <span
            className={`status-dot ${session.principal.production ? 'production' : 'development'}`}
          />
          <span>{environmentName}</span>
          <Badge>{session.principal.role}</Badge>
        </div>
      </section>
      <div className="overview-stats">
        <section className="overview-card" aria-labelledby="sending-access-title">
          <div className="overview-card-heading">
            <ShieldCheck size={18} aria-hidden="true" />
            <h2 id="sending-access-title">Sending access</h2>
          </div>
          {policy.isPending ? (
            <Loading />
          ) : !currentPolicy ? (
            <Unavailable label="Sending policy" retry={() => void policy.refetch()} />
          ) : (
            <>
              <div className="overview-value">
                <Badge
                  tone={
                    currentPolicy.state === 'approved'
                      ? 'active'
                      : currentPolicy.state === 'suspended'
                        ? 'failed'
                        : 'pending'
                  }
                >
                  {policyLabel}
                </Badge>
              </div>
              <p>
                {currentPolicy.state === 'approved'
                  ? 'Organization approved. Delivery still depends on sender readiness and available capacity.'
                  : currentPolicy.state === 'suspended'
                    ? 'Real outbound sending is paused. Contact your platform operator for review.'
                    : 'A platform operator must approve real outbound sending. Domain verification does not grant approval.'}
              </p>
              <span className="overview-card-note">
                Organization-wide · all environments and credentials
              </span>
            </>
          )}
        </section>
        <section className="overview-card" aria-labelledby="recipient-allowance-title">
          <div className="overview-card-heading">
            <Mail size={18} aria-hidden="true" />
            <h2 id="recipient-allowance-title">Recipient allowance</h2>
          </div>
          {policy.isPending ? (
            <Loading />
          ) : !currentPolicy ? (
            <Unavailable label="Recipient allowance" retry={() => void policy.refetch()} />
          ) : (
            <>
              <div className="overview-value">
                {Math.max(0, currentPolicy.daily_limit - used).toLocaleString()}{' '}
                <span>available of {currentPolicy.daily_limit.toLocaleString()}</span>
              </div>
              <div
                className="quota-track"
                role="meter"
                aria-label="Recipient allowance used"
                aria-valuemin={0}
                aria-valuemax={currentPolicy.daily_limit}
                aria-valuenow={Math.min(used, currentPolicy.daily_limit)}
                aria-valuetext={`${used} used or reserved of ${currentPolicy.daily_limit}`}
              >
                <span style={{ width: `${progress}%` }} />
              </div>
              <p>
                {currentPolicy.usage.sent_24h.toLocaleString()} used in 24 hours ·{' '}
                {currentPolicy.usage.reserved.toLocaleString()} reserved
              </p>
              <span className="overview-card-note">
                Across all environments · {currentPolicy.per_minute_limit} recipients/minute
              </span>
            </>
          )}
        </section>
        <section className="overview-card" aria-labelledby="sender-readiness-title">
          <div className="overview-card-heading">
            <Globe size={18} aria-hidden="true" />
            <h2 id="sender-readiness-title">Sender readiness</h2>
          </div>
          {domains.isPending ? (
            <Loading />
          ) : !currentDomains ? (
            <Unavailable label="Sender readiness" retry={() => void domains.refetch()} />
          ) : (
            <>
              <div className="overview-value">
                {readyDomains?.length ?? 0}
                <span>
                  {' '}
                  of {currentDomains.filter((domain) => domain.sending).length} sending domains{' '}
                  {session.principal.production ? 'ready' : `pass ${environmentName} checks`}
                </span>
              </div>
              <p>
                {currentDomains.length
                  ? session.principal.production
                    ? `Readiness for ${environmentName} from configured routes and current evidence.`
                    : `${environmentName} checks are limited. They do not establish Production readiness or verify real-world delivery.`
                  : 'Add a sending domain to begin ownership and transport verification.'}
              </p>
              <Link href="/domains" className="overview-inline-link">
                Review domains <ArrowRight size={14} aria-hidden="true" />
              </Link>
            </>
          )}
        </section>
      </div>
      <div className="overview-columns">
        <section className="panel overview-attention" aria-labelledby="needs-attention-title">
          <div className="overview-section-heading">
            <div>
              <h2 id="needs-attention-title">Needs attention</h2>
              <p>Latest 100 emails · selected environment</p>
            </div>
            <Link href="/emails" className="overview-inline-link">
              All emails <ArrowRight size={14} aria-hidden="true" />
            </Link>
          </div>
          {emails.isPending ? (
            <Loading />
          ) : !currentEmails ? (
            <Unavailable label="Recent emails" retry={() => void emails.refetch()} />
          ) : attention?.length ? (
            <ul className="overview-message-list">
              {attention.map((email) => (
                <li key={email.id}>
                  <Link href={`/emails/${email.id}`}>
                    <div>
                      <strong>{email.subject || '(No subject)'}</strong>
                      <p>
                        {email.status === 'held'
                          ? `Held: ${email.hold_reason?.replaceAll('_', ' ') ?? 'Review delivery details'}`
                          : 'Review delivery details before retrying; provider acceptance may be uncertain.'}
                      </p>
                      <small>
                        {date(email.created_at)}
                        {email.next_attempt_at
                          ? ` · Next attempt ${date(email.next_attempt_at)}`
                          : ''}
                      </small>
                    </div>
                    <Badge>{email.status}</Badge>
                    <ArrowRight size={16} aria-hidden="true" />
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <div className="overview-clear">
              <CheckCircle2 size={25} aria-hidden="true" />
              <h3>
                {currentEmails.length
                  ? 'No held or failed emails in this list'
                  : 'Your first message starts here'}
              </h3>
              <p>
                {currentEmails.length
                  ? 'Open all emails for individual delivery status. Provider acceptance is separate from recipient delivery.'
                  : 'Set up a sender, then submit an email or trigger a workflow to see its progress.'}
              </p>
            </div>
          )}
        </section>
        <section className="panel overview-feedback" aria-labelledby="feedback-title">
          <div className="overview-section-heading">
            <div>
              <h2 id="feedback-title">Recipient feedback</h2>
              <p>Organization-wide · rolling 24 hours</p>
            </div>
          </div>
          {policy.isPending ? (
            <Loading />
          ) : !currentPolicy ? (
            <Unavailable label="Recipient feedback" retry={() => void policy.refetch()} />
          ) : (
            <>
              <dl className="overview-feedback-list">
                <div>
                  <dt>Recipients in window</dt>
                  <dd>{currentPolicy.feedback.recipients_24h.toLocaleString()}</dd>
                </div>
                <div>
                  <dt>Hard bounces</dt>
                  <dd>{currentPolicy.feedback.hard_bounces.toLocaleString()}</dd>
                </div>
                <div>
                  <dt>Complaints</dt>
                  <dd>{currentPolicy.feedback.complaints.toLocaleString()}</dd>
                </div>
                <div>
                  <dt>Unknown bounce outcomes</dt>
                  <dd>{currentPolicy.feedback.unknown.toLocaleString()}</dd>
                </div>
              </dl>
              <p className="overview-card-note">
                Feedback depends on authenticated provider callbacks. No recorded feedback is not
                proof of delivery.
              </p>
            </>
          )}
        </section>
      </div>
      <section aria-labelledby="workspace-shortcuts-title">
        <div className="overview-section-heading">
          <div>
            <h2 id="workspace-shortcuts-title">Keep building</h2>
            <p>Two ways to reach people. One place to follow the result.</p>
          </div>
        </div>
        <div className="overview-shortcuts">
          <Link href="/workflows" className="overview-shortcut">
            <Workflow size={21} aria-hidden="true" />
            <div>
              <h3>Workflows</h3>
              <p>
                {writable && !session.principal.production
                  ? 'Design and test a notification journey.'
                  : 'Explore your notification journeys.'}
              </p>
            </div>
            <ArrowRight size={17} aria-hidden="true" />
          </Link>
          <Link href="/inbound" className="overview-shortcut">
            <Mail size={21} aria-hidden="true" />
            <div>
              <h3>Received email</h3>
              <p>Read email received by your domains.</p>
            </div>
            <ArrowRight size={17} aria-hidden="true" />
          </Link>
          <Link href="/subscribers" className="overview-shortcut">
            <Inbox size={21} aria-hidden="true" />
            <div>
              <h3>In-app Inbox</h3>
              <p>Open a subscriber to view product notifications and preferences.</p>
            </div>
            <ArrowRight size={17} aria-hidden="true" />
          </Link>
        </div>
      </section>
      <ErrorBox error={policy.error ?? domains.error ?? emails.error} />
    </div>
  );
}
