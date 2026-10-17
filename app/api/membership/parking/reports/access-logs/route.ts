import { NextResponse } from "next/server";
import pool from "@/lib/db";
import { withAuth, ok, err } from "@/lib/api-utils";
import { requirePermission } from "@/lib/permissions";

export async function GET(req: Request) {
  return withAuth(req, async (user) => {
    const { allowed } = await requirePermission(user, "view", "parking_sessions");
    if (!allowed) return NextResponse.json({ error: "Permission denied" }, { status: 403 });
    try {
      const { searchParams } = new URL(req.url);
      const from = searchParams.get("from");
      const to = searchParams.get("to");
      const plate = searchParams.get("plate");
      const status = searchParams.get("status");
      let query = `SELECT * FROM parking_access_logs WHERE company_id = $1`;
      const params: any[] = [user.company_id];
      let idx = 2;
      if (from) { query += ` AND entry_time >= $${idx}::timestamp`; params.push(from); idx++; }
      if (to) { query += ` AND entry_time <= $${idx}::timestamp`; params.push(to); idx++; }
      if (plate) { query += ` AND plate_number ILIKE $${idx}`; params.push(`%${plate}%`); idx++; }
      if (status) { query += ` AND session_status = $${idx}`; params.push(status); idx++; }
      query += " ORDER BY entry_time DESC LIMIT 500";
      const result = await pool.query(query, params);

      const summary = await pool.query(
        `SELECT
          COUNT(*) as total_entries,
          COUNT(*) FILTER (WHERE exit_time IS NOT NULL) as total_exits,
          COUNT(*) FILTER (WHERE session_status = 'active') as active_sessions,
          COALESCE(AVG(duration_minutes) FILTER (WHERE duration_minutes IS NOT NULL), 0)::integer as avg_duration_minutes,
          COALESCE(SUM(amount) FILTER (WHERE paid = true), 0) as total_revenue
         FROM parking_access_logs
         WHERE company_id = $1`,
        [user.company_id]
      );

      return ok({ rows: result.rows, summary: summary.rows[0] });
    } catch (e: any) {
      return err(e.message);
    }
  });
}
