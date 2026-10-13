-- A native integration must have only one local configuration per environment,
-- including when concurrent requests adopt Novu's preinstalled Inbox provider.
CREATE UNIQUE INDEX integrations_engine_identity
  ON integrations(org_id,environment_id,novu_id) WHERE novu_id IS NOT NULL;
