-- 009_parking_module (DOWN)
DROP VIEW IF EXISTS parking_access_logs;
DROP TABLE IF EXISTS relay_commands;
DROP TABLE IF EXISTS rfid_access_logs;
DROP TABLE IF EXISTS rfid_cards;
DROP TABLE IF EXISTS membership_plans;
-- Note: parking_subscriptions.plan_id and membership_members customer columns are
-- left in place on rollback to avoid destroying unrelated data.
