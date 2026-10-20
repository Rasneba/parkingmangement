import pool from "@/lib/db";
import { withAuth, ok, err, notFound } from "@/lib/api-utils";
import { requirePermission } from "@/lib/permissions";
import { logParkingAudit } from "@/lib/audit";

const COLUMNS = ["name", "description", "price", "currency", "duration_days", "max_members", "is_active"];

/**
 * PUT  /api/membership/parking/plans/:id — update a parking plan
 * DELETE /api/membership/parking/plans/:id — deactivate a parking plan (soft, preserves history)
 * Scoped to membership_plans.type='parking' and the caller's company so ERP membership
 * plans and other tenants are untouched.
 */
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return withAuth(req, async (user) => {
    const perm = await requirePermission(user, "edit", "parking_subscriptions");
    if (!perm.allowed) return err("Permission denied", 403);
    const { id } = await params;
    const pid = Number(id);
    if (!pid) return err("Invalid id", 400);

    try {
      const body = await req.json();
      const vals: unknown[] = [];
      const sets: string[] = [];
      for (const col of COLUMNS) {
        if (col in body) {
          vals.push(col === "price" || col === "duration_days" || col === "max_members" ? (body[col] === null ? null : Number(body[col])) : body[col]);
          sets.push(`${col} = $${vals.length}`);
        }
      }
      if (!sets.length) return err("No valid fields to update", 400);

      const cur = await pool.query(
        `SELECT * FROM membership_plans
         WHERE id = $1 AND type = 'parking' AND company_id = $2`,
        [pid, user.company_id]
      );
      if (!cur.rows[0]) return notFound("Plan");
      const before = cur.rows[0];

      vals.push(pid);
      const idIdx = vals.length;
      vals.push(user.company_id);
      const compIdx = vals.length;
      const res = await pool.query(
        `UPDATE membership_plans SET ${sets.join(", ")}, updated_at = CURRENT_TIMESTAMP
         WHERE id = $${idIdx} AND type = 'parking' AND company_id = $${compIdx} RETURNING *`,
        vals
      );

      await logParkingAudit({
        user, action: "UPDATE", entity: "membership_plan", entity_id: pid,
        description: `Parking plan "${before.name}" updated`,
        old_values: { name: before.name, price: before.price, is_active: before.is_active },
        new_values: res.rows[0], req,
      });
      return ok(res.rows[0]);
    } catch (e: any) {
      return err(e.message);
    }
  });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return withAuth(req, async (user) => {
    const perm = await requirePermission(user, "delete", "parking_subscriptions");
    if (!perm.allowed) return err("Permission denied", 403);
    const { id } = await params;
    const pid = Number(id);
    if (!pid) return err("Invalid id", 400);

    try {
      // Soft delete: keep plan history for existing subscriptions.
      const res = await pool.query(
        `UPDATE membership_plans SET is_active = false, updated_at = CURRENT_TIMESTAMP
         WHERE id = $1 AND type = 'parking' AND company_id = $2 RETURNING *`,
        [pid, user.company_id]
      );
      if (!res.rows[0]) return notFound("Plan");

      await logParkingAudit({
        user, action: "DELETE", entity: "membership_plan", entity_id: pid,
        description: `Parking plan "${res.rows[0].name}" deactivated`,
        old_values: res.rows[0], req,
      });
      return ok({ deactivated: true, id: pid });
    } catch (e: any) {
      return err(e.message);
    }
  });
}
