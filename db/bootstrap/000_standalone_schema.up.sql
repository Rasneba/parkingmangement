-- 000_standalone_schema (UP)
-- Bootstrap schema for a standalone (non-ERP) PostgreSQL database such as Neon.
-- Creates the minimal Genius ERP framework tables plus the original parking
-- tables that the additive 001-008 migrations extend. Generated from the live ERP schema.

CREATE TABLE IF NOT EXISTS companies (
    id serial NOT NULL,
    name character varying(200) NOT NULL,
    code character varying(50),
    address text,
    phone character varying(30),
    email character varying(100),
    website character varying(200),
    contact_person character varying(100),
    contact_phone character varying(30),
    contact_email character varying(100),
    tin character varying(50),
    license_type character varying(20) DEFAULT 'demo'::character varying,
    status character varying(20) DEFAULT 'active'::character varying,
    registration_date date DEFAULT CURRENT_DATE,
    notes text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id)
);
ALTER TABLE companies DROP CONSTRAINT IF EXISTS companies_license_type_check;
ALTER TABLE companies ADD CONSTRAINT companies_license_type_check CHECK (((license_type)::text = ANY ((ARRAY['demo'::character varying, 'trial'::character varying, 'full'::character varying, 'enterprise'::character varying])::text[])));
ALTER TABLE companies DROP CONSTRAINT IF EXISTS companies_status_check;
ALTER TABLE companies ADD CONSTRAINT companies_status_check CHECK (((status)::text = ANY ((ARRAY['active'::character varying, 'inactive'::character varying, 'suspended'::character varying])::text[])));
CREATE UNIQUE INDEX IF NOT EXISTS companies_code_key ON public.companies USING btree (code);
CREATE UNIQUE INDEX IF NOT EXISTS companies_pkey ON public.companies USING btree (id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_companies_tin ON public.companies USING btree (tin) WHERE ((tin IS NOT NULL) AND ((tin)::text <> ''::text));

CREATE TABLE IF NOT EXISTS roles (
    id serial NOT NULL,
    name character varying(50) NOT NULL,
    description text,
    is_active boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    company_id integer,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id)
);
CREATE UNIQUE INDEX IF NOT EXISTS roles_name_key ON public.roles USING btree (name);
CREATE UNIQUE INDEX IF NOT EXISTS roles_pkey ON public.roles USING btree (id);

CREATE TABLE IF NOT EXISTS users (
    id serial NOT NULL,
    name character varying(100),
    email character varying(100) NOT NULL,
    password text NOT NULL,
    role character varying(20) DEFAULT 'admin'::character varying,
    role_id integer,
    is_active boolean DEFAULT true,
    phone character varying(20),
    branch_id integer,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    company_id integer,
    PRIMARY KEY (id)
);
CREATE UNIQUE INDEX IF NOT EXISTS users_email_key ON public.users USING btree (email);
CREATE UNIQUE INDEX IF NOT EXISTS users_pkey ON public.users USING btree (id);

CREATE TABLE IF NOT EXISTS role_permissions (
    id serial NOT NULL,
    role_id integer NOT NULL,
    resource character varying(50) NOT NULL,
    can_view boolean DEFAULT false,
    can_create boolean DEFAULT false,
    can_edit boolean DEFAULT false,
    can_delete boolean DEFAULT false,
    can_approve boolean DEFAULT false,
    PRIMARY KEY (id)
);
CREATE UNIQUE INDEX IF NOT EXISTS role_permissions_pkey ON public.role_permissions USING btree (id);
CREATE UNIQUE INDEX IF NOT EXISTS role_permissions_role_id_resource_key ON public.role_permissions USING btree (role_id, resource);

