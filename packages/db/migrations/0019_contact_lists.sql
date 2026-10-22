-- Import cohorts are explicit, environment-scoped audiences. Membership is
-- independent of consent; opt-outs and suppressions still apply at dispatch.
CREATE TABLE contact_lists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  environment_id uuid NOT NULL,
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 120),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id,environment_id,id),
  UNIQUE (org_id,environment_id,name),
  FOREIGN KEY (org_id,environment_id) REFERENCES environments(org_id,id)
);
CREATE TABLE contact_list_members (
  org_id uuid NOT NULL,
  environment_id uuid NOT NULL,
  list_id uuid NOT NULL,
  contact_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (org_id,environment_id,list_id,contact_id),
  FOREIGN KEY (org_id,environment_id,list_id) REFERENCES contact_lists(org_id,environment_id,id),
  FOREIGN KEY (org_id,environment_id,contact_id) REFERENCES contacts(org_id,environment_id,id)
);
CREATE INDEX contact_list_members_contact ON contact_list_members(org_id,environment_id,contact_id);
ALTER TABLE broadcasts ADD COLUMN list_id uuid;
ALTER TABLE broadcasts ADD COLUMN creation_key text,
  ADD COLUMN creation_hash text,
  ADD CONSTRAINT broadcasts_creation_key_unique UNIQUE(org_id,environment_id,creation_key),
  ADD CONSTRAINT broadcasts_creation_key_pair CHECK (
    (creation_key IS NULL AND creation_hash IS NULL)
    OR (creation_key IS NOT NULL AND length(creation_key) BETWEEN 1 AND 200
      AND creation_hash IS NOT NULL AND creation_hash ~ '^[0-9a-f]{64}$')
  );
ALTER TABLE broadcasts ADD CONSTRAINT broadcasts_contact_list_fk
  FOREIGN KEY (org_id,environment_id,list_id) REFERENCES contact_lists(org_id,environment_id,id);
ALTER TABLE broadcasts ADD CONSTRAINT broadcasts_one_audience
  CHECK (list_id IS NULL OR segment_id IS NULL);
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['contact_lists','contact_list_members'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',t);
    EXECUTE format('GRANT SELECT,INSERT,UPDATE,DELETE ON %I TO flare_tenant',t);
    EXECUTE format('CREATE POLICY tenant_scope ON %I TO flare_tenant USING (org_id = nullif(current_setting(''flare.org_id'',true),'''')::uuid AND environment_id = nullif(current_setting(''flare.environment_id'',true),'''')::uuid) WITH CHECK (org_id = nullif(current_setting(''flare.org_id'',true),'''')::uuid AND environment_id = nullif(current_setting(''flare.environment_id'',true),'''')::uuid)',t);
  END LOOP;
END $$;
