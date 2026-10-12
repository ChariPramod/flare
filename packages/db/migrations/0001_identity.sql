CREATE TABLE organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL, slug text UNIQUE NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), email text UNIQUE NOT NULL, name text NOT NULL,
  password_hash text, mfa_secret text, mfa_pending text, mfa_last_counter bigint NOT NULL DEFAULT -1,
  recovery_hashes jsonb NOT NULL DEFAULT '[]', created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE memberships (
  org_id uuid NOT NULL REFERENCES organizations(id), user_id uuid NOT NULL REFERENCES users(id),
  role text NOT NULL CHECK (role IN ('owner','admin','developer','viewer')), created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (org_id, user_id)
);
CREATE TABLE environments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), org_id uuid NOT NULL REFERENCES organizations(id),
  name text NOT NULL CHECK (name IN ('Development','Production')), novu_key_cipher text,
  novu_application_id text, bridge_url text, created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, name), UNIQUE (org_id, id)
);
CREATE TABLE sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES users(id),
  expires_at timestamptz NOT NULL, revoked_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE oidc_identities (
  issuer text NOT NULL, subject text NOT NULL, user_id uuid NOT NULL REFERENCES users(id), PRIMARY KEY (issuer, subject)
);
CREATE TABLE api_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), org_id uuid NOT NULL REFERENCES organizations(id),
  environment_id uuid NOT NULL, name text NOT NULL, token_hash text UNIQUE NOT NULL, prefix text NOT NULL,
  permission text NOT NULL CHECK (permission IN ('full_access','sending_access')), domain_id uuid,
  created_by uuid REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now(), last_used_at timestamptz, revoked_at timestamptz,
  FOREIGN KEY (org_id, environment_id) REFERENCES environments(org_id,id),
  CHECK (domain_id IS NULL OR permission = 'sending_access')
);
CREATE TABLE invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), org_id uuid NOT NULL REFERENCES organizations(id),
  email text NOT NULL, role text NOT NULL CHECK (role IN ('admin','developer','viewer')), token_hash text UNIQUE NOT NULL,
  expires_at timestamptz NOT NULL, accepted_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), org_id uuid NOT NULL REFERENCES organizations(id), environment_id uuid,
  actor_id text NOT NULL, action text NOT NULL, resource_id text, metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(), FOREIGN KEY (org_id, environment_id) REFERENCES environments(org_id,id)
);
CREATE INDEX audit_logs_tenant_created ON audit_logs(org_id, environment_id, created_at DESC);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'flare_tenant') THEN
    CREATE ROLE flare_tenant NOLOGIN NOSUPERUSER NOBYPASSRLS;
  END IF;
END $$;
GRANT USAGE ON SCHEMA public TO flare_tenant;
GRANT SELECT, INSERT, UPDATE, DELETE ON environments, api_keys, invites, audit_logs TO flare_tenant;
ALTER TABLE environments ENABLE ROW LEVEL SECURITY;
ALTER TABLE environments FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_environment ON environments TO flare_tenant USING (org_id = nullif(current_setting('flare.org_id', true),'')::uuid) WITH CHECK (org_id = nullif(current_setting('flare.org_id', true),'')::uuid);
ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_keys FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_api_key ON api_keys TO flare_tenant USING (org_id = nullif(current_setting('flare.org_id', true),'')::uuid AND environment_id = nullif(current_setting('flare.environment_id', true),'')::uuid) WITH CHECK (org_id = nullif(current_setting('flare.org_id', true),'')::uuid AND environment_id = nullif(current_setting('flare.environment_id', true),'')::uuid);
ALTER TABLE invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE invites FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_invite ON invites TO flare_tenant USING (org_id = nullif(current_setting('flare.org_id', true),'')::uuid) WITH CHECK (org_id = nullif(current_setting('flare.org_id', true),'')::uuid);
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_audit ON audit_logs TO flare_tenant USING (org_id = nullif(current_setting('flare.org_id', true),'')::uuid AND (environment_id IS NULL OR environment_id = nullif(current_setting('flare.environment_id', true),'')::uuid));
