'use client';
import Link from 'next/link';
import { useState } from 'react';
import {
  ArrowRight,
  ArrowUpRight,
  Clock3,
  RefreshCw,
  CheckCircle2,
  CircleHelp,
  Inbox,
  Mail,
  Workflow,
} from 'lucide-react';
import { date, useApi } from '../lib/api';
import type { Session } from '../lib/api';
import { deliveryLabel } from '../lib/email-status';
import styles from './overview.module.css';
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
  const [attentionFilter, setAttentionFilter] = useState<'all' | 'held' | 'failed'>('all');
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
  const recentEmails = currentEmails?.toSorted(
    (left, right) => new Date(right.created_at).getTime() - new Date(left.created_at).getTime(),
  );
  const allAttention = recentEmails?.filter((email) => ['held', 'failed'].includes(email.status));
  const matchingAttention = allAttention?.filter(
    (email) => attentionFilter === 'all' || email.status === attentionFilter,
  );
  const attention = matchingAttention?.slice(0, 5);
  const pending = policy.isPending || domains.isPending || emails.isPending;
  const refreshing = policy.isFetching || domains.isFetching || emails.isFetching;
  const unavailable = Boolean(policy.error || domains.error || emails.error);
  const updatedAt = Math.min(policy.dataUpdatedAt, domains.dataUpdatedAt, emails.dataUpdatedAt);
  const refresh = () => {
    void Promise.allSettled([policy.refetch(), domains.refetch(), emails.refetch()]);
  };
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
  const nextStep =
    unavailable || pending
      ? undefined
      : currentPolicy?.state === 'suspended'
        ? {
            title: 'Sending is paused. Review what needs attention.',
            description:
              'A platform operator must review the suspension before real outbound sending can resume. Check held messages for the reason.',
            label: 'Review held emails',
            href: '/emails',
            attention: true,
          }
        : currentPolicy?.state === 'pending_review'
          ? {
              title: 'Get ready for your first real send.',
              description:
                writable && !session.principal.production
                  ? 'Real outbound sending needs operator approval. You can review your domains and build notification workflows while that review is pending.'
                  : 'Real outbound sending needs operator approval. You can review your domains and explore notification workflows while that review is pending.',
              label: 'Review sender setup',
              href: '/domains',
              attention: false,
            }
          : !currentDomains?.some((domain) => domain.sending)
            ? {
                title: 'Give your notifications a sending domain.',
                description: writable
                  ? 'Add a domain, verify ownership and review the transport checks before sending email.'
                  : 'Ask a workspace administrator to add a sending domain. You can follow its verification here.',
                label: writable ? 'Set up a domain' : 'Review domains',
                href: '/domains',
                attention: false,
              }
            : !readyDomains?.length
              ? {
                  title: 'Your sender setup needs a closer look.',
                  description:
                    'No sending domain currently passes the checks for this environment. Open a domain to see which evidence or configuration is missing.',
                  label: 'Review sender checks',
                  href: '/domains',
                  attention: true,
                }
              : currentPolicy && used >= currentPolicy.daily_limit
                ? {
                    title: 'Your recipient allowance is fully allocated.',
                    description:
                      'Used and reserved recipients share the organization allowance. Review pending messages before submitting more email.',
                    label: 'Review email activity',
                    href: '/emails',
                    attention: true,
                  }
                : allAttention?.length
                  ? {
                      title: 'A few messages need your attention.',
                      description:
                        'Held and failed emails retain their delivery details. Review the outcome before considering another send.',
                      label: 'Review email activity',
                      href: '/emails',
                      attention: true,
                    }
                  : {
                      title: 'Follow your next notification from start to finish.',
                      description:
                        'Open a workflow, follow its activity and check the subscriber’s Inbox. Email provider acceptance is separate from recipient delivery.',
                      label:
                        writable && !session.principal.production
                          ? 'Build a workflow'
                          : 'Explore workflows',
                      href: '/workflows',
                      attention: false,
                    };
  return (
    <div className={`overview-page ${styles.page}`}>
      <PageHeader
        title="Overview"
        description={`Your notification workspace at a glance. You’re viewing ${environmentName}.`}
        actions={
          <>
            <Button onClick={refresh} disabled={refreshing} aria-label="Refresh overview">
              <RefreshCw size={15} className={refreshing ? 'spin' : undefined} aria-hidden="true" />
              Refresh
            </Button>
            <Link className="button" href="/activity">
              View activity <ArrowUpRight size={15} aria-hidden="true" />
            </Link>
          </>
        }
      />
      <div className={styles.contextBar}>
        <p
          className={styles.freshness}
          role="status"
          aria-live="polite"
          aria-label="Overview refresh status"
        >
          <Clock3 size={13} aria-hidden="true" />
          {refreshing
            ? 'Updating overview…'
            : unavailable
              ? 'Some data is unavailable. Refresh to retry.'
              : updatedAt
                ? `Updated ${new Date(updatedAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })} · refreshes every 30 seconds`
                : 'Waiting for workspace data…'}
        </p>
      </div>
      <div className={styles.sectionLabel}>
        <span>01 / Sending status</span>
        <span>Organization policy · environment readiness</span>
      </div>
      <div className={`overview-stats ${styles.stats}`}>
        <section
          className={`overview-card ${styles.statCard}`}
          aria-labelledby="sending-access-title"
        >
          <div className="overview-card-heading">
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
        <section
          className={`overview-card ${styles.statCard}`}
          aria-labelledby="recipient-allowance-title"
        >
          <div className="overview-card-heading">
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
        <section
          className={`overview-card ${styles.statCard}`}
          aria-labelledby="sender-readiness-title"
        >
          <div className="overview-card-heading">
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
      <section className={styles.nextStep} aria-labelledby="overview-welcome-title">
        <div className={styles.nextStepContent}>
          <span className={styles.eyebrow}>
            {nextStep?.attention ? 'Action required' : 'Recommended next step'}
          </span>
          <h2 id="overview-welcome-title">
            {unavailable
              ? 'Let’s get a current view of your workspace.'
              : (nextStep?.title ?? 'Checking your workspace…')}
          </h2>
          <p>
            {unavailable
              ? 'Some checks could not be loaded. Retry below to see the current policy, domains and email activity.'
              : (nextStep?.description ??
                'Loading sending policy, sender checks and recent emails.')}
          </p>
        </div>
        {nextStep && (
          <Link href={nextStep.href} className={`button ${styles.nextStepAction}`}>
            {nextStep.label} <ArrowRight size={15} aria-hidden="true" />
          </Link>
        )}
      </section>
      <div className={styles.sectionLabel}>
        <span>02 / Delivery review</span>
        <span>Exceptions &amp; authenticated feedback</span>
      </div>
      <div className={`overview-columns ${styles.reviewColumns}`}>
        <section
          className={`panel overview-attention ${styles.attentionPanel}`}
          aria-labelledby="needs-attention-title"
        >
          <div className="overview-section-heading">
            <div>
              <h2 id="needs-attention-title">Needs attention</h2>
              <p>Latest 100 emails · selected environment</p>
            </div>
            <Link href="/emails" className="overview-inline-link">
              All emails <ArrowRight size={14} aria-hidden="true" />
            </Link>
          </div>
          {currentEmails && (
            <div
              className={styles.filterBar}
              role="group"
              aria-label="Filter emails needing attention"
            >
              {(['all', 'held', 'failed'] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={attentionFilter === value}
                  onClick={() => setAttentionFilter(value)}
                >
                  {value === 'all' ? 'All' : value === 'held' ? 'On hold' : 'Failed'}
                  <span>
                    {allAttention?.filter((email) => value === 'all' || email.status === value)
                      .length ?? 0}
                  </span>
                </button>
              ))}
            </div>
          )}
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
                    <Badge tone={email.status}>{deliveryLabel(email.status)}</Badge>
                    <ArrowRight size={16} aria-hidden="true" />
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <div className="overview-clear">
              <CheckCircle2 size={25} aria-hidden="true" />
              <h3>
                {attentionFilter !== 'all' && allAttention?.length
                  ? `No ${attentionFilter === 'held' ? 'held' : 'failed'} emails in this list`
                  : currentEmails.length
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
          {Boolean(matchingAttention?.length) && (
            <div className={styles.listFooter}>
              <span>
                Showing {attention?.length} of {matchingAttention?.length} in this list
              </span>
              <Link href="/emails">
                View all emails <ArrowRight size={13} aria-hidden="true" />
              </Link>
            </div>
          )}
        </section>
        <section
          className={`panel overview-feedback ${styles.feedbackPanel}`}
          aria-labelledby="feedback-title"
        >
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
      <section className={`panel ${styles.recentPanel}`} aria-labelledby="recent-emails-title">
        <div className="overview-section-heading">
          <div>
            <span className={styles.eyebrow}>03 / Message ledger</span>
            <h2 id="recent-emails-title">Recent emails</h2>
            <p>
              Your latest submissions in {environmentName}. Open one to follow its recipient
              outcomes.
            </p>
          </div>
          <Link href="/emails" className="overview-inline-link">
            View emails <ArrowRight size={14} aria-hidden="true" />
          </Link>
        </div>
        {emails.isPending ? (
          <Loading />
        ) : !recentEmails ? (
          <Unavailable label="Recent emails" retry={() => void emails.refetch()} />
        ) : recentEmails.length ? (
          <ul className={styles.recentList}>
            {recentEmails.slice(0, 5).map((email, index) => (
              <li key={email.id}>
                <Link href={`/emails/${email.id}`}>
                  <span className={styles.messageIndex} aria-hidden="true">
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  <span className={styles.messageSubject}>
                    <strong>{email.subject || '(No subject)'}</strong>
                    <span>{date(email.created_at)}</span>
                  </span>
                  <Badge tone={email.status}>{deliveryLabel(email.status)}</Badge>
                  <ArrowUpRight size={15} aria-hidden="true" />
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <div className={styles.recentEmpty}>
            <span className={styles.messageIcon}>
              <Mail size={21} aria-hidden="true" />
            </span>
            <div>
              <h3>No email submissions yet</h3>
              <p>
                {writable
                  ? 'Send an email or test an email workflow to see its progress here.'
                  : 'Submitted emails will appear here with their latest status.'}
              </p>
            </div>
            <Link href="/emails" className="overview-inline-link">
              {writable ? 'Open emails' : 'View emails'} <ArrowRight size={14} aria-hidden="true" />
            </Link>
          </div>
        )}
        <p className={styles.deliveryNote}>
          Provider accepted means the transport accepted the message. Delivered requires a recipient
          delivery event.
        </p>
      </section>
      <section aria-labelledby="workspace-shortcuts-title">
        <div className="overview-section-heading">
          <div>
            <span className={styles.eyebrow}>04 / Workspace directory</span>
            <h2 id="workspace-shortcuts-title">Keep building</h2>
            <p>Two ways to reach people. One place to follow the result.</p>
          </div>
        </div>
        <div className={`overview-shortcuts ${styles.shortcuts}`}>
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
