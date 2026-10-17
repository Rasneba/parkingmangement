import { NextResponse } from "next/server";
import pool from "@/lib/db";
import { getAuthUser, unauthorized } from "@/lib/auth";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();
  const { id } = await params;
  try {
    const result = await pool.query(
      `SELECT ps.*,
        pv.plate_number as vehicle_plate, pv.vehicle_type, pv.vehicle_model, pv.vehicle_color, pv.owner_name,
        pv.owner_phone, pv.owner_email,
        eg.name as entry_gate_name, xg.name as exit_gate_name,
        ec.name as entry_camera_name, xc.name as exit_camera_name,
        pz.name as zone_name, psl.slot_number,
        pq.ticket_number as qr_ticket
       FROM parking_sessions ps
       LEFT JOIN parking_vehicles pv ON ps.vehicle_id = pv.id
       LEFT JOIN parking_gates eg ON ps.entry_gate_id = eg.id
       LEFT JOIN parking_gates xg ON ps.exit_gate_id = xg.id
       LEFT JOIN parking_cameras ec ON ps.entry_camera_id = ec.id
       LEFT JOIN parking_cameras xc ON ps.exit_camera_id = xc.id
       LEFT JOIN parking_slots psl ON ps.slot_id = psl.id
       LEFT JOIN parking_zones pz ON psl.zone_id = pz.id
       LEFT JOIN parking_qr_tickets pq ON ps.qr_ticket_id = pq.id
       WHERE ps.id = $1`, [id]
    );
    if (result.rows.length === 0) return NextResponse.json({ error: "Session not found" }, { status: 404 });
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
    const allowed = ["vehicle_id","plate_number","exit_gate_id","exit_camera_id","exit_time","duration_minutes","exit_image_url","exit_plate_confidence","exit_method","status","amount","paid","slot_id","notes"];

    if (body.exit_time || body.status === "completed") {
      const sessionRes = await pool.query("SELECT slot_id, entry_time FROM parking_sessions WHERE id = $1", [id]);
      if (sessionRes.rows.length > 0) {
        const { slot_id, entry_time } = sessionRes.rows[0];
        if (!body.exit_time) body.exit_time = new Date().toISOString();
        if (!body.duration_minutes) {
          const diffMs = new Date(body.exit_time).getTime() - new Date(entry_time).getTime();
          body.duration_minutes = Math.round(diffMs / 60000);
        }
        if (slot_id && body.status === "completed") {
          await pool.query("UPDATE parking_slots SET status = 'available', current_session_id = NULL WHERE id = $1", [slot_id]);
        }
      }
    }

    const sets: string[] = [];
    const vals: any[] = [];
    let idx = 1;
    for (const key of allowed) {
      if (body[key] !== undefined) { sets.push(`${key} = $${idx}`); vals.push(body[key]); idx++; }
    }
    if (sets.length === 0) return NextResponse.json({ error: "No fields" }, { status: 400 });
    sets.push("updated_at = CURRENT_TIMESTAMP");
    vals.push(id);
    const result = await pool.query(
      `UPDATE parking_sessions SET ${sets.join(", ")} WHERE id = $${idx} RETURNING *`, vals
    );
    if (result.rows.length === 0) return NextResponse.json({ error: "Session not found" }, { status: 404 });
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
    const session = await pool.query("SELECT slot_id FROM parking_sessions WHERE id = $1", [id]);
    if (session.rows[0]?.slot_id) {
      await pool.query("UPDATE parking_slots SET status = 'available', current_session_id = NULL WHERE id = $1", [session.rows[0].slot_id]);
    }
    const result = await pool.query("DELETE FROM parking_sessions WHERE id = $1 RETURNING id", [id]);
    if (result.rows.length === 0) return NextResponse.json({ error: "Session not found" }, { status: 404 });
    return NextResponse.json({ message: "Deleted" });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
