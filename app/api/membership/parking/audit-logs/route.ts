import pool from "@/lib/db";
import { withAuth, ok, err, isSuperAdmin } from "@/lib/api-utils";
import { requirePermission } from "@/lib/permissions";

/**
 * GET /api/membership/parking/audit-logs?action=&entity=&from=&to=&page=&page_size=
 * Dedicated parking audit trail (parking_audit_logs). View is restricted to
 * roles with parking_audit_logs:view (admins, supervisors, auditors).
 */
export async function GET(req: Request) {
  return withAuth(req, async (user) => {
    const perm = await requirePermission(user, "view", "parking_audit_logs");
    if (!perm.allowed) return err("Permission denied", 403);

    const { searchParams } = new URL(req.url);
    const action = searchParams.get("action");
    const entity = searchParams.get("entity");
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10) || 1);
    const pageSize = Math.min(Math.max(parseInt(searchParams.get("page_size") || "30", 10) || 30, 10), 100);

    const params: unknown[] = [];
    let cp = "TRUE";
    if (!isSuperAdmin(user)) {
      params.push(user.company_id);
      cp = "company_id = $1";
    }
    const P = (v: unknown) => {
      params.push(v);
      return `$${params.length}`;
    };

    try {
      const where = [cp];
      if (action) where.push(`action = ${P(action.toUpperCase())}`);
      if (entity) where.push(`entity = ${P(entity)}`);
      if (from) where.push(`created_at::date >= ${P(from)}`);
      if (to) where.push(`created_at::date <= ${P(to)}`);

      const countRes = await pool.query(`SELECT COUNT(*)::int AS total FROM parking_audit_logs WHERE ${where.join(" AND ")}`, params);
      const rows = await pool.query(
        `SELECT id, action, entity, entity_id, description, user_email, ip_address,
                old_values, new_values, created_at
         FROM parking_audit_logs
         WHERE ${where.join(" AND ")}
         ORDER BY created_at DESC
         LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`,
        params
      );
      return ok({ rows: rows.rows, total: countRes.rows[0]?.total ?? 0, page, page_size: pageSize });
    } catch (e: any) {
      return err(e.message);
    }
  });
}
