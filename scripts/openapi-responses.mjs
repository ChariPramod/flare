const str = { type: 'string' },
  int = { type: 'integer' },
  bool = { type: 'boolean' },
  json = { type: 'object', additionalProperties: true };
const obj = (
  properties,
  required = Object.keys(properties).filter((key) => !['org_id', 'environment_id'].includes(key)),
) => ({
  type: 'object',
  properties,
  required,
  additionalProperties: true,
});
const arr = (items) => ({ type: 'array', items });
const page = (items) => obj({ data: arr(items), page: int, limit: int }, ['data']);
const entity = obj({ id: str, org_id: str, environment_id: str, created_at: str }, ['id']);
const workflow = obj({
  ...entity.properties,
  identifier: str,
  definition: json,
  source_definition: json,
  revision: int,
  content_dependencies: json,
});
const message = obj({
  ...entity.properties,
  status: str,
  request: json,
  error: { type: 'string', nullable: true },
});
const domain = obj({
  ...entity.properties,
  name: str,
  status: str,
  records: arr(json),
  sending: bool,
  receiving: bool,
  enforce_tls: bool,
});
const publication = obj(
  {
    id: str,
    status: { type: 'string', enum: ['pending', 'failed', 'completed', 'superseded'] },
    error: { type: 'string', nullable: true },
    items: arr(
      obj({
        id: str,
        kind: str,
        identifier: str,
        status: str,
        attempts: int,
        error: { type: 'string', nullable: true },
      }),
    ),
  },
  ['id', 'status'],
);
const mappings = {
  WorkflowController_list: page(workflow),
  WorkflowController_get: workflow,
  WorkflowController_create: workflow,
  WorkflowController_update: workflow,
  WorkflowController_trigger: obj({
    transactionId: str,
    ids: arr(str),
    status: str,
    recipients: int,
  }),
  WorkflowController_bulk: obj({ data: arr(json) }),
  WorkflowController_activity: page(
    obj({
      ...entity.properties,
      workflow_id: str,
      transaction_id: str,
      status: str,
      attempts: int,
      error: { type: 'string', nullable: true },
      cancellation_status: str,
    }),
  ),
  WorkflowController_subscribers: page(
    obj({ ...entity.properties, subscriber_id: str, profile: json, preferences: json }),
  ),
  WorkflowController_topics: arr(obj({ ...entity.properties, key: str, name: str })),
  MailController_send: obj({ id: str }),
  MailController_batch: obj({ data: arr(obj({ id: str })) }),
  MailController_list: arr(
    obj({
      id: str,
      domain_id: str,
      from: str,
      subject: str,
      status: str,
      scheduled_at: str,
      created_at: str,
    }),
  ),
  MailController_get: message,
  MailController_source: obj({ source: str }),
  MailController_domains: arr(domain),
  MailController_domain: domain,
  MailController_createDomain: obj({ id: str, name: str, status: str, records: arr(json) }),
  MailController_verify: obj({ id: str, status: str }),
  MailController_updateDomain: obj({ id: str, status: str, records: arr(json) }),
  MailController_suppressions: arr(obj({ email: str, reason: str, created_at: str })),
  PublicationController_create: publication,
  PublicationController_list: arr(publication),
  PublicationController_detail: publication,
  PublicationController_retry: obj({ id: str, status: str }),
  PublicationController_diff: obj({
    diff_token: str,
    workflows: arr(json),
    automations: arr(json),
    layouts: arr(json),
    translations: arr(json),
  }),
  DeadLettersController_list: page(
    obj({
      id: str,
      kind: {
        type: 'string',
        enum: ['workflow', 'email', 'webhook', 'inbound', 'forward', 'automation', 'publication'],
      },
      status: str,
      error: { type: 'string', nullable: true },
      attempts: int,
      created_at: str,
      redrivable: bool,
    }),
  ),
  DeadLettersController_redrive: obj({ id: str, kind: str, status: str }),
  InboundController_list: page(
    obj({
      ...entity.properties,
      domain_id: str,
      subject: { type: 'string', nullable: true },
      status: str,
      mail_from: str,
      rcpt_to: str,
    }),
  ),
  InboundController_detail: obj({
    ...entity.properties,
    subject: { type: 'string', nullable: true },
    status: str,
    mail_from: str,
    rcpt_to: str,
    attachments: arr(json),
    attempts: arr(json),
  }),
  InboundController_body: obj({ html: str, text: str }, []),
  InboundController_raw: obj({ filename: str, content: str, content_type: str }),
  InboundController_attachment: obj({ filename: str, content: str, content_type: str }),
  InboundController_rules: arr(json),
  ContentController_list: arr(
    obj({
      ...entity.properties,
      identifier: str,
      name: str,
      current_version: int,
      html: str,
      translations: bool,
    }),
  ),
  ContentController_dictionaries: arr(
    obj({
      locale: str,
      current_version: int,
      entries: { type: 'object', additionalProperties: str },
    }),
  ),
  ContentController_dictionary: obj({
    locale: str,
    version: int,
    entries: { type: 'object', additionalProperties: str },
  }),
  ContentController_preview: obj({ definition: json, resolved: json, dependencies: json }),
  AudienceController_contacts: page(
    obj({
      ...entity.properties,
      email: str,
      first_name: { type: 'string', nullable: true },
      last_name: { type: 'string', nullable: true },
      properties: json,
      unsubscribed: bool,
    }),
  ),
  AudienceController_templates: arr(json),
  AudienceController_broadcasts: arr(json),
  AudienceController_properties: arr(json),
  AudienceController_segments: arr(json),
  AudienceController_topics: arr(json),
  AutomationController_list: arr(json),
  AutomationController_runs: arr(json),
  OperationsController_endpoints: arr(json),
  OperationsController_deliveries: page(json),
  OperationsController_logs: page(json),
  OperationsController_alerts: arr(json),
  IdentityController_environments: arr(json),
  IdentityController_keys: arr(json),
  IdentityController_team: arr(json),
  IdentityController_auditLogs: arr(json),
  IntegrationController_list: arr(json),
  IntegrationController_catalog: arr(json),
};
export function responseFor(id) {
  if (id === 'OperationsController_exportLogs') return { schema: str, contentType: 'text/csv' };
  return { schema: mappings[id] ?? json };
}
