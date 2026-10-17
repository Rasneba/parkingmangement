import pool from "@/lib/db";
import { withAuth, ok, created, err, badRequest, notFound, conflict, forbidden } from "@/lib/api-utils";
import { requirePermission, can } from "@/lib/permissions";
import { round2 } from "@/lib/money";
import { logParkingAudit } from "@/lib/audit";

/**
 * GET  /api/membership/parking/refunds?status=pending&limit=
 * POST /api/membership/parking/refunds          — request a refund (audit-logged)
 * PUT  via /refunds/:id handled below            — approve/reject/process (authorized)
 */

export async function GET(req: Request) {
  return withAuth(req, async (user) => {
    const perm = await requirePermission(user, "view", "parking_refunds");
    if (!perm.allowed) return err("Permission denied", 403);

    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status");
    const limit = Math.min(parseInt(searchParams.get("limit") || "100", 10) || 100, 500);
    const params: unknown[] = [user.company_id];
    let where = `r.company_id = $1`;
    if (status) {
      params.push(status);
      where += ` AND r.status = $${params.length}`;
    }
    try {
      const res = await pool.query(
        `SELECT r.*, pp.amount AS payment_amount, pp.payment_method, pp.receipt_number,
                ps.ticket_number, ps.plate_number,
                u1.name AS requested_by_name, u2.name AS authorized_by_name
         FROM parking_refunds r
         LEFT JOIN parking_payments pp ON pp.id = r.payment_id
         LEFT JOIN parking_sessions ps ON ps.id = r.session_id
         LEFT JOIN users u1 ON u1.id = r.requested_by
         LEFT JOIN users u2 ON u2.id = r.authorized_by
         WHERE ${where} ORDER BY r.created_at DESC LIMIT ${limit}`,
        params
      );
      return ok(res.rows);
    } catch (e: any) {
      return err(e.message);
    }
  });
}

export async function POST(req: Request) {
  return withAuth(req, async (user) => {
    const perm = await requirePermission(user, "create", "parking_refunds");
    if (!perm.allowed) return err("Permission denied", 403);
    if (!user.company_id) return badRequest("Company required");

    try {
      const body = await req.json();
      const paymentId = Number(body.payment_id);
      const amount = round2(Number(body.amount));
      const reason = body.reason ? String(body.reason).slice(0, 500) : null;
      if (!paymentId) return badRequest("payment_id is required");
      if (!isFinite(amount) || amount <= 0) return badRequest("Refund amount must be a positive number");
      if (!reason) return badRequest("A reason is required for every refund");

      const pay = await pool.query(
        `SELECT pp.*, ps.id AS session_id FROM parking_payments pp
         LEFT JOIN parking_sessions ps ON ps.id = pp.session_id
         WHERE pp.id = $1 AND pp.company_id = $2`,
        [paymentId, user.company_id]
      );
      const payment = pay.rows[0];
      if (!payment) return notFound("Payment");
      if (amount > Number(payment.amount)) return badRequest("Refund cannot exceed the original payment");

      const already = await pool.query(
        `SELECT COALESCE(SUM(amount),0)::float AS refunded FROM parking_refunds
         WHERE payment_id = $1 AND status IN ('pending','approved','processed')`,
        [paymentId]
      );
      if (Number(already.rows[0].refunded) + amount > Number(payment.amount) + 0.005) {
        return conflict(`Refunds would exceed the payment total (already refunded ${already.rows[0].refunded})`);
      }

      // Self-authorization guard: the requester cannot approve their own refund.
      const res = await pool.query(
        `INSERT INTO parking_refunds (company_id, payment_id, session_id, amount, reason, requested_by, status)
         VALUES ($1,$2,$3,$4,$5,$6,'pending') RETURNING *`,
        [user.company_id, paymentId, payment.session_id || null, amount, reason, user.id]
      );

      await logParkingAudit({
        user, action: "REFUND", entity: "parking_refund", entity_id: res.rows[0].id,
        description: `Refund of ${amount} requested on payment #${paymentId} — ${reason}`,
        new_values: res.rows[0], req,
      });

      return created(res.rows[0]);
    } catch (e: any) {
      return err(e.message);
    }
  });
}

/** PUT /api/membership/parking/refunds — { id, action: 'approve'|'reject'|'process' } */
export async function PUT(req: Request) {
  return withAuth(req, async (user) => {
    const approve = await can(user, "approve", "parking_refunds");
    if (!approve) return forbidden("Only authorized roles can resolve refunds");
    if (!user.company_id) return badRequest("Company required");

    try {
      const body = await req.json();
      const id = Number(body.id);
      const action = body.action;
      if (!id || !["approve", "reject", "process"].includes(action)) {
        return badRequest("id and action (approve|reject|process) are required");
      }

      const cur = await pool.query(
        `SELECT * FROM parking_refunds WHERE id = $1 AND company_id = $2`,
        [id, user.company_id]
      );
      const refund = cur.rows[0];
      if (!refund) return notFound("Refund");
      if (refund.requested_by === user.id && action !== "process") {
        return forbidden("You cannot authorize your own refund request");
      }

      const statusMap: Record<string, string> = { approve: "approved", reject: "rejected", process: "processed" };
      const nextStatus = statusMap[action];
      if (nextStatus === "processed" && refund.status !== "approved") {
        return conflict("Only approved refunds can be marked as processed");
      }

      const res = await pool.query(
        `UPDATE parking_refunds SET status = $2, authorized_by = $3, resolved_at = CASE WHEN $4 THEN NOW() ELSE resolved_at END,
          updated_at = CURRENT_TIMESTAMP WHERE id = $1 RETURNING *`,
        [id, nextStatus, user.id, nextStatus !== "approved"]
      );

      await logParkingAudit({
        user, action: nextStatus === "rejected" ? "REJECT" : "APPROVE",
        entity: "parking_refund", entity_id: id,
        description: `Refund ${id} ${nextStatus} by ${user.email}`,
        old_values: { status: refund.status },
        new_values: { status: nextStatus },
        req,
      });

      return ok(res.rows[0]);
    } catch (e: any) {
      return err(e.message);
    }
  });
}
