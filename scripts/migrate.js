#!/usr/bin/env node
/*
 * Versioned, reversible migration runner for the Parking Management System.
 *
 * All migrations are ADDITIVE and safe to run against the shared ERP database.
 * Usage:
 *   node scripts/migrate.js            # apply all pending .up.sql
 *   node scripts/migrate.js --down     # roll back the last applied migration
 *   node scripts/migrate.js --down all # roll back every migration
 *   node scripts/migrate.js --status   # show applied / pending
 *   node scripts/migrate.js --dry-run  # list what would run
 */
const fs = require("fs");
const path = require("path");
const { Pool } = require("pg");
require("./load-env");

const MIGRATIONS_DIR = path.join(__dirname, "..", "db", "migrations");
const connectionString =
  process.env.DATABASE_URL || "postgresql://postgres:postgres@localhost:5432/genius_hrms";

const pool = new Pool({ connectionString });

function listMigrations() {
  return fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".up.sql"))
    .map((f) => f.replace(".up.sql", ""))
    .sort();
}

async function ensureTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS parking_schema_migrations (
      version    VARCHAR(120) PRIMARY KEY,
      applied_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP
    )
  `);
}

async function applied() {
  const r = await pool.query("SELECT version FROM parking_schema_migrations ORDER BY version");
  return r.rows.map((x) => x.version);
}

async function apply(version, dryRun) {
  const file = path.join(MIGRATIONS_DIR, `${version}.up.sql`);
  const sql = fs.readFileSync(file, "utf8");
  if (dryRun) {
    console.log(`[dry-run] would apply ${version}`);
    return;
  }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(sql);
    await client.query("INSERT INTO parking_schema_migrations (version) VALUES ($1)", [version]);
    await client.query("COMMIT");
    console.log(`applied  ${version}`);
  } catch (e) {
    await client.query("ROLLBACK");
    throw new Error(`migration ${version} failed: ${e.message}`);
  } finally {
    client.release();
  }
}

async function rollback(version) {
  const file = path.join(MIGRATIONS_DIR, `${version}.down.sql`);
  if (!fs.existsSync(file)) throw new Error(`missing down migration for ${version}`);
  const sql = fs.readFileSync(file, "utf8");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(sql);
    await client.query("DELETE FROM parking_schema_migrations WHERE version = $1", [version]);
    await client.query("COMMIT");
    console.log(`rolled back ${version}`);
  } catch (e) {
    await client.query("ROLLBACK");
    throw new Error(`rollback ${version} failed: ${e.message}`);
  } finally {
    client.release();
  }
}

(async () => {
  const args = process.argv.slice(2);
  try {
    await ensureTable();
    const all = listMigrations();
    const done = await applied();

    if (args.includes("--status")) {
      for (const v of all) console.log(`${done.includes(v) ? "[x]" : "[ ]"} ${v}`);
      return;
    }

    if (args.includes("--down")) {
      const target = args[args.indexOf("--down") + 1];
      if (target === "all") {
        for (const v of [...done].reverse()) await rollback(v);
      } else {
        const last = done[done.length - 1];
        if (!last) return void console.log("nothing to roll back");
        await rollback(last);
      }
      return;
    }

    const dryRun = args.includes("--dry-run");
    const pending = all.filter((v) => !done.includes(v));
    if (pending.length === 0) return void console.log("database is up to date");
    for (const v of pending) await apply(v, dryRun);
  } catch (e) {
    console.error("ERROR:", e.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
})();
