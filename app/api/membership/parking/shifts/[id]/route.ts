import pool from "@/lib/db";
import { withAuth, ok, err, badRequest, notFound, conflict, forbidden } from "@/lib/api-utils";
import { requirePermission, can } from "@/lib/permissions";
import { round2 } from "@/lib/money";
import { logParkingAudit } from "@/lib/audit";

const MOVEMENTS = ["cash_in", "cash_out", "float", "pickup", "drop"];

/** GET /api/membership/parking/shifts/:id — shift detail + movements + payment summary. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return withAuth(req, async (user) => {
    const perm = await requirePermission(user, "view", "parking_shifts");
    if (!perm.allowed) return err("Permission denied", 403);
    const { id } = await params;

    try {
      const sh = await pool.query(
        `SELECT sh.*, u.name AS operator_name FROM parking_shifts sh
         LEFT JOIN users u ON u.id = sh.operator_id
         WHERE sh.id = $1 AND sh.company_id = $2`,
        [Number(id), user.company_id]
      );
      if (!sh.rows[0]) return notFound("Shift");

      const [movements, payments] = await Promise.all([
        pool.query(
          `SELECT m.*, u.name AS performed_by_name FROM parking_shift_movements m
           LEFT JOIN users u ON u.id = m.performed_by
           WHERE m.shift_id = $1 ORDER BY m.created_at DESC`,
          [Number(id)]
        ),
        pool.query(
          `SELECT pp.payment_method, COUNT(*)::int AS tx, COALESCE(SUM(pp.amount),0)::float AS total
           FROM parking_payments pp
           WHERE pp.company_id = $1 AND pp.payment_date BETWEEN
                 (SELECT opened_at FROM parking_shifts WHERE id = $2)
                 AND COALESCE((SELECT closed_at FROM parking_shifts WHERE id = $2), NOW())
           GROUP BY 1 ORDER BY 2 DESC`,
          [user.company_id, Number(id)]
        ),
      ]);

      return ok({ shift: sh.rows[0], movements: movements.rows, paymentSummary: payments.rows });
    } catch (e: any) {
      return err(e.message);
    }
  });
}

/**
 * PUT /api/membership/parking/shifts/:id
 * Body: { action: "movement", movement_type, amount, reason }
 *     | { action: "close", closing_cash, notes? }
 * Closing computes expected = opening + cash payments + cash_in − cash_out
 * and the counted difference; reconciliation is audit-logged.
 */
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return withAuth(req, async (user) => {
    const perm = await requirePermission(user, "edit", "parking_shifts");
    if (!perm.allowed) return err("Permission denied", 403);
    const { id } = await params;
    const shiftId = Number(id);

    try {
      const body = await req.json();
      const sh = await pool.query(
        `SELECT * FROM parking_shifts WHERE id = $1 AND company_id = $2`,
        [shiftId, user.company_id]
      );
      const shift = sh.rows[0];
      if (!shift) return notFound("Shift");

      if (body.action === "movement") {
        if (shift.status !== "open") return conflict("Shift is closed — movements are only allowed on open shifts");
        if (!MOVEMENTS.includes(body.movement_type)) return badRequest("Invalid movement type");
        const amount = round2(Number(body.amount));
        if (!isFinite(amount) || amount <= 0) return badRequest("Movement amount must be a positive number");
        const res = await pool.query(
          `INSERT INTO parking_shift_movements (company_id, shift_id, movement_type, amount, reason, performed_by)
           VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
          [user.company_id, shiftId, body.movement_type, amount, body.reason ? String(body.reason).slice(0, 255) : null, user.id]
        );
        await logParkingAudit({
          user, action: "UPDATE", entity: "parking_shift_movement", entity_id: res.rows[0].id,
          description: `${body.movement_type} of ${amount} on shift ${shift.shift_code}`,
          new_values: res.rows[0], req,
        });
        return ok(res.rows[0]);
      }

      if (body.action === "close") {
        if (shift.status !== "open") return conflict("Shift is already closed");
        const isOwner = shift.operator_id === user.id;
        const supervisor = await can(user, "approve", "parking_shifts");
        if (!isOwner && !supervisor) return forbidden("Only the shift operator or a supervisor can close this shift");

        const closingCash = round2(Number(body.closing_cash ?? 0));
        if (!isFinite(closingCash) || closingCash < 0) return badRequest("Closing cash must be a non-negative number");

        const totals = await pool.query(
          `SELECT
             COALESCE(SUM(pp.amount) FILTER (WHERE pp.payment_method = 'cash'),0)::float AS cash_total,
             COUNT(*)::int AS tx,
             COALESCE(SUM(pp.amount),0)::float AS all_total
           FROM parking_payments pp
           WHERE pp.company_id = $1 AND pp.payment_date BETWEEN $2 AND NOW()`,
          [user.company_id, shift.opened_at]
        );
        const movements = await pool.query(
          `SELECT COALESCE(SUM(amount) FILTER (WHERE movement_type IN ('cash_in','float')),0)::float AS cash_in,
                  COALESCE(SUM(amount) FILTER (WHERE movement_type IN ('cash_out','pickup','drop')),0)::float AS cash_out
           FROM parking_shift_movements WHERE shift_id = $1`,
          [shiftId]
        );
        const cashTotal = Number(totals.rows[0].cash_total) || 0;
        const cashIn = Number(movements.rows[0].cash_in) || 0;
        const cashOut = Number(movements.rows[0].cash_out) || 0;
        const expected = round2(Number(shift.opening_cash) + cashTotal + cashIn - cashOut);
        const difference = round2(closingCash - expected);

        const upd = await pool.query(
          `UPDATE parking_shifts SET
             closed_at = NOW(), closing_cash = $2, expected_cash = $3, cash_difference = $4,
             total_transactions = $5, total_collected = $6, status = $7,
             notes = COALESCE($8, notes), updated_at = CURRENT_TIMESTAMP
           WHERE id = $1 RETURNING *`,
          [
            shiftId, closingCash, expected, difference,
            Number(totals.rows[0].tx) || 0, Number(totals.rows[0].all_total) || 0,
            Math.abs(difference) < 0.005 ? "reconciled" : "closed",
            body.notes ? String(body.notes).slice(0, 500) : null,
          ]
        );

        await logParkingAudit({
          user, action: "SHIFT_CLOSE", entity: "parking_shift", entity_id: shiftId,
          description: `Shift ${shift.shift_code} closed — expected ${expected}, counted ${closingCash}, difference ${difference}`,
          old_values: { status: "open" },
          new_values: { closing_cash: closingCash, expected_cash: expected, cash_difference: difference },
          req,
        });

        return ok(upd.rows[0]);
      }

      return badRequest("action must be 'movement' or 'close'");
    } catch (e: any) {
      return err(e.message);
    }
  });
}