CREATE TABLE IF NOT EXISTS membership_members (
    id serial NOT NULL,
    company_id integer NOT NULL,
    plan_id integer,
    full_name character varying(200) NOT NULL,
    phone character varying(30),
    email character varying(200),
    id_number character varying(100),
    address text,
    photo_url text,
    start_date date DEFAULT CURRENT_DATE NOT NULL,
    end_date date NOT NULL,
    status character varying(20) DEFAULT 'active'::character varying NOT NULL,
    notes text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    customer_id character varying(50),
    qr_code text,
    PRIMARY KEY (id)
);
ALTER TABLE membership_members DROP CONSTRAINT IF EXISTS membership_members_status_check;
ALTER TABLE membership_members ADD CONSTRAINT membership_members_status_check CHECK (((status)::text = ANY ((ARRAY['active'::character varying, 'expired'::character varying, 'suspended'::character varying, 'cancelled'::character varying])::text[])));
CREATE UNIQUE INDEX IF NOT EXISTS idx_membership_members_customer_id ON public.membership_members USING btree (company_id, customer_id) WHERE (customer_id IS NOT NULL);
CREATE UNIQUE INDEX IF NOT EXISTS membership_members_pkey ON public.membership_members USING btree (id);

CREATE TABLE IF NOT EXISTS parking_zones (
    id serial NOT NULL,
    company_id integer NOT NULL,
    name character varying(100) NOT NULL,
    code character varying(20) NOT NULL,
    floor integer DEFAULT 0,
    description text,
    slot_count integer DEFAULT 0 NOT NULL,
    type character varying(20) DEFAULT 'standard'::character varying,
    is_active boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    site_id integer,
    PRIMARY KEY (id)
);
ALTER TABLE parking_zones DROP CONSTRAINT IF EXISTS parking_zones_type_check;
ALTER TABLE parking_zones ADD CONSTRAINT parking_zones_type_check CHECK (((type)::text = ANY ((ARRAY['standard'::character varying, 'vip'::character varying, 'disabled'::character varying, 'reserved'::character varying, 'electric'::character varying, 'staff'::character varying])::text[])));
CREATE INDEX IF NOT EXISTS idx_parking_zones_site ON public.parking_zones USING btree (site_id);
CREATE UNIQUE INDEX IF NOT EXISTS parking_zones_pkey ON public.parking_zones USING btree (id);

CREATE TABLE IF NOT EXISTS parking_slots (
    id serial NOT NULL,
    company_id integer NOT NULL,
    zone_id integer NOT NULL,
    slot_number character varying(20) NOT NULL,
    floor integer DEFAULT 0,
    status character varying(20) DEFAULT 'available'::character varying,
    type character varying(20) DEFAULT 'standard'::character varying,
    current_session_id integer,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id)
);
ALTER TABLE parking_slots DROP CONSTRAINT IF EXISTS parking_slots_status_check;
ALTER TABLE parking_slots ADD CONSTRAINT parking_slots_status_check CHECK (((status)::text = ANY ((ARRAY['available'::character varying, 'occupied'::character varying, 'reserved'::character varying, 'maintenance'::character varying])::text[])));
ALTER TABLE parking_slots DROP CONSTRAINT IF EXISTS parking_slots_type_check;
ALTER TABLE parking_slots ADD CONSTRAINT parking_slots_type_check CHECK (((type)::text = ANY ((ARRAY['standard'::character varying, 'vip'::character varying, 'disabled'::character varying, 'reserved'::character varying, 'electric'::character varying, 'staff'::character varying])::text[])));
CREATE INDEX IF NOT EXISTS idx_parking_slots_status ON public.parking_slots USING btree (status);
CREATE INDEX IF NOT EXISTS idx_parking_slots_zone ON public.parking_slots USING btree (zone_id);
CREATE UNIQUE INDEX IF NOT EXISTS parking_slots_company_id_slot_number_key ON public.parking_slots USING btree (company_id, slot_number);
CREATE UNIQUE INDEX IF NOT EXISTS parking_slots_pkey ON public.parking_slots USING btree (id);

