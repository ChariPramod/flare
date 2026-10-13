ALTER TABLE event_outbox ADD CONSTRAINT event_outbox_tenant_id UNIQUE(org_id,environment_id,id);
ALTER TABLE environments ADD COLUMN novu_webhook_secret_cipher text;
CREATE TABLE webhook_endpoints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),org_id uuid NOT NULL,environment_id uuid NOT NULL,
  name text NOT NULL,url text NOT NULL,events jsonb NOT NULL DEFAULT '["*"]',enabled boolean NOT NULL DEFAULT true,
  secret_cipher text NOT NULL,previous_secret_cipher text,previous_secret_until timestamptz,
  disabled_reason text,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(org_id,environment_id,id),FOREIGN KEY(org_id,environment_id) REFERENCES environments(org_id,id)
);
ALTER TABLE event_outbox ADD COLUMN target_endpoint_id uuid;
ALTER TABLE event_outbox ADD FOREIGN KEY(org_id,environment_id,target_endpoint_id) REFERENCES webhook_endpoints(org_id,environment_id,id);
CREATE TABLE webhook_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),org_id uuid NOT NULL,environment_id uuid NOT NULL,
  endpoint_id uuid NOT NULL,event_id uuid NOT NULL,payload text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','delivering','delivered','failed')),
  attempts integer NOT NULL DEFAULT 0,cycle_attempts integer NOT NULL DEFAULT 0,replays integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),claim_id uuid,lease_until timestamptz,
  error text,created_at timestamptz NOT NULL DEFAULT now(),delivered_at timestamptz,
  UNIQUE(org_id,environment_id,id),UNIQUE(endpoint_id,event_id),
  FOREIGN KEY(org_id,environment_id,endpoint_id) REFERENCES webhook_endpoints(org_id,environment_id,id),
  FOREIGN KEY(org_id,environment_id,event_id) REFERENCES event_outbox(org_id,environment_id,id)
);
CREATE INDEX webhook_deliveries_due ON webhook_deliveries(next_attempt_at) WHERE status='pending';
CREATE TABLE webhook_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),org_id uuid NOT NULL,environment_id uuid NOT NULL,
  delivery_id uuid NOT NULL,ordinal integer NOT NULL,url text NOT NULL,status_code integer,
  error text,response_excerpt text,latency_ms integer,started_at timestamptz NOT NULL DEFAULT now(),finished_at timestamptz,
  UNIQUE(delivery_id,ordinal),FOREIGN KEY(org_id,environment_id,delivery_id) REFERENCES webhook_deliveries(org_id,environment_id,id)
);
CREATE TABLE operation_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),org_id uuid NOT NULL,environment_id uuid NOT NULL,
  kind text NOT NULL,resource_id uuid NOT NULL,message text NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),resolved_at timestamptz,
  FOREIGN KEY(org_id,environment_id) REFERENCES environments(org_id,id)
);
CREATE TABLE engine_events (
  org_id uuid NOT NULL,environment_id uuid NOT NULL,source_id text NOT NULL,type text NOT NULL,data jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(environment_id,source_id),
  FOREIGN KEY(org_id,environment_id) REFERENCES environments(org_id,id)
);
CREATE TABLE request_logs (
  id uuid PRIMARY KEY,org_id uuid,environment_id uuid,key_id uuid,actor_id text,
  method text NOT NULL,path text NOT NULL,status integer NOT NULL,latency_ms integer NOT NULL,
  request_body jsonb,response_body jsonb,created_at timestamptz NOT NULL DEFAULT now(),
  CHECK((org_id IS NULL)=(environment_id IS NULL)),
  FOREIGN KEY(org_id,environment_id) REFERENCES environments(org_id,id)
);
CREATE INDEX request_logs_tenant_time ON request_logs(org_id,environment_id,created_at DESC);
CREATE INDEX request_logs_tenant_status ON request_logs(org_id,environment_id,status,created_at DESC);
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['webhook_endpoints','webhook_deliveries','webhook_attempts','operation_alerts','engine_events','request_logs'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',t);
    EXECUTE format('GRANT SELECT,INSERT,UPDATE,DELETE ON %I TO flare_tenant',t);
    EXECUTE format('CREATE POLICY tenant_scope ON %I TO flare_tenant USING (org_id = nullif(current_setting(''flare.org_id'',true),'''')::uuid AND environment_id = nullif(current_setting(''flare.environment_id'',true),'''')::uuid) WITH CHECK (org_id = nullif(current_setting(''flare.org_id'',true),'''')::uuid AND environment_id = nullif(current_setting(''flare.environment_id'',true),'''')::uuid)',t);
  END LOOP;
END $$;
CREATE INDEX event_outbox_message ON event_outbox(org_id,environment_id,(data->>'email_id'),type);
CREATE INDEX delivery_events_message ON delivery_events(org_id,environment_id,message_id,type);

ALTER TABLE api_keys ADD CONSTRAINT api_keys_tenant_id UNIQUE(org_id,environment_id,id);
ALTER TABLE request_logs ADD FOREIGN KEY(org_id,environment_id,key_id) REFERENCES api_keys(org_id,environment_id,id);
