CREATE TABLE publication_operations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),org_id uuid NOT NULL,environment_id uuid NOT NULL,target_environment_id uuid NOT NULL,actor_id uuid NOT NULL,
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','failed','completed','superseded')),snapshot_hash text NOT NULL,error text,
 created_at timestamptz NOT NULL DEFAULT now(),completed_at timestamptz,
 UNIQUE(org_id,environment_id,id),
 FOREIGN KEY(org_id,environment_id) REFERENCES environments(org_id,id),
 FOREIGN KEY(org_id,target_environment_id) REFERENCES environments(org_id,id)
);
CREATE UNIQUE INDEX publication_one_active ON publication_operations(org_id,target_environment_id) WHERE status IN ('pending','failed');
CREATE TABLE publication_items (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),org_id uuid NOT NULL,environment_id uuid NOT NULL,operation_id uuid NOT NULL,
 ordinal integer NOT NULL,kind text NOT NULL CHECK(kind IN ('layout','workflow','translation')),identifier text NOT NULL,snapshot jsonb NOT NULL,
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','completed','failed')),attempts integer NOT NULL DEFAULT 0,failures integer NOT NULL DEFAULT 0,error text,
 next_attempt_at timestamptz NOT NULL DEFAULT now(),completed_at timestamptz,
 UNIQUE(operation_id,ordinal),FOREIGN KEY(org_id,environment_id,operation_id) REFERENCES publication_operations(org_id,environment_id,id)
);
ALTER TABLE workflows ADD COLUMN publication_blocked boolean NOT NULL DEFAULT false;
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['publication_operations','publication_items'] LOOP
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',t);
  EXECUTE format('GRANT SELECT,INSERT,UPDATE,DELETE ON %I TO flare_tenant',t);
  EXECUTE format('CREATE POLICY tenant_scope ON %I TO flare_tenant USING (org_id = nullif(current_setting(''flare.org_id'',true),'''')::uuid AND environment_id = nullif(current_setting(''flare.environment_id'',true),'''')::uuid) WITH CHECK (org_id = nullif(current_setting(''flare.org_id'',true),'''')::uuid AND environment_id = nullif(current_setting(''flare.environment_id'',true),'''')::uuid)',t);
 END LOOP;
END $$;
