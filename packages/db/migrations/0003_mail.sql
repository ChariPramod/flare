CREATE TABLE domains (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), org_id uuid NOT NULL, environment_id uuid NOT NULL,
  name text NOT NULL CHECK(name=lower(name)), region text NOT NULL DEFAULT 'us-east-1',
  status text NOT NULL DEFAULT 'not_started' CHECK(status IN ('not_started','pending','verified','failed','temporary_failure')),
  sending boolean NOT NULL DEFAULT true, receiving boolean NOT NULL DEFAULT false,
  open_tracking boolean NOT NULL DEFAULT false, click_tracking boolean NOT NULL DEFAULT false,
  tracking_subdomain text NOT NULL DEFAULT 'track', enforce_tls boolean NOT NULL DEFAULT false,
  dkim_selector text NOT NULL, dkim_public text NOT NULL, dkim_private_cipher text NOT NULL,
  records jsonb NOT NULL DEFAULT '[]', verification_attempts integer NOT NULL DEFAULT 0,
  next_check_at timestamptz NOT NULL DEFAULT now(), verified_at timestamptz, checked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(org_id,environment_id,name), UNIQUE(org_id,environment_id,id),
  FOREIGN KEY(org_id,environment_id) REFERENCES environments(org_id,id)
);
ALTER TABLE api_keys ADD CONSTRAINT api_keys_domain_fk FOREIGN KEY(org_id,environment_id,domain_id) REFERENCES domains(org_id,environment_id,id);
CREATE FUNCTION immutable_api_key_scope() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
  IF NEW.permission IS DISTINCT FROM OLD.permission OR NEW.domain_id IS DISTINCT FROM OLD.domain_id OR NEW.org_id IS DISTINCT FROM OLD.org_id OR NEW.environment_id IS DISTINCT FROM OLD.environment_id THEN
    RAISE EXCEPTION 'API key permission and scope are immutable';
  END IF; RETURN NEW;
END $$;
CREATE TRIGGER api_key_scope BEFORE UPDATE ON api_keys FOR EACH ROW EXECUTE FUNCTION immutable_api_key_scope();
CREATE TABLE messages (
  id uuid PRIMARY KEY, org_id uuid NOT NULL, environment_id uuid NOT NULL, domain_id uuid NOT NULL,
  request jsonb NOT NULL, mime_key text, envelope_from text NOT NULL,
  status text NOT NULL CHECK(status IN ('queued','scheduled','sent','delivered','delivery_delayed','bounced','complained','failed','suppressed','canceled')),
  scheduled_at timestamptz NOT NULL DEFAULT now(), delivery_started_at timestamptz, delivery_finished_at timestamptz, claim_id uuid, lease_until timestamptz,
  error text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(org_id,environment_id,id), UNIQUE(org_id,id), FOREIGN KEY(org_id,environment_id,domain_id) REFERENCES domains(org_id,environment_id,id)
);
CREATE INDEX messages_dispatch ON messages(scheduled_at) WHERE status IN ('queued','scheduled');
CREATE TABLE message_recipients (
  org_id uuid NOT NULL, environment_id uuid NOT NULL, message_id uuid NOT NULL, address text NOT NULL CHECK(address=lower(address)),
  kind text NOT NULL CHECK(kind IN ('to','cc','bcc')), status text NOT NULL DEFAULT 'queued',
  PRIMARY KEY(org_id,environment_id,message_id,address), FOREIGN KEY(org_id,environment_id,message_id) REFERENCES messages(org_id,environment_id,id) ON DELETE CASCADE
);
CREATE TABLE transport_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), org_id uuid NOT NULL, environment_id uuid NOT NULL, message_id uuid NOT NULL,
  provider text NOT NULL, ordinal integer NOT NULL, status text NOT NULL CHECK(status IN ('started','accepted','transient_failure','permanent_failure','ambiguous')),
  provider_ids jsonb NOT NULL DEFAULT '{}', recipients jsonb NOT NULL, error text, started_at timestamptz NOT NULL DEFAULT now(), finished_at timestamptz,
  UNIQUE(org_id,environment_id,message_id,ordinal), FOREIGN KEY(org_id,environment_id,message_id) REFERENCES messages(org_id,environment_id,id)
);
CREATE INDEX transport_attempt_provider_ids ON transport_attempts USING gin(provider_ids);
CREATE TABLE delivery_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), org_id uuid NOT NULL, environment_id uuid NOT NULL, message_id uuid NOT NULL,
  source text NOT NULL, source_id text NOT NULL, type text NOT NULL, recipient text, data jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(source,source_id),
  FOREIGN KEY(org_id,environment_id,message_id) REFERENCES messages(org_id,environment_id,id)
);
CREATE TABLE suppressions (
  org_id uuid NOT NULL REFERENCES organizations(id), address text NOT NULL CHECK(address=lower(address)),
  reason text NOT NULL CHECK(reason IN ('manual','hard_bounce','complaint','soft_bounce')), created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(org_id,address)
);
CREATE TABLE event_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), org_id uuid NOT NULL, environment_id uuid NOT NULL,
  type text NOT NULL, data jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), dispatched_at timestamptz,
  FOREIGN KEY(org_id,environment_id) REFERENCES environments(org_id,id)
);
CREATE INDEX event_outbox_pending ON event_outbox(created_at) WHERE dispatched_at IS NULL;
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['domains','messages','message_recipients','transport_attempts','delivery_events','event_outbox'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',t);
    EXECUTE format('GRANT SELECT,INSERT,UPDATE,DELETE ON %I TO flare_tenant',t);
    EXECUTE format('CREATE POLICY tenant_scope ON %I TO flare_tenant USING (org_id = nullif(current_setting(''flare.org_id'',true),'''')::uuid AND environment_id = nullif(current_setting(''flare.environment_id'',true),'''')::uuid) WITH CHECK (org_id = nullif(current_setting(''flare.org_id'',true),'''')::uuid AND environment_id = nullif(current_setting(''flare.environment_id'',true),'''')::uuid)',t);
  END LOOP;
END $$;
ALTER TABLE suppressions ENABLE ROW LEVEL SECURITY;
ALTER TABLE suppressions FORCE ROW LEVEL SECURITY;
GRANT SELECT,INSERT,UPDATE,DELETE ON suppressions TO flare_tenant;
CREATE POLICY org_scope ON suppressions TO flare_tenant USING (org_id=nullif(current_setting('flare.org_id',true),'')::uuid) WITH CHECK (org_id=nullif(current_setting('flare.org_id',true),'')::uuid);
