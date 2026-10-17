import { NextResponse } from "next/server";
import { verifyPayment } from "@/lib/chapa";
import pool from "@/lib/db";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const txRef = searchParams.get("tx_ref");
  const sessionId = searchParams.get("session_id");

  if (!txRef) {
    return NextResponse.json({ error: "Missing tx_ref" }, { status: 400 });
  }

  try {
    const result = await verifyPayment(txRef);
    const txData = result.data as any;

    if (result.status === "success" && (txData?.status === "completed" || txData?.status === "success")) {
      const payRes = await pool.query(
        `UPDATE parking_payments SET notes = 'Chapa payment completed via callback' WHERE reference = $1 RETURNING session_id, amount, company_id`,
        [txRef]
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
        if (sessionId) {
          return NextResponse.redirect(
            new URL(`/dashboard/membership/parking/pos?session=${sessionId}&chapa=success`, req.url)
          );
        }
      }
    }

    if (sessionId) {
      return NextResponse.redirect(
        new URL(`/dashboard/membership/parking/pos?session=${sessionId}&chapa=error`, req.url)
      );
    }

    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { tx_ref, status } = body;

    if (status === "success" || status === "completed") {
      const payRes = await pool.query(
        `UPDATE parking_payments SET notes = 'Chapa webhook: completed' WHERE reference = $1 RETURNING session_id, amount`,
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

    return NextResponse.json({ received: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
