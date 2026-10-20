import pool from "@/lib/db";
import { withAuth, created, err, badRequest, conflict, forbidden } from "@/lib/api-utils";
import { requirePermission } from "@/lib/permissions";
import { nextNumber, dailyPeriodKey } from "@/lib/id-generator";
import { qrDataUrl, buildTicketPayload } from "@/lib/qr";
import { logParkingAudit } from "@/lib/audit";
import { isKiosk } from "@/lib/public-kiosk";
import { rateLimit, requestIp } from "@/lib/rate-limit";

const PLATE_RE = /^[A-Z0-9][A-Z0-9\s\-]{1,19}$/;

/**
 * POST /api/membership/parking/sessions/entry
 * Transactional vehicle check-in:
 *  - normalizes + validates the plate
 *  - rejects blacklisted vehicles and duplicate active sessions (409)
 *  - allocates a free space atomically (FOR UPDATE SKIP LOCKED) so two
 *    concurrent check-ins can never receive the same space
 *  - generates the ticket number from the atomic counter and a QR ticket image
 */
export async function POST(req: Request) {
  return withAuth(req, async (user) => {
    const kiosk = isKiosk(user);
    if (kiosk && !rateLimit(`kiosk-entry:${requestIp(req)}`, 60, 60_000)) {
      return err("Too many check-ins from this network. Please try again shortly.", 429);
    }
    if (!kiosk) {
      const perm = await requirePermission(user, "create", "parking_sessions");
      if (!perm.allowed) return err("Permission denied", 403);
    }
    if (!user.company_id) return badRequest("Company required");

    const body = await req.json().catch(() => null);
    if (!body) return badRequest("Invalid JSON body");

    const plate = String(body.plate_number || "").trim().toUpperCase();
    const vehicleType = body.vehicle_type ? String(body.vehicle_type) : null;
    const customerId = !kiosk && body.customer_id ? Number(body.customer_id) : null;
    const zoneId = body.zone_id ? Number(body.zone_id) : null;
    const slotId = body.slot_id ? Number(body.slot_id) : null;
    const entryGateId = body.entry_gate_id ? Number(body.entry_gate_id) : null;
    if (customerId !== null && !Number.isFinite(customerId)) return badRequest("Invalid customer");
    if (zoneId !== null && !Number.isFinite(zoneId)) return badRequest("Invalid zone");
    if (slotId !== null && !Number.isFinite(slotId)) return badRequest("Invalid space");
    if (entryGateId !== null && !Number.isFinite(entryGateId)) return badRequest("Invalid gate");
    const entryMethod = ["manual", "anpr", "qr", "rfid", "nfc"].includes(body.entry_method) ? body.entry_method : "manual";
    const entrySource = kiosk
      ? "kiosk"
      : ["web", "kiosk", "bridge", "mobile", "api"].includes(body.entry_source)
        ? body.entry_source
        : "web";
    const notes = body.notes ? String(body.notes).slice(0, 500) : null;

    if (kiosk && !plate) return badRequest("License plate is required");
    if (!plate && !body.vehicle_id) return badRequest("License plate is required");
    if (plate && !PLATE_RE.test(plate)) return badRequest("Invalid license plate format");

    const client = await pool.connect();
    let effectivePlate = plate || `V-${Date.now()}`;
    try {
      await client.query("BEGIN");

      // Reject references that belong to another company.
      if (customerId !== null) {
        const c = await client.query(
          "SELECT id FROM membership_members WHERE id = $1 AND company_id = $2",
          [customerId, user.company_id]
        );
        if (!c.rows[0]) {
          await client.query("ROLLBACK");
          return badRequest("Customer not found");
        }
      }
      if (entryGateId !== null) {
        const g = await client.query(
          "SELECT id FROM parking_gates WHERE id = $1 AND company_id = $2",
          [entryGateId, user.company_id]
        );
        if (!g.rows[0]) {
          await client.query("ROLLBACK");
          return badRequest("Entry gate not found");
        }
      }

      // Resolve (or create) the vehicle.
      let vehicleId = !kiosk && body.vehicle_id ? Number(body.vehicle_id) : null;
      effectivePlate = plate;
      let effectiveType = vehicleType;
      if (vehicleId) {
        const v = await client.query(
          `SELECT id, plate_number, vehicle_type, is_blacklisted, customer_id FROM parking_vehicles WHERE id = $1 AND company_id = $2 FOR UPDATE`,
          [vehicleId, user.company_id]
        );
        if (!v.rows[0]) {
          await client.query("ROLLBACK");
          return badRequest("Vehicle not found");
        }
        if (v.rows[0].is_blacklisted) {
          await client.query("ROLLBACK");
          return forbidden(`Vehicle ${v.rows[0].plate_number} is blacklisted`);
        }
        effectivePlate = v.rows[0].plate_number;
        effectiveType = effectiveType || v.rows[0].vehicle_type;
        if (customerId && !v.rows[0].customer_id) {
          await client.query(`UPDATE parking_vehicles SET customer_id = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`, [customerId, vehicleId]);
        }
      } else {
        const v = await client.query(
          `INSERT INTO parking_vehicles (company_id, plate_number, vehicle_type, customer_id)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (company_id, plate_number)
           DO UPDATE SET updated_at = CURRENT_TIMESTAMP, vehicle_type = COALESCE($3, parking_vehicles.vehicle_type)
           RETURNING id, plate_number, vehicle_type, is_blacklisted`,
          [user.company_id, effectivePlate, effectiveType, customerId]
        );
        if (v.rows[0].is_blacklisted) {
          await client.query("ROLLBACK");
          return forbidden(`Vehicle ${effectivePlate} is blacklisted`);
        }
        vehicleId = v.rows[0].id;
        effectiveType = effectiveType || v.rows[0].vehicle_type;
      }

      // Duplicate active session guard (defense in depth: the partial unique
      // index uq_parking_sessions_active_plate is the final authority).
      const dup = await client.query(
        `SELECT id, ticket_number FROM parking_sessions
         WHERE company_id = $1 AND plate_number = $2 AND status = 'active'
         LIMIT 1`,
        [user.company_id, effectivePlate]
      );
      if (dup.rows[0]) {
        await client.query("ROLLBACK");
        return conflict(`Vehicle ${effectivePlate} already has an active session (${dup.rows[0].ticket_number}). Override requires closing that session first.`);
      }

      // Allocate a space: explicit choice or first free in the zone.
      let assignedSlot: any = null;
      if (slotId) {
        const s = await client.query(
          `UPDATE parking_slots SET status = 'occupied', current_session_id = NULL, updated_at = CURRENT_TIMESTAMP
           WHERE id = $1 AND company_id = $2 AND status = 'available'
           RETURNING id, slot_number, zone_id, floor`,
          [slotId, user.company_id]
        );
        if (!s.rows[0]) {
          await client.query("ROLLBACK");
          return conflict("Selected space is no longer available");
        }
        assignedSlot = s.rows[0];
      } else {
        const s = await client.query(
          `SELECT id, slot_number, zone_id, floor FROM parking_slots
           WHERE company_id = $1 AND status = 'available'
             ${zoneId ? "AND zone_id = $2" : ""}
             AND type NOT IN ('electric', 'disabled', 'staff')
           ORDER BY zone_id, slot_number
           LIMIT 1 FOR UPDATE SKIP LOCKED`,
          zoneId ? [user.company_id, zoneId] : [user.company_id]
        );
        if (s.rows[0]) {
          const lock = await client.query(
            `UPDATE parking_slots SET status = 'occupied', updated_at = CURRENT_TIMESTAMP
             WHERE id = $1 AND status = 'available' RETURNING id, slot_number, zone_id, floor`,
            [s.rows[0].id]
          );
          if (lock.rows[0]) assignedSlot = lock.rows[0];
        }
      }

      // Operator's open shift (if any) for shift-attribution.
      const shiftId = kiosk
        ? null
        : (await client.query(
            `SELECT id FROM parking_shifts WHERE company_id = $1 AND operator_id = $2 AND status = 'open' ORDER BY id DESC LIMIT 1`,
            [user.company_id, user.id]
          )).rows[0]?.id ?? null;

      const ticketNumber = await nextNumber(user.company_id, "session_ticket", "TKT", {
        pad: 6,
        periodKey: dailyPeriodKey(),
        includePeriod: true,
      });

      const ins = await client.query(
        `INSERT INTO parking_sessions
           (company_id, vehicle_id, plate_number, vehicle_type_snapshot, entry_gate_id, slot_id,
            entry_method, entry_source, entry_operator_id, shift_id, ticket_number, status, payment_status, notes)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'active','unpaid',$12)
         RETURNING *`,
        [
          user.company_id, vehicleId, effectivePlate, effectiveType, entryGateId || null,
          assignedSlot?.id || null, entryMethod, entrySource, kiosk ? null : user.id,
          shiftId, ticketNumber, notes,
        ]
      );
      const session = ins.rows[0];

      if (assignedSlot) {
        await client.query(`UPDATE parking_slots SET current_session_id = $1 WHERE id = $2`, [session.id, assignedSlot.id]);
      }

      const zone = assignedSlot
        ? await client.query(`SELECT id, name, code, floor FROM parking_zones WHERE id = $1`, [assignedSlot.zone_id])
        : null;

      const qr = buildTicketPayload({
        id: session.id,
        ticket_number: session.ticket_number,
        plate_number: session.plate_number,
        company_id: session.company_id,
        entry_time: session.entry_time,
      });
      const qrPayload = JSON.stringify(qr);
      const qrImage = await qrDataUrl(qrPayload);

      await client.query("COMMIT");

      await logParkingAudit({
        user: kiosk ? null : user,
        company_id: user.company_id,
        action: "ENTRY",
        entity: "parking_session",
        entity_id: session.id,
        description: `Vehicle ${effectivePlate} entered via ${entryMethod}${assignedSlot ? ` — space ${assignedSlot.slot_number}` : ""}`,
        new_values: { ticket_number: ticketNumber, plate: effectivePlate, slot: assignedSlot?.slot_number ?? null },
        req,
      });

      return created({
        session,
        vehicle: { id: vehicleId, plate_number: effectivePlate, vehicle_type: effectiveType },
        slot: assignedSlot
          ? { ...assignedSlot, zone_name: zone?.rows[0]?.name ?? null, zone_code: zone?.rows[0]?.code ?? null }
          : null,
        ticket: { ticket_number: ticketNumber, qr_payload: qrPayload, qr_data_url: qrImage, entry_time: session.entry_time },
      });
    } catch (e: any) {
      await client.query("ROLLBACK").catch(() => {});
      if (e?.code === "23P01" || e?.code === "23505" || /uq_parking_sessions_active_plate/.test(e?.detail || "")) {
        return conflict(`Vehicle ${effectivePlate} already has an active session`);
      }
      return err(e.message);
    } finally {
      client.release();
    }
  });
}
