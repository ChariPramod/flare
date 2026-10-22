'use client';

import { useEffect, useRef, useState } from 'react';
import { Monitor, Smartphone, AlignLeft, Search } from 'lucide-react';
import { api } from '../lib/api';
import { emailPreview } from '../lib/email-preview';
import { Button, Field, ErrorBox, ConfirmButton } from './ui';
import styles from './campaign-import.module.css';

const footer =
  '<p style="font-size:12px;color:#595969"><a href="{{{FLARE_UNSUBSCRIBE_URL}}}">Manage preferences or unsubscribe</a></p>';
const wrap = (body: string) =>
  `<div style="max-width:600px;margin:0 auto;padding:24px;font-family:Arial,sans-serif;color:#25243a;line-height:1.6">${body}${footer}</div>`;
export const campaignStarters = [
  {
    id: 'update',
    name: 'Product update',
    description: 'Share what is new and why it matters.',
    subject: 'A new update for you, {{first_name}}',
    html: wrap(
      '<p>Hi {{first_name}},</p><h1 style="font-size:28px">A little news. A useful improvement.</h1><p>Explain what changed and how it helps your readers.</p><h2 style="font-size:20px">What is new</h2><p>Add one clear benefit and the next step here.</p><p>Thanks for being part of our community.</p>',
    ),
    text: 'Hi {{first_name}},\n\nA little news. A useful improvement.\n\nExplain what changed and how it helps your readers.\n\nManage preferences: {{FLARE_UNSUBSCRIBE_URL}}',
  },
  {
    id: 'event',
    name: 'Event invitation',
    description: 'Make the who, when and next step clear.',
    subject: '{{first_name}}, you are invited',
    html: wrap(
      '<p>Hi {{first_name}},</p><h1 style="font-size:28px">Let us get together.</h1><p>Describe your event and who it is for.</p><p><strong>When:</strong> Add the date, time and timezone.<br><strong>Where:</strong> Add a location or joining details.</p><p>Explain how to register or reply.</p>',
    ),
    text: 'Hi {{first_name}},\n\nLet us get together.\n\nDescribe your event and who it is for.\nWhen: Add the date, time and timezone.\nWhere: Add a location or joining details.\n\nExplain how to register or reply.\n\nManage preferences: {{FLARE_UNSUBSCRIBE_URL}}',
  },
  {
    id: 'note',
    name: 'Personal announcement',
    description: 'A simple, readable note from your team.',
    subject: 'A quick note, {{first_name}}',
    html: wrap(
      '<p>Hi {{first_name}},</p><p>Start with the reason you are writing.</p><p>Share the details that matter to this audience.</p><p>Finish with one clear next step.</p><p>Thanks,<br>Your team</p>',
    ),
    text: 'Hi {{first_name}},\n\nStart with the reason you are writing.\n\nShare the details that matter to this audience.\n\nFinish with one clear next step.\n\nThanks,\nYour team\n\nManage preferences: {{FLARE_UNSUBSCRIBE_URL}}',
  },
];

