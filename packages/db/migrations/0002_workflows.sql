CREATE TABLE workflows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), org_id uuid NOT NULL, environment_id uuid NOT NULL,
  identifier text NOT NULL, definition jsonb NOT NULL, revision integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, environment_id, identifier), FOREIGN KEY (org_id, environment_id) REFERENCES environments(org_id,id)
);
CREATE TABLE subscribers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), org_id uuid NOT NULL, environment_id uuid NOT NULL,
  subscriber_id text NOT NULL, profile jsonb NOT NULL, preferences jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id,environment_id,subscriber_id), FOREIGN KEY (org_id,environment_id) REFERENCES environments(org_id,id)
);
CREATE TABLE topics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), org_id uuid NOT NULL, environment_id uuid NOT NULL,
  key text NOT NULL, name text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id,environment_id,key), UNIQUE(org_id,environment_id,id), FOREIGN KEY (org_id,environment_id) REFERENCES environments(org_id,id)
);
CREATE TABLE topic_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), org_id uuid NOT NULL, environment_id uuid NOT NULL,
  topic_id uuid NOT NULL, subscriber_id text NOT NULL, context jsonb NOT NULL DEFAULT '{}', condition jsonb,
  UNIQUE (org_id,environment_id,topic_id,subscriber_id,context),
  FOREIGN KEY (org_id,environment_id,topic_id) REFERENCES topics(org_id,environment_id,id) ON DELETE CASCADE,
  FOREIGN KEY (org_id,environment_id,subscriber_id) REFERENCES subscribers(org_id,environment_id,subscriber_id) ON DELETE CASCADE
);
CREATE TABLE integrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), org_id uuid NOT NULL, environment_id uuid NOT NULL,
  identifier text NOT NULL, provider text NOT NULL, channel text NOT NULL, name text NOT NULL,
  credential_cipher text NOT NULL, active boolean NOT NULL DEFAULT true, is_primary boolean NOT NULL DEFAULT false,
  priority integer NOT NULL DEFAULT 0, conditions jsonb, novu_id text, relay_key_id uuid REFERENCES api_keys(id), created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(org_id,environment_id,identifier), FOREIGN KEY (org_id,environment_id) REFERENCES environments(org_id,id)
);
CREATE UNIQUE INDEX integrations_primary ON integrations(org_id,environment_id,channel) WHERE is_primary AND channel IN ('email','sms');
CREATE TABLE workflow_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), org_id uuid NOT NULL, environment_id uuid NOT NULL,
  workflow_id text NOT NULL, transaction_id text NOT NULL, parent_transaction_id text NOT NULL, payload jsonb NOT NULL,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','accepted','failed','canceled')),
  response jsonb, attempts integer NOT NULL DEFAULT 0, error text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(org_id,environment_id,transaction_id), FOREIGN KEY (org_id,environment_id) REFERENCES environments(org_id,id)
);
CREATE TABLE idempotency (
  org_id uuid NOT NULL, environment_id uuid NOT NULL, operation text NOT NULL, key text NOT NULL CHECK(length(key) BETWEEN 1 AND 256),
  body_hash text NOT NULL, response jsonb NOT NULL, expires_at timestamptz NOT NULL DEFAULT now() + interval '24 hours',
  PRIMARY KEY(org_id,environment_id,operation,key), FOREIGN KEY(org_id,environment_id) REFERENCES environments(org_id,id)
);
CREATE INDEX workflow_runs_dispatch ON workflow_runs(created_at) WHERE status='queued';
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['workflows','subscribers','topics','topic_subscriptions','integrations','workflow_runs','idempotency'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',t);
    EXECUTE format('GRANT SELECT,INSERT,UPDATE,DELETE ON %I TO flare_tenant',t);
    EXECUTE format('CREATE POLICY tenant_scope ON %I TO flare_tenant USING (org_id = nullif(current_setting(''flare.org_id'',true),'''')::uuid AND environment_id = nullif(current_setting(''flare.environment_id'',true),'''')::uuid) WITH CHECK (org_id = nullif(current_setting(''flare.org_id'',true),'''')::uuid AND environment_id = nullif(current_setting(''flare.environment_id'',true),'''')::uuid)',t);
  END LOOP;
END $$;
