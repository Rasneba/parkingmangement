import pool from "@/lib/db";
import type { AuthUser } from "@/lib/auth";

export type ParkingAuditAction =
  | "LOGIN"
  | "LOGOUT"
  | "CREATE"
  | "UPDATE"
  | "DELETE"
  | "ENTRY"
  | "EXIT"
  | "PAYMENT"
  | "REFUND"
  | "DISCOUNT"
  | "SHIFT_OPEN"
  | "SHIFT_CLOSE"
  | "SHIFT_RECONCILE"
  | "APPROVE"
  | "REJECT"
  | "PRINT"
  | "EXPORT";

export interface ParkingAuditInput {
  user?: AuthUser | null;
  company_id?: number | null;
  action: ParkingAuditAction;
  entity: string;
  entity_id?: number | string | null;
  description?: string;
  old_values?: unknown;
  new_values?: unknown;
  req?: Request;
  ip_address?: string;
  user_agent?: string;
}

export function requestMeta(req?: Request): { ip_address?: string; user_agent?: string } {
  if (!req) return {};
  const headers = req.headers;
  const ip =
    headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    headers.get("x-real-ip") ||
    undefined;
  return { ip_address: ip, user_agent: headers.get("user-agent") || undefined };
}

/** Best-effort audit write — never throws into the caller's business flow. */
export async function logParkingAudit(entry: ParkingAuditInput): Promise<void> {
  try {
    const meta = requestMeta(entry.req);
    await pool.query(
      `INSERT INTO parking_audit_logs
         (company_id, user_id, user_email, action, entity, entity_id, description,
          old_values, new_values, ip_address, user_agent)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [
        entry.company_id ?? entry.user?.company_id ?? null,
        entry.user?.id ?? null,
        entry.user?.email ?? null,
        entry.action,
        entry.entity,
        entry.entity_id != null ? String(entry.entity_id) : null,
        entry.description ?? null,
        entry.old_values != null ? JSON.stringify(entry.old_values) : null,
        entry.new_values != null ? JSON.stringify(entry.new_values) : null,
        entry.ip_address ?? meta.ip_address ?? null,
        entry.user_agent ?? meta.user_agent ?? null,
      ]
    );
  } catch (e) {
    console.error("parking audit log failed:", e);
  }
}
