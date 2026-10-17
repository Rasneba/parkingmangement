import { NextResponse } from "next/server";
import pool from "@/lib/db";
import { withAuth, ok, created, err, notFound, badRequest, deleted } from "@/lib/api-utils";
import { requirePermission } from "@/lib/permissions";

export async function GET(req: Request) {
  return withAuth(req, async (user) => {
    const { allowed } = await requirePermission(user, "view", "parking_gates");
    if (!allowed) return NextResponse.json({ error: "Permission denied" }, { status: 403 });
    try {
      const result = await pool.query(
        `SELECT pg.*,
          (SELECT COUNT(*) FROM parking_cameras WHERE gate_id = pg.id) as camera_count
         FROM parking_gates pg
         WHERE pg.company_id = $1
         ORDER BY pg.name`,
        [user.company_id]
      );
      return ok(result.rows);
    } catch (e: any) { return err(e.message); }
  });
}

export async function POST(req: Request) {
  return withAuth(req, async (user) => {
    const { allowed } = await requirePermission(user, "create", "parking_gates");
    if (!allowed) return NextResponse.json({ error: "Permission denied" }, { status: 403 });
    try {
      const body = await req.json();
      const { name, code, type, direction, ip_address, port, serial_port, barrier_open_delay, is_anpr_enabled, is_qr_enabled, is_nfc_enabled, is_rfid_enabled, notes } = body;
      if (!name) return badRequest("Gate name is required");
      if (!code) return badRequest("Gate code is required");
      const result = await pool.query(
        `INSERT INTO parking_gates (company_id, name, code, type, direction, ip_address, port, serial_port, barrier_open_delay, is_anpr_enabled, is_qr_enabled, is_nfc_enabled, is_rfid_enabled, notes)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *`,
        [user.company_id, name, code.toUpperCase(), type || "entry", direction || "in", ip_address, port, serial_port, barrier_open_delay || 2, is_anpr_enabled !== false, is_qr_enabled !== false, is_nfc_enabled || false, is_rfid_enabled || false, notes]
      );
      return created(result.rows[0]);
    } catch (e: any) { return err(e.message); }
  });
}
