import pool from "@/lib/db";

/**
 * Atomically increments and returns the next value for a tenant-scoped counter.
 * Safe under concurrency thanks to the ON CONFLICT upsert in a single statement.
 */
export async function nextSequence(
  companyId: number,
  scope: string,
  periodKey = "all"
): Promise<number> {
  const res = await pool.query(
    `INSERT INTO parking_counters (company_id, scope, period_key, current_value, updated_at)
     VALUES ($1, $2, $3, 1, CURRENT_TIMESTAMP)
     ON CONFLICT (company_id, scope, period_key)
     DO UPDATE SET current_value = parking_counters.current_value + 1,
                   updated_at = CURRENT_TIMESTAMP
     RETURNING current_value`,
    [companyId, scope, periodKey]
  );
  return Number(res.rows[0].current_value);
}

export function pad(n: number, length = 6): string {
  return String(n).padStart(length, "0");
}

export function dailyPeriodKey(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}${m}${d}`;
}

export function monthlyPeriodKey(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  return `${y}${m}`;
}

interface NumberOptions {
  pad?: number;
  separator?: string;
  periodKey?: string;
  includePeriod?: boolean;
}

/**
 * Sequential, prefixed id derived from the current MAX value in a table column
 * (used by the ported parking module). Example: `CUT-001`, `QR-004`.
 */
export async function generateSequentialId(
  table: string,
  column: string,
  prefix: string,
  padLength = 3
): Promise<string> {
  const result = await pool.query(
    `SELECT MAX(CAST(SUBSTRING(${column} FROM '${prefix}-([0-9]+)$') AS INTEGER)) AS max_id
     FROM ${table} WHERE ${column} ~ $1`,
    [`^${prefix}-\\d+$`]
  );
  const nextNum = (result.rows[0]?.max_id || 0) + 1;
  return `${prefix}-${padNumber(nextNum, padLength)}`;
}

function padNumber(n: number, length: number): string {
  return String(n).padStart(length, "0");
}

/** Generates e.g. `TKT-20261017-000001` or `RCP-000042`. */
export async function nextNumber(
  companyId: number,
  scope: string,
  prefix: string,
  opts: NumberOptions = {}
): Promise<string> {
  const { pad: padLen = 6, separator = "-", periodKey = "all", includePeriod = false } = opts;
  const seq = await nextSequence(companyId, scope, periodKey);
  const parts = [prefix];
  if (includePeriod && periodKey !== "all") parts.push(periodKey);
  parts.push(pad(seq, padLen));
  return parts.join(separator);
}
