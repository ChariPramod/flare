CREATE TABLE contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),org_id uuid NOT NULL,environment_id uuid NOT NULL,
  email text NOT NULL CHECK(email=lower(email)),first_name text NOT NULL DEFAULT '',last_name text NOT NULL DEFAULT '',
  properties jsonb NOT NULL DEFAULT '{}',unsubscribed boolean NOT NULL DEFAULT false,deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(org_id,environment_id,id),UNIQUE(org_id,environment_id,email),
  FOREIGN KEY(org_id,environment_id) REFERENCES environments(org_id,id)
);
CREATE TABLE contact_properties (
  org_id uuid NOT NULL,environment_id uuid NOT NULL,name text NOT NULL,
  type text NOT NULL CHECK(type IN ('string','number','boolean','date')),fallback jsonb,
  PRIMARY KEY(org_id,environment_id,name),FOREIGN KEY(org_id,environment_id) REFERENCES environments(org_id,id)
);
CREATE TABLE audience_segments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),org_id uuid NOT NULL,environment_id uuid NOT NULL,
  name text NOT NULL,definition jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(org_id,environment_id,id),FOREIGN KEY(org_id,environment_id) REFERENCES environments(org_id,id)
);
CREATE TABLE audience_topics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),org_id uuid NOT NULL,environment_id uuid NOT NULL,
  name text NOT NULL,description text NOT NULL DEFAULT '',default_opt_in boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(org_id,environment_id,id),
  FOREIGN KEY(org_id,environment_id) REFERENCES environments(org_id,id)
);
CREATE TABLE contact_topic_preferences (
  org_id uuid NOT NULL,environment_id uuid NOT NULL,contact_id uuid NOT NULL,topic_id uuid NOT NULL,enabled boolean NOT NULL,
  PRIMARY KEY(org_id,environment_id,contact_id,topic_id),
  FOREIGN KEY(org_id,environment_id,contact_id) REFERENCES contacts(org_id,environment_id,id),
  FOREIGN KEY(org_id,environment_id,topic_id) REFERENCES audience_topics(org_id,environment_id,id)
);
CREATE TABLE email_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),org_id uuid NOT NULL,environment_id uuid NOT NULL,
  name text NOT NULL,identifier text NOT NULL,current_version integer NOT NULL DEFAULT 1,archived boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(org_id,environment_id,id),UNIQUE(org_id,environment_id,identifier),
  FOREIGN KEY(org_id,environment_id) REFERENCES environments(org_id,id)
);
CREATE TABLE template_versions (
  org_id uuid NOT NULL,environment_id uuid NOT NULL,template_id uuid NOT NULL,version integer NOT NULL,
  subject text NOT NULL,html text NOT NULL,text_body text,variables jsonb NOT NULL DEFAULT '{}',created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(org_id,environment_id,template_id,version),
  FOREIGN KEY(org_id,environment_id,template_id) REFERENCES email_templates(org_id,environment_id,id)
);
CREATE TABLE broadcasts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),org_id uuid NOT NULL,environment_id uuid NOT NULL,
  name text NOT NULL,sender text NOT NULL,template_id uuid NOT NULL,template_version integer NOT NULL,
  segment_id uuid,topic_id uuid,status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','scheduled','sending','sent','canceled')),
  rate_per_second integer NOT NULL DEFAULT 10 CHECK(rate_per_second BETWEEN 1 AND 50),
  scheduled_at timestamptz,next_dispatch_at timestamptz,started_at timestamptz,finished_at timestamptz,error text,
  created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(org_id,environment_id,id),FOREIGN KEY(org_id,environment_id) REFERENCES environments(org_id,id),
  FOREIGN KEY(org_id,environment_id,template_id,template_version) REFERENCES template_versions(org_id,environment_id,template_id,version),
  FOREIGN KEY(org_id,environment_id,segment_id) REFERENCES audience_segments(org_id,environment_id,id),
  FOREIGN KEY(org_id,environment_id,topic_id) REFERENCES audience_topics(org_id,environment_id,id)
);
CREATE TABLE broadcast_recipients (
  org_id uuid NOT NULL,environment_id uuid NOT NULL,broadcast_id uuid NOT NULL,contact_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','queued','skipped','failed','canceled')),
  message_id uuid,error text,created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(org_id,environment_id,broadcast_id,contact_id),
  FOREIGN KEY(org_id,environment_id,broadcast_id) REFERENCES broadcasts(org_id,environment_id,id),
  FOREIGN KEY(org_id,environment_id,contact_id) REFERENCES contacts(org_id,environment_id,id),
  FOREIGN KEY(org_id,environment_id,message_id) REFERENCES messages(org_id,environment_id,id)
);
ALTER TABLE messages ADD COLUMN broadcast_id uuid,ADD COLUMN contact_id uuid,ADD COLUMN audience_topic_id uuid;
ALTER TABLE messages ADD FOREIGN KEY(org_id,environment_id,broadcast_id) REFERENCES broadcasts(org_id,environment_id,id);
ALTER TABLE messages ADD FOREIGN KEY(org_id,environment_id,contact_id) REFERENCES contacts(org_id,environment_id,id);
ALTER TABLE messages ADD FOREIGN KEY(org_id,environment_id,audience_topic_id) REFERENCES audience_topics(org_id,environment_id,id);
CREATE INDEX broadcasts_due ON broadcasts(next_dispatch_at) WHERE status IN ('scheduled','sending');
CREATE INDEX broadcast_recipients_pending ON broadcast_recipients(broadcast_id,contact_id) WHERE status='pending';
CREATE INDEX messages_broadcast ON messages(org_id,environment_id,broadcast_id);
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['contacts','contact_properties','audience_segments','audience_topics','contact_topic_preferences','email_templates','template_versions','broadcasts','broadcast_recipients'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',t);
    EXECUTE format('GRANT SELECT,INSERT,UPDATE,DELETE ON %I TO flare_tenant',t);
    EXECUTE format('CREATE POLICY tenant_scope ON %I TO flare_tenant USING (org_id = nullif(current_setting(''flare.org_id'',true),'''')::uuid AND environment_id = nullif(current_setting(''flare.environment_id'',true),'''')::uuid) WITH CHECK (org_id = nullif(current_setting(''flare.org_id'',true),'''')::uuid AND environment_id = nullif(current_setting(''flare.environment_id'',true),'''')::uuid)',t);
  END LOOP;
END $$;
REVOKE UPDATE,DELETE ON template_versions FROM flare_tenant;
