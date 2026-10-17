#!/usr/bin/env node
/*
 * Idempotent demo/seed data for the Parking Management System.
 *
 * Safe to run repeatedly. It works against the shared ERP database and only
 * touches parking tables. The company is taken from COMPANY_ID or the first
 * company in the database.
 *
 *   node scripts/seed.js
 */
const { Pool } = require("pg");
require("./load-env");

const connectionString =
  process.env.DATABASE_URL || "postgresql://postgres:postgres@localhost:5432/genius_hrms";
const pool = new Pool({ connectionString });

async function resolveCompanyId() {
  if (process.env.COMPANY_ID) return Number(process.env.COMPANY_ID);
  const r = await pool.query("SELECT id, name FROM companies ORDER BY id LIMIT 1");
  if (!r.rows[0]) throw new Error("No company found. Create a company in the ERP first.");
  return r.rows[0].id;
}

async function seedTariff(companyId) {
  const exists = await pool.query(
    "SELECT id FROM parking_rates WHERE company_id=$1 AND is_default=true LIMIT 1",
    [companyId]
  );
  if (exists.rows[0]) return console.log("• default tariff already present");
  const r = await pool.query(
    `INSERT INTO parking_rates
       (company_id, name, vehicle_type, rate_type, base_rate, per_hour_rate, per_day_rate,
        billing_increment_minutes, grace_period_minutes, min_charge, currency, is_active, is_default)
     VALUES ($1,'Standard Hourly','car','hourly',0,30,0,60,15,0,'ETB',true,true)
     RETURNING id`,
    [companyId]
  );
  console.log(`• created default tariff #${r.rows[0].id}`);
}

async function seedSite(companyId) {
  const r = await pool.query(
    `INSERT INTO parking_sites (company_id, name, code, city, total_capacity, is_active)
     VALUES ($1,'Main Parking','MAIN','Addis Ababa',20,true)
     ON CONFLICT (company_id, code) DO NOTHING RETURNING id`,
    [companyId]
  );
  let id = r.rows[0]?.id;
  if (!id) {
    const s = await pool.query("SELECT id FROM parking_sites WHERE company_id=$1 AND code='MAIN'", [companyId]);
    id = s.rows[0].id;
    console.log("• site MAIN already present");
  } else {
    console.log(`• created site #${id}`);
  }
  return id;
}

async function seedZone(companyId, siteId) {
  const s = await pool.query("SELECT id FROM parking_zones WHERE company_id=$1 AND code='Z-GF'", [companyId]);
  if (s.rows[0]) {
    console.log("• zone Z-GF already present");
    return s.rows[0].id;
  }
  const r = await pool.query(
    `INSERT INTO parking_zones (company_id, site_id, name, code, floor, type, slot_count, is_active)
     VALUES ($1,$2,'Ground Floor','Z-GF',0,'standard',20,true) RETURNING id`,
    [companyId, siteId]
  );
  console.log(`• created zone #${r.rows[0].id}`);
  return r.rows[0].id;
}

async function seedSlots(companyId, zoneId) {
  const c = await pool.query("SELECT COUNT(*)::int AS n FROM parking_slots WHERE zone_id=$1", [zoneId]);
  if (c.rows[0].n > 0) return console.log(`• zone already has ${c.rows[0].n} spaces`);
  const values = [];
  const params = [];
  for (let i = 1; i <= 20; i++) {
    const num = `A-${String(i).padStart(3, "0")}`;
    params.push(num, 0, "available", "standard");
    const b = params.length;
    values.push(`(${companyId}, ${zoneId}, $${b - 3}, $${b - 2}, $${b - 1}, $${b})`);
  }
  await pool.query(
    `INSERT INTO parking_slots (company_id, zone_id, slot_number, floor, status, type) VALUES ${values.join(",")}`,
    params
  );
  console.log("• created 20 spaces (A-001 .. A-020)");
}

async function seedGates(companyId) {
  const c = await pool.query("SELECT COUNT(*)::int AS n FROM parking_gates WHERE company_id=$1", [companyId]);
  if (c.rows[0].n > 0) return console.log("• gates already present");
  await pool.query(
    `INSERT INTO parking_gates (company_id, name, code, type, direction, status)
     VALUES ($1,'Entry Gate 1','GATE-IN-1','entry','in','active'),
            ($1,'Exit Gate 1','GATE-OUT-1','exit','out','active')`,
    [companyId]
  );
  console.log("• created 2 gates");
}

async function seedVehicles(companyId) {
  const c = await pool.query("SELECT COUNT(*)::int AS n FROM parking_vehicles WHERE company_id=$1", [companyId]);
  if (c.rows[0].n > 0) return console.log("• vehicles already present");
  await pool.query(
    `INSERT INTO parking_vehicles (company_id, plate_number, vehicle_type, owner_name, owner_phone)
     VALUES ($1,'AA-12345','car','Demo Owner','+251900000000'),
            ($1,'AA-54321','suv','Demo Owner','+251900000000')`,
    [companyId]
  );
  console.log("• created 2 sample vehicles");
}

async function seedPlans(companyId) {
  const c = await pool.query(
    "SELECT COUNT(*)::int AS n FROM membership_plans WHERE company_id=$1 AND type='parking'",
    [companyId]
  );
  if (c.rows[0].n > 0) return console.log("• parking plans already present");
  await pool.query(
    `INSERT INTO membership_plans (company_id, name, type, description, duration_days, price, currency, is_active)
     VALUES ($1,'Monthly Parking','parking','Unlimited monthly parking access',30,1500,'ETB',true),
            ($1,'Quarterly Parking','parking','3-month parking subscription',90,4000,'ETB',true),
            ($1,'Annual Parking','parking','12-month parking subscription',365,14000,'ETB',true)`,
    [companyId]
  );
  console.log("• created 3 parking plans");
}

async function seedRfidCards(companyId) {
  const c = await pool.query("SELECT COUNT(*)::int AS n FROM rfid_cards WHERE company_id=$1", [companyId]);
  if (c.rows[0].n > 0) return console.log("• rfid cards already present");
  await pool.query(
    `INSERT INTO rfid_cards (company_id, card_uid, label, status)
     VALUES ($1,'04A1B2C3D4','Demo RFID Card 1','active'),
            ($1,'04E5F6A7B8','Demo RFID Card 2','active')
     ON CONFLICT (company_id, card_uid) DO NOTHING`,
    [companyId]
  );
  console.log("• created 2 sample RFID cards");
}

(async () => {
  try {
    const companyId = await resolveCompanyId();
    console.log(`Seeding parking data for company #${companyId}`);
    await seedTariff(companyId);
    const siteId = await seedSite(companyId);
    const zoneId = await seedZone(companyId, siteId);
    await seedSlots(companyId, zoneId);
    await seedGates(companyId);
    await seedVehicles(companyId);
    await seedPlans(companyId);
    await seedRfidCards(companyId);
    console.log("Seed complete.");
  } catch (e) {
    console.error("SEED ERROR:", e.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
})();
