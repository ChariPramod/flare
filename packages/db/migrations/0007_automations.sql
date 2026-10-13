CREATE TABLE automations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),org_id uuid NOT NULL,environment_id uuid NOT NULL,
  identifier text NOT NULL,name text NOT NULL,definition jsonb NOT NULL,revision integer NOT NULL DEFAULT 1,
  enabled boolean NOT NULL DEFAULT false,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(org_id,environment_id,id),UNIQUE(org_id,environment_id,identifier),
  FOREIGN KEY(org_id,environment_id) REFERENCES environments(org_id,id)
);
CREATE TABLE automation_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),org_id uuid NOT NULL,environment_id uuid NOT NULL,
  contact_id uuid NOT NULL,name text NOT NULL,data jsonb NOT NULL DEFAULT '{}',external_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),dispatched_at timestamptz,
  UNIQUE(org_id,environment_id,id),UNIQUE(org_id,environment_id,external_id),
  FOREIGN KEY(org_id,environment_id,contact_id) REFERENCES contacts(org_id,environment_id,id)
);
CREATE TABLE automation_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),org_id uuid NOT NULL,environment_id uuid NOT NULL,
  automation_id uuid NOT NULL,contact_id uuid NOT NULL,event_id uuid NOT NULL,definition jsonb NOT NULL,revision integer NOT NULL,
  current_step text,status text NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','waiting','completed','failed','canceled')),
  next_step_at timestamptz NOT NULL DEFAULT now(),attempts integer NOT NULL DEFAULT 0,error text,
  created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),finished_at timestamptz,
  UNIQUE(org_id,environment_id,id),UNIQUE(automation_id,event_id),
  FOREIGN KEY(org_id,environment_id,automation_id) REFERENCES automations(org_id,environment_id,id),
  FOREIGN KEY(org_id,environment_id,contact_id) REFERENCES contacts(org_id,environment_id,id),
  FOREIGN KEY(org_id,environment_id,event_id) REFERENCES automation_events(org_id,environment_id,id)
);
CREATE TABLE automation_steps (
  org_id uuid NOT NULL,environment_id uuid NOT NULL,run_id uuid NOT NULL,step_id text NOT NULL,
  type text NOT NULL,status text NOT NULL CHECK(status IN ('waiting','completed','skipped','failed','canceled')),
  started_at timestamptz NOT NULL DEFAULT now(),finished_at timestamptz,wake_at timestamptz,
  message_id uuid,matched_event_id uuid,error text,
  PRIMARY KEY(org_id,environment_id,run_id,step_id),
  FOREIGN KEY(org_id,environment_id,run_id) REFERENCES automation_runs(org_id,environment_id,id),
  FOREIGN KEY(org_id,environment_id,message_id) REFERENCES messages(org_id,environment_id,id),
  FOREIGN KEY(org_id,environment_id,matched_event_id) REFERENCES automation_events(org_id,environment_id,id)
);
ALTER TABLE messages ADD COLUMN automation_run_id uuid;
ALTER TABLE messages ADD FOREIGN KEY(org_id,environment_id,automation_run_id) REFERENCES automation_runs(org_id,environment_id,id);
ALTER TABLE event_outbox ADD COLUMN automation_dispatched_at timestamptz;
CREATE INDEX automation_events_pending ON automation_events(created_at) WHERE dispatched_at IS NULL;
CREATE INDEX automation_events_contact ON automation_events(org_id,environment_id,contact_id,name,created_at);
CREATE INDEX automation_runs_due ON automation_runs(next_step_at) WHERE status IN ('queued','waiting');
CREATE INDEX outbox_automation_pending ON event_outbox(created_at) WHERE automation_dispatched_at IS NULL;
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['automations','automation_events','automation_runs','automation_steps'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',t);
    EXECUTE format('GRANT SELECT,INSERT,UPDATE,DELETE ON %I TO flare_tenant',t);
    EXECUTE format('CREATE POLICY tenant_scope ON %I TO flare_tenant USING (org_id = nullif(current_setting(''flare.org_id'',true),'''')::uuid AND environment_id = nullif(current_setting(''flare.environment_id'',true),'''')::uuid) WITH CHECK (org_id = nullif(current_setting(''flare.org_id'',true),'''')::uuid AND environment_id = nullif(current_setting(''flare.environment_id'',true),'''')::uuid)',t);
  END LOOP;
END $$;
