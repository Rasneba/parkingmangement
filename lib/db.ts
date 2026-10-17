import { Pool } from "pg";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is not defined in environment variables");
}

declare global {
  // Reuse a single pool across hot reloads in development.
  var __parkingPgPool: Pool | undefined;
}

const pool = global.__parkingPgPool ?? new Pool({ connectionString, max: 10 });

if (process.env.NODE_ENV !== "production") {
  global.__parkingPgPool = pool;
}

export default pool;
