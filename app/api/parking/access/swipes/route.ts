import { NextResponse } from "next/server";
import pool from "@/lib/db";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { card_uid, card_label, member_id, member_name, direction, event_type, controller_id, granted, reason, message, days_remaining, plan_name, subscription_id } = body;

    const result = await pool.query(
      `INSERT INTO rfid_access_logs
       (company_id, card_uid, member_id, member_name, granted, reason, message, days_remaining, door_opened, direction, event_type, controller_id, plan_name, subscription_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
       RETURNING id`,
      [
        body.company_id || null,
        card_uid || "",
        member_id || null,
        member_name || null,
        granted || false,
        reason || "RAW_SWIPE",
        message || null,
        days_remaining ?? 0,
        false,
        direction || null,
        event_type || null,
        controller_id || null,
        plan_name || null,
        subscription_id || null,
      ]
    );

    return NextResponse.json({ ok: true, id: result.rows[0]?.id });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
