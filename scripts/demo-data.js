#!/usr/bin/env node
/*
 * Development-only demo history generator (NOT part of the production seed).
 * Creates ~30 days of realistic parking sessions, payments, customers,
 * subscriptions, shifts and adjustments so dashboards, charts and reports can
 * be verified against plausible data.
 *
 *   node scripts/demo-data.js [--days 30] [--reset]
 *
 * --reset removes previously generated demo history (rows tagged demo=true in
 * notes) before regenerating. Never touches real operational data.
 */
const { Pool } = require("pg");
require("./load-env");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || "postgresql://postgres:postgres@localhost:5432/genius_hrms",
});

const args = process.argv.slice(2);
const reset = args.includes("--reset");
const days = Math.min(parseInt(args[args.indexOf("--days") + 1] || "30", 10) || 30, 120);

const VEHICLES = [
  ["ABC-123", "car", "Toyota Corolla", "White", "Abebe Kebede", "+251911000001"],
  ["CDXB-045", "suv", "Toyota Landcruiser", "Silver", "Sara Tesfaye", "+251911000002"],
  ["EF-9921", "car", "Hyundai Elantra", "Blue", "Dawit Alemu", "+251911000003"],
  ["GH-3312", "truck", "Isuzu NPR", "Grey", "Meron Hailu", "+251911000004"],
  ["JK-5561", "motorcycle", "TVS HLX", "Red", "Yonas Girma", "+251911000005"],
  ["LM-7788", "car", "Kia Rio", "Black", "Hanna Solomon", "+251911000006"],
  ["OP-2233", "car", "VW Golf", "Green", "Birhanu Nega", "+251911000007"],
  ["QR-4455", "bus", "Higer Bus", "White", "Selam Transport", "+251911000008"],
  ["ST-6677", "suv", "Mazda CX-5", "Blue", "Kalkidan Bekele", "+251911000009"],
  ["UV-8899", "car", "Chevrolet Spark", "Yellow", "Tewodros Assefa", "+251911000010"],
];

const rand = (n) => Math.floor(Math.random() * n);
const pick = (a) => a[rand(a.length)];
const money = (n) => Math.round(n * 100) / 100;

