-- 002_parking_rates_ext (DOWN)

ALTER TABLE parking_rates DROP CONSTRAINT IF EXISTS parking_rates_rate_type_check;
ALTER TABLE parking_rates
    ADD CONSTRAINT parking_rates_rate_type_check
    CHECK (rate_type::text = ANY (ARRAY[
        'hourly','daily','weekly','monthly','annual','flat','custom'
    ]::text[]));

DROP INDEX IF EXISTS idx_parking_rates_company_active;

ALTER TABLE parking_rates
    DROP COLUMN IF EXISTS overnight_rate,
    DROP COLUMN IF EXISTS overnight_start_hour,
    DROP COLUMN IF EXISTS overnight_end_hour,
    DROP COLUMN IF EXISTS billing_increment_minutes,
    DROP COLUMN IF EXISTS min_charge,
    DROP COLUMN IF EXISTS effective_from,
    DROP COLUMN IF EXISTS is_default;
