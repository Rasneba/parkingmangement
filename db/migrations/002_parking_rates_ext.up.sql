-- 002_parking_rates_ext (UP)
-- Extends the existing parking_rates table with tariff features required by the
-- standalone app: overnight pricing, billing increments, minimum charge, defaults.
-- All columns are additive & nullable/defaulted, so existing ERP behaviour is kept.

ALTER TABLE parking_rates
    ADD COLUMN IF NOT EXISTS overnight_rate NUMERIC(12,2) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS overnight_start_hour INTEGER DEFAULT 20,
    ADD COLUMN IF NOT EXISTS overnight_end_hour INTEGER DEFAULT 6,
    ADD COLUMN IF NOT EXISTS billing_increment_minutes INTEGER DEFAULT 60,
    ADD COLUMN IF NOT EXISTS min_charge NUMERIC(12,2) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS effective_from TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    ADD COLUMN IF NOT EXISTS is_default BOOLEAN DEFAULT FALSE;

-- Allow the 'overnight' rate type by replacing the CHECK constraint.
-- This only broadens the allowed set; no data is removed.
ALTER TABLE parking_rates DROP CONSTRAINT IF EXISTS parking_rates_rate_type_check;
ALTER TABLE parking_rates
    ADD CONSTRAINT parking_rates_rate_type_check
    CHECK (rate_type::text = ANY (ARRAY[
        'hourly','daily','weekly','monthly','annual','flat','custom','overnight'
    ]::text[]));

CREATE INDEX IF NOT EXISTS idx_parking_rates_company_active
    ON parking_rates (company_id, is_active);
