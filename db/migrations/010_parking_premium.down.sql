-- 010_parking_premium (DOWN)
-- Reverses the premium release additions. Only touches objects created by the
-- matching UP script; session/payment data rows are preserved (columns drop).

DROP INDEX IF EXISTS uq_parking_sessions_active_plate;
DROP INDEX IF EXISTS uq_parking_payments_company_idem;
DROP INDEX IF EXISTS idx_parking_payments_company_date;
DROP INDEX IF EXISTS idx_parking_sessions_company_exit;

ALTER TABLE parking_sessions
    DROP COLUMN IF EXISTS rate_id,
    DROP COLUMN IF EXISTS fee_breakdown,
    DROP COLUMN IF EXISTS entry_source,
    DROP COLUMN IF EXISTS vehicle_type_snapshot;

ALTER TABLE parking_payments
    DROP COLUMN IF EXISTS idempotency_key,
    DROP COLUMN IF EXISTS created_by;

DELETE FROM role_permissions
WHERE role_id IN (SELECT id FROM roles WHERE name IN (
    'parking_admin','parking_supervisor','parking_operator',
    'parking_cashier','parking_accountant','parking_auditor'));

DELETE FROM roles WHERE name IN (
    'parking_admin','parking_supervisor','parking_operator',
    'parking_cashier','parking_accountant','parking_auditor');