CREATE TABLE IF NOT EXISTS parking_vehicles (
    id serial NOT NULL,
    company_id integer NOT NULL,
    plate_number character varying(50) NOT NULL,
    vehicle_type character varying(30) DEFAULT 'car'::character varying,
    vehicle_model character varying(100),
    vehicle_color character varying(50),
    owner_name character varying(200),
    owner_phone character varying(30),
    owner_email character varying(200),
    rfid_tag character varying(100),
    nfc_tag character varying(100),
    is_blacklisted boolean DEFAULT false,
    is_resident boolean DEFAULT false,
    subscription_id integer,
    notes text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    customer_id integer,
    PRIMARY KEY (id)
);
ALTER TABLE parking_vehicles DROP CONSTRAINT IF EXISTS parking_vehicles_vehicle_type_check;
ALTER TABLE parking_vehicles ADD CONSTRAINT parking_vehicles_vehicle_type_check CHECK (((vehicle_type)::text = ANY ((ARRAY['car'::character varying, 'suv'::character varying, 'truck'::character varying, 'bus'::character varying, 'motorcycle'::character varying, 'bicycle'::character varying, 'other'::character varying])::text[])));
CREATE INDEX IF NOT EXISTS idx_parking_vehicles_customer ON public.parking_vehicles USING btree (customer_id);
CREATE INDEX IF NOT EXISTS idx_parking_vehicles_plate ON public.parking_vehicles USING btree (plate_number);
CREATE UNIQUE INDEX IF NOT EXISTS parking_vehicles_company_id_plate_number_key ON public.parking_vehicles USING btree (company_id, plate_number);
CREATE UNIQUE INDEX IF NOT EXISTS parking_vehicles_pkey ON public.parking_vehicles USING btree (id);

CREATE TABLE IF NOT EXISTS parking_gates (
    id serial NOT NULL,
    company_id integer NOT NULL,
    name character varying(100) NOT NULL,
    code character varying(20) NOT NULL,
    type character varying(20) DEFAULT 'entry'::character varying NOT NULL,
    direction character varying(10) DEFAULT 'in'::character varying,
    status character varying(20) DEFAULT 'active'::character varying,
    ip_address character varying(45),
    port integer,
    serial_port character varying(50),
    barrier_open_delay integer DEFAULT 2,
    is_anpr_enabled boolean DEFAULT true,
    is_qr_enabled boolean DEFAULT true,
    is_nfc_enabled boolean DEFAULT false,
    notes text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    is_rfid_enabled boolean DEFAULT false,
    PRIMARY KEY (id)
);
ALTER TABLE parking_gates DROP CONSTRAINT IF EXISTS parking_gates_direction_check;
ALTER TABLE parking_gates ADD CONSTRAINT parking_gates_direction_check CHECK (((direction)::text = ANY ((ARRAY['in'::character varying, 'out'::character varying, 'both'::character varying])::text[])));
ALTER TABLE parking_gates DROP CONSTRAINT IF EXISTS parking_gates_status_check;
ALTER TABLE parking_gates ADD CONSTRAINT parking_gates_status_check CHECK (((status)::text = ANY ((ARRAY['active'::character varying, 'inactive'::character varying, 'maintenance'::character varying])::text[])));
ALTER TABLE parking_gates DROP CONSTRAINT IF EXISTS parking_gates_type_check;
ALTER TABLE parking_gates ADD CONSTRAINT parking_gates_type_check CHECK (((type)::text = ANY ((ARRAY['entry'::character varying, 'exit'::character varying, 'dual'::character varying])::text[])));
CREATE UNIQUE INDEX IF NOT EXISTS parking_gates_code_key ON public.parking_gates USING btree (code);
CREATE UNIQUE INDEX IF NOT EXISTS parking_gates_pkey ON public.parking_gates USING btree (id);

