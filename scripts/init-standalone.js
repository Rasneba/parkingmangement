#!/usr/bin/env node
/*
 * Bootstrap a standalone PostgreSQL database (e.g. Neon) for the Parking app.
 *
 * Steps:
 *   1. Apply db/bootstrap/000_standalone_schema.up.sql (ERP framework + base parking tables)
 *   2. Create the demo company, an admin role, the admin user and parking permissions
 *   3. Apply the additive migrations (db/migrations)
 *   4. Seed demo parking data (tariff, site, zone, spaces, gates)
 *
 * Safe to re-run. Configure the target in .env (DATABASE_URL).
 *
 *   node scripts/init-standalone.js
 */
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const { Pool } = require("pg");
const bcrypt = require("bcryptjs");
require("./load-env");

const EMAIL = process.env.SEED_ADMIN_EMAIL || "admin@parking.local";
const PASSWORD = process.env.SEED_ADMIN_PASSWORD || "Parking@123";
const ADMIN_NAME = process.env.SEED_ADMIN_NAME || "Parking Admin";

const RESOURCES = [
  "parking_sites", "parking_zones", "parking_slots", "parking_gates", "parking_devices",
  "parking_sessions", "parking_tickets", "parking_rates", "parking_payments",
  "parking_refunds", "parking_discounts", "parking_subscriptions", "parking_permits",
  "parking_vehicles", "parking_customers", "parking_shifts", "parking_reports",
  "parking_audit_logs", "parking_users", "parking_roles", "parking_settings",
];

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function applyBootstrap() {
  const file = path.join(__dirname, "..", "db", "bootstrap", "000_standalone_schema.up.sql");
  const sql = fs.readFileSync(file, "utf8");
  await pool.query(sql);
  console.log("• applied bootstrap schema");
}

async function seedAdmin() {
  const company = await pool.query(
    `INSERT INTO companies (name, code, status) VALUES ('Parking Demo Co', 'PARK-DEMO', 'active')
     ON CONFLICT (code) DO NOTHING RETURNING id`
  );
  let companyId = company.rows[0]?.id;
  if (!companyId) {
    const c = await pool.query("SELECT id FROM companies WHERE code='PARK-DEMO'");
    companyId = c.rows[0].id;
  }

  const role = await pool.query(
    `INSERT INTO roles (name, description, is_active) VALUES ('admin', 'Full access', true)
     ON CONFLICT (name) DO UPDATE SET is_active = true RETURNING id`
  );
  const roleId = role.rows[0].id;
  console.log(`• company #${companyId}, role 'admin' #${roleId}`);

  for (const resource of RESOURCES) {
    await pool.query(
      `INSERT INTO role_permissions (role_id, resource, can_view, can_create, can_edit, can_delete, can_approve)
       VALUES ($1,$2,true,true,true,true,true)
       ON CONFLICT (role_id, resource)
       DO UPDATE SET can_view=true, can_create=true, can_edit=true, can_delete=true, can_approve=true`,
      [roleId, resource]
    );
  }
  console.log(`• granted admin permissions on ${RESOURCES.length} parking resources`);

  const hash = bcrypt.hashSync(PASSWORD, 10);
  const user = await pool.query(
    `INSERT INTO users (name, email, password, role, role_id, is_active, company_id)
     VALUES ($1,$2,$3,'admin',$4,true,$5)
     ON CONFLICT (email) DO UPDATE SET password=$3, role='admin', role_id=$4, is_active=true, company_id=$5
     RETURNING id`,
    [ADMIN_NAME, EMAIL, hash, roleId, companyId]
  );
  console.log(`• admin user ready: ${EMAIL} / ${PASSWORD} (id #${user.rows[0].id})`);
}

function run(script) {
  execFileSync(process.execPath, [path.join(__dirname, script)], { stdio: "inherit" });
}

(async () => {
  try {
    if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set in .env");
    console.log("Initialising standalone database...");
    await applyBootstrap();
    await seedAdmin();
    await pool.end();

    console.log("Applying migrations...");
    run("migrate.js");

    console.log("Seeding parking demo data...");
    run("seed.js");

    console.log("\nDone. Start the app with: npm run dev -- -p 3001");
  } catch (e) {
    console.error("INIT ERROR:", e.message);
    try { await pool.end(); } catch {}
    process.exitCode = 1;
  }
})();
