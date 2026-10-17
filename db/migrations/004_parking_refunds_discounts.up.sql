-- 004_parking_refunds_discounts (UP)
-- Refunds (with authorization + audit) and discount records.

CREATE TABLE IF NOT EXISTS parking_refunds (
    id               SERIAL PRIMARY KEY,
    company_id       INTEGER NOT NULL,
    payment_id       INTEGER NOT NULL,
    session_id       INTEGER,
    amount           NUMERIC(12,2) NOT NULL,
    reason           TEXT NOT NULL,
    requested_by     INTEGER,
    authorized_by    INTEGER,
    status           VARCHAR(20) DEFAULT 'pending' NOT NULL,
    reference        VARCHAR(80),
    shift_id         INTEGER,
    resolved_at      TIMESTAMP WITHOUT TIME ZONE,
    created_at       TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at       TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT parking_refunds_status_check
        CHECK (status IN ('pending','approved','rejected','processed'))
);
CREATE INDEX IF NOT EXISTS idx_parking_refunds_company
    ON parking_refunds (company_id, status);
CREATE INDEX IF NOT EXISTS idx_parking_refunds_payment
    ON parking_refunds (payment_id);

CREATE TABLE IF NOT EXISTS parking_discounts (
    id               SERIAL PRIMARY KEY,
    company_id       INTEGER NOT NULL,
    session_id       INTEGER,
    code             VARCHAR(40),
    discount_type    VARCHAR(20) DEFAULT 'amount' NOT NULL,
    value            NUMERIC(12,2) NOT NULL,
    computed_amount  NUMERIC(12,2) DEFAULT 0 NOT NULL,
    reason           TEXT,
    applied_by       INTEGER,
    authorized_by    INTEGER,
    status           VARCHAR(20) DEFAULT 'applied' NOT NULL,
    created_at       TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT parking_discounts_type_check
        CHECK (discount_type IN ('amount','percent')),
    CONSTRAINT parking_discounts_status_check
        CHECK (status IN ('applied','void'))
);
CREATE INDEX IF NOT EXISTS idx_parking_discounts_session
    ON parking_discounts (session_id);
CREATE INDEX IF NOT EXISTS idx_parking_discounts_company
    ON parking_discounts (company_id);
