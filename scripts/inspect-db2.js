const { Pool } = require("pg");
const p = new Pool({ connectionString: process.env.DATABASE_URL || "postgresql://postgres:postgres@localhost:5432/genius_hrms" });
(async () => {
  try {
    const cols = await p.query(`SELECT table_name, column_name, data_type, is_nullable FROM information_schema.columns WHERE table_schema='public' AND table_name IN ('users','companies','roles','role_permissions','audit_logs','membership_members','branches') ORDER BY table_name, ordinal_position`);
    console.log("COLUMNS:");
    for (const r of cols.rows) console.log(`${r.table_name}.${r.column_name} (${r.data_type}${r.is_nullable === 'YES' ? ', null' : ''})`);
    const roles = await p.query(`SELECT id, name FROM roles ORDER BY id`);
    console.log("\nROLES:\n" + roles.rows.map(x => `${x.id}=${x.name}`).join("\n"));
    const comp = await p.query(`SELECT id, name, tin, status FROM companies ORDER BY id LIMIT 10`);
    console.log("\nCOMPANIES:\n" + comp.rows.map(x => `${x.id} | ${x.name} | ${x.tin} | ${x.status}`).join("\n"));
    const uc = await p.query(`SELECT company_id, COUNT(*) c FROM users GROUP BY company_id ORDER BY company_id`);
    console.log("\nUSER COUNTS BY COMPANY:\n" + uc.rows.map(x => `${x.company_id}: ${x.c}`).join("\n"));
    const cnt = await p.query(`SELECT (SELECT COUNT(*) FROM parking_sessions) sessions, (SELECT COUNT(*) FROM parking_vehicles) vehicles, (SELECT COUNT(*) FROM parking_slots) slots, (SELECT COUNT(*) FROM parking_zones) zones, (SELECT COUNT(*) FROM parking_rates) rates`);
    console.log("\nPARKING ROW COUNTS:", JSON.stringify(cnt.rows[0]));
  } catch (e) { console.log("ERR", e.message); } finally { p.end(); }
})();
