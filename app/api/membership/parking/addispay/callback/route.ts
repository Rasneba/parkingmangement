import { NextResponse } from "next/server";
import { checkStatus } from "@/lib/addispay";
import pool from "@/lib/db";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const txRef = searchParams.get("tx_ref");
  const sessionId = searchParams.get("session_id");

  if (!txRef) {
    return NextResponse.json({ error: "Missing tx_ref" }, { status: 400 });
  }

  try {
    const payRes = await pool.query(
      `SELECT id, session_id, amount, notes FROM parking_payments WHERE reference = $1`,
      [txRef]
    );

    const uuid = payRes.rows[0]?.notes?.replace("uuid:", "") || txRef;
    const result = await checkStatus(uuid);

    if (result.status === "success") {
      if (payRes.rows.length > 0) {
        const { session_id, amount } = payRes.rows[0];
        await pool.query(
          `UPDATE parking_payments SET notes = 'AddisPay payment completed via callback' WHERE reference = $1`,
          [txRef]
        );
        await pool.query(
          `UPDATE parking_sessions SET paid = true, amount = $1, status = 'completed' WHERE id = $2`,
          [amount, session_id]
        );
        const slotRes = await pool.query("SELECT slot_id FROM parking_sessions WHERE id = $1", [session_id]);
        if (slotRes.rows[0]?.slot_id) {
          await pool.query("UPDATE parking_slots SET status = 'available', current_session_id = NULL WHERE id = $1", [slotRes.rows[0].slot_id]);
        }
        if (sessionId) {
          return NextResponse.redirect(
            new URL(`/dashboard/membership/parking/pos?session=${sessionId}&addispay=success`, req.url)
          );
        }
      }
    }

    if (sessionId) {
      return NextResponse.redirect(
        new URL(`/dashboard/membership/parking/pos?session=${sessionId}&addispay=pending`, req.url)
      );
    }

    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
