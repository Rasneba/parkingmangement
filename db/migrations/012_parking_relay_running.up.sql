-- 010_parking_relay_running (UP)
-- The local bridge claims a queued command by transition it to a transient
-- 'running' status before executing it. The original CHECK only allowed
-- ('pending','done','failed'), so every queued Open Door command failed.
ALTER TABLE relay_commands DROP CONSTRAINT IF EXISTS relay_commands_status_check;
ALTER TABLE relay_commands ADD CONSTRAINT relay_commands_status_check
    CHECK (status IN ('pending','running','done','failed'));
