import pool from "@/lib/db";
import { withAuth, ok, err, notFound, forbidden, badRequest } from "@/lib/api-utils";
import { requirePermission } from "@/lib/permissions";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return withAuth(req, async (user) => {
    const perm = await requirePermission(user, "view", "parking_payments");
    if (!perm.allowed) return forbidden();
    const { id } = await params;
    try {
      const result = await pool.query(
        `SELECT pp.*,
          ps.ticket_number, ps.plate_number, ps.entry_time, ps.exit_time, ps.duration_minutes,
          pv.owner_name, pv.vehicle_type, pv.vehicle_model,
          eg.name as entry_gate_name, xg.name as exit_gate_name
         FROM parking_payments pp
         JOIN parking_sessions ps ON pp.session_id = ps.id
         LEFT JOIN parking_vehicles pv ON pp.vehicle_id = pv.id
         LEFT JOIN parking_gates eg ON ps.entry_gate_id = eg.id
         LEFT JOIN parking_gates xg ON ps.exit_gate_id = xg.id
         WHERE pp.id = $1 AND pp.company_id = $2`,
        [id, user.company_id]
      );
      if (result.rows.length === 0) return notFound("Payment");
      return ok(result.rows[0]);
    } catch (e: any) {
      return err(e.message);
    }
  });
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return withAuth(req, async (user) => {
    const perm = await requirePermission(user, "edit", "parking_payments");
    if (!perm.allowed) return forbidden();
    const { id } = await params;
    try {
      const body = await req.json();
      const allowed = ["amount","payment_method","reference","pos_terminal_id","receipt_number","paid_by","notes"];
      const sets: string[] = [];
      const vals: any[] = [];
      for (const key of allowed) {
        if (body[key] !== undefined) { sets.push(`${key} = $${vals.length + 1}`); vals.push(body[key]); }
      }
      if (sets.length === 0) return badRequest("No fields");
      vals.push(id);
      const idIdx = vals.length;
      vals.push(user.company_id);
      const compIdx = vals.length;
      const result = await pool.query(
        `UPDATE parking_payments SET ${sets.join(", ")}
         WHERE id = $${idIdx} AND company_id = $${compIdx} RETURNING *`,
        vals
      );
      if (result.rows.length === 0) return notFound("Payment");
      return ok(result.rows[0]);
    } catch (e: any) {
      return err(e.message);
    }
  });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return withAuth(req, async (user) => {
    const perm = await requirePermission(user, "delete", "parking_payments");
    if (!perm.allowed) return forbidden();
    const { id } = await params;
    try {
      const result = await pool.query(
        "DELETE FROM parking_payments WHERE id = $1 AND company_id = $2 RETURNING id",
        [id, user.company_id]
      );
      if (result.rows.length === 0) return notFound("Payment");
      return ok({ message: "Deleted" });
    } catch (e: any) {
      return err(e.message);
    }
  });
}
