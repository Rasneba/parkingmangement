import { NextResponse } from "next/server";
import pool from "@/lib/db";
import { getAuthUser, unauthorized } from "@/lib/auth";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();
  const { id } = await params;
  try {
    const result = await pool.query(
      `SELECT pp.*,
        ps.ticket_number, ps.plate_number, ps.entry_time, ps.exit_time, ps.duration_minutes,
        pv.owner_name, pv.vehicle_type, pv.vehicle_model,
        eg.name as entry_gate_name, xg.name as exit_gate_name
       FROM parking_payments pp
       JOIN parking_sessions ps ON pp.session_id = ps.id
       LEFT JOIN parking_vehicles pv ON pp.vehicle_id = pv.id
       LEFT JOIN parking_gates eg ON ps.entry_gate_id = eg.id
       LEFT JOIN parking_gates xg ON ps.exit_gate_id = xg.id
       WHERE pp.id = $1`, [id]
    );
    if (result.rows.length === 0) return NextResponse.json({ error: "Payment not found" }, { status: 404 });
    return NextResponse.json(result.rows[0]);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();
  const { id } = await params;
  try {
    const body = await req.json();
    const allowed = ["amount","payment_method","reference","pos_terminal_id","receipt_number","paid_by","notes"];
    const sets: string[] = [];
    const vals: any[] = [];
    let idx = 1;
    for (const key of allowed) {
      if (body[key] !== undefined) { sets.push(`${key} = $${idx}`); vals.push(body[key]); idx++; }
    }
    if (sets.length === 0) return NextResponse.json({ error: "No fields" }, { status: 400 });
    vals.push(id);
    const result = await pool.query(
      `UPDATE parking_payments SET ${sets.join(", ")} WHERE id = $${idx} RETURNING *`, vals
    );
    if (result.rows.length === 0) return NextResponse.json({ error: "Payment not found" }, { status: 404 });
    return NextResponse.json(result.rows[0]);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();
  const { id } = await params;
  try {
    const result = await pool.query("DELETE FROM parking_payments WHERE id = $1 RETURNING id", [id]);
    if (result.rows.length === 0) return NextResponse.json({ error: "Payment not found" }, { status: 404 });
    return NextResponse.json({ message: "Deleted" });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
