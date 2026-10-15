ALTER TABLE messages ADD COLUMN next_attempt_at timestamptz NOT NULL DEFAULT now();
CREATE INDEX messages_retry_due ON messages(next_attempt_at) WHERE delivery_finished_at IS NULL;
ALTER TABLE transport_attempts ADD COLUMN diagnostics jsonb NOT NULL DEFAULT '{}';
ALTER TABLE suppressions ADD COLUMN protected boolean NOT NULL DEFAULT false;
ALTER TABLE suppressions DROP CONSTRAINT suppressions_reason_check;
ALTER TABLE suppressions ADD CHECK(reason IN ('manual','hard_bounce','complaint','soft_bounce','unknown_bounce'));
UPDATE suppressions SET protected=true WHERE reason<>'manual';
ALTER TABLE suppressions ADD CHECK(reason='manual' OR protected);
