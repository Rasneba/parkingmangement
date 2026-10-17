-- 005_parking_permits (UP)
-- Long-term permits (monthly / quarterly / semi-annual / annual) assigned to a
-- registered vehicle. Complements ad-hoc parking_subscriptions.

CREATE TABLE IF NOT EXISTS parking_permits (
    id             SERIAL PRIMARY KEY,
    company_id     INTEGER NOT NULL,
    permit_number  VARCHAR(60) NOT NULL,
    vehicle_id     INTEGER,
    plate_number   VARCHAR(50),
    customer_id    INTEGER,
    site_id        INTEGER,
    zone_id        INTEGER,
    permit_type    VARCHAR(20) DEFAULT 'monthly' NOT NULL,
    start_date     DATE DEFAULT CURRENT_DATE NOT NULL,
    end_date       DATE NOT NULL,
    amount         NUMERIC(12,2) DEFAULT 0 NOT NULL,
    currency       VARCHAR(10) DEFAULT 'ETB',
    payment_method VARCHAR(30) DEFAULT 'cash',
    payment_reference VARCHAR(200),
    status         VARCHAR(20) DEFAULT 'active' NOT NULL,
    auto_renew     BOOLEAN DEFAULT FALSE,
    notes          TEXT,
    created_by     INTEGER,
    created_at     TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at     TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT parking_permits_type_check
        CHECK (permit_type IN ('monthly','quarterly','semi_annual','annual')),
    CONSTRAINT parking_permits_status_check
        CHECK (status IN ('active','expired','cancelled','pending'))
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_parking_permits_company_number
    ON parking_permits (company_id, permit_number);
CREATE INDEX IF NOT EXISTS idx_parking_permits_plate
    ON parking_permits (company_id, plate_number);
CREATE INDEX IF NOT EXISTS idx_parking_permits_status
    ON parking_permits (company_id, status, end_date);