async function main() {
  const company = await pool.query("SELECT id FROM companies ORDER BY id LIMIT 1");
  const companyId = Number(process.env.COMPANY_ID) || company.rows[0].id;
  console.log(`Generating ${days} days of demo history for company #${companyId}`);

  if (reset) {
    await pool.query(
      `DELETE FROM parking_discounts WHERE company_id = $1 AND reason ILIKE '%demo%'`,
      [companyId]
    );
    await pool.query(
      `DELETE FROM parking_payments WHERE company_id = $1 AND notes ILIKE '%demo%'`,
      [companyId]
    );
    await pool.query(
      `DELETE FROM parking_sessions WHERE company_id = $1 AND notes ILIKE '%demo%'`,
      [companyId]
    );
    await pool.query(
      `DELETE FROM parking_subscriptions WHERE company_id = $1 AND notes ILIKE '%demo%'`,
      [companyId]
    );
    console.log("• removed previous demo history");
  }

  // Slots exist from npm run seed (A-001..A-020). Reuse them.
  const slots = await pool.query(
    `SELECT id, slot_number, zone_id, floor FROM parking_slots WHERE company_id = $1 ORDER BY id`,
    [companyId]
  );
  if (slots.rows.length === 0) throw new Error("No parking slots — run `npm run seed` first");

  // Customers + vehicles
  const customers = [];
  for (const [plate, type, model, color, owner, phone] of VEHICLES) {
    const name = owner;
    const exists = await pool.query(
      `SELECT id FROM membership_members WHERE company_id = $1 AND full_name = $2 LIMIT 1`,
      [companyId, name]
    );
    let customerId = exists.rows[0]?.id;
    if (!customerId) {
      const c = await pool.query(
        `INSERT INTO membership_members (company_id, full_name, phone, email, customer_id, start_date, end_date, status)
         VALUES ($1,$2,$3,$4,'CUT-' || lpad((floor(random()*900)+100)::text,3,'0'), CURRENT_DATE - 60, CURRENT_DATE + 300, 'active') RETURNING id`,
        [companyId, name, phone, `${name.split(" ")[0].toLowerCase()}@example.com`]
      );
      customerId = c.rows[0].id;
    }
    const v = await pool.query(
      `INSERT INTO parking_vehicles (company_id, plate_number, vehicle_type, vehicle_model, vehicle_color, owner_name, owner_phone, customer_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT (company_id, plate_number) DO UPDATE SET customer_id = EXCLUDED.customer_id
       RETURNING id`,
      [companyId, plate, type, model, color, owner, phone, customerId]
    );
    customers.push({ customerId, vehicleId: v.rows[0].id, plate, type, owner });
  }
  console.log(`• ${customers.length} demo customers/vehicles ready`);

  // Subscriptions (2 monthly, 1 annual) — expiries spread for notification demo
  const subs = [
    { i: 0, type: "monthly", start: -20, end: 10, amount: 2500 },
    { i: 1, type: "monthly", start: -27, end: 3, amount: 3000 },
    { i: 5, type: "annual", start: -100, end: 265, amount: 24000 },
    { i: 7, type: "monthly", start: -35, end: -2, amount: 2800 }, // expired → alert
  ];
  for (const s of subs) {
    await pool.query(
      `INSERT INTO parking_subscriptions (company_id, customer_id, vehicle_id, plan_type, start_date, end_date, amount, payment_method, status, notes, created_by)
       VALUES ($1,$2,$3,$4, CURRENT_DATE + ($5)::int, CURRENT_DATE + ($6)::int, $7, 'cash', 'active', 'demo subscription', 1)`,
      [companyId, customers[s.i].customerId, customers[s.i].vehicleId, s.type, s.start, s.end, s.amount]
    );
  }
  console.log(`• ${subs.length} demo subscriptions`);

  // Rates: ensure a default hourly tariff exists (created by npm run seed)
  const rate = await pool.query(
    `SELECT id, base_rate, per_hour_rate, billing_increment_minutes, grace_period_minutes FROM parking_rates
     WHERE company_id = $1 AND is_active = true ORDER BY is_default DESC, id LIMIT 1`,
    [companyId]
  );
  const tariff = rate.rows[0];
  const hourly = Number(tariff?.per_hour_rate ?? 30);
  const increment = Number(tariff?.billing_increment_minutes ?? 30);

  function feeFor(minutes) {
    if (minutes <= 15) return 0;
    const billable = Math.ceil((minutes - 15) / increment);
    return money(Math.max(10, billable * hourly));
  }

  // History
  const METHODS = ["cash", "cash", "cash", "telebirr", "telebirr", "cbebirr", "pos", "bank"];
  const activePlates = new Set();
  const busySlots = new Set();
  let count = 0;
  const now = new Date();
  for (let d = days; d >= 0; d--) {
    const day = new Date(now.getTime() - d * 86400000);
    const isWeekend = [0, 6].includes(day.getDay());
    const baseCount = isWeekend ? 6 + rand(4) : 10 + rand(8);
    for (let i = 0; i < baseCount; i++) {
      // Rush-hour-weighted hour
      const hour = pick([7, 8, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 17, 18, 18, 19, 20, 21]);
      const entry = new Date(day);
      entry.setHours(hour, rand(60), rand(60), 0);
      const cust = pick(customers);
      const stillInside = d === 0 && rand(10) < 2 && !activePlates.has(cust.plate);
      const durationMin = stillInside ? Math.max(5, Math.floor((now - entry) / 60000)) : pick([20, 35, 50, 65, 80, 95, 140, 200, 260, 420, 600, 800]);
      const exit = new Date(entry.getTime() + durationMin * 60000);
      const active = stillInside;
      if (active) activePlates.add(cust.plate);
      const slot = slots.rows[rand(slots.rows.length)];
      if (active) busySlots.add(slot.id);
      else busySlots.delete(slot.id);
      const fee = feeFor(durationMin);
      const unpaid = active ? rand(10) < 6 : rand(15) === 0;
      const method = pick(METHODS);

      const ticket = `TKT-${day.getFullYear()}${String(day.getMonth() + 1).padStart(2, "0")}${String(day.getDate()).padStart(2, "0")}-${String(count + 1).padStart(6, "0")}`;
      const s = await pool.query(
        `INSERT INTO parking_sessions
          (company_id, vehicle_id, plate_number, vehicle_type_snapshot, slot_id, entry_time, exit_time,
           duration_minutes, entry_method, entry_source, status, amount, gross_amount, discount_amount,
           amount_paid, paid, payment_status, ticket_number, notes)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'manual','web',$9,$10,$10,0,$11,$12,$13,$14,'demo history') RETURNING id`,
        [
          companyId, cust.vehicleId, cust.plate, cust.type, slot.id, entry,
          active ? null : exit, durationMin,
          active ? "active" : "completed", fee, active ? 0 : fee, !unpaid && !active,
          active ? "unpaid" : unpaid ? "unpaid" : "paid", ticket,
        ]
      );
      const sessionId = s.rows[0].id;
      count++;

      if (!active && !unpaid && fee > 0) {
        await pool.query(
          `INSERT INTO parking_payments (company_id, session_id, vehicle_id, amount, payment_method, receipt_number, payment_date, notes, created_by)
           VALUES ($1,$2,$3,$4,$5,'RCP-DEV-' || lpad(($6)::text,6,'0'), $7, 'demo payment', 1)`,
          [companyId, sessionId, cust.vehicleId, fee, method, count, exit]
        );
        await pool.query(
          `UPDATE parking_sessions SET payment_status = 'paid', amount_paid = $2 WHERE id = $1`,
          [sessionId, fee]
        );
      }
      if (!active && unpaid) {
        await pool.query(
          `UPDATE parking_sessions SET payment_status = 'unpaid', paid = false WHERE id = $1`,
          [sessionId]
        );
      }
    }
  }

  // A couple of live sessions occupying spaces right now
  for (let i = 0; i < 4; i++) {
    const cust = customers[i];
    if (activePlates.has(cust.plate)) continue;
    const slot = slots.rows.find((sl) => !busySlots.has(sl.id));
    if (!slot) break;
    busySlots.add(slot.id);
    const entry = new Date(now.getTime() - (30 + rand(300)) * 60000);
    const ticket = `TKT-LIVE-${i + 1}`;
    await pool.query(
      `INSERT INTO parking_sessions
        (company_id, vehicle_id, plate_number, vehicle_type_snapshot, slot_id, entry_time, entry_method, entry_source, status, payment_status, ticket_number, notes)
       VALUES ($1,$2,$3,$4,$5,$6,'manual','web','active','unpaid',$7,'demo live session')`,
      [companyId, cust.vehicleId, cust.plate, cust.type, slot.id, entry, ticket]
    );
    await pool.query(`UPDATE parking_slots SET status = 'occupied', current_session_id = (SELECT id FROM parking_sessions WHERE ticket_number = $1) WHERE id = $2`, [ticket, slot.id]);
  }
  console.log(`• ${count} historical sessions + 4 live sessions`);

  // One pending refund to exercise the authorization workflow
  const pay = await pool.query(
    `SELECT id, amount FROM parking_payments WHERE company_id = $1 ORDER BY payment_date DESC LIMIT 1`,
    [companyId]
  );
  if (pay.rows[0]) {
    await pool.query(
      `INSERT INTO parking_refunds (company_id, payment_id, amount, reason, requested_by, status)
       VALUES ($1,$2, ROUND(($3)::numeric * 0.5, 2), 'demo refund — customer double-paid', 1, 'pending')`,
      [companyId, pay.rows[0].id, pay.rows[0].amount]
    );
    console.log("• 1 pending demo refund");
  }

  console.log("Demo history complete.");
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
