import { NextResponse } from "next/server";
import pool from "@/lib/db";
import { withAuth, ok, created, err, badRequest } from "@/lib/api-utils";
import { requirePermission } from "@/lib/permissions";

export async function GET(req: Request) {
  return withAuth(req, async (user) => {
    const { allowed } = await requirePermission(user, "view", "parking_zones");
    if (!allowed) return NextResponse.json({ error: "Permission denied" }, { status: 403 });

    try {
      const result = await pool.query(
        `SELECT pz.*,
          (SELECT COUNT(*) FROM parking_slots WHERE zone_id = pz.id) as total_slots,
          (SELECT COUNT(*) FROM parking_slots WHERE zone_id = pz.id AND status = 'occupied') as occupied_slots
         FROM parking_zones pz
         WHERE pz.company_id = $1
         ORDER BY pz.code`,
        [user.company_id]
      );
      return ok(result.rows);
    } catch (e: any) {
      return err(e.message);
    }
  });
}

export async function POST(req: Request) {
  return withAuth(req, async (user) => {
    const { allowed } = await requirePermission(user, "create", "parking_zones");
    if (!allowed) return NextResponse.json({ error: "Permission denied" }, { status: 403 });

    try {
      const body = await req.json();
      const { name, code, floor, description, slot_count, type } = body;
      if (!name) return badRequest("Zone name is required");
      if (!code) return badRequest("Zone code is required");

      const result = await pool.query(
        `INSERT INTO parking_zones (company_id, name, code, floor, description, slot_count, type)
         VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
        [user.company_id, name, code.toUpperCase(), floor || 0, description, slot_count || 0, type || "standard"]
      );
      return created(result.rows[0]);
    } catch (e: any) {
      return err(e.message);
    }
  });
}
