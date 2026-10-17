# PARKING_EXTRACTION_PLAN.md

> Standalone **Parking Management System** built on top of the existing **Genius ERP**
> (`C:\genius-erp\genius-hrms-local`, remote `https://github.com/Rasneba/-geniouserp.git`).
> This document records the architecture discovered during Phase 1 inspection and the
> reuse / add / leave-untouched decisions for Phase 2+.

---

## 1. Source repository analysis (Phase 1 findings)

### 1.1 Stack of the existing ERP

| Layer | Technology |
|---|---|
| Framework | **Next.js 16** (App Router, `app/`), React **19**, TypeScript 5 |
| Styling | **Tailwind CSS v4** (`@tailwindcss/postcss`) + **Bootstrap 5** + CSS variables in `app/globals.css` |
| Icons | `lucide-react`, `bootstrap-icons` |
| Database | **PostgreSQL** accessed with the `pg` driver (no ORM) |
| DB access | `lib/db.ts` → single `Pool` from `DATABASE_URL` |
| Migrations | Numbered raw-SQL files at repo root: `db-migration.sql`, `db-migration-v2.sql` … `db-migration-v31.sql` |
| Auth | **JWT** (`jose`, HS256, 24 h) via `lib/auth.ts`; passwords hashed with `bcryptjs`; token returned on login and stored client-side, sent as `Authorization: Bearer <token>` |
| Authorization | `lib/permissions.ts` — resource/action matrix (`view|create|edit|delete|approve`) stored in `role_permissions`, joined to `roles` |
| Multi-tenancy | Every business row carries `company_id`; JWT carries `company_id`, `company_name`, `company_tin` |
| Roles seeded | `admin`, `hr_manager`, `hr_clerk`, `finance`, `super_admin`, `guest` |
| Audit | `audit_logs` table |
| i18n | `next-intl` (locales `en`, `am`, prefix `always`) |
| API convention | `app/api/**/route.ts`, helpers in `lib/api-utils.ts` (`ok`, `created`, `err`, `withAuth`, …) |
| UI kit | `lib/gem-ui.tsx` (`GemPage`, `GemCard`, `GemKpi`, `GemTable`, `GemBadge`, …) |

### 1.2 Live database inspected

Database `genius_hrms` on `localhost:5432` (reachable during inspection).
Core tables reused: `companies`, `users`, `roles`, `role_permissions`,
`branches`, `membership_members`, `audit_logs`.

Parking tables that **already exist** in the live DB:

`parking_zones`, `parking_slots`, `parking_gates`, `parking_cameras`,
`parking_vehicles`, `parking_sessions`, `parking_rates`, `parking_qr_tickets`,
`parking_payments`, `parking_subscriptions`, view `parking_access_logs`.

Existing parking module (inside the ERP) lives at:
- UI: `app/[locale]/dashboard/membership/parking/**`
- API: `app/api/membership/parking/**` and `app/api/parking/**`
- Docs: `public/MANUAL-PARKING.md`
- Migration: `db-migration-v14.sql` (+ v15, v16, v31)

---

## 2. Reuse / Add / Do-not-touch

### 2.1 REUSE (copied and adapted, never modified in place)

| ERP asset | Parking reuse |
|---|---|
| `lib/db.ts` | Identical `pg` Pool pattern |
| `lib/auth.ts` | Same JWT create/verify, same secret env `JWT_SECRET` (falls back to ERP default for compatibility) |
| `lib/api-utils.ts` | Same response helpers and `withAuth` |
| `lib/permissions.ts` | Same resource/action model, extended with parking resources |
| `lib/id-generator.ts` | Sequential ID helper retained for ticket/receipt numbers |
| `lib/gem-ui.tsx` | Base UI primitives, restyled for a modern parking theme |
| Auth data | **Same `users`, `roles`, `role_permissions`, `companies` tables** — one login works for both apps |
| Parking tables | `parking_zones / slots / gates / cameras / vehicles / sessions / rates / payments / subscriptions / qr_tickets` reused directly |

### 2.2 ADD (new, parking-only — never drops or alters existing ERP data)

New tables (see `db/migrations`):

| Table | Purpose |
|---|---|
| `parking_sites` | Physical site/location grouping zones (multi-site, capacity) |
| `parking_shifts` | Operator shift open/close + opening/closing cash |
| `parking_shift_movements` | Cash in/out movements during a shift (reconciliation) |
| `parking_refunds` | Refunds with authorization + audit trail |
| `parking_discounts` | Discount codes/records with authorization |
| `parking_permits` | Long-term permits (monthly/quarterly/annual) distinct from ad-hoc subscriptions |
| `parking_devices` | Barrier/RFID/ANPR/LPR/access-control device registry (future integration scaffolding) |
| `parking_audit_logs` | Dedicated, dependency-free audit trail for parking actions |