CREATE TABLE IF NOT EXISTS parking_sessions (
    id serial NOT NULL,
    company_id integer NOT NULL,
    vehicle_id integer,
    plate_number character varying(50),
    entry_gate_id integer,
    exit_gate_id integer,
    entry_camera_id integer,
    exit_camera_id integer,
    slot_id integer,
    entry_time timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    exit_time timestamp without time zone,
    duration_minutes integer,
    entry_image_url text,
    exit_image_url text,
    entry_plate_confidence numeric(5,2),
    exit_plate_confidence numeric(5,2),
    entry_method character varying(20) DEFAULT 'anpr'::character varying,
    exit_method character varying(20) DEFAULT 'anpr'::character varying,
    status character varying(20) DEFAULT 'active'::character varying,
    amount numeric(12,2) DEFAULT 0,
    paid boolean DEFAULT false,
    ticket_number character varying(50),
    qr_ticket_id integer,
    notes text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    site_id integer,
    floor integer,
    shift_id integer,
    entry_operator_id integer,
    exit_operator_id integer,
    gross_amount numeric(12,2) DEFAULT 0,
    discount_amount numeric(12,2) DEFAULT 0,
    amount_paid numeric(12,2) DEFAULT 0,
    overstay boolean DEFAULT false,
    payment_status character varying(20) DEFAULT 'unpaid'::character varying,
    PRIMARY KEY (id)
);
ALTER TABLE parking_sessions DROP CONSTRAINT IF EXISTS parking_sessions_entry_method_check;
ALTER TABLE parking_sessions ADD CONSTRAINT parking_sessions_entry_method_check CHECK (((entry_method)::text = ANY ((ARRAY['anpr'::character varying, 'qr'::character varying, 'nfc'::character varying, 'manual'::character varying, 'rfid'::character varying])::text[])));
ALTER TABLE parking_sessions DROP CONSTRAINT IF EXISTS parking_sessions_exit_method_check;
ALTER TABLE parking_sessions ADD CONSTRAINT parking_sessions_exit_method_check CHECK (((exit_method)::text = ANY ((ARRAY['anpr'::character varying, 'qr'::character varying, 'nfc'::character varying, 'manual'::character varying, 'rfid'::character varying])::text[])));
ALTER TABLE parking_sessions DROP CONSTRAINT IF EXISTS parking_sessions_status_check;
ALTER TABLE parking_sessions ADD CONSTRAINT parking_sessions_status_check CHECK (((status)::text = ANY ((ARRAY['active'::character varying, 'completed'::character varying, 'pending_payment'::character varying, 'cancelled'::character varying])::text[])));
CREATE INDEX IF NOT EXISTS idx_parking_sessions_entry ON public.parking_sessions USING btree (entry_time);
CREATE INDEX IF NOT EXISTS idx_parking_sessions_plate ON public.parking_sessions USING btree (plate_number);
CREATE INDEX IF NOT EXISTS idx_parking_sessions_shift ON public.parking_sessions USING btree (shift_id);
CREATE INDEX IF NOT EXISTS idx_parking_sessions_site ON public.parking_sessions USING btree (site_id);
CREATE INDEX IF NOT EXISTS idx_parking_sessions_status ON public.parking_sessions USING btree (status);
CREATE INDEX IF NOT EXISTS idx_parking_sessions_status_entry ON public.parking_sessions USING btree (company_id, status, entry_time);
CREATE INDEX IF NOT EXISTS idx_parking_sessions_vehicle ON public.parking_sessions USING btree (vehicle_id);
CREATE UNIQUE INDEX IF NOT EXISTS parking_sessions_pkey ON public.parking_sessions USING btree (id);

CREATE TABLE IF NOT EXISTS parking_rates (
    id serial NOT NULL,
    company_id integer NOT NULL,
    name character varying(100) NOT NULL,
    vehicle_type character varying(30) DEFAULT 'car'::character varying,
    rate_type character varying(20) DEFAULT 'hourly'::character varying,
    base_rate numeric(12,2) DEFAULT 0 NOT NULL,
    per_hour_rate numeric(12,2) DEFAULT 0,
    per_day_rate numeric(12,2) DEFAULT 0,
    grace_period_minutes integer DEFAULT 15,
    max_daily_charge numeric(12,2),
    currency character varying(10) DEFAULT 'ETB'::character varying,
    is_active boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    overnight_rate numeric(12,2) DEFAULT 0,
    overnight_start_hour integer DEFAULT 20,
    overnight_end_hour integer DEFAULT 6,
    billing_increment_minutes integer DEFAULT 60,
    min_charge numeric(12,2) DEFAULT 0,
    effective_from timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    is_default boolean DEFAULT false,
    PRIMARY KEY (id)
);
ALTER TABLE parking_rates DROP CONSTRAINT IF EXISTS parking_rates_rate_type_check;
ALTER TABLE parking_rates ADD CONSTRAINT parking_rates_rate_type_check CHECK (((rate_type)::text = ANY (ARRAY['hourly'::text, 'daily'::text, 'weekly'::text, 'monthly'::text, 'annual'::text, 'flat'::text, 'custom'::text, 'overnight'::text])));
ALTER TABLE parking_rates DROP CONSTRAINT IF EXISTS parking_rates_vehicle_type_check;
ALTER TABLE parking_rates ADD CONSTRAINT parking_rates_vehicle_type_check CHECK (((vehicle_type)::text = ANY ((ARRAY['car'::character varying, 'suv'::character varying, 'truck'::character varying, 'bus'::character varying, 'motorcycle'::character varying, 'bicycle'::character varying, 'all'::character varying, 'other'::character varying])::text[])));
CREATE INDEX IF NOT EXISTS idx_parking_rates_company_active ON public.parking_rates USING btree (company_id, is_active);
CREATE UNIQUE INDEX IF NOT EXISTS parking_rates_pkey ON public.parking_rates USING btree (id);

