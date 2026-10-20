import pool from "@/lib/db";
import { withAuth, ok, err, isSuperAdmin } from "@/lib/api-utils";
import { requirePermission } from "@/lib/permissions";

/**
 * GET /api/membership/parking/floor-map?site_id=N
 * Live facility map: zones with their individual spaces and, for occupied
 * spaces, the active session's plate/entry (visible to authorized roles).
 */
export async function GET(req: Request) {
  return withAuth(req, async (user) => {
    const perm = await requirePermission(user, "view", "parking_slots");
    if (!perm.allowed) return err("Permission denied", 403);

    const { searchParams } = new URL(req.url);
    const siteId = Number(searchParams.get("site_id")) || null;

    const cp = "(company_id = $1 OR $1::int IS NULL)";
    const qp = [isSuperAdmin(user) ? null : user.company_id];

    try {
      const zonesRes = await pool.query(
        `SELECT z.id, z.name, z.code, z.floor, z.type, z.site_id, z.slot_count,
                s.name AS site_name,
                COUNT(sl.id)::int AS capacity,
                COUNT(sl.id) FILTER (WHERE sl.status = 'occupied')::int AS occupied,
                COUNT(sl.id) FILTER (WHERE sl.status = 'reserved')::int AS reserved,
                COUNT(sl.id) FILTER (WHERE sl.status = 'maintenance')::int AS maintenance
         FROM parking_zones z
         LEFT JOIN parking_sites s ON s.id = z.site_id
         LEFT JOIN parking_slots sl ON sl.zone_id = z.id
         WHERE ${cp.replace("company_id", "z.company_id")} AND z.is_active = true ${siteId ? `AND z.site_id = ${siteId}` : ""}
         GROUP BY z.id, s.name ORDER BY z.floor NULLS LAST, z.code`,
        qp
      );

      const slotsRes = await pool.query(
        `SELECT sl.id, sl.zone_id, sl.slot_number, sl.floor, sl.status, sl.type,
                ps.id AS session_id, ps.ticket_number, ps.plate_number, ps.entry_time,
                pv.vehicle_type, pv.owner_name,
                DATE_PART('minute', NOW() - ps.entry_time)::int AS minutes_parked
         FROM parking_slots sl
         LEFT JOIN parking_sessions ps ON ps.id = sl.current_session_id AND ps.status = 'active'
         LEFT JOIN parking_vehicles pv ON pv.id = ps.vehicle_id
         WHERE ${cp.replace("company_id", "sl.company_id")}
         ORDER BY sl.zone_id, sl.slot_number`,
        qp
      );

      const zones = zonesRes.rows.map((z: any) => ({
        ...z,
        available: Math.max(0, Number(z.capacity) - Number(z.occupied)),
        occupancyPct: Number(z.capacity) > 0 ? Math.round((Number(z.occupied) / Number(z.capacity)) * 100) : 0,
        slots: slotsRes.rows.filter((s: any) => s.zone_id === z.id),
      }));

      return ok({
        zones,
        totals: {
          capacity: zones.reduce((a: number, z: any) => a + Number(z.capacity), 0),
          occupied: zones.reduce((a: number, z: any) => a + Number(z.occupied), 0),
          reserved: zones.reduce((a: number, z: any) => a + Number(z.reserved), 0),
          maintenance: zones.reduce((a: number, z: any) => a + Number(z.maintenance), 0),
        },
        generatedAt: new Date().toISOString(),
      });
    } catch (e: any) {
      return err(e.message);
    }
  });
}
