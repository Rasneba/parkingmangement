import { NextResponse } from "next/server";
import pool from "@/lib/db";
import { withAuth, ok, created, err, notFound, badRequest, deleted } from "@/lib/api-utils";
import { requirePermission } from "@/lib/permissions";

export async function GET(req: Request) {
  return withAuth(req, async (user) => {
    const { allowed } = await requirePermission(user, "view", "parking_cameras");
    if (!allowed) return NextResponse.json({ error: "Permission denied" }, { status: 403 });
    try {
      const result = await pool.query(
        `SELECT pc.*, pg.name as gate_name, pg.code as gate_code
         FROM parking_cameras pc
         LEFT JOIN parking_gates pg ON pc.gate_id = pg.id
         WHERE pc.company_id = $1
         ORDER BY pc.name`,
        [user.company_id]
      );
      return ok(result.rows);
    } catch (e: any) { return err(e.message); }
  });
}

export async function POST(req: Request) {
  return withAuth(req, async (user) => {
    const { allowed } = await requirePermission(user, "create", "parking_cameras");
    if (!allowed) return NextResponse.json({ error: "Permission denied" }, { status: 403 });
    try {
      const body = await req.json();
      const { gate_id, name, code, ip_address, port, rtsp_url, direction, protocol, confidence_threshold } = body;
      if (!name) return badRequest("Camera name is required");
      if (!code) return badRequest("Camera code is required");
      const isWebcam = protocol === "webcam";
      if (!isWebcam && !ip_address) return badRequest("IP address is required");
      const result = await pool.query(
        `INSERT INTO parking_cameras (company_id, gate_id, name, code, ip_address, port, rtsp_url, direction, protocol, confidence_threshold)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
        [user.company_id, gate_id || null, name, code.toUpperCase(), ip_address || null, port || (isWebcam ? null : 80), rtsp_url || null, direction || "in", protocol || "http", isWebcam ? null : (confidence_threshold || 85.00)]
      );
      return created(result.rows[0]);
    } catch (e: any) { return err(e.message); }
  });
}
