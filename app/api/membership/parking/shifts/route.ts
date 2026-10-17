import pool from "@/lib/db";
import { withAuth, ok, created, err, badRequest, conflict } from "@/lib/api-utils";
import { requirePermission } from "@/lib/permissions";
import { nextNumber } from "@/lib/id-generator";
import { round2 } from "@/lib/money";
import { logParkingAudit } from "@/lib/audit";

/**
 * GET  /api/membership/parking/shifts?status=open|closed|reconciled&limit=
 * GET  /api/membership/parking/shifts?current=1   → caller's open shift + live totals
 * POST /api/membership/parking/shifts             → open a shift { opening_cash, site_id? }
 */
export async function GET(req: Request) {
  return withAuth(req, async (user) => {
    const perm = await requirePermission(user, "view", "parking_shifts");
    if (!perm.allowed) return err("Permission denied", 403);

    const { searchParams } = new URL(req.url);
    const current = searchParams.get("current");

    try {
      if (current) {
        const res = await pool.query(
          `SELECT sh.*, u.name AS operator_name,
                  (SELECT COALESCE(SUM(pp.amount),0) FROM parking_payments pp
                    WHERE pp.company_id = sh.company_id AND pp.payment_method = 'cash'
                      AND pp.payment_date BETWEEN sh.opened_at AND COALESCE(sh.closed_at, NOW())) AS cash_collected,
                  (SELECT COUNT(*) FROM parking_payments pp
                    WHERE pp.company_id = sh.company_id
                      AND pp.payment_date BETWEEN sh.opened_at AND COALESCE(sh.closed_at, NOW())) AS transactions,
                  (SELECT COALESCE(SUM(pp.amount),0) FROM parking_payments pp
                    WHERE pp.company_id = sh.company_id
                      AND pp.payment_date BETWEEN sh.opened_at AND COALESCE(sh.closed_at, NOW())) AS total_collected_live,
                  (SELECT COALESCE(SUM(m.amount) FILTER (WHERE m.movement_type IN ('cash_out','pickup','drop')),0)
                          - COALESCE(SUM(m.amount) FILTER (WHERE m.movement_type IN ('cash_in','float')),0)
                   FROM parking_shift_movements m WHERE m.shift_id = sh.id) AS movements_net
           FROM parking_shifts sh LEFT JOIN users u ON u.id = sh.operator_id
           WHERE sh.company_id = $1 AND sh.operator_id = $2 AND sh.status = 'open'
           ORDER BY sh.id DESC LIMIT 1`,
          [user.company_id, user.id]
        );
        return ok({ shift: res.rows[0] || null });
      }

      const status = searchParams.get("status");
      const limit = Math.min(parseInt(searchParams.get("limit") || "50", 10) || 50, 200);
      const params: unknown[] = [user.company_id];
      let where = `sh.company_id = $1`;
      if (status) {
        params.push(status);
        where += ` AND sh.status = $${params.length}`;
      }
      const res = await pool.query(
        `SELECT sh.*, u.name AS operator_name
         FROM parking_shifts sh LEFT JOIN users u ON u.id = sh.operator_id
         WHERE ${where} ORDER BY sh.id DESC LIMIT ${limit}`,
        params
      );
      return ok(res.rows);
    } catch (e: any) {
      return err(e.message);
    }
  });
}

export async function POST(req: Request) {
  return withAuth(req, async (user) => {
    const perm = await requirePermission(user, "create", "parking_shifts");
    if (!perm.allowed) return err("Permission denied", 403);
    if (!user.company_id) return badRequest("Company required");

    try {
      const body = await req.json().catch(() => ({}));
      const openingCash = round2(Number(body.opening_cash ?? 0));
      if (!isFinite(openingCash) || openingCash < 0) return badRequest("Opening cash must be a non-negative number");

      const open = await pool.query(
        `SELECT id FROM parking_shifts WHERE company_id = $1 AND operator_id = $2 AND status = 'open' LIMIT 1`,
        [user.company_id, user.id]
      );
      if (open.rows[0]) return conflict("You already have an open shift. Close it before starting a new one.");

      const code = await nextNumber(user.company_id, "shift", "SH", { pad: 5 });
      const res = await pool.query(
        `INSERT INTO parking_shifts (company_id, site_id, shift_code, operator_id, opening_cash, expected_cash, status)
         VALUES ($1,$2,$3,$4,$5,$5,'open') RETURNING *`,
        [user.company_id, body.site_id ? Number(body.site_id) : null, code, user.id, openingCash]
      );

      await logParkingAudit({
        user,
        action: "SHIFT_OPEN",
        entity: "parking_shift",
        entity_id: res.rows[0].id,
        description: `Shift ${code} opened with ${openingCash} float`,
        new_values: { opening_cash: openingCash },
        req,
      });

      return created(res.rows[0]);
    } catch (e: any) {
      return err(e.message);
    }
  });
}
