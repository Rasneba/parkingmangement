import { NextResponse } from "next/server";
import pool from "@/lib/db";
import { withAuth, ok, created, err, notFound, badRequest, deleted } from "@/lib/api-utils";
import { requirePermission } from "@/lib/permissions";

export async function GET(req: Request) {
  return withAuth(req, async (user) => {
    const { allowed } = await requirePermission(user, "view", "parking_rates");
    if (!allowed) return NextResponse.json({ error: "Permission denied" }, { status: 403 });
    try {
      const result = await pool.query(
        `SELECT * FROM parking_rates
         WHERE company_id = $1
         ORDER BY vehicle_type, rate_type`,
        [user.company_id]
      );
      return ok(result.rows);
    } catch (e: any) { return err(e.message); }
  });
}

export async function POST(req: Request) {
  return withAuth(req, async (user) => {
    const { allowed } = await requirePermission(user, "create", "parking_rates");
    if (!allowed) return NextResponse.json({ error: "Permission denied" }, { status: 403 });
    try {
      const body = await req.json();
      const { name, vehicle_type, rate_type, base_rate, per_hour_rate, per_day_rate, grace_period_minutes, max_daily_charge } = body;
      if (!name) return badRequest("Rate name is required");
      const result = await pool.query(
        `INSERT INTO parking_rates (company_id, name, vehicle_type, rate_type, base_rate, per_hour_rate, per_day_rate, grace_period_minutes, max_daily_charge)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
        [user.company_id, name, vehicle_type || "all", rate_type || "hourly", base_rate || 0, per_hour_rate || 0, per_day_rate || 0, grace_period_minutes || 15, max_daily_charge]
      );
      return created(result.rows[0]);
    } catch (e: any) { return err(e.message); }
  });
}
