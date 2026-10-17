import { NextResponse } from "next/server";
import pool from "@/lib/db";
import { withAuth, ok, created, err, notFound, badRequest, deleted } from "@/lib/api-utils";
import { requirePermission } from "@/lib/permissions";
import { generateSequentialId } from "@/lib/id-generator";

export async function GET(req: Request) {
  return withAuth(req, async (user) => {
    const { allowed } = await requirePermission(user, "view", "parking_payments");
    if (!allowed) return NextResponse.json({ error: "Permission denied" }, { status: 403 });
    const { searchParams } = new URL(req.url);
    const date = searchParams.get("date");
    try {
      let query = `SELECT pp.*,
          ps.ticket_number, ps.plate_number, ps.entry_time, ps.exit_time, ps.duration_minutes,
          pv.owner_name, pv.vehicle_type, pv.vehicle_model,
          eg.name as entry_gate_name
         FROM parking_payments pp
         JOIN parking_sessions ps ON pp.session_id = ps.id
         LEFT JOIN parking_vehicles pv ON pp.vehicle_id = pv.id
         LEFT JOIN parking_gates eg ON ps.entry_gate_id = eg.id
         WHERE pp.company_id = $1`;
      const params: any[] = [user.company_id];
      let idx = 2;
      if (date) { query += ` AND DATE(pp.payment_date) = $${idx}`; params.push(date); idx++; }
      query += " ORDER BY pp.created_at DESC LIMIT 200";
      const result = await pool.query(query, params);
      return ok(result.rows);
    } catch (e: any) { return err(e.message); }
  });
}

export async function POST(req: Request) {
  return withAuth(req, async (user) => {
    const { allowed } = await requirePermission(user, "create", "parking_payments");
    if (!allowed) return NextResponse.json({ error: "Permission denied" }, { status: 403 });
    if (!user.company_id) return badRequest("Company required");
    try {
      const body = await req.json();
      const { session_id, amount, payment_method, reference, pos_terminal_id, receipt_number, paid_by, notes } = body;
      if (!session_id) return badRequest("Session is required");
      if (!amount) return badRequest("Amount is required");

      const ref = reference || await generateSequentialId("parking_payments", "reference", "PAY");
      const result = await pool.query(
        `INSERT INTO parking_payments (company_id, session_id, vehicle_id, amount, payment_method, reference, pos_terminal_id, receipt_number, paid_by, notes)
         VALUES ($1,$2,(SELECT vehicle_id FROM parking_sessions WHERE id = $2),$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
        [user.company_id, session_id, amount, payment_method || "cash", ref, pos_terminal_id, receipt_number || null, paid_by || null, notes || null]
      );

      await pool.query(
        `UPDATE parking_sessions SET paid = true, amount = $1, status = 'completed' WHERE id = $2`,
        [amount, session_id]
      );

      const sessionRes = await pool.query("SELECT slot_id FROM parking_sessions WHERE id = $1", [session_id]);
      if (sessionRes.rows[0]?.slot_id) {
        await pool.query("UPDATE parking_slots SET status = 'available', current_session_id = NULL WHERE id = $1", [sessionRes.rows[0].slot_id]);
      }

      return created(result.rows[0]);
    } catch (e: any) { return err(e.message); }
  });
}
