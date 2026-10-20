import pool from "@/lib/db";
import { withAuth, ok, err, notFound, forbidden, badRequest } from "@/lib/api-utils";
import { requirePermission } from "@/lib/permissions";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return withAuth(req, async (user) => {
    const perm = await requirePermission(user, "view", "parking_customers");
    if (!perm.allowed) return forbidden();
    const { id } = await params;
    try {
      const result = await pool.query(
        `SELECT mm.*,
          (SELECT json_agg(json_build_object('id', pv.id, 'plate_number', pv.plate_number, 'vehicle_type', pv.vehicle_type, 'vehicle_model', pv.vehicle_model, 'vehicle_color', pv.vehicle_color))
           FROM parking_vehicles pv WHERE pv.customer_id = mm.id) as vehicles,
          (SELECT json_agg(json_build_object('id', ps.id, 'plan_type', ps.plan_type, 'start_date', ps.start_date, 'end_date', ps.end_date, 'amount', ps.amount, 'status', ps.status))
           FROM parking_subscriptions ps WHERE ps.customer_id = mm.id) as subscriptions
         FROM membership_members mm
         WHERE mm.id = $1 AND mm.company_id = $2`,
        [id, user.company_id]
      );
      if (result.rows.length === 0) return notFound("Customer");
      return ok(result.rows[0]);
    } catch (e: any) {
      return err(e.message);
    }
  });
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return withAuth(req, async (user) => {
    const perm = await requirePermission(user, "edit", "parking_customers");
    if (!perm.allowed) return forbidden();
    const { id } = await params;
    try {
      const body = await req.json();
      const allowed = ["customer_id","full_name","phone","email","address","photo_url","notes"];
      const sets: string[] = [];
      const vals: any[] = [];
      for (const key of allowed) {
        if (body[key] !== undefined) { sets.push(`${key} = $${vals.length + 1}`); vals.push(body[key]); }
      }
      if (sets.length === 0) return badRequest("No fields");
      sets.push("updated_at = CURRENT_TIMESTAMP");
      vals.push(id);
      const idIdx = vals.length;
      vals.push(user.company_id);
      const compIdx = vals.length;
      const result = await pool.query(
        `UPDATE membership_members SET ${sets.join(", ")}
         WHERE id = $${idIdx} AND company_id = $${compIdx} RETURNING *`,
        vals
      );
      if (result.rows.length === 0) return notFound("Customer");
      return ok(result.rows[0]);
    } catch (e: any) {
      return err(e.message);
    }
  });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return withAuth(req, async (user) => {
    const perm = await requirePermission(user, "delete", "parking_customers");
    if (!perm.allowed) return forbidden();
    const { id } = await params;
    try {
      const result = await pool.query(
        "DELETE FROM membership_members WHERE id = $1 AND company_id = $2 RETURNING id",
        [id, user.company_id]
      );
      if (result.rows.length === 0) return notFound("Customer");
      return ok({ message: "Deleted" });
    } catch (e: any) {
      return err(e.message);
    }
  });
}
