-- 010_parking_premium (UP)
-- Additive foundations for the premium parking operations release:
--   * tariff snapshot + entry source on sessions (preserves historical pricing)
--   * idempotency keys for payments (safe retries / double-submit protection)
--   * DB-level guarantee: one active session per plate per company
--   * hot-path indexes for dashboards and reports
--   * premium role set with permission rows (rows only — no existing rows touched)

ALTER TABLE parking_sessions
    ADD COLUMN IF NOT EXISTS rate_id INTEGER,
    ADD COLUMN IF NOT EXISTS fee_breakdown JSONB,
    ADD COLUMN IF NOT EXISTS entry_source VARCHAR(30) DEFAULT 'manual',
    ADD COLUMN IF NOT EXISTS vehicle_type_snapshot VARCHAR(30);

ALTER TABLE parking_payments
    ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(80),
    ADD COLUMN IF NOT EXISTS created_by INTEGER;  -- operator who recorded the payment

CREATE UNIQUE INDEX IF NOT EXISTS uq_parking_payments_company_idem
    ON parking_payments (company_id, idempotency_key)
    WHERE idempotency_key IS NOT NULL;

-- Business rule: a plate can never have two simultaneously active sessions.
CREATE UNIQUE INDEX IF NOT EXISTS uq_parking_sessions_active_plate
    ON parking_sessions (company_id, plate_number)
    WHERE status = 'active' AND plate_number IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_parking_payments_company_date
    ON parking_payments (company_id, payment_date);

CREATE INDEX IF NOT EXISTS idx_parking_sessions_company_exit
    ON parking_sessions (company_id, exit_time);

-- ---------------------------------------------------------------------------
-- Premium role set. Names align with lib/permissions.ts PARKING_ROLES and the
-- resource/action model. Roles named admin / super_admin already bypass the
-- permission table; these rows give fine-grained roles to new operators.
-- ---------------------------------------------------------------------------
INSERT INTO roles (name, description) VALUES
    ('parking_admin',      'Parking system administrator (full access)'),
    ('parking_supervisor', 'Parking manager: oversight, approvals, tariffs, refunds'),
    ('parking_operator',   'Attendant: vehicle entry/exit and sessions'),
    ('parking_cashier',    'Cashier: payments, shifts, receipts'),
    ('parking_accountant', 'Accountant: payments, refunds, reports'),
    ('parking_auditor',    'Read-only auditor')
ON CONFLICT (name) DO NOTHING;

CREATE TEMP TABLE _pk_resources(resource TEXT, grp TEXT);
INSERT INTO _pk_resources VALUES
    ('parking_sites','ops'),('parking_zones','ops'),('parking_slots','ops'),
    ('parking_gates','ops'),('parking_cameras','ops'),('parking_devices','ops'),
    ('parking_sessions','ops'),('parking_tickets','ops'),('parking_qr_tickets','ops'),
    ('parking_rates','com'),('parking_payments','com'),('parking_refunds','com'),
    ('parking_discounts','com'),('parking_subscriptions','com'),('parking_permits','com'),
    ('parking_vehicles','reg'),('parking_customers','reg'),('parking_rfid_cards','reg'),
    ('parking_shifts','fin'),('parking_reports','rep'),('parking_audit_logs','rep'),
    ('parking_users','sys'),('parking_roles','sys'),('parking_settings','sys');

-- parking_admin: everything
INSERT INTO role_permissions (role_id, resource, can_view, can_create, can_edit, can_delete, can_approve)
SELECT r.id, x.resource, TRUE, TRUE, TRUE, TRUE, TRUE
FROM roles r, _pk_resources x
WHERE r.name = 'parking_admin'
ON CONFLICT (role_id, resource) DO NOTHING;

-- parking_supervisor: full visibility, manage operations & tariffs, approve money actions
INSERT INTO role_permissions (role_id, resource, can_view, can_create, can_edit, can_delete, can_approve)
SELECT r.id, x.resource,
       TRUE,
       x.grp IN ('ops','com','reg'),
       x.grp IN ('ops','com','reg'),
       FALSE,
       x.resource IN ('parking_payments','parking_refunds','parking_rates','parking_discounts','parking_sessions')
FROM roles r, _pk_resources x
WHERE r.name = 'parking_supervisor'
ON CONFLICT (role_id, resource) DO NOTHING;

-- parking_operator: entry/exit floor operations
INSERT INTO role_permissions (role_id, resource, can_view, can_create, can_edit, can_delete, can_approve)
SELECT r.id, x.resource,
       x.resource IN ('parking_sites','parking_zones','parking_slots','parking_gates','parking_cameras','parking_sessions','parking_tickets','parking_qr_tickets','parking_rates','parking_vehicles','parking_customers','parking_subscriptions'),
       x.resource IN ('parking_sessions','parking_tickets','parking_qr_tickets','parking_vehicles','parking_customers'),
       x.resource IN ('parking_sessions','parking_tickets','parking_qr_tickets','parking_vehicles'),
       FALSE, FALSE
FROM roles r, _pk_resources x
WHERE r.name = 'parking_operator'
ON CONFLICT (role_id, resource) DO NOTHING;

-- parking_cashier: money handling + shifts
INSERT INTO role_permissions (role_id, resource, can_view, can_create, can_edit, can_delete, can_approve)
SELECT r.id, x.resource,
       x.resource IN ('parking_sessions','parking_payments','parking_shifts','parking_tickets','parking_rates','parking_subscriptions','parking_refunds','parking_discounts','parking_reports'),
       x.resource IN ('parking_payments','parking_shifts','parking_discounts','parking_refunds'),
       x.resource IN ('parking_payments','parking_shifts','parking_sessions'),
       FALSE,
       x.resource = 'parking_payments'
FROM roles r, _pk_resources x
WHERE r.name = 'parking_cashier'
ON CONFLICT (role_id, resource) DO NOTHING;

-- parking_accountant: finance oversight
INSERT INTO role_permissions (role_id, resource, can_view, can_create, can_edit, can_delete, can_approve)
SELECT r.id, x.resource,
       x.resource IN ('parking_payments','parking_refunds','parking_shifts','parking_rates','parking_subscriptions','parking_reports','parking_sessions','parking_discounts'),
       FALSE, FALSE, FALSE,
       x.resource IN ('parking_refunds','parking_payments')
FROM roles r, _pk_resources x
WHERE r.name = 'parking_accountant'
ON CONFLICT (role_id, resource) DO NOTHING;

-- parking_auditor: read-only
INSERT INTO role_permissions (role_id, resource, can_view, can_create, can_edit, can_delete, can_approve)
SELECT r.id, x.resource, TRUE, FALSE, FALSE, FALSE, FALSE
FROM roles r, _pk_resources x
WHERE r.name = 'parking_auditor'
ON CONFLICT (role_id, resource) DO NOTHING;

DROP TABLE _pk_resources;
