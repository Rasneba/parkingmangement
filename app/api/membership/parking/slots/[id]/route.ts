import { NextResponse } from "next/server";
import pool from "@/lib/db";
import { getAuthUser, unauthorized } from "@/lib/auth";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();
  const { id } = await params;
  try {
    const result = await pool.query(
      `SELECT ps.*, pz.name as zone_name, pz.code as zone_code
       FROM parking_slots ps
       JOIN parking_zones pz ON ps.zone_id = pz.id
       WHERE ps.id = $1`, [id]
    );
    if (result.rows.length === 0) return NextResponse.json({ error: "Slot not found" }, { status: 404 });
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
    const allowed = ["zone_id","slot_number","floor","status","type","current_session_id"];
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
      `UPDATE parking_slots SET ${sets.join(", ")} WHERE id = $${idx} RETURNING *`, vals
    );
    if (result.rows.length === 0) return NextResponse.json({ error: "Slot not found" }, { status: 404 });
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
    const slot = await pool.query("SELECT zone_id FROM parking_slots WHERE id = $1", [id]);
    const zoneId = slot.rows[0]?.zone_id;
    const result = await pool.query("DELETE FROM parking_slots WHERE id = $1 RETURNING id", [id]);
    if (result.rows.length === 0) return NextResponse.json({ error: "Slot not found" }, { status: 404 });
    if (zoneId) {
      await pool.query("UPDATE parking_zones SET slot_count = (SELECT COUNT(*) FROM parking_slots WHERE zone_id = $1) WHERE id = $1", [zoneId]);
    }
    return NextResponse.json({ message: "Deleted" });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
