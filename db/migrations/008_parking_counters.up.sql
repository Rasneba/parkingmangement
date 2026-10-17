-- 008_parking_counters (UP)
-- Atomic, tenant-scoped sequence generator used for ticket numbers, permit
-- numbers, receipt numbers and shift codes. Some ERP installs do not have the
-- id_definitions tables, so parking owns its own counters.

CREATE TABLE IF NOT EXISTS parking_counters (
    company_id    INTEGER NOT NULL,
    scope         VARCHAR(40) NOT NULL,
    period_key    VARCHAR(20) NOT NULL DEFAULT 'all',
    current_value INTEGER NOT NULL DEFAULT 0,
    updated_at    TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (company_id, scope, period_key)
);
