import { NextResponse } from "next/server";
import pool from "@/lib/db";
import { withAuth, ok, err } from "@/lib/api-utils";
import { requirePermission } from "@/lib/permissions";

export async function GET(req: Request) {
  return withAuth(req, async (user) => {
    const { allowed } = await requirePermission(user, "view", "parking_subscriptions");
    if (!allowed) return NextResponse.json({ error: "Permission denied" }, { status: 403 });
    try {
      const { searchParams } = new URL(req.url);
      const status = searchParams.get("status");
      const from = searchParams.get("from");
      const to = searchParams.get("to");
      let query = `SELECT ps.*,
          mm.full_name as customer_name, mm.phone as customer_phone, mm.customer_id as customer_code,
          pv.plate_number, pv.vehicle_type, pv.vehicle_model
         FROM parking_subscriptions ps
         JOIN membership_members mm ON ps.customer_id = mm.id
         LEFT JOIN parking_vehicles pv ON ps.vehicle_id = pv.id
         WHERE ps.company_id = $1`;
      const params: any[] = [user.company_id];
      let idx = 2;
      if (status) { query += ` AND ps.status = $${idx}`; params.push(status); idx++; }
      if (from) { query += ` AND ps.start_date >= $${idx}`; params.push(from); idx++; }
      if (to) { query += ` AND ps.end_date <= $${idx}`; params.push(to); idx++; }
      query += " ORDER BY ps.created_at DESC";
      const result = await pool.query(query, params);

      const summary = await pool.query(
        `SELECT
          COUNT(*) as total,
          COUNT(*) FILTER (WHERE status = 'active') as active_count,
          COUNT(*) FILTER (WHERE status = 'expired') as expired_count,
          COUNT(*) FILTER (WHERE status = 'cancelled') as cancelled_count,
          COALESCE(SUM(amount) FILTER (WHERE status = 'active'), 0) as active_revenue,
          COALESCE(SUM(amount), 0) as total_revenue
         FROM parking_subscriptions
         WHERE company_id = $1`,
        [user.company_id]
      );

      return ok({ rows: result.rows, summary: summary.rows[0] });
    } catch (e: any) {
      return err(e.message);
    }
  });
}
