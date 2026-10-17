-- 003_parking_operations (UP)
-- Shift management (open/close + cash reconciliation) and additive columns on
-- parking_sessions to record the operator, shift, site, floor and money breakdown.

CREATE TABLE IF NOT EXISTS parking_shifts (
    id                SERIAL PRIMARY KEY,
    company_id        INTEGER NOT NULL,
    site_id           INTEGER,
    shift_code        VARCHAR(40) NOT NULL,
    operator_id       INTEGER,
    opened_at         TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    closed_at         TIMESTAMP WITHOUT TIME ZONE,
    opening_cash      NUMERIC(12,2) DEFAULT 0 NOT NULL,
    closing_cash      NUMERIC(12,2),
    expected_cash     NUMERIC(12,2) DEFAULT 0 NOT NULL,
    cash_difference   NUMERIC(12,2),
    total_transactions INTEGER DEFAULT 0 NOT NULL,
    total_collected   NUMERIC(12,2) DEFAULT 0 NOT NULL,
    status            VARCHAR(20) DEFAULT 'open' NOT NULL,
    notes             TEXT,
    created_at        TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at        TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT parking_shifts_status_check CHECK (status IN ('open','closed','reconciled'))
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_parking_shifts_company_code
    ON parking_shifts (company_id, shift_code);
CREATE INDEX IF NOT EXISTS idx_parking_shifts_company_status
    ON parking_shifts (company_id, status);
CREATE INDEX IF NOT EXISTS idx_parking_shifts_operator
    ON parking_shifts (operator_id);

CREATE TABLE IF NOT EXISTS parking_shift_movements (
    id            SERIAL PRIMARY KEY,
    company_id    INTEGER NOT NULL,
    shift_id      INTEGER NOT NULL,
    movement_type VARCHAR(20) NOT NULL,
    amount        NUMERIC(12,2) NOT NULL,
    reason        VARCHAR(255),
    performed_by  INTEGER,
    created_at    TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT parking_shift_movements_type_check
        CHECK (movement_type IN ('cash_in','cash_out','float','pickup','drop'))
);
CREATE INDEX IF NOT EXISTS idx_parking_shift_movements_shift
    ON parking_shift_movements (shift_id);

-- Additive session columns
ALTER TABLE parking_sessions
    ADD COLUMN IF NOT EXISTS site_id INTEGER,
    ADD COLUMN IF NOT EXISTS floor INTEGER,
    ADD COLUMN IF NOT EXISTS shift_id INTEGER,
    ADD COLUMN IF NOT EXISTS entry_operator_id INTEGER,
    ADD COLUMN IF NOT EXISTS exit_operator_id INTEGER,
    ADD COLUMN IF NOT EXISTS gross_amount NUMERIC(12,2) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS discount_amount NUMERIC(12,2) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS amount_paid NUMERIC(12,2) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS overstay BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS payment_status VARCHAR(20) DEFAULT 'unpaid';

CREATE INDEX IF NOT EXISTS idx_parking_sessions_site
    ON parking_sessions (site_id);
CREATE INDEX IF NOT EXISTS idx_parking_sessions_shift
    ON parking_sessions (shift_id);
CREATE INDEX IF NOT EXISTS idx_parking_sessions_status_entry
    ON parking_sessions (company_id, status, entry_time);
