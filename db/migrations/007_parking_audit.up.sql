-- 007_parking_audit (UP)
-- Dedicated parking audit trail. Kept separate from the ERP audit_logs table so
-- its schema is never coupled to (or modifies) the ERP.

CREATE TABLE IF NOT EXISTS parking_audit_logs (
    id           SERIAL PRIMARY KEY,
    company_id   INTEGER,
    user_id      INTEGER,
    user_email   VARCHAR(200),
    action       VARCHAR(40) NOT NULL,
    entity       VARCHAR(60) NOT NULL,
    entity_id    VARCHAR(60),
    description  TEXT,
    old_values   JSONB,
    new_values   JSONB,
    ip_address   VARCHAR(64),
    user_agent   TEXT,
    created_at   TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_parking_audit_company_created
    ON parking_audit_logs (company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_parking_audit_entity
    ON parking_audit_logs (entity, entity_id);
