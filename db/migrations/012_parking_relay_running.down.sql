-- 010_parking_relay_running (DOWN)
UPDATE relay_commands SET status = 'pending' WHERE status = 'running';
ALTER TABLE relay_commands DROP CONSTRAINT IF EXISTS relay_commands_status_check;
ALTER TABLE relay_commands ADD CONSTRAINT relay_commands_status_check
    CHECK (status IN ('pending','done','failed'));
