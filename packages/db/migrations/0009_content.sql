ALTER TABLE workflows ADD COLUMN source_definition jsonb;
UPDATE workflows SET source_definition=definition;
ALTER TABLE workflows ADD COLUMN content_dependencies jsonb NOT NULL DEFAULT '{"layouts":[],"templates":[],"translations":[]}';
CREATE TABLE layouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),org_id uuid NOT NULL,environment_id uuid NOT NULL,
  identifier text NOT NULL,name text NOT NULL,current_version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(org_id,environment_id,id),UNIQUE(org_id,environment_id,identifier),
  FOREIGN KEY(org_id,environment_id) REFERENCES environments(org_id,id)
);
CREATE TABLE layout_versions (
  org_id uuid NOT NULL,environment_id uuid NOT NULL,layout_id uuid NOT NULL,version integer NOT NULL,
  html text NOT NULL,translations boolean NOT NULL DEFAULT false,created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(org_id,environment_id,layout_id,version),
  FOREIGN KEY(org_id,environment_id,layout_id) REFERENCES layouts(org_id,environment_id,id)
);
CREATE TABLE translations (
  org_id uuid NOT NULL,environment_id uuid NOT NULL,workflow_identifier text NOT NULL,locale text NOT NULL,
  current_version integer NOT NULL DEFAULT 1,updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(org_id,environment_id,workflow_identifier,locale),
  FOREIGN KEY(org_id,environment_id,workflow_identifier) REFERENCES workflows(org_id,environment_id,identifier) ON DELETE CASCADE
);
CREATE TABLE translation_versions (
  org_id uuid NOT NULL,environment_id uuid NOT NULL,workflow_identifier text NOT NULL,locale text NOT NULL,version integer NOT NULL,
  entries jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(org_id,environment_id,workflow_identifier,locale,version),
  FOREIGN KEY(org_id,environment_id,workflow_identifier,locale) REFERENCES translations(org_id,environment_id,workflow_identifier,locale) ON DELETE CASCADE
);
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['layouts','layout_versions','translations','translation_versions'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',t);
    EXECUTE format('GRANT SELECT,INSERT,UPDATE,DELETE ON %I TO flare_tenant',t);
    EXECUTE format('CREATE POLICY tenant_scope ON %I TO flare_tenant USING (org_id = nullif(current_setting(''flare.org_id'',true),'''')::uuid AND environment_id = nullif(current_setting(''flare.environment_id'',true),'''')::uuid) WITH CHECK (org_id = nullif(current_setting(''flare.org_id'',true),'''')::uuid AND environment_id = nullif(current_setting(''flare.environment_id'',true),'''')::uuid)',t);
  END LOOP;
END $$;
REVOKE UPDATE,DELETE ON layout_versions,translation_versions FROM flare_tenant;
