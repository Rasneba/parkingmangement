import { NextResponse } from "next/server";
import { getAuthUser, unauthorized } from "@/lib/auth";
import { verifyPayment } from "@/lib/chapa";
import pool from "@/lib/db";

export async function GET(req: Request, { params }: { params: Promise<{ tx_ref: string }> }) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();
  const { tx_ref } = await params;
  try {
    const result = await verifyPayment(tx_ref);

    if (result.status === "success" && result.data) {
      const txData = result.data as any;
      if (txData.status === "completed" || txData.status === "success") {
        const payRes = await pool.query(
          `UPDATE parking_payments SET notes = 'Chapa payment completed' WHERE reference = $1 RETURNING session_id, amount`,
          [tx_ref]
        );
        if (payRes.rows.length > 0) {
          const { session_id, amount } = payRes.rows[0];
          await pool.query(
            `UPDATE parking_sessions SET paid = true, amount = $1, status = 'completed' WHERE id = $2`,
            [amount, session_id]
          );
          const slotRes = await pool.query("SELECT slot_id FROM parking_sessions WHERE id = $1", [session_id]);
          if (slotRes.rows[0]?.slot_id) {
            await pool.query("UPDATE parking_slots SET status = 'available', current_session_id = NULL WHERE id = $1", [slotRes.rows[0].slot_id]);
          }
        }
      }
    }

    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
