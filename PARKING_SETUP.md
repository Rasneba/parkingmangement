# Parking Management System

A standalone Next.js 16 (App Router) parking management application built on top of
the Genius ERP foundation. It **shares the ERP PostgreSQL database and identity/auth
tables** but owns its own UI, navigation, API namespaces
(`/api/membership/parking/*` and `/api/parking/access/*`) and additive parking
tables. Existing ERP functionality is never modified. The parking module UI/API are
ported from the Genius ERP's parking section so the two stay equivalent.

---

## Features

The parking module is a direct port of the parking section of the Genius ERP
(`Rasneba/-geniouserp`). The menu (17 screens) and API namespace match that source:

- **Overview** — parking dashboard with occupancy KPIs and a live session feed.
- **Facility** — zones & lots, parking slots, gates and cameras.
- **Registry** — customers, vehicles and RFID cards.
- **Access** — access control (RFID controller), QR access, QR tickets and a kiosk.
- **Commercial** — subscriptions (backed by `membership_plans`), rates and a POS
  checkout with receipt printing.
- **Insights** — sessions browser and reports (access logs, controller swipes,
  subscriptions) with filters and CSV export.
- **Hardware bridge** — `/api/parking/access/*` exposes live feeds, QR lookup,
  a relay command queue and a raw RFID swipe ingest endpoint.
- **Online payments** — Chapa and AddisPay initialize/callback/verify flows.

---

## Requirements

- Node.js **20+** (developed and verified on Node 24)
- PostgreSQL 13+ (shared Genius ERP database)
- The ERP database must already contain the ERP tables: `companies`, `users`, `roles`, `role_permissions`, `membership_members` and the original `parking_*` tables.

---

## 1. Install

```bash
npm install
```

## 2. Configure environment

Copy `.env.example` to `.env` and set the values:

| Variable | Description |
| --- | --- |
| `DATABASE_URL` | PostgreSQL connection string for the shared ERP database. |
| `JWT_SECRET` | Must match the ERP secret so tokens are interchangeable (`genius-hrms-secret-key-2026`). |
| `NEXT_PUBLIC_APP_URL` | Public URL of this app (e.g. `http://localhost:3001`). |
| `NODE_ENV` | `development` or `production`. |
| `COMPANY_ID` | Optional. Company used by the seed script; defaults to the first company. |
| `CHAPA_SECRET_KEY` | Optional. Enables the Chapa payment gateway. |
| `ADDISPAY_SECRET_KEY` / `ADDISPAY_API_URL` | Optional. Enables the AddisPay gateway. |

> **Access controller.** The relay/open-door helper in `lib/access-control.ts` and
> `app/api/parking/access/route.ts` talks to a ZKTeco-style controller. The default
> address is `192.168.0.68` (`/cdor.cgi?open=1&door=0`); each gate can override it via
> its `ip_address` column. The bridge is expected to run on the same LAN as the
> controller.

## 3. Database migrations

All migrations are **additive and reversible** and live in `db/migrations/`.

```bash
npm run migrate          # apply all pending migrations
npm run migrate -- --status   # show applied / pending
npm run migrate:down     # roll back the last migration
npm run migrate -- --down all # roll back everything
```

The runner records applied versions in `parking_schema_migrations`.

Migrations included:

| Version | Purpose |
| --- | --- |
| `001_parking_sites` | Sites layer + `zones.site_id`. |
| `002_parking_rates_ext` | Tariff extensions (overnight, increments, min charge, default). |
| `003_parking_operations` | Shifts, shift movements, extra session columns. |
| `004_parking_refunds_discounts` | Refund and discount tables. |
| `005_parking_permits` | Long-term permits. |
| `006_parking_devices` | Devices registry. |
| `007_parking_audit` | Dedicated `parking_audit_logs` (never touches ERP `audit_logs`). |
| `008_parking_counters` | Atomic tenant-scoped number generator (`parking_counters`). |
| `009_parking_module` | Imported-module tables: `membership_plans`, `rfid_cards`, `rfid_access_logs`, `relay_commands`, subscription `plan_id` and the `parking_access_logs` view. |

## 3b. Standalone / cloud database (Neon)

