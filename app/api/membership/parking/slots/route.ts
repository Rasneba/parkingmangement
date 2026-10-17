import { NextResponse } from "next/server";
import pool from "@/lib/db";
import { withAuth, ok, created, err, notFound, badRequest, deleted } from "@/lib/api-utils";
import { requirePermission } from "@/lib/permissions";

export async function GET(req: Request) {
  return withAuth(req, async (user) => {
    const { allowed } = await requirePermission(user, "view", "parking_slots");
    if (!allowed) return NextResponse.json({ error: "Permission denied" }, { status: 403 });
    const { searchParams } = new URL(req.url);
    const zoneId = searchParams.get("zone_id");
    const status = searchParams.get("status");
    try {
      let query = `SELECT ps.*, pz.name as zone_name, pz.code as zone_code
         FROM parking_slots ps
         JOIN parking_zones pz ON ps.zone_id = pz.id
         WHERE ps.company_id = $1`;
      const params: any[] = [user.company_id];
      let idx = 2;
      if (zoneId) { query += ` AND ps.zone_id = $${idx}`; params.push(zoneId); idx++; }
      if (status) { query += ` AND ps.status = $${idx}`; params.push(status); idx++; }
      query += " ORDER BY pz.code, ps.slot_number";
      const result = await pool.query(query, params);
      return ok(result.rows);
    } catch (e: any) { return err(e.message); }
  });
}

export async function POST(req: Request) {
  return withAuth(req, async (user) => {
    const { allowed } = await requirePermission(user, "create", "parking_slots");
    if (!allowed) return NextResponse.json({ error: "Permission denied" }, { status: 403 });
    try {
      const body = await req.json();
      const { zone_id, slot_number, floor, type } = body;
      if (!zone_id) return badRequest("Zone is required");
      if (!slot_number) return badRequest("Slot number is required");
      const result = await pool.query(
        `INSERT INTO parking_slots (company_id, zone_id, slot_number, floor, type)
         VALUES ($1,$2,$3,$4,$5) RETURNING *`,
        [user.company_id, zone_id, slot_number, floor || 0, type || "standard"]
      );
      await pool.query("UPDATE parking_zones SET slot_count = (SELECT COUNT(*) FROM parking_slots WHERE zone_id = $1) WHERE id = $1", [zone_id]);
      return created(result.rows[0]);
    } catch (e: any) { return err(e.message); }
  });
}
