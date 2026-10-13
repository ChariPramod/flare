ALTER TABLE api_keys ADD COLUMN allow_publish boolean NOT NULL DEFAULT false;
ALTER TABLE api_keys ADD CHECK(NOT allow_publish OR (permission='full_access' AND domain_id IS NULL));
CREATE OR REPLACE FUNCTION immutable_api_key_scope() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
  IF NEW.permission IS DISTINCT FROM OLD.permission OR NEW.domain_id IS DISTINCT FROM OLD.domain_id OR NEW.org_id IS DISTINCT FROM OLD.org_id OR NEW.environment_id IS DISTINCT FROM OLD.environment_id OR NEW.allow_publish IS DISTINCT FROM OLD.allow_publish THEN
    RAISE EXCEPTION 'API key permission and scope are immutable';
  END IF; RETURN NEW;
END $$;
