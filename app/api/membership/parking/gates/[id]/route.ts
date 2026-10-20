import pool from "@/lib/db";
import { withAuth, ok, err, notFound, forbidden, badRequest } from "@/lib/api-utils";
import { requirePermission } from "@/lib/permissions";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return withAuth(req, async (user) => {
    const perm = await requirePermission(user, "view", "parking_gates");
    if (!perm.allowed) return forbidden();
    const { id } = await params;
    try {
      const result = await pool.query(
        `SELECT pg.*,
          (SELECT COUNT(*) FROM parking_cameras WHERE gate_id = pg.id) as camera_count
         FROM parking_gates pg
         WHERE pg.id = $1 AND pg.company_id = $2`,
        [id, user.company_id]
      );
      if (result.rows.length === 0) return notFound("Gate");
      return ok(result.rows[0]);
    } catch (e: any) {
      return err(e.message);
    }
  });
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return withAuth(req, async (user) => {
    const perm = await requirePermission(user, "edit", "parking_gates");
    if (!perm.allowed) return forbidden();
    const { id } = await params;
    try {
      const body = await req.json();
      const allowed = ["name","code","type","direction","status","ip_address","port","serial_port","barrier_open_delay","is_anpr_enabled","is_qr_enabled","is_nfc_enabled","is_rfid_enabled","notes"];
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
        `UPDATE parking_gates SET ${sets.join(", ")}
         WHERE id = $${idIdx} AND company_id = $${compIdx} RETURNING *`,
        vals
      );
      if (result.rows.length === 0) return notFound("Gate");
      return ok(result.rows[0]);
    } catch (e: any) {
      return err(e.message);
    }
  });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return withAuth(req, async (user) => {
    const perm = await requirePermission(user, "delete", "parking_gates");
    if (!perm.allowed) return forbidden();
    const { id } = await params;
    try {
      const result = await pool.query(
        "DELETE FROM parking_gates WHERE id = $1 AND company_id = $2 RETURNING id",
        [id, user.company_id]
      );
      if (result.rows.length === 0) return notFound("Gate");
      return ok({ message: "Deleted" });
    } catch (e: any) {
      return err(e.message);
    }
  });
}
