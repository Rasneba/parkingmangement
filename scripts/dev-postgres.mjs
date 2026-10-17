/**
 * Sandbox-only helper: boots an embedded PostgreSQL cluster for local dev/tests.
 * Not part of the application runtime; kept out of production dependency lists.
 *
 * Usage: node scripts/dev-postgres.mjs [--port 5432] [--data <dir>]
 */
import EmbeddedPostgres from "embedded-postgres";
import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
function arg(name, fallback) {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
}

const port = parseInt(arg("--port", "5432"), 10);
const dataDir = path.resolve(arg("--data", ".pgdata/instance"));
const user = "parking";
const password = "parking";

if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
  const pg = new EmbeddedPostgres({
    databaseDir: dataDir,
    user,
    password,
    port,
    persistent: true,
  });
  await pg.initialise();
  await pg.start();
  await pg.createDatabase("parking");
  console.log(`embedded postgres initialised at ${dataDir}, db 'parking' created`);
} else {
  const pg = new EmbeddedPostgres({
    databaseDir: dataDir,
    user,
    password,
    port,
    persistent: true,
  });
  await pg.start();
  console.log("embedded postgres started");
}

// Keep running until killed
setInterval(() => {}, 1 << 30);
