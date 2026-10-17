-- 003_parking_operations (DOWN)

DROP INDEX IF EXISTS idx_parking_sessions_status_entry;
DROP INDEX IF EXISTS idx_parking_sessions_shift;
DROP INDEX IF EXISTS idx_parking_sessions_site;

ALTER TABLE parking_sessions
    DROP COLUMN IF EXISTS site_id,
    DROP COLUMN IF EXISTS floor,
    DROP COLUMN IF EXISTS shift_id,
    DROP COLUMN IF EXISTS entry_operator_id,
    DROP COLUMN IF EXISTS exit_operator_id,
    DROP COLUMN IF EXISTS gross_amount,
    DROP COLUMN IF EXISTS discount_amount,
    DROP COLUMN IF EXISTS amount_paid,
    DROP COLUMN IF EXISTS overstay,
    DROP COLUMN IF EXISTS payment_status;

DROP TABLE IF EXISTS parking_shift_movements;
DROP TABLE IF EXISTS parking_shifts;
