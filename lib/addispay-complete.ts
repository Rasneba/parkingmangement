import pool from "@/lib/db";
import { checkStatus } from "@/lib/addispay";

export interface CompleteResult {
  status: string;
  completed: boolean;
  session_id: number | null;
  message: string;
}

/**
 * Verifies an AddisPay transaction and, when successful, atomically closes the
 * linked parking session and releases its space. Safe to call repeatedly
 * (idempotent): a session that is no longer active is left untouched.
 */
export async function completeAddisPayPayment(
  reference: string,
  companyId?: number | null
): Promise<CompleteResult> {
  const payRes = await pool.query(
    `SELECT id, session_id, amount, notes, company_id FROM parking_payments
     WHERE reference = $1 ${companyId ? "AND company_id = $2" : ""} LIMIT 1`,
    companyId ? [reference, companyId] : [reference]
  );
  const pay = payRes.rows[0];
  if (!pay) {
    return { status: "failed", completed: false, session_id: null, message: "Payment record not found" };
  }

  const uuid = String(pay.notes || "").replace(/^uuid:/, "").split(" ")[0] || reference;
  const result = await checkStatus(uuid);

  if (result.status !== "success") {
    return {
      status: result.status || "pending",
      completed: false,
      session_id: pay.session_id,
      message: result.message || "Payment not completed",
    };
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const sRes = await client.query(
      `SELECT id, status, slot_id FROM parking_sessions WHERE id = $1 FOR UPDATE`,
      [pay.session_id]
    );
    const session = sRes.rows[0];
    if (session && session.status === "active") {
      const exitTime = new Date();
      const durRes = await client.query(
        `SELECT GREATEST(0, FLOOR(EXTRACT(EPOCH FROM ($1::timestamptz - entry_time))/60))::int AS minutes
         FROM parking_sessions WHERE id = $2`,
        [exitTime.toISOString(), session.id]
      );
      await client.query(
        `UPDATE parking_sessions SET
            exit_time = $2, exit_method = 'qr', duration_minutes = $3,
            status = 'completed', gross_amount = $4, amount = $4, amount_paid = $4,
            paid = TRUE, payment_status = 'paid', updated_at = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [session.id, exitTime, durRes.rows[0]?.minutes ?? 0, pay.amount]
      );
      if (session.slot_id) {
        await client.query(
          `UPDATE parking_slots SET status = 'available', current_session_id = NULL, updated_at = CURRENT_TIMESTAMP
           WHERE id = $1 AND current_session_id = $2`,
          [session.slot_id, session.id]
        );
      }
    }
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    client.release();
  }

  return { status: "success", completed: true, session_id: pay.session_id, message: "Payment completed" };
}
