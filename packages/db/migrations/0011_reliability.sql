ALTER TABLE api_keys ADD COLUMN rate_limit integer CHECK(rate_limit BETWEEN 1 AND 10000);
ALTER TABLE api_keys ADD COLUMN rate_burst integer CHECK(rate_burst BETWEEN 1 AND 10000);
ALTER TABLE workflow_runs DROP CONSTRAINT workflow_runs_status_check;
ALTER TABLE workflow_runs ADD CHECK(status IN ('queued','dispatching','accepted','failed','ambiguous','canceled'));
ALTER TABLE workflow_runs ADD COLUMN claim_id uuid;
ALTER TABLE workflow_runs ADD COLUMN lease_until timestamptz;
ALTER TABLE workflow_runs ADD COLUMN next_attempt_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE workflow_runs ADD COLUMN cycle_attempts integer NOT NULL DEFAULT 0;
ALTER TABLE workflow_runs ADD COLUMN redrives integer NOT NULL DEFAULT 0;
ALTER TABLE workflow_runs ADD COLUMN cancellation_status text NOT NULL DEFAULT 'none' CHECK(cancellation_status IN ('none','pending','confirmed','failed'));
ALTER TABLE workflow_runs ADD COLUMN cancellation_attempts integer NOT NULL DEFAULT 0;
ALTER TABLE workflow_runs ADD COLUMN request_id text;
ALTER TABLE workflow_runs ADD COLUMN traceparent text;
ALTER TABLE workflow_runs ADD CONSTRAINT workflow_runs_tenant_id UNIQUE(org_id,environment_id,id);
CREATE TABLE workflow_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),org_id uuid NOT NULL,environment_id uuid NOT NULL,run_id uuid NOT NULL,
  kind text NOT NULL CHECK(kind IN ('trigger','cancel')),ordinal integer NOT NULL,
  status text NOT NULL DEFAULT 'started',error text,created_at timestamptz NOT NULL DEFAULT now(),finished_at timestamptz,
  UNIQUE(run_id,kind,ordinal),FOREIGN KEY(org_id,environment_id,run_id) REFERENCES workflow_runs(org_id,environment_id,id)
);
ALTER TABLE workflow_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_attempts FORCE ROW LEVEL SECURITY;
GRANT SELECT,INSERT,UPDATE,DELETE ON workflow_attempts TO flare_tenant;
CREATE POLICY tenant_scope ON workflow_attempts TO flare_tenant USING (org_id=nullif(current_setting('flare.org_id',true),'')::uuid AND environment_id=nullif(current_setting('flare.environment_id',true),'')::uuid) WITH CHECK (org_id=nullif(current_setting('flare.org_id',true),'')::uuid AND environment_id=nullif(current_setting('flare.environment_id',true),'')::uuid);
CREATE INDEX workflow_recovery ON workflow_runs(next_attempt_at) WHERE status IN ('queued','dispatching') OR cancellation_status='pending';
ALTER TABLE messages ADD COLUMN redrives integer NOT NULL DEFAULT 0;
ALTER TABLE transport_attempts ADD COLUMN retry_cycle integer NOT NULL DEFAULT 0;
ALTER TABLE request_logs ADD COLUMN trace_id text;

ALTER TABLE messages ADD COLUMN request_id text;
ALTER TABLE messages ADD COLUMN traceparent text;
