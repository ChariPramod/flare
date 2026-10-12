CREATE TABLE soft_bounces (
  org_id uuid NOT NULL REFERENCES organizations(id), address text NOT NULL CHECK(address=lower(address)),
  message_id uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(org_id,address,message_id), FOREIGN KEY(org_id,message_id) REFERENCES messages(org_id,id)
);
CREATE INDEX soft_bounces_window ON soft_bounces(org_id,address,created_at);
ALTER TABLE soft_bounces ENABLE ROW LEVEL SECURITY;
ALTER TABLE soft_bounces FORCE ROW LEVEL SECURITY;
GRANT SELECT,INSERT,UPDATE,DELETE ON soft_bounces TO flare_tenant;
CREATE POLICY org_scope ON soft_bounces TO flare_tenant USING (org_id=nullif(current_setting('flare.org_id',true),'')::uuid) WITH CHECK (org_id=nullif(current_setting('flare.org_id',true),'')::uuid);
