CREATE TABLE inbound_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), org_id uuid NOT NULL, environment_id uuid NOT NULL,
  domain_id uuid NOT NULL, postal_id text NOT NULL, content_hash text NOT NULL,
  mail_from text NOT NULL, rcpt_to text NOT NULL, raw_key text NOT NULL, size integer NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','parsed','failed')),
  subject text, headers jsonb, body_key text, error text, attempts integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(), created_at timestamptz NOT NULL DEFAULT now(), parsed_at timestamptz,
  UNIQUE(org_id,environment_id,id), UNIQUE(org_id,environment_id,domain_id,postal_id),
  FOREIGN KEY(org_id,environment_id,domain_id) REFERENCES domains(org_id,environment_id,id)
);
CREATE TABLE inbound_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), org_id uuid NOT NULL, environment_id uuid NOT NULL,
  inbound_id uuid NOT NULL, filename text NOT NULL, content_type text NOT NULL, size integer NOT NULL,
  content_id text, object_key text NOT NULL,
  FOREIGN KEY(org_id,environment_id,inbound_id) REFERENCES inbound_messages(org_id,environment_id,id)
);
CREATE TABLE inbound_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), org_id uuid NOT NULL, environment_id uuid NOT NULL,
  inbound_id uuid NOT NULL, ordinal integer NOT NULL, status text NOT NULL, error text, created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(inbound_id,ordinal),
  FOREIGN KEY(org_id,environment_id,inbound_id) REFERENCES inbound_messages(org_id,environment_id,id)
);
CREATE TABLE forwarding_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), org_id uuid NOT NULL, environment_id uuid NOT NULL,
  domain_id uuid NOT NULL, recipient text, sender text NOT NULL, destinations jsonb NOT NULL,
  enabled boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(org_id,environment_id,id),
  FOREIGN KEY(org_id,environment_id,domain_id) REFERENCES domains(org_id,environment_id,id)
);
CREATE TABLE inbound_forwards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), org_id uuid NOT NULL, environment_id uuid NOT NULL,
  inbound_id uuid NOT NULL, rule_id uuid NOT NULL, rule jsonb NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','submitted','failed','skipped')),
  message_id uuid, error text, attempts integer NOT NULL DEFAULT 0, next_attempt_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(inbound_id,rule_id),
  FOREIGN KEY(org_id,environment_id,inbound_id) REFERENCES inbound_messages(org_id,environment_id,id),
  FOREIGN KEY(org_id,environment_id,rule_id) REFERENCES forwarding_rules(org_id,environment_id,id),
  FOREIGN KEY(org_id,environment_id,message_id) REFERENCES messages(org_id,environment_id,id)
);
CREATE INDEX inbound_pending ON inbound_messages(next_attempt_at) WHERE status='pending';
CREATE INDEX inbound_forwards_pending ON inbound_forwards(next_attempt_at) WHERE status='pending';
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['inbound_messages','inbound_attachments','inbound_attempts','forwarding_rules','inbound_forwards'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',t);
    EXECUTE format('GRANT SELECT,INSERT,UPDATE,DELETE ON %I TO flare_tenant',t);
    EXECUTE format('CREATE POLICY tenant_scope ON %I TO flare_tenant USING (org_id = nullif(current_setting(''flare.org_id'',true),'''')::uuid AND environment_id = nullif(current_setting(''flare.environment_id'',true),'''')::uuid) WITH CHECK (org_id = nullif(current_setting(''flare.org_id'',true),'''')::uuid AND environment_id = nullif(current_setting(''flare.environment_id'',true),'''')::uuid)',t);
  END LOOP;
END $$;
