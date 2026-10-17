import pool from "@/lib/db";
import { withAuth, ok, err, isSuperAdmin } from "@/lib/api-utils";

/**
 * GET /api/membership/parking/search?q=...
 * Global search for the header command palette: active sessions by plate or
 * ticket, registered vehicles and customers. Small, fast, company-scoped.
 */
export async function GET(req: Request) {
  return withAuth(req, async (user) => {
    const { searchParams } = new URL(req.url);
    const q = (searchParams.get("q") || "").trim();
    if (q.length < 2) return ok({ sessions: [], vehicles: [], customers: [] });

    const like = `%${q}%`;
    const upper = `%${q.toUpperCase()}%`;
    const params: unknown[] = [];
    let cp = "TRUE";
    let cpv = "TRUE";
    if (!isSuperAdmin(user)) {
      params.push(user.company_id);
      cp = `company_id = $1`;
      cpv = `pv.company_id = $1`;
    }

    try {
      const [sessions, vehicles, customers] = await Promise.all([
        pool.query(
          `SELECT ps.id, ps.ticket_number, ps.plate_number, ps.status, ps.payment_status, ps.entry_time
           FROM parking_sessions ps
           WHERE ps.${cp} AND (ps.plate_number ILIKE $2 OR UPPER(ps.ticket_number) LIKE $3)
           ORDER BY (ps.status = 'active') DESC, ps.entry_time DESC LIMIT 5`,
          [...params, like, upper]
        ),
        pool.query(
          `SELECT pv.id, pv.plate_number, pv.vehicle_type, pv.owner_name, pv.is_blacklisted
           FROM parking_vehicles pv
           WHERE ${cpv} AND (pv.plate_number ILIKE $2 OR pv.owner_name ILIKE $2)
           ORDER BY pv.plate_number LIMIT 5`,
          [...params, like]
        ),
        pool.query(
          `SELECT mm.id, mm.full_name, mm.customer_id, mm.phone, mm.status
           FROM membership_members mm
           WHERE ${!isSuperAdmin(user) ? "mm.company_id = $1" : "TRUE"} AND (mm.full_name ILIKE $2 OR mm.phone ILIKE $2 OR mm.customer_id ILIKE $2)
           ORDER BY mm.full_name LIMIT 5`,
          [...params, like]
        ),
      ]);
      return ok({ sessions: sessions.rows, vehicles: vehicles.rows, customers: customers.rows });
    } catch (e: any) {
      return err(e.message);
    }
  });
}