The app can run against an **empty** PostgreSQL database (e.g. Neon) that has no
ERP schema. `npm run init` bootstraps the minimal framework tables
(`companies`, `users`, `roles`, `role_permissions`, `membership_members`), the base
`parking_*` tables, grants admin parking permissions, creates the login user, then
runs the migrations and the demo seed:

```bash
# .env -> DATABASE_URL="postgresql://...@...neon.tech/neondb?sslmode=require"
npm run init
```

Default login created by the bootstrap (override with `SEED_ADMIN_EMAIL` /
`SEED_ADMIN_PASSWORD` env vars):

| Email | Password | Role |
| --- | --- | --- |
| `admin@parking.local` | `Parking@123` | `admin` (full access) |

The bootstrap SQL is generated from a live ERP schema into
`db/bootstrap/000_standalone_schema.up.sql`; `scripts/init-standalone.js` is safe to
re-run. Neon requires SSL — the connection string's `sslmode=require` is handled by `pg`.

## 4. Seed demo data (optional)

Idempotent — safe to run repeatedly. Creates a default tariff, a site, a zone with
20 spaces, 2 gates, 2 sample vehicles, 3 parking subscription plans and 2 sample
RFID cards.

```bash
npm run seed
```

## 5. Run

```bash
npm run dev      # http://localhost:3000 (or pass -p 3001)
npm run build
npm run start
```

> **Webpack note.** On some Windows machines the prebuilt Turbopack/SWC native
> binary is unusable (`next-swc.win32-x64-msvc.node is not a valid Win32
> application`). The `dev` and `build` scripts therefore use `--webpack`. On
> platforms with working native bindings you can use `npm run dev:turbo` /
> `npm run build:turbo` instead.

## 6. Sign in

Authentication is delegated to the shared ERP identity tables (`users`, `roles`,
`companies`) and uses bcrypt password hashes. Sign in with any existing ERP user
that has access to parking resources. Tokens are HS256 JWTs valid for 24 hours and
are interchangeable with the ERP because both apps share `JWT_SECRET`.

Parking permissions are resolved with the same `role_permissions` table using these
resources:

```
parking_sites, parking_zones, parking_slots, parking_gates, parking_cameras,
parking_devices, parking_sessions, parking_tickets, parking_qr_tickets,
parking_rates, parking_payments, parking_refunds, parking_discounts,
parking_subscriptions, parking_permits, parking_vehicles, parking_customers,
parking_rfid_cards, parking_shifts, parking_reports, parking_audit_logs,
parking_users, parking_roles, parking_settings
```

Actions: `view`, `create`, `edit`, `delete`, `approve`. Roles named `admin` and
`super_admin` retain full access. The ported endpoints resolve the current user via
`getAuthUser` and, for company-scoped reads, filter by `company_id` (`super_admin`
sees all companies).

---

## Project structure

```
app/
  api/
    auth/                     login, me
    membership/parking/       CRUD, POS, reports, payment gateways (see API.md)
    parking/access/           hardware bridge: live, logs, relay, swipes, qr-*
  dashboard/
    membership/parking/       all 17 parking screens (zones, slots, gates, ...)
  login/                      sign-in page
components/                   ReportFilters, MembershipReportTable
lib/                          db, auth, api-utils, permissions, id-generator, money,
                              tariff, qr, access-control, rfid, addispay, chapa, gem-ui
db/migrations/                versioned SQL (.up.sql / .down.sql)
scripts/                      migrate.js, seed.js, init-standalone.js, load-env.js
tests/                        node:test unit tests
```

## Testing & quality

```bash
npm test         # unit tests (fee engine + money math) via node --test
npm run typecheck
npm run lint
npm run build
```

---

## Design notes

- **Non-destructive.** ERP tables are extended only with additive, nullable/defaulted columns. The parking app has its own audit table and its own counter table.
- **Tenant scope.** Every query is filtered by `company_id`; super admins may operate across companies.
- **Money.** All arithmetic is done in integer minor units (cents) to avoid floating point drift.
- **Fee engine.** `amount = base_rate + per_hour_rate × billed_units`; units derive from `billing_increment_minutes`; a grace period, minimum charge and per-day cap are honoured. With no matching tariff the fallback is **30 ETB per started 30 minutes**.
