-- 006_parking_devices (UP)
-- Registry for barrier controllers, RFID readers, ANPR/LPR cameras and
-- access-control devices. Used for optional future integrations.

CREATE TABLE IF NOT EXISTS parking_devices (
    id             SERIAL PRIMARY KEY,
    company_id     INTEGER NOT NULL,
    site_id        INTEGER,
    gate_id        INTEGER,
    name           VARCHAR(120) NOT NULL,
    code           VARCHAR(40) NOT NULL,
    device_type    VARCHAR(30) NOT NULL,
    direction      VARCHAR(10) DEFAULT 'both',
    protocol       VARCHAR(30),
    host           VARCHAR(120),
    port           INTEGER,
    endpoint       VARCHAR(255),
    api_key        VARCHAR(120),
    min_confidence INTEGER DEFAULT 80,
    status         VARCHAR(20) DEFAULT 'offline' NOT NULL,
    is_enabled     BOOLEAN DEFAULT TRUE NOT NULL,
    last_seen_at   TIMESTAMP WITHOUT TIME ZONE,
    notes          TEXT,
    created_at     TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at     TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT parking_devices_type_check
        CHECK (device_type IN ('barrier','rfid_reader','anpr_camera','lpr_camera','access_controller','display','kiosk')),
    CONSTRAINT parking_devices_direction_check
        CHECK (direction IN ('in','out','both')),
    CONSTRAINT parking_devices_status_check
        CHECK (status IN ('online','offline','error','maintenance'))
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_parking_devices_company_code
    ON parking_devices (company_id, code);
CREATE INDEX IF NOT EXISTS idx_parking_devices_company
    ON parking_devices (company_id, device_type);
CREATE INDEX IF NOT EXISTS idx_parking_devices_gate
    ON parking_devices (gate_id);