CREATE TABLE IF NOT EXISTS parking_qr_tickets (
    id serial NOT NULL,
    company_id integer NOT NULL,
    ticket_number character varying(50) NOT NULL,
    qr_code text NOT NULL,
    visitor_name character varying(200),
    visitor_phone character varying(30),
    visitor_plate character varying(50),
    purpose character varying(200),
    host_name character varying(200),
    host_phone character varying(30),
    valid_from timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    valid_until timestamp without time zone NOT NULL,
    is_used boolean DEFAULT false,
    used_at timestamp without time zone,
    session_id integer,
    status character varying(20) DEFAULT 'active'::character varying,
    created_by integer,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id)
);
ALTER TABLE parking_qr_tickets DROP CONSTRAINT IF EXISTS parking_qr_tickets_status_check;
ALTER TABLE parking_qr_tickets ADD CONSTRAINT parking_qr_tickets_status_check CHECK (((status)::text = ANY ((ARRAY['active'::character varying, 'used'::character varying, 'expired'::character varying, 'cancelled'::character varying])::text[])));
CREATE INDEX IF NOT EXISTS idx_parking_qr_tickets_code ON public.parking_qr_tickets USING btree (qr_code);
CREATE UNIQUE INDEX IF NOT EXISTS parking_qr_tickets_pkey ON public.parking_qr_tickets USING btree (id);
CREATE UNIQUE INDEX IF NOT EXISTS parking_qr_tickets_ticket_number_key ON public.parking_qr_tickets USING btree (ticket_number);

CREATE TABLE IF NOT EXISTS parking_payments (
    id serial NOT NULL,
    company_id integer NOT NULL,
    session_id integer NOT NULL,
    vehicle_id integer,
    amount numeric(12,2) NOT NULL,
    currency character varying(10) DEFAULT 'ETB'::character varying,
    payment_method character varying(30) DEFAULT 'cash'::character varying NOT NULL,
    reference character varying(200),
    pos_terminal_id character varying(50),
    receipt_number character varying(50),
    paid_by character varying(200),
    notes text,
    payment_date timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id)
);
ALTER TABLE parking_payments DROP CONSTRAINT IF EXISTS parking_payments_payment_method_check;
ALTER TABLE parking_payments ADD CONSTRAINT parking_payments_payment_method_check CHECK (((payment_method)::text = ANY ((ARRAY['cash'::character varying, 'telebirr'::character varying, 'cbebirr'::character varying, 'chapa'::character varying, 'addispay'::character varying, 'santimpay'::character varying, 'bank'::character varying, 'pos'::character varying, 'credit_card'::character varying, 'debit_card'::character varying])::text[])));
CREATE INDEX IF NOT EXISTS idx_parking_payments_session ON public.parking_payments USING btree (session_id);
CREATE UNIQUE INDEX IF NOT EXISTS parking_payments_pkey ON public.parking_payments USING btree (id);