export function CampaignStarters({
  apply,
}: {
  apply: (content: { subject: string; html: string; text: string }) => void;
}) {
  const [choice, setChoice] = useState(campaignStarters[0]!.id);
  const starter = campaignStarters.find((item) => item.id === choice)!;
  return (
    <div className={styles.studioTools}>
      <Field label="Email starter" hint={starter.description}>
        <select value={choice} onChange={(event) => setChoice(event.target.value)}>
          {campaignStarters.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>
      </Field>
      <ConfirmButton
        title="Replace email content?"
        description="This replaces the subject, HTML and plain text with the selected starter. Your sender and audience stay the same. Customize the example wording before sending."
        onConfirm={async () =>
          apply({ subject: starter.subject, html: starter.html, text: starter.text })
        }
      >
        Use starter
      </ConfirmButton>
    </div>
  );
}

export type PreviewContact = { id: string; email: string; first_name: string; last_name: string };
export function PreviewRecipient({
  selected,
  onSelect,
  audienceQuery,
}: {
  selected?: PreviewContact;
  onSelect: (contact?: PreviewContact) => void;
  audienceQuery: string;
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PreviewContact[]>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>();
  const generation = useRef(0);
  useEffect(
    () => () => {
      generation.current++;
    },
    [],
  );
  async function search() {
    if (busy) return;
    const current = ++generation.current;
    setBusy(true);
    setError(undefined);
    setResults(undefined);
    try {
      const result = await api<{ data: PreviewContact[] }>(
        `contacts?limit=10&q=${encodeURIComponent(query)}${audienceQuery}`,
      );
      if (generation.current === current) setResults(result.data);
    } catch (error) {
      if (generation.current === current) setError(error);
    } finally {
      if (generation.current === current) setBusy(false);
    }
  }
  return (
    <div className={styles.previewRecipient}>
      <p className="small muted">
        Preview recipient: <strong>{selected?.email ?? 'Sample — Alex Morgan'}</strong>. This does
        not select who receives the campaign.
      </p>
      <div className={styles.studioTools}>
        <Field
          label="Search preview contacts"
          hint="Search your current audience by name or email. A preview does not send mail or change preferences."
        >
          <input
            type="search"
            maxLength={120}
            value={query}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                void search();
              }
            }}
            onChange={(event) => {
              generation.current++;
              setBusy(false);
              setQuery(event.target.value);
              setResults(undefined);
              setError(undefined);
            }}
          />
        </Field>
        <Button type="button" disabled={busy} onClick={() => void search()}>
          <Search size={15} />
          {busy ? 'Searching…' : 'Find contacts'}
        </Button>
        {selected && (
          <Button type="button" onClick={() => onSelect()}>
            Use sample recipient
          </Button>
        )}
      </div>
      <ErrorBox error={error} />
      {results && (
        <div className={styles.contactChoices} aria-label="Preview contact results">
          {!results.length ? (
            <p role="status">No matching contacts. Try a different name or email.</p>
          ) : (
            <>
              <p className="small muted" role="status">
                Showing up to 10 matches. Refine your search to find another contact.
              </p>
              {results.map((contact) => (
                <Button
                  type="button"
                  key={contact.id}
                  aria-pressed={selected?.id === contact.id}
                  onClick={() => onSelect(contact)}
                >
                  {contact.first_name} {contact.last_name} · {contact.email}
                </Button>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}

export type CampaignPreview = {
  subject: string;
  html: string;
  text: string | null;
  missing_variables?: string[];
  missing_variable_count?: number;
};
export function CampaignPreviewPanel({
  preview,
  recipient,
}: {
  preview: CampaignPreview;
  recipient?: PreviewContact;
}) {
  const [view, setView] = useState<'desktop' | 'mobile' | 'text'>('desktop');
  return (
    <section className={styles.review} aria-label="Email preview">
      <div className={styles.previewHeader}>
        <div>
          <span className="small muted">Subject</span>
          <p>
            <strong>{preview.subject}</strong>
          </p>
        </div>
        <div className="section-tabs" role="group" aria-label="Email preview format">
          <Button
            type="button"
            aria-pressed={view === 'desktop'}
            onClick={() => setView('desktop')}
          >
            <Monitor size={15} />
            Desktop
          </Button>
          <Button type="button" aria-pressed={view === 'mobile'} onClick={() => setView('mobile')}>
            <Smartphone size={15} />
            Mobile
          </Button>
          <Button type="button" aria-pressed={view === 'text'} onClick={() => setView('text')}>
            <AlignLeft size={15} />
            Plain text
          </Button>
        </div>
      </div>
      <p className="small muted">
        {recipient
          ? `Preview uses ${recipient.email}.`
          : 'Preview uses sample recipient Alex Morgan.'}{' '}
        No email is sent.
      </p>
      {!!preview.missing_variable_count && (
        <div className={styles.note} role="status">
          {preview.missing_variable_count}{' '}
          {preview.missing_variable_count === 1 ? 'field has' : 'fields have'} no value in this
          preview: {preview.missing_variables?.join(', ')}
          {preview.missing_variable_count > 50 ? ' (first 50 shown)' : ''}. These render as blank;
          check your contact data or template defaults.
        </div>
      )}
      {view === 'text' ? (
        <pre className={styles.textPreview}>
          {preview.text || 'No plain-text alternative provided.'}
        </pre>
      ) : (
        <div className={styles.previewCanvas}>
          <iframe
            title="Campaign email preview"
            className={styles.preview}
            style={{ maxWidth: view === 'mobile' ? 360 : 640 }}
            sandbox=""
            referrerPolicy="no-referrer"
            srcDoc={emailPreview(preview.html)}
          />
        </div>
      )}
      <p className="small muted">
        Browser preview only; email apps may render differently. Remote images and links are
        disabled. One contact preview does not validate the whole audience.
      </p>
    </section>
  );
}
