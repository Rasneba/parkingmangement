import { NextResponse } from "next/server";
import pool from "@/lib/db";
import { withAuth, ok, created, err, notFound, badRequest, deleted } from "@/lib/api-utils";
import { requirePermission } from "@/lib/permissions";

export async function GET(req: Request) {
  return withAuth(req, async (user) => {
    const { allowed } = await requirePermission(user, "view", "parking_vehicles");
    if (!allowed) return NextResponse.json({ error: "Permission denied" }, { status: 403 });
    const { searchParams } = new URL(req.url);
    const plate = searchParams.get("plate");
    const q = searchParams.get("q");
    const customerId = searchParams.get("customer_id");
    const vehicleType = searchParams.get("vehicle_type");
    const blacklisted = searchParams.get("blacklisted");
    const limit = Math.min(parseInt(searchParams.get("limit") || "500", 10) || 500, 1000);
    try {
      let query = `SELECT pv.*,
          c.full_name AS customer_name,
          (SELECT COUNT(*) FROM parking_sessions WHERE vehicle_id = pv.id) as session_count
         FROM parking_vehicles pv
         LEFT JOIN membership_members c ON c.id = pv.customer_id
         WHERE pv.company_id = $1`;
      const params: any[] = [user.company_id];
      let idx = 2;
      const search = q || plate;
      if (search) {
        query += ` AND (pv.plate_number ILIKE $${idx} OR pv.owner_name ILIKE $${idx})`;
        params.push(`%${search}%`);
        idx++;
      }
      if (customerId) { query += ` AND pv.customer_id = $${idx}`; params.push(Number(customerId)); idx++; }
      if (vehicleType) { query += ` AND pv.vehicle_type = $${idx}`; params.push(vehicleType); idx++; }
      if (blacklisted === "true") { query += ` AND pv.is_blacklisted = true`; }
      if (blacklisted === "false") { query += ` AND pv.is_blacklisted = false`; }
      query += ` ORDER BY pv.created_at DESC LIMIT ${limit}`;
      const result = await pool.query(query, params);
      return ok(result.rows);
    } catch (e: any) { return err(e.message); }
  });
}

export async function POST(req: Request) {
  return withAuth(req, async (user) => {
    const { allowed } = await requirePermission(user, "create", "parking_vehicles");
    if (!allowed) return NextResponse.json({ error: "Permission denied" }, { status: 403 });
    try {
      const body = await req.json();
      const { plate_number, vehicle_type, vehicle_model, vehicle_color, owner_name, owner_phone, owner_email, rfid_tag, nfc_tag, is_resident, is_blacklisted, notes } = body;
      if (!plate_number) return badRequest("Plate number is required");
      const result = await pool.query(
        `INSERT INTO parking_vehicles (company_id, plate_number, vehicle_type, vehicle_model, vehicle_color, owner_name, owner_phone, owner_email, rfid_tag, nfc_tag, is_resident, is_blacklisted, notes)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
         ON CONFLICT (company_id, plate_number) DO UPDATE SET
           vehicle_type = EXCLUDED.vehicle_type,
           vehicle_model = EXCLUDED.vehicle_model,
           vehicle_color = EXCLUDED.vehicle_color,
           owner_name = EXCLUDED.owner_name,
           owner_phone = EXCLUDED.owner_phone,
           owner_email = EXCLUDED.owner_email,
           updated_at = CURRENT_TIMESTAMP
         RETURNING *`,
        [user.company_id, plate_number.toUpperCase(), vehicle_type || "car", vehicle_model, vehicle_color, owner_name, owner_phone, owner_email, rfid_tag, nfc_tag, is_resident || false, is_blacklisted || false, notes]
      );
      return created(result.rows[0]);
    } catch (e: any) { return err(e.message); }
  });
}
