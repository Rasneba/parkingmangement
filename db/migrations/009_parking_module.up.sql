-- 009_parking_module (UP)
-- Tables required by the imported parking module: membership plans, RFID cards,
-- RFID access logs, relay commands, and the parking_access_logs reporting view.
-- Additive and safe to run against a standalone (Neon) or shared ERP database.

-- Membership plans (used for parking subscriptions and RFID access division)
CREATE TABLE IF NOT EXISTS membership_plans (
    id            SERIAL PRIMARY KEY,
    company_id    INTEGER NOT NULL,
    name          VARCHAR(200) NOT NULL,
    type          VARCHAR(50) NOT NULL DEFAULT 'general'
                  CHECK (type IN ('gym','parking','club','general')),
    description   TEXT,
    duration_days INTEGER NOT NULL DEFAULT 30,
    price         NUMERIC(12,2) NOT NULL DEFAULT 0,
    currency      VARCHAR(10) DEFAULT 'ETB',
    max_members   INTEGER,
    is_active     BOOLEAN DEFAULT true,
    created_at    TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at    TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_membership_plans_company ON membership_plans (company_id);

-- RFID cards assigned to members/customers
CREATE TABLE IF NOT EXISTS rfid_cards (
    id            SERIAL PRIMARY KEY,
    company_id    INTEGER NOT NULL,
    member_id     INTEGER,
    card_uid      VARCHAR(100) NOT NULL,
    label         VARCHAR(200),
    status        VARCHAR(20) NOT NULL DEFAULT 'active'
                  CHECK (status IN ('active','inactive','lost','blocked')),
    last_used_at  TIMESTAMP WITHOUT TIME ZONE,
    created_by    INTEGER,
    created_at    TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at    TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_rfid_cards_company_uid ON rfid_cards (company_id, card_uid);
CREATE INDEX IF NOT EXISTS idx_rfid_cards_member ON rfid_cards (member_id);

-- RFID / QR access events
CREATE TABLE IF NOT EXISTS rfid_access_logs (
    id              SERIAL PRIMARY KEY,
    company_id      INTEGER,
    card_uid        VARCHAR(100) NOT NULL,
    member_id       INTEGER,
    member_name     VARCHAR(200),
    granted         BOOLEAN DEFAULT false,
    reason          VARCHAR(60),
    message         TEXT,
    days_remaining  INTEGER DEFAULT 0,
    door_opened     BOOLEAN DEFAULT false,
    direction       VARCHAR(10),
    event_type      VARCHAR(50),
    controller_id   VARCHAR(100),
    raw_data        JSONB,
    plan_name       VARCHAR(200),
    subscription_id INTEGER,
    created_at      TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_rfid_access_logs_company ON rfid_access_logs (company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_rfid_access_logs_event_type ON rfid_access_logs (event_type);
CREATE INDEX IF NOT EXISTS idx_rfid_access_logs_direction ON rfid_access_logs (direction);
CREATE INDEX IF NOT EXISTS idx_rfid_access_logs_subscription_id ON rfid_access_logs (subscription_id);

-- Relay / barrier commands queued for the local bridge
CREATE TABLE IF NOT EXISTS relay_commands (
    id          SERIAL PRIMARY KEY,
    company_id  INTEGER NOT NULL,
    action      VARCHAR(40) NOT NULL DEFAULT 'open_door',
    payload     JSONB,
    status      VARCHAR(20) NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending','done','failed')),
    created_at  TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at  TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_relay_commands_company ON relay_commands (company_id, status, created_at DESC);

-- Ensure subscription <-> plan link and customer columns exist
ALTER TABLE parking_subscriptions ADD COLUMN IF NOT EXISTS plan_id INTEGER;
ALTER TABLE membership_members ADD COLUMN IF NOT EXISTS customer_id VARCHAR(50);
ALTER TABLE membership_members ADD COLUMN IF NOT EXISTS qr_code TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_membership_members_customer_id
    ON membership_members (company_id, customer_id) WHERE customer_id IS NOT NULL;

-- Reporting view: normalised entry/exit + payment trail
CREATE OR REPLACE VIEW parking_access_logs AS
SELECT
  ps.id AS session_id,
  ps.company_id,
  ps.ticket_number,
  COALESCE(pv.plate_number, ps.plate_number) AS plate_number,
  pv.vehicle_type,
  pv.vehicle_model,
  pv.vehicle_color,
  mm.full_name AS customer_name,
  mm.phone AS customer_phone,
  mm.customer_id AS customer_code,
  ps.entry_time,
  ps.exit_time,
  ps.duration_minutes,
  eg.name AS entry_gate,
  xg.name AS exit_gate,
  ps.entry_method,
  ps.exit_method,
  pz.name AS zone_name,
  psl.slot_number,
  ps.status AS session_status,
  ps.amount,
  ps.paid,
  pp.payment_method,
  pp.receipt_number,
  pp.created_at AS payment_time
FROM parking_sessions ps
LEFT JOIN parking_vehicles pv ON ps.vehicle_id = pv.id
LEFT JOIN membership_members mm ON pv.customer_id = mm.id
LEFT JOIN parking_gates eg ON ps.entry_gate_id = eg.id
LEFT JOIN parking_gates xg ON ps.exit_gate_id = xg.id
LEFT JOIN parking_slots psl ON ps.slot_id = psl.id
LEFT JOIN parking_zones pz ON psl.zone_id = pz.id
LEFT JOIN parking_payments pp ON pp.session_id = ps.id;
