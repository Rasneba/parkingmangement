import { NextResponse } from "next/server";
import { getAuthUser, unauthorized } from "@/lib/auth";
import { checkStatus } from "@/lib/addispay";
import pool from "@/lib/db";

export async function GET(req: Request, { params }: { params: Promise<{ tx_ref: string }> }) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();
  const { tx_ref } = await params;
  try {
    const payRes = await pool.query(
      `SELECT session_id, amount, notes FROM parking_payments WHERE reference = $1 AND company_id = $2`,
      [tx_ref, user.company_id]
    );

    if (payRes.rows.length === 0) {
      return NextResponse.json({ status: "failed", message: "Payment record not found" });
    }

    const uuid = payRes.rows[0].notes?.replace("uuid:", "") || tx_ref;
    const result = await checkStatus(uuid);

    if (result.status === "success") {
      const { session_id, amount } = payRes.rows[0];
      await pool.query(
        `UPDATE parking_payments SET notes = 'AddisPay payment completed' WHERE reference = $1`,
        [tx_ref]
      );
      await pool.query(
        `UPDATE parking_sessions SET paid = true, amount = $1, status = 'completed' WHERE id = $2`,
        [amount, session_id]
      );
      const slotRes = await pool.query("SELECT slot_id FROM parking_sessions WHERE id = $1", [session_id]);
      if (slotRes.rows[0]?.slot_id) {
        await pool.query("UPDATE parking_slots SET status = 'available', current_session_id = NULL WHERE id = $1", [slotRes.rows[0].slot_id]);
      }
    }

    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