Additive columns (all `ADD COLUMN IF NOT EXISTS`, nullable/defaulted — non-breaking):
- `parking_sessions`: `site_id`, `floor`, `shift_id`, `entry_operator_id`,
  `exit_operator_id`, `gross_amount`, `discount_amount`, `amount_paid`,
  `overstay` , `payment_status`.
- `parking_rates`: `overnight_rate`, `overnight_start_hour`, `overnight_end_hour`,
  `billing_increment_minutes`, `min_charge`, `effective_from`, `is_default`.
- `parking_vehicles`: none required (owner fields already present).
- `roles`: parking operator/cashier/supervisor seeded as **new rows only** (no update of existing roles).

### 2.3 DO NOT TOUCH

- Any non-parking ERP table/route (`employees`, `payroll`, `stock`, `sales`, …).
- The existing ERP source tree at `C:\genius-erp\genius-hrms-local` — it is **read-only** for this project.
- Existing parking rows and columns (only additive migrations).
- `lib/db.ts` connection string / any ERP `.env`.

---

## 3. Standalone application architecture

The parking app is a **separate Next.js project** in `C:\genius-erp\parking` that
shares the ERP **database** and **auth/identity** layer but ships its own UI,
navigation, services and APIs. This satisfies the "independent deployment using
shared stable data packages/APIs" option in the task.

```
C:\genius-erp\parking
├─ app/
│  ├─ login/                 # login (reuses ERP users/roles)
│  ├─ dashboard/             # parking-only shell + navigation
│  │  ├─ page.tsx            # live dashboard
│  │  ├─ sites, zones, slots # capacity management
│  │  ├─ vehicles            # registration + plate search
│  │  ├─ entry, exit         # operator workflows
│  │  ├─ sessions            # live + history
│  │  ├─ tickets             # QR tickets
│  │  ├─ tariffs             # hourly/daily/overnight/monthly
│  │  ├─ payments            # POS + receipts
│  │  ├─ subscriptions       # monthly plans
│  │  ├─ permits             # long-term permits
│  │  ├─ shifts              # open/close + cash reconciliation
│  │  ├─ refunds, discounts  # authorization + audit
│  │  ├─ reports             # occupancy/revenue/transactions/vehicles/operators
│  │  └─ settings            # devices (barriers/RFID/ANPR), users, roles
│  └─ api/parking/**         # JSON APIs (server-side RBAC enforced)
├─ db/migrations/            # versioned, reversible SQL
├─ lib/                      # db, auth, permissions, audit, money, tariff, qr
├─ scripts/                  # migrate.js, seed.js
└─ tests/                    # tariff boundary + workflow tests
```

### 3.1 Permissions model additions

New resources registered in `lib/permissions.ts`:
`parking_sites, parking_shifts, parking_refunds, parking_discounts,
parking_permits, parking_devices, parking_operators, parking_reports`.

Seeded roles (rows only, company-scoped):
`parking_admin` (all), `parking_supervisor` (view/approve/report),
`parking_operator` (entry/exit), `parking_cashier` (payments/shifts).

Server-side enforcement is mandatory: every route calls `withAuth` +
`requirePermission`; the UI merely hides what the API would reject anyway.

### 3.2 Monetary handling

`numeric(12,2)` in Postgres; arithmetic done with integer **minor units**
(cents) in `lib/money.ts` to avoid floating-point drift. All amounts
(charged, discount, paid, refund) are journaled.

### 3.3 Fee engine

`lib/tariff.ts` — pure, dependency-free, unit-tested function
`calculateFee(rate, entryTime, exitTime)` supporting `hourly`, `daily`,
`overnight`, `monthly`, `flat` and a documented fallback
(30 ETB / 30 min) matching existing ERP behaviour. It returns a breakdown
used by both the API and receipts.

---

## 4. Non-destructive guarantees

1. All migrations are **additive** (`CREATE TABLE IF NOT EXISTS`,
   `ADD COLUMN IF NOT EXISTS`) and each has a matching `*_down.sql`.
2. No `DROP`/`DELETE`/`TRUNCATE` against pre-existing ERP or parking data.
3 . Seed data is **development only**, gated by `NODE_ENV`/`--dev`, and idempotent.
4. The ERP project directory is never modified.

---

## 5. What remains unchanged checklist

- [x] ERP source tree untouched
- [x] Existing parking tables: additive columns only
- [x] Existing roles/users: reused, new roles appended
- [x] Existing `audit_logs` schema left alone; parking uses its own table
- [x] No secrets in frontend bundles (only `NEXT_PUBLIC_*` non-secrets)
