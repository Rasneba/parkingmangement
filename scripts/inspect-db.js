const { Pool } = require("pg");
const p = new Pool({ connectionString: process.env.DATABASE_URL || "postgresql://postgres:postgres@localhost:5432/genius_hrms" });
(async () => {
  try {
    const tables = await p.query(`SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND (table_name LIKE 'parking%' OR table_name IN ('companies','users','roles','role_permissions','audit_logs','membership_members','branches','id_definitions','id_sequences')) ORDER BY table_name`);
    console.log("TABLES:\n" + tables.rows.map(x => x.table_name).join("\n"));
    const cols = await p.query(`SELECT table_name, column_name, data_type FROM information_schema.columns WHERE table_schema='public' AND table_name IN ('parking_sessions','parking_rates','parking_slots','parking_zones','parking_vehicles','parking_payments','parking_subscriptions') ORDER BY table_name, ordinal_position`);
    console.log("\nCOLUMNS:");
    for (const r of cols.rows) console.log(`${r.table_name}.${r.column_name} (${r.data_type})`);
  } catch (e) { console.log("ERR", e.message); } finally { p.end(); }
})();
