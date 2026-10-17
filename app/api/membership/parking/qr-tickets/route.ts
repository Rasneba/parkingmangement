import { NextResponse } from "next/server";
import pool from "@/lib/db";
import { withAuth, ok, created, err, notFound, badRequest, deleted } from "@/lib/api-utils";
import { requirePermission } from "@/lib/permissions";
import { generateSequentialId } from "@/lib/id-generator";

export async function GET(req: Request) {
  return withAuth(req, async (user) => {
    const { allowed } = await requirePermission(user, "view", "parking_qr_tickets");
    if (!allowed) return NextResponse.json({ error: "Permission denied" }, { status: 403 });
    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status");
    try {
      let query = `SELECT pqt.*, u.name as created_by_name
         FROM parking_qr_tickets pqt
         LEFT JOIN users u ON pqt.created_by = u.id
         WHERE pqt.company_id = $1`;
      const params: any[] = [user.company_id];
      let idx = 2;
      if (status) { query += ` AND pqt.status = $${idx}`; params.push(status); idx++; }
      query += " ORDER BY pqt.created_at DESC";
      const result = await pool.query(query, params);
      return ok(result.rows);
    } catch (e: any) { return err(e.message); }
  });
}

export async function POST(req: Request) {
  return withAuth(req, async (user) => {
    const { allowed } = await requirePermission(user, "create", "parking_qr_tickets");
    if (!allowed) return NextResponse.json({ error: "Permission denied" }, { status: 403 });
    try {
      const body = await req.json();
      const { visitor_name, visitor_phone, visitor_plate, purpose, host_name, host_phone, valid_hours } = body;
      if (!visitor_name) return badRequest("Visitor name is required");

      const ticketNumber = await generateSequentialId("parking_qr_tickets", "ticket_number", "QR");
      const qrData = JSON.stringify({
        t: ticketNumber,
        c: user.company_id,
        v: visitor_name,
        p: visitor_plate,
        ts: Date.now()
      });
      const qrCode = Buffer.from(qrData).toString("base64");
      const validFrom = new Date();
      const validUntil = new Date(validFrom.getTime() + (parseInt(valid_hours) || 2) * 60 * 60 * 1000);

      const result = await pool.query(
        `INSERT INTO parking_qr_tickets (company_id, ticket_number, qr_code, visitor_name, visitor_phone, visitor_plate, purpose, host_name, host_phone, valid_from, valid_until, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
        [user.company_id, ticketNumber, qrCode, visitor_name, visitor_phone, visitor_plate, purpose, host_name, host_phone, validFrom, validUntil, user.id]
      );
      return created(result.rows[0]);
    } catch (e: any) { return err(e.message); }
  });
}
