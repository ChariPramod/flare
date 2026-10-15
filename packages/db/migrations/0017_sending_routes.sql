CREATE TABLE mail_routes (
  id uuid NOT NULL,revision integer NOT NULL CHECK(revision>0),name text NOT NULL,
  traffic_class text NOT NULL CHECK(traffic_class IN ('transactional','marketing')),
  trust_tier text NOT NULL CHECK(trust_tier IN ('customer','pareto')),
  critical boolean NOT NULL DEFAULT false CHECK(NOT critical OR (trust_tier='pareto' AND traffic_class='transactional')),
  transport_instances jsonb NOT NULL,instance_snapshot jsonb NOT NULL,
  physical_ips jsonb NOT NULL DEFAULT '[]',proof_reference text,verified_at timestamptz,disabled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),created_by text NOT NULL,
  PRIMARY KEY(id,revision)
);
ALTER TABLE mail_routes ENABLE ROW LEVEL SECURITY;
ALTER TABLE mail_routes FORCE ROW LEVEL SECURITY;
GRANT SELECT ON mail_routes TO flare_tenant;

CREATE TABLE mail_route_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),route_id uuid NOT NULL,route_revision integer NOT NULL,
  actor_id text NOT NULL,session_id uuid NOT NULL REFERENCES sessions(id),action text NOT NULL,metadata jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),FOREIGN KEY(route_id,route_revision) REFERENCES mail_routes(id,revision)
);
ALTER TABLE mail_route_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE mail_route_audit FORCE ROW LEVEL SECURITY;
ALTER TABLE messages ADD COLUMN route_id uuid;
ALTER TABLE messages ADD COLUMN route_revision integer;
ALTER TABLE messages ADD CONSTRAINT messages_route_fk FOREIGN KEY(route_id,route_revision) REFERENCES mail_routes(id,revision);
ALTER TABLE messages ADD CHECK((route_id IS NULL)=(route_revision IS NULL));
CREATE POLICY bound_route_read ON mail_routes FOR SELECT TO flare_tenant USING (
  EXISTS(SELECT 1 FROM sending_policies p CROSS JOIN LATERAL jsonb_each(p.route_bindings) b
    WHERE p.org_id=nullif(current_setting('flare.org_id',true),'')::uuid
    AND b.value->>'id'=mail_routes.id::text AND (b.value->>'revision')::integer=mail_routes.revision)
  OR EXISTS(SELECT 1 FROM messages m WHERE m.org_id=nullif(current_setting('flare.org_id',true),'')::uuid
    AND m.environment_id=nullif(current_setting('flare.environment_id',true),'')::uuid
    AND m.route_id=mail_routes.id AND m.route_revision=mail_routes.revision)
);

ALTER TABLE transport_attempts ADD COLUMN instance_id text;
UPDATE transport_attempts SET instance_id=provider;
CREATE FUNCTION default_transport_instance() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
  NEW.instance_id=coalesce(NEW.instance_id,NEW.provider); RETURN NEW;
END $$;
CREATE TRIGGER attempt_transport_instance BEFORE INSERT ON transport_attempts FOR EACH ROW EXECUTE FUNCTION default_transport_instance();
ALTER TABLE transport_attempts ALTER COLUMN instance_id SET NOT NULL;
CREATE INDEX attempts_instance ON transport_attempts(instance_id,message_id);

ALTER TABLE domains ADD COLUMN dmarc_evidence jsonb NOT NULL DEFAULT '{}';
-- Ownership history is preserved; refresh DNS promptly without granting readiness.
UPDATE domains SET next_check_at=least(next_check_at,now()) WHERE status='verified';
CREATE TABLE domain_transport_readiness (
  org_id uuid NOT NULL,environment_id uuid NOT NULL,domain_id uuid NOT NULL,transport_instance text NOT NULL,
  evidence jsonb NOT NULL,config_fingerprint text NOT NULL,checked_at timestamptz NOT NULL DEFAULT now(),revoked_at timestamptz,
  provider_check_after timestamptz NOT NULL DEFAULT now(),provider_checked_at timestamptz,
  actor_id uuid NOT NULL REFERENCES users(id),PRIMARY KEY(org_id,environment_id,domain_id,transport_instance),
  FOREIGN KEY(org_id,environment_id,domain_id) REFERENCES domains(org_id,environment_id,id)
);
ALTER TABLE domain_transport_readiness ENABLE ROW LEVEL SECURITY;
ALTER TABLE domain_transport_readiness FORCE ROW LEVEL SECURITY;
GRANT SELECT ON domain_transport_readiness TO flare_tenant;
CREATE POLICY tenant_read ON domain_transport_readiness FOR SELECT TO flare_tenant USING (
  org_id=nullif(current_setting('flare.org_id',true),'')::uuid AND environment_id=nullif(current_setting('flare.environment_id',true),'')::uuid
);
