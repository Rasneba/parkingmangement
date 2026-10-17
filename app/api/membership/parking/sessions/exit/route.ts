import pool from "@/lib/db";
import { withAuth, ok, created, err, badRequest, conflict, forbidden, notFound } from "@/lib/api-utils";
import { requirePermission, can } from "@/lib/permissions";
import { nextNumber, dailyPeriodKey } from "@/lib/id-generator";
import { priceSession, validateDiscount } from "@/lib/pricing";
import { round2, toMinor, fromMinor } from "@/lib/money";
import { logParkingAudit } from "@/lib/audit";

const METHODS = ["cash", "telebirr", "cbebirr", "chapa", "addispay", "santimpay", "bank", "pos", "credit_card", "debit_card"];
const PLATE_RE = /^[A-Z0-9][A-Z0-9\s\-]{1,19}$/;

/**
 * GET /api/membership/parking/sessions/exit?q=<ticket|plate|session id>
 * Exit-station lookup: resolves the session and returns the authoritative,
 * server-computed fee breakdown before any money moves.
 */
export async function GET(req: Request) {
  return withAuth(req, async (user) => {
    const perm = await requirePermission(user, "view", "parking_sessions");
    if (!perm.allowed) return err("Permission denied", 403);

    const { searchParams } = new URL(req.url);
    const q = (searchParams.get("q") || "").trim();
    if (!q) return badRequest("Provide a ticket number, plate or session id");
    if (!user.company_id) return badRequest("Company required");

    let row;
    if (/^\d+$/.test(q)) {
      const res = await pool.query(
        `SELECT ps.*, pv.vehicle_type, pv.vehicle_model, pv.vehicle_color, pv.owner_name, pv.owner_phone,
                mm.full_name AS customer_name, s.slot_number, z.name AS zone_name, z.floor
         FROM parking_sessions ps
         LEFT JOIN parking_vehicles pv ON pv.id = ps.vehicle_id
         LEFT JOIN membership_members mm ON mm.id = pv.customer_id
         LEFT JOIN parking_slots s ON s.id = ps.slot_id
         LEFT JOIN parking_zones z ON z.id = s.zone_id
         WHERE ps.company_id = $1 AND ps.id = $2`,
        [user.company_id, Number(q)]
      );
      row = res.rows[0];
    }
    if (!row) {
      const res = await pool.query(
        `SELECT ps.*, pv.vehicle_type, pv.vehicle_model, pv.vehicle_color, pv.owner_name, pv.owner_phone,
                mm.full_name AS customer_name, s.slot_number, z.name AS zone_name, z.floor
         FROM parking_sessions ps
         LEFT JOIN parking_vehicles pv ON pv.id = ps.vehicle_id
         LEFT JOIN membership_members mm ON mm.id = pv.customer_id
         LEFT JOIN parking_slots s ON s.id = ps.slot_id
         LEFT JOIN parking_zones z ON z.id = s.zone_id
         WHERE ps.company_id = $1 AND (UPPER(ps.ticket_number) = $2 OR UPPER(ps.plate_number) = $2)
         ORDER BY (ps.status = 'active') DESC, ps.entry_time DESC
         LIMIT 5`,
        [user.company_id, q.toUpperCase()]
      );
      row = res.rows[0] || null;
      const candidates = res.rows;
      if (!row) return notFound("No parking session matches that ticket or plate");
      if (candidates.length > 1) {
        // Multiple matches (e.g. history for a plate): return the list for selection.
        return ok({ matches: candidates.map((c: any) => ({ id: c.id, ticket_number: c.ticket_number, plate_number: c.plate_number, entry_time: c.entry_time, status: c.status })) });
      }
    }

    if (row.status === "completed") {
      return conflict(`Session ${row.ticket_number} already exited at ${row.exit_time}`);
    }
    if (row.status === "cancelled") return conflict(`Session ${row.ticket_number} was cancelled`);

    const priced = await priceSession({
      companyId: user.company_id,
      entryTime: row.entry_time,
      exitTime: new Date(),
      vehicleType: row.vehicle_type || row.vehicle_type_snapshot,
      vehicleId: row.vehicle_id,
      plateNumber: row.plate_number,
      rateId: row.rate_id,
    });

    return ok({
      session: row,
      pricing: priced,
      permissions: {
        canDiscount: await can(user, "create", "parking_discounts"),
        canOverride: await can(user, "approve", "parking_payments"),
      },
    });
  });
}

/**
 * POST /api/membership/parking/sessions/exit
 * Transactional vehicle exit + settlement:
 *  - locks the session row (FOR UPDATE) — concurrent exits serialize safely
 *  - recomputes the fee server-side (never trusts client amounts)
 *  - applies permission-gated discounts / manual overrides (audited)
 *  - inserts the payment with an idempotency key (retries never double-charge)
 *  - closes the session, frees the space, returns printable receipt data
 */
