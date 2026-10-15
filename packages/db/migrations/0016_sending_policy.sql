ALTER TABLE sessions ADD COLUMN operator_mfa_at timestamptz;
ALTER TABLE api_keys ADD COLUMN mail_traffic_class text CHECK(mail_traffic_class IN ('transactional','marketing'));
ALTER TABLE api_keys ADD COLUMN critical_sending boolean NOT NULL DEFAULT false;
CREATE FUNCTION operator_key_bindings_only() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
  IF current_user='flare_tenant' THEN
    IF TG_OP='INSERT' THEN
      IF NEW.mail_traffic_class IS NOT NULL OR NEW.critical_sending THEN RAISE EXCEPTION 'Operator approval is required for sending bindings'; END IF;
    ELSIF NEW.mail_traffic_class IS DISTINCT FROM OLD.mail_traffic_class OR NEW.critical_sending IS DISTINCT FROM OLD.critical_sending THEN
      RAISE EXCEPTION 'Operator approval is required for sending bindings';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER api_key_operator_bindings BEFORE INSERT OR UPDATE ON api_keys FOR EACH ROW EXECUTE FUNCTION operator_key_bindings_only();

CREATE TABLE sending_policies (
  org_id uuid PRIMARY KEY REFERENCES organizations(id),
  state text NOT NULL DEFAULT 'pending_review' CHECK(state IN ('pending_review','approved','suspended')),
  revision integer NOT NULL DEFAULT 0,
  daily_limit integer NOT NULL DEFAULT 100 CHECK(daily_limit BETWEEN 1 AND 1000000),
  per_minute_limit integer NOT NULL DEFAULT 10 CHECK(per_minute_limit BETWEEN 1 AND 10000),
  complaint_threshold integer NOT NULL DEFAULT 1 CHECK(complaint_threshold BETWEEN 1 AND 100),
  hard_bounce_rate numeric NOT NULL DEFAULT 0.05 CHECK(hard_bounce_rate BETWEEN 0 AND 1),
  hard_bounce_min integer NOT NULL DEFAULT 20 CHECK(hard_bounce_min BETWEEN 1 AND 10000),
  marketing_enabled boolean NOT NULL DEFAULT false,
  default_traffic_class text CHECK(default_traffic_class IN ('transactional','marketing')),
  trust_tier text NOT NULL DEFAULT 'customer' CHECK(trust_tier IN ('customer','pareto')),
  route_bindings jsonb NOT NULL DEFAULT '{}',
  suspension_reason text, reviewed_at timestamptz, feedback_reviewed_at timestamptz, updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO sending_policies(org_id) SELECT id FROM organizations;
CREATE FUNCTION initialize_sending_policy() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
  INSERT INTO sending_policies(org_id) VALUES(NEW.id); RETURN NEW;
END $$;
CREATE TRIGGER organization_sending_policy AFTER INSERT ON organizations FOR EACH ROW EXECUTE FUNCTION initialize_sending_policy();
ALTER TABLE sending_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE sending_policies FORCE ROW LEVEL SECURITY;
GRANT SELECT ON sending_policies TO flare_tenant;
CREATE POLICY org_read ON sending_policies FOR SELECT TO flare_tenant USING(org_id=nullif(current_setting('flare.org_id',true),'')::uuid);

ALTER TABLE messages DROP CONSTRAINT messages_status_check;
ALTER TABLE messages ADD CHECK(status IN ('queued','scheduled','held','sent','delivered','delivery_delayed','bounced','complained','failed','suppressed','canceled'));
ALTER TABLE messages ADD COLUMN traffic_class text CHECK(traffic_class IN ('transactional','marketing'));
ALTER TABLE messages ADD COLUMN policy_revision integer;
ALTER TABLE messages ADD COLUMN route_snapshot jsonb;
ALTER TABLE messages ADD COLUMN hold_reason text;
ALTER TABLE messages ADD COLUMN sandbox boolean NOT NULL DEFAULT false;
ALTER TABLE messages ADD COLUMN submitting_key_id uuid;
ALTER TABLE messages ADD CONSTRAINT messages_submitting_key_fk FOREIGN KEY(org_id,environment_id,submitting_key_id) REFERENCES api_keys(org_id,environment_id,id);

CREATE TABLE sending_quota (
  org_id uuid NOT NULL REFERENCES organizations(id),environment_id uuid NOT NULL,message_id uuid NOT NULL,
  recipient text NOT NULL,
  state text NOT NULL CHECK(state IN ('reserved','consumed','released')),
  consumed_at timestamptz,created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(org_id,message_id,recipient),
  FOREIGN KEY(org_id,environment_id,message_id,recipient) REFERENCES message_recipients(org_id,environment_id,message_id,address)
);
CREATE INDEX sending_quota_usage ON sending_quota(org_id,state,consumed_at);
CREATE TABLE sending_dispatches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),org_id uuid NOT NULL REFERENCES organizations(id),environment_id uuid NOT NULL,
  message_id uuid NOT NULL,recipients integer NOT NULL CHECK(recipients>0),created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(org_id,environment_id,message_id) REFERENCES messages(org_id,environment_id,id)
);
CREATE INDEX sending_dispatch_window ON sending_dispatches(org_id,created_at);
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['sending_quota','sending_dispatches'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',t);
    EXECUTE format('GRANT SELECT,INSERT,UPDATE,DELETE ON %I TO flare_tenant',t);
    EXECUTE format('CREATE POLICY org_scope ON %I TO flare_tenant USING(org_id=nullif(current_setting(''flare.org_id'',true),'''')::uuid) WITH CHECK(org_id=nullif(current_setting(''flare.org_id'',true),'''')::uuid)',t);
  END LOOP;
END $$;

-- Old pending real sends have no reviewed purpose or route. Keep their identity and MIME.
UPDATE messages SET status='held',hold_reason='classification_required',next_attempt_at=now()
WHERE delivery_finished_at IS NULL AND delivery_started_at IS NULL AND status IN ('queued','scheduled');
