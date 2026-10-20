import pool from "@/lib/db";
import { withAuth, created, err, badRequest, conflict } from "@/lib/api-utils";
import { requirePermission } from "@/lib/permissions";
import { logParkingAudit } from "@/lib/audit";

/**
 * POST /api/membership/parking/slots/bulk
 * Body: { zone_id, prefix, count, floor?, type?, start_number? }
 * Generates numbered spaces (e.g. A-001…A-040) in a single transaction.
 * Existing numbers are skipped (unique per company + slot_number).
 */
export async function POST(req: Request) {
  return withAuth(req, async (user) => {
    const perm = await requirePermission(user, "create", "parking_slots");
    if (!perm.allowed) return err("Permission denied", 403);
    if (!user.company_id) return badRequest("Company required");

    const body = await req.json().catch(() => null);
    if (!body) return badRequest("Invalid JSON body");
    const zoneId = Number(body.zone_id);
    const prefix = String(body.prefix || "").trim().toUpperCase();
    const count = Number(body.count);
    const floor = body.floor != null && body.floor !== "" ? Number(body.floor) : null;
    const type = ["standard", "vip", "disabled", "reserved", "electric", "staff"].includes(body.type) ? body.type : "standard";
    const start = Math.max(1, Number(body.start_number) || 1);
    const padLen = Math.max(2, String(start + count - 1).length);

    if (!zoneId || !prefix || !Number.isFinite(count) || count < 1 || count > 500) {
      return badRequest("zone_id, prefix and count (1–500) are required");
    }

    const zone = await pool.query(
      `SELECT id, company_id FROM parking_zones WHERE id = $1`,
      [zoneId]
    );
    if (!zone.rows[0]) return badRequest("Zone not found");
    const ownsZone = user.role === "super_admin" || zone.rows[0].company_id === user.company_id;
    if (!ownsZone) return conflict("Zone belongs to a different company");

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const createdRows: any[] = [];
      for (let i = 0; i < count; i++) {
        const number = `${prefix}-${String(start + i).padStart(padLen, "0")}`;
        const res = await client.query(
          `INSERT INTO parking_slots (company_id, zone_id, slot_number, floor, status, type)
           VALUES ($1, $2, $3, $4, 'available', $5)
           ON CONFLICT (company_id, slot_number) DO NOTHING
           RETURNING id, slot_number`,
          [zone.rows[0].company_id, zoneId, number, floor, type]
        );
        if (res.rows[0]) createdRows.push(res.rows[0]);
      }
      await client.query(
        `UPDATE parking_zones SET slot_count = (SELECT COUNT(*) FROM parking_slots WHERE zone_id = $1), updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
        [zoneId]
      );
      await client.query("COMMIT");

      await logParkingAudit({
        user,
        action: "CREATE",
        entity: "parking_slot_batch",
        entity_id: zoneId,
        description: `Generated ${createdRows.length} space(s) ${prefix}-${String(start).padStart(padLen, "0")}… in zone #${zoneId}`,
        new_values: { count: createdRows.length, prefix, type },
        req,
      });

      return created({ created: createdRows.length, skipped: count - createdRows.length, slots: createdRows });
    } catch (e: any) {
      await client.query("ROLLBACK").catch(() => {});
      return err(e.message);
    } finally {
      client.release();
    }
  });
}