export async function POST(req: Request) {
  return withAuth(req, async (user) => {
    const perm = await requirePermission(user, "edit", "parking_sessions");
    if (!perm.allowed) return err("Permission denied", 403);
    const payPerm = await requirePermission(user, "create", "parking_payments");
    if (!payPerm.allowed) return err("Payment permission required", 403);
    if (!user.company_id) return badRequest("Company required");

    const body = await req.json().catch(() => null);
    if (!body) return badRequest("Invalid JSON body");

    const sessionId = Number(body.session_id) || null;
    const ticketNumber = body.ticket_number ? String(body.ticket_number).trim().toUpperCase() : null;
    const plate = body.plate_number ? String(body.plate_number).trim().toUpperCase() : null;
    if (plate && !PLATE_RE.test(plate)) return badRequest("Invalid license plate format");
    if (!sessionId && !ticketNumber && !plate) return badRequest("session_id, ticket_number or plate_number is required");

    const method = METHODS.includes(body.payment_method) ? body.payment_method : "cash";
    const reference = body.reference ? String(body.reference).slice(0, 200) : null;
    const notes = body.notes ? String(body.notes).slice(0, 500) : null;
    const idempotencyKey = body.idempotency_key ? String(body.idempotency_key).slice(0, 80) : null;
    const lostTicket = !!body.lost_ticket;
    const discount = body.discount || null;
    const overrideAmount = body.override_amount != null && body.override_amount !== "" ? Number(body.override_amount) : null;
    const overrideReason = body.override_reason ? String(body.override_reason).slice(0, 300) : null;

    const discountErr = validateDiscount(discount);
    if (discountErr) return badRequest(discountErr);
    if (overrideAmount != null && (!isFinite(overrideAmount) || overrideAmount < 0)) return badRequest("Override amount must be a non-negative number");

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      // Idempotency: if this exact operation already completed, return the original result.
      if (idempotencyKey) {
        const existing = await client.query(
          `SELECT pp.*, ps.ticket_number, ps.plate_number FROM parking_payments pp
           JOIN parking_sessions ps ON ps.id = pp.session_id
           WHERE pp.company_id = $1 AND pp.idempotency_key = $2 LIMIT 1`,
          [user.company_id, idempotencyKey]
        );
        if (existing.rows[0]) {
          await client.query("COMMIT");
          const s = await client.query(`SELECT * FROM parking_sessions WHERE id = $1`, [existing.rows[0].session_id]);
          return ok({ payment: existing.rows[0], session: s.rows[0], idempotent: true });
        }
      }

      // Lock the session row.
      const lock = await client.query(
        `SELECT ps.*, pv.vehicle_type, pv.vehicle_model, pv.owner_name, s.id AS slot_id
         FROM parking_sessions ps
         LEFT JOIN parking_vehicles pv ON pv.id = ps.vehicle_id
         LEFT JOIN parking_slots s ON s.id = ps.slot_id
         WHERE ps.company_id = $1 AND ($2::int IS NULL OR ps.id = $2)
           AND ($3::text IS NULL OR UPPER(ps.ticket_number) = $3)
           AND ($4::text IS NULL OR UPPER(ps.plate_number) = $4)
         ORDER BY (ps.status = 'active') DESC, ps.entry_time DESC
         LIMIT 1 FOR UPDATE OF ps`,
        [user.company_id, sessionId, ticketNumber, plate]
      );
      const session = lock.rows[0];
      if (!session) {
        await client.query("ROLLBACK");
        return notFound("Parking session not found");
      }
      if (session.status === "completed") {
        await client.query("ROLLBACK");
        return conflict(`Session ${session.ticket_number} has already been closed`);
      }
      if (session.status === "cancelled") {
        await client.query("ROLLBACK");
        return conflict(`Session ${session.ticket_number} was cancelled and cannot be settled`);
      }

      // Authoritative pricing (server-side only).
      const priced = await priceSession({
        companyId: user.company_id,
        entryTime: session.entry_time,
        exitTime: new Date(),
        vehicleType: session.vehicle_type || session.vehicle_type_snapshot,
        vehicleId: session.vehicle_id,
        plateNumber: session.plate_number,
        rateId: session.rate_id,
        options: {
          lostTicket,
          discount,
          forceBase: overrideAmount != null ? overrideAmount : null,
        },
      });

      // Permission gates for money-affecting adjustments.
      if (discount && priced.discountAmount > 0) {
        const d = await can(user, "create", "parking_discounts");
        if (!d) {
          await client.query("ROLLBACK");
          return forbidden("You are not authorized to apply discounts");
        }
      }
      if (overrideAmount != null) {
        const o = await can(user, "approve", "parking_payments");
        if (!o) {
          await client.query("ROLLBACK");
          return forbidden("You are not authorized to override fees");
        }
      }

      const exitTime = new Date();
      const operatorShift = await client.query(
        `SELECT id FROM parking_shifts WHERE company_id = $1 AND operator_id = $2 AND status = 'open' ORDER BY id DESC LIMIT 1`,
        [user.company_id, user.id]
      );
      const receiptNumber = await nextNumber(user.company_id, "receipt", "RCP", { pad: 6 });

      // Insert payment (idempotent on (company_id, idempotency_key)).
      const payIns = await client.query(
        `INSERT INTO parking_payments
           (company_id, session_id, vehicle_id, amount, currency, payment_method, reference,
            receipt_number, paid_by, notes, idempotency_key, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
         ${idempotencyKey ? "ON CONFLICT (company_id, idempotency_key) WHERE idempotency_key IS NOT NULL DO NOTHING" : ""}
         RETURNING *`,
        [
          user.company_id, session.id, session.vehicle_id, priced.amountDue, priced.currency,
          method, reference, receiptNumber, session.owner_name || null, notes, idempotencyKey, user.id,
        ]
      );

      let payment = payIns.rows[0];
      if (!payment && idempotencyKey) {
        const again = await client.query(
          `SELECT * FROM parking_payments WHERE company_id = $1 AND idempotency_key = $2`,
          [user.company_id, idempotencyKey]
        );
        payment = again.rows[0];
        const s2 = await client.query(`SELECT status FROM parking_sessions WHERE id = $1`, [session.id]);
        if (s2.rows[0]?.status === "completed") {
          await client.query("COMMIT");
          return ok({ payment, session: (await client.query(`SELECT * FROM parking_sessions WHERE id = $1`, [session.id])).rows[0], idempotent: true });
        }
      }

      // Close the session with the frozen tariff snapshot.
      const upd = await client.query(
        `UPDATE parking_sessions SET
            exit_time = $2, exit_method = COALESCE(exit_method, $3), exit_operator_id = $4,
            duration_minutes = $5, status = 'completed',
            rate_id = $6, fee_breakdown = $7::jsonb,
            gross_amount = $8, discount_amount = $9, amount = $10, amount_paid = $10,
            paid = TRUE, payment_status = 'paid', shift_id = COALESCE(shift_id, $11),
            updated_at = CURRENT_TIMESTAMP
         WHERE id = $1 RETURNING *`,
        [
          session.id, exitTime, method === "cash" ? "manual" : "manual", user.id,
          priced.fee.durationMinutes, priced.tariffId, JSON.stringify({ ...priced.fee, gross: priced.grossAmount, discount: priced.discountAmount, due: priced.amountDue }),
          priced.grossAmount, priced.discountAmount, priced.amountDue,
          operatorShift.rows[0]?.id || null,
        ]
      );

      // Release the space.
      if (session.slot_id) {
        await client.query(
          `UPDATE parking_slots SET status = 'available', current_session_id = NULL, updated_at = CURRENT_TIMESTAMP
           WHERE id = $1 AND current_session_id = $2`,
          [session.slot_id, session.id]
        );
      }

      // Record discount trail.
      if (priced.discountAmount > 0 && discount) {
        await client.query(
          `INSERT INTO parking_discounts (company_id, session_id, code, discount_type, value, computed_amount, reason, applied_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [user.company_id, session.id, discount.code || null, discount.discount_type, discount.value, priced.discountAmount, discount.reason || null, user.id]
        );
      }

      await client.query("COMMIT");

      await logParkingAudit({
        user,
        action: "EXIT",
        entity: "parking_session",
        entity_id: session.id,
        description: `Vehicle ${session.plate_number} exited — ${priced.amountDue} ${priced.currency} collected via ${method}${overrideAmount != null ? " (manual override)" : ""}${lostTicket ? " (lost ticket)" : ""}`,
        old_values: { status: session.status, payment_status: session.payment_status },
        new_values: { status: "completed", amount: priced.amountDue, receipt: receiptNumber, override: overrideAmount, override_reason: overrideReason },
        req,
      });

      return created({
        payment: { ...payment, receipt_number: receiptNumber },
        session: upd.rows[0],
        pricing: priced,
        slot_released: !!session.slot_id,
        operator: { id: user.id, name: user.email },
      });
    } catch (e: any) {
      await client.query("ROLLBACK").catch(() => {});
      return err(e.message);
    } finally {
      client.release();
    }
  });
}
