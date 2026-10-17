-- 001_parking_sites (UP)
-- Adds the physical "site" layer above zones. Fully additive.

CREATE TABLE IF NOT EXISTS parking_sites (
    id              SERIAL PRIMARY KEY,
    company_id      INTEGER NOT NULL,
    name            VARCHAR(150) NOT NULL,
    code            VARCHAR(30) NOT NULL,
    address         TEXT,
    city            VARCHAR(100),
    latitude        NUMERIC(10,7),
    longitude       NUMERIC(10,7),
    total_capacity  INTEGER DEFAULT 0 NOT NULL,
    contact_name    VARCHAR(150),
    contact_phone   VARCHAR(40),
    is_active       BOOLEAN DEFAULT TRUE NOT NULL,
    notes           TEXT,
    created_at      TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_parking_sites_company_code
    ON parking_sites (company_id, code);

CREATE INDEX IF NOT EXISTS idx_parking_sites_company
    ON parking_sites (company_id);

-- Link existing zones to a site (nullable, additive)
ALTER TABLE parking_zones
    ADD COLUMN IF NOT EXISTS site_id INTEGER;

CREATE INDEX IF NOT EXISTS idx_parking_zones_site
    ON parking_zones (site_id);
