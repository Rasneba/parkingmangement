import { NextResponse } from "next/server";
import pool from "@/lib/db";
import { getAuthUser, unauthorized } from "@/lib/auth";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();
  const { id } = await params;
  try {
    const result = await pool.query(
      `SELECT mm.*,
        (SELECT json_agg(json_build_object('id', pv.id, 'plate_number', pv.plate_number, 'vehicle_type', pv.vehicle_type, 'vehicle_model', pv.vehicle_model, 'vehicle_color', pv.vehicle_color))
         FROM parking_vehicles pv WHERE pv.customer_id = mm.id) as vehicles,
        (SELECT json_agg(json_build_object('id', ps.id, 'plan_type', ps.plan_type, 'start_date', ps.start_date, 'end_date', ps.end_date, 'amount', ps.amount, 'status', ps.status))
         FROM parking_subscriptions ps WHERE ps.customer_id = mm.id) as subscriptions
       FROM membership_members mm WHERE mm.id = $1`, [id]
    );
    if (result.rows.length === 0) return NextResponse.json({ error: "Customer not found" }, { status: 404 });
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
    const allowed = ["customer_id","full_name","phone","email","address","photo_url","notes"];
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
      `UPDATE membership_members SET ${sets.join(", ")} WHERE id = $${idx} RETURNING *`, vals
    );
    if (result.rows.length === 0) return NextResponse.json({ error: "Customer not found" }, { status: 404 });
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
    const result = await pool.query("DELETE FROM membership_members WHERE id = $1 RETURNING id", [id]);
    if (result.rows.length === 0) return NextResponse.json({ error: "Customer not found" }, { status: 404 });
    return NextResponse.json({ message: "Deleted" });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
