import { NextResponse } from "next/server";
import pool from "@/lib/db";
import { getAuthUser, unauthorized } from "@/lib/auth";
import QRCode from "qrcode";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();
  const { id } = await params;
  try {
    const result = await pool.query(
      `SELECT ps.*,
        mm.full_name as customer_name, mm.phone as customer_phone, mm.customer_id as customer_code,
        pv.plate_number, pv.vehicle_type, pv.vehicle_model,
        u.name as created_by_name,
        mp.name as plan_name, mp.duration_days as plan_duration_days
       FROM parking_subscriptions ps
       JOIN membership_members mm ON ps.customer_id = mm.id
       LEFT JOIN parking_vehicles pv ON ps.vehicle_id = pv.id
       LEFT JOIN users u ON ps.created_by = u.id
       LEFT JOIN membership_plans mp ON ps.plan_id = mp.id
       WHERE ps.id = $1`, [id]
    );
    if (result.rows.length === 0) return NextResponse.json({ error: "Subscription not found" }, { status: 404 });
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
    const allowed = ["vehicle_id","plan_id","plan_type","start_date","end_date","amount","payment_method","payment_reference","status","auto_renew","notes","freeze_start","freeze_end"];
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
      `UPDATE parking_subscriptions SET ${sets.join(", ")} WHERE id = $${idx} RETURNING *`, vals
    );
    if (result.rows.length === 0) return NextResponse.json({ error: "Subscription not found" }, { status: 404 });

    let updated = result.rows[0];

    if (body.status === "active" && updated.freeze_start && updated.freeze_end) {
      const freezeStart = new Date(updated.freeze_start);
      const freezeEnd = new Date(updated.freeze_end);
      const freezeDays = Math.ceil((freezeEnd.getTime() - freezeStart.getTime()) / (1000 * 60 * 60 * 24));
      if (freezeDays > 0) {
        const currentEnd = new Date(updated.end_date);
        currentEnd.setDate(currentEnd.getDate() + freezeDays);
        const newEnd = currentEnd.toISOString().split("T")[0];
        await pool.query(
          "UPDATE parking_subscriptions SET end_date = $1, freeze_start = NULL, freeze_end = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = $2",
          [newEnd, id]
        );
        const refetch = await pool.query("SELECT * FROM parking_subscriptions WHERE id = $1", [id]);
        updated = refetch.rows[0];
      } else {
        await pool.query(
          "UPDATE parking_subscriptions SET freeze_start = NULL, freeze_end = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = $1",
          [id]
        );
        const refetch = await pool.query("SELECT * FROM parking_subscriptions WHERE id = $1", [id]);
        updated = refetch.rows[0];
      }
    }

    if (body.status !== undefined || body.end_date !== undefined) {
      const qrData = JSON.stringify({ t: "sub", sid: updated.id, cid: updated.company_id, exp: updated.end_date });
      const qrImage = await QRCode.toDataURL(qrData, { width: 300, margin: 2 });
      await pool.query("UPDATE parking_subscriptions SET qr_code = $1, qr_image = $2 WHERE id = $3", [Buffer.from(qrData).toString("base64"), qrImage, updated.id]);
      updated.qr_code = Buffer.from(qrData).toString("base64");
      updated.qr_image = qrImage;
    }

    return NextResponse.json(updated);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();
  const { id } = await params;
  try {
    const sub = await pool.query("SELECT vehicle_id FROM parking_subscriptions WHERE id = $1", [id]);
    const vehicleId = sub.rows[0]?.vehicle_id;
    const result = await pool.query("DELETE FROM parking_subscriptions WHERE id = $1 RETURNING id", [id]);
    if (result.rows.length === 0) return NextResponse.json({ error: "Subscription not found" }, { status: 404 });
    if (vehicleId) {
      await pool.query("UPDATE parking_vehicles SET is_resident = false WHERE id = $1", [vehicleId]);
    }
    return NextResponse.json({ message: "Deleted" });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
