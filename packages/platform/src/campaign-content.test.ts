import { describe, expect, it } from 'vitest';
import {
  campaignRecipientValues,
  renderContentPreview,
  templatePreviewSchema,
} from './campaign-content.js';

const content = { subject: '{{first_name}}', html: '<p>{{first_name}}</p>', variables: {} };
describe('campaign content previews', () => {
  it('uses dispatch precedence while preserving false and zero and protecting recipient identity', () => {
    const values = campaignRecipientValues(
      { city: 'Template', other: 'value' },
      { city: 'Fallback', enabled: true },
      {
        email: 'real@example.test',
        first_name: '',
        last_name: 'Person',
        properties: {
          city: null,
          enabled: false,
          count: 0,
          email: 'forged@example.test',
          FLARE_UNSUBSCRIBE_URL: 'https://forged.test',
        },
      },
      'https://example.test/preferences/preview',
    );
    expect(values).toMatchObject({
      city: 'Fallback',
      other: 'value',
      enabled: false,
      count: 0,
      email: 'real@example.test',
      first_name: '',
      FLARE_UNSUBSCRIBE_URL: 'https://example.test/preferences/preview',
    });
  });
  it('reports empty or unresolved fields without treating false and zero as missing', () => {
    const preview = renderContentPreview(
      {
        ...content,
        html: '{{empty}} {{unset}} {{nullable}} {{zero}} {{no}} {{nested.value}} {{empty}}',
        text: 'Hi {{first_name}}',
      },
      {
        first_name: 'Alex',
        empty: ' ',
        nullable: null,
        zero: 0,
        no: false,
        nested: { value: 'ok' },
      },
    );
    expect(preview.missing_variables).toEqual(['empty', 'unset', 'nullable']);
    expect(preview.missing_variable_count).toBe(3);
    expect(preview.text).toBe('Hi Alex');
  });
  it('escapes hostile values in HTML but preserves plain text, and validates syntax', () => {
    const value = '<img src=x onerror=alert(1)>';
    const preview = renderContentPreview(
      { ...content, text: '{{first_name}}' },
      { first_name: value },
    );
    expect(preview.subject).toBe(value);
    expect(preview.text).toBe(value);
    expect(preview.html).toContain('&lt;img');
    expect(() => renderContentPreview({ ...content, html: '{{{first_name}}}' }, {})).toThrow(
      'triple braces',
    );
    expect(() => renderContentPreview({ ...content, html: '{{constructor.name}}' }, {})).toThrow(
      'Invalid template variable',
    );
  });
  it('bounds missing-field details and distinguishes absent plain text', () => {
    const preview = renderContentPreview(
      { ...content, html: Array.from({ length: 100 }, (_, i) => `{{field${i}}}`).join('') },
      {},
    );
    expect(preview.missing_variables).toHaveLength(50);
    expect(preview.missing_variable_count).toBe(101);
    expect(preview.text).toBeNull();
  });
  it('keeps sample requests compatible and rejects mixed contact and sample contexts', () => {
    expect(templatePreviewSchema.parse({ content })).toMatchObject({ variables: {} });
    expect(
      templatePreviewSchema.safeParse({
        content,
        variables: { first_name: 'fake' },
        contact_id: '00000000-0000-4000-8000-000000000001',
      }).success,
    ).toBe(false);
  });
});