CREATE TABLE IF NOT EXISTS parking_subscriptions (
    id serial NOT NULL,
    company_id integer NOT NULL,
    customer_id integer NOT NULL,
    vehicle_id integer,
    plan_type character varying(20) DEFAULT 'monthly'::character varying NOT NULL,
    start_date date DEFAULT CURRENT_DATE NOT NULL,
    end_date date NOT NULL,
    amount numeric(12,2) DEFAULT 0 NOT NULL,
    payment_method character varying(30) DEFAULT 'cash'::character varying,
    payment_reference character varying(200),
    status character varying(20) DEFAULT 'active'::character varying NOT NULL,
    auto_renew boolean DEFAULT false,
    renewal_count integer DEFAULT 0,
    last_renewed_at timestamp without time zone,
    notes text,
    created_by integer,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    plan_id integer,
    PRIMARY KEY (id)
);
ALTER TABLE parking_subscriptions DROP CONSTRAINT IF EXISTS parking_subscriptions_payment_method_check;
ALTER TABLE parking_subscriptions ADD CONSTRAINT parking_subscriptions_payment_method_check CHECK (((payment_method)::text = ANY ((ARRAY['cash'::character varying, 'telebirr'::character varying, 'cbebirr'::character varying, 'chapa'::character varying, 'addispay'::character varying, 'santimpay'::character varying, 'bank'::character varying, 'pos'::character varying, 'credit_card'::character varying, 'debit_card'::character varying])::text[])));
ALTER TABLE parking_subscriptions DROP CONSTRAINT IF EXISTS parking_subscriptions_status_check;
ALTER TABLE parking_subscriptions ADD CONSTRAINT parking_subscriptions_status_check CHECK (((status)::text = ANY ((ARRAY['active'::character varying, 'expired'::character varying, 'cancelled'::character varying, 'pending'::character varying])::text[])));
CREATE INDEX IF NOT EXISTS idx_parking_subscriptions_customer ON public.parking_subscriptions USING btree (customer_id);
CREATE INDEX IF NOT EXISTS idx_parking_subscriptions_dates ON public.parking_subscriptions USING btree (start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_parking_subscriptions_plan_id ON public.parking_subscriptions USING btree (plan_id);
CREATE INDEX IF NOT EXISTS idx_parking_subscriptions_vehicle ON public.parking_subscriptions USING btree (vehicle_id);
CREATE UNIQUE INDEX IF NOT EXISTS parking_subscriptions_pkey ON public.parking_subscriptions USING btree (id);

CREATE TABLE IF NOT EXISTS parking_cameras (
    id serial NOT NULL,
    company_id integer NOT NULL,
    gate_id integer,
    name character varying(100) NOT NULL,
    code character varying(20) NOT NULL,
    ip_address character varying(45) NOT NULL,
    port integer DEFAULT 80,
    rtsp_url text,
    direction character varying(10) DEFAULT 'in'::character varying,
    status character varying(20) DEFAULT 'active'::character varying,
    protocol character varying(20) DEFAULT 'http'::character varying,
    confidence_threshold numeric(5,2) DEFAULT 85.00,
    last_heartbeat timestamp without time zone,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id)
);
ALTER TABLE parking_cameras DROP CONSTRAINT IF EXISTS parking_cameras_direction_check;
ALTER TABLE parking_cameras ADD CONSTRAINT parking_cameras_direction_check CHECK (((direction)::text = ANY ((ARRAY['in'::character varying, 'out'::character varying, 'both'::character varying])::text[])));
ALTER TABLE parking_cameras DROP CONSTRAINT IF EXISTS parking_cameras_protocol_check;
ALTER TABLE parking_cameras ADD CONSTRAINT parking_cameras_protocol_check CHECK (((protocol)::text = ANY ((ARRAY['http'::character varying, 'rtsp'::character varying, 'onvif'::character varying, 'tcp_ip'::character varying])::text[])));
ALTER TABLE parking_cameras DROP CONSTRAINT IF EXISTS parking_cameras_status_check;
ALTER TABLE parking_cameras ADD CONSTRAINT parking_cameras_status_check CHECK (((status)::text = ANY ((ARRAY['active'::character varying, 'inactive'::character varying, 'offline'::character varying, 'maintenance'::character varying])::text[])));
CREATE UNIQUE INDEX IF NOT EXISTS parking_cameras_pkey ON public.parking_cameras USING btree (id);
