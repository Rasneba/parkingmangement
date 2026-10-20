import { NextResponse } from "next/server";
import pool from "@/lib/db";

/**
 * Controller/bridge endpoint for raw RFID swipes.
 *
 * When PARKING_RELAY_KEY is configured the caller must send it as `x-relay-key`.
 * Keep the key unset only in trusted local setups; production should always set it.
 */
export async function POST(req: Request) {
  const expectedKey = process.env.PARKING_RELAY_KEY;
  if (expectedKey && req.headers.get("x-relay-key") !== expectedKey) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { card_uid, member_id, member_name, direction, event_type, controller_id, granted, reason, message, days_remaining, plan_name, subscription_id } = body;
    const companyId = Number(body.company_id);

    const result = await pool.query(
      `INSERT INTO rfid_access_logs
       (company_id, card_uid, member_id, member_name, granted, reason, message, days_remaining, door_opened, direction, event_type, controller_id, plan_name, subscription_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
       RETURNING id`,
      [
        Number.isFinite(companyId) && companyId > 0 ? companyId : null,
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
    console.error("parking swipe log failed:", error);
    return NextResponse.json({ ok: false, error: "Failed to record swipe" }, { status: 500 });
  }
}
