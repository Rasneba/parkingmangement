import pool from "@/lib/db";
import { withAuth, ok, err, notFound, forbidden, badRequest } from "@/lib/api-utils";
import { requirePermission } from "@/lib/permissions";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return withAuth(req, async (user) => {
    const perm = await requirePermission(user, "view", "parking_qr_tickets");
    if (!perm.allowed) return forbidden();
    const { id } = await params;
    try {
      const result = await pool.query(
        `SELECT pqt.*, u.name as created_by_name
         FROM parking_qr_tickets pqt
         LEFT JOIN users u ON pqt.created_by = u.id
         WHERE pqt.id = $1 AND pqt.company_id = $2`,
        [id, user.company_id]
      );
      if (result.rows.length === 0) return notFound("Ticket");
      return ok(result.rows[0]);
    } catch (e: any) {
      return err(e.message);
    }
  });
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return withAuth(req, async (user) => {
    const perm = await requirePermission(user, "edit", "parking_qr_tickets");
    if (!perm.allowed) return forbidden();
    const { id } = await params;
    try {
      const body = await req.json();
      const allowed = ["visitor_name","visitor_phone","visitor_plate","purpose","host_name","host_phone","valid_until","status","is_used"];
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
        `UPDATE parking_qr_tickets SET ${sets.join(", ")}
         WHERE id = $${idIdx} AND company_id = $${compIdx} RETURNING *`,
        vals
      );
      if (result.rows.length === 0) return notFound("Ticket");
      return ok(result.rows[0]);
    } catch (e: any) {
      return err(e.message);
    }
  });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return withAuth(req, async (user) => {
    const perm = await requirePermission(user, "delete", "parking_qr_tickets");
    if (!perm.allowed) return forbidden();
    const { id } = await params;
    try {
      const result = await pool.query(
        "DELETE FROM parking_qr_tickets WHERE id = $1 AND company_id = $2 RETURNING id",
        [id, user.company_id]
      );
      if (result.rows.length === 0) return notFound("Ticket");
      return ok({ message: "Deleted" });
    } catch (e: any) {
      return err(e.message);
    }
  });
}
