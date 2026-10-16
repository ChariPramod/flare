-- Only uploads created after this migration are eligible for collection. Legacy
-- keys are never discovered by listing a bucket. Tombstones deliberately persist.
CREATE TABLE object_uploads (
  id uuid PRIMARY KEY,
  org_id uuid NOT NULL,
  environment_id uuid NOT NULL,
  storage_identity text NOT NULL CHECK (storage_identity ~ '^[0-9a-f]{64}$'),
  object_key text NOT NULL CHECK (length(object_key) BETWEEN 1 AND 1024),
  state text NOT NULL DEFAULT 'prepared' CHECK (state IN ('prepared','adopted','tombstoned')),
  created_at timestamptz NOT NULL DEFAULT now(),
  adopted_at timestamptz,
  tombstoned_at timestamptz,
  next_check_at timestamptz NOT NULL DEFAULT now()+interval '1 hour',
  delete_attempts integer NOT NULL DEFAULT 0,
  last_deleted_at timestamptz,
  UNIQUE(storage_identity,object_key),
  FOREIGN KEY(org_id,environment_id) REFERENCES environments(org_id,id) ON DELETE RESTRICT
);
CREATE INDEX object_uploads_sweep ON object_uploads(storage_identity,next_check_at,id);
ALTER TABLE object_uploads ENABLE ROW LEVEL SECURITY;
ALTER TABLE object_uploads FORCE ROW LEVEL SECURITY;
GRANT SELECT ON object_uploads TO flare_tenant;
GRANT UPDATE(state,adopted_at) ON object_uploads TO flare_tenant;
CREATE POLICY tenant_scope ON object_uploads TO flare_tenant
  USING (org_id=nullif(current_setting('flare.org_id',true),'')::uuid AND environment_id=nullif(current_setting('flare.environment_id',true),'')::uuid)
  WITH CHECK (org_id=nullif(current_setting('flare.org_id',true),'')::uuid AND environment_id=nullif(current_setting('flare.environment_id',true),'')::uuid);
CREATE FUNCTION protect_object_upload() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW.org_id IS DISTINCT FROM OLD.org_id OR NEW.environment_id IS DISTINCT FROM OLD.environment_id OR NEW.storage_identity IS DISTINCT FROM OLD.storage_identity OR NEW.object_key IS DISTINCT FROM OLD.object_key OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'Upload identity is immutable';
  END IF;
  IF current_user='flare_tenant' AND (OLD.state<>'prepared' OR NEW.state<>'adopted' OR NEW.adopted_at IS NULL) THEN
    RAISE EXCEPTION 'Only prepared uploads may be adopted';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER object_upload_immutable BEFORE UPDATE ON object_uploads FOR EACH ROW EXECUTE FUNCTION protect_object_upload();
CREATE INDEX messages_mime_key ON messages(mime_key) WHERE mime_key IS NOT NULL;
CREATE INDEX messages_attachment_keys ON messages USING gin ((request->'attachments') jsonb_path_ops);
CREATE INDEX inbound_raw_key ON inbound_messages(raw_key);
CREATE INDEX inbound_body_key ON inbound_messages(body_key) WHERE body_key IS NOT NULL;
CREATE INDEX inbound_attachment_key ON inbound_attachments(object_key);
