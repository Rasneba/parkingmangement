import { NextResponse } from "next/server";
import pool from "@/lib/db";
import { withAuth, ok, created, err, notFound, badRequest, deleted } from "@/lib/api-utils";
import { requirePermission } from "@/lib/permissions";
import { generateSequentialId } from "@/lib/id-generator";

export async function GET(req: Request) {
  return withAuth(req, async (user) => {
    const { allowed } = await requirePermission(user, "view", "parking_sessions");
    if (!allowed) return NextResponse.json({ error: "Permission denied" }, { status: 403 });
    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status");
    const date = searchParams.get("date");
    const zone_id = searchParams.get("zone_id");
    const phone = searchParams.get("phone");
    try {
      let query = `SELECT ps.*,
          pv.plate_number as vehicle_plate, pv.vehicle_type, pv.vehicle_model, pv.vehicle_color, pv.owner_name, pv.owner_phone,
          mm.full_name as customer_name, mm.phone as customer_phone,
          eg.name as entry_gate_name, xg.name as exit_gate_name,
          pz.id as zone_id, pz.name as zone_name, psl.slot_number,
          pq.ticket_number as qr_ticket, pq.visitor_name, pq.visitor_phone
         FROM parking_sessions ps
         LEFT JOIN parking_vehicles pv ON ps.vehicle_id = pv.id
         LEFT JOIN membership_members mm ON pv.customer_id = mm.id
         LEFT JOIN parking_gates eg ON ps.entry_gate_id = eg.id
         LEFT JOIN parking_gates xg ON ps.exit_gate_id = xg.id
         LEFT JOIN parking_slots psl ON ps.slot_id = psl.id
         LEFT JOIN parking_zones pz ON psl.zone_id = pz.id
         LEFT JOIN parking_qr_tickets pq ON ps.qr_ticket_id = pq.id
         WHERE ps.company_id = $1`;
      const params: any[] = [user.company_id];
      let idx = 2;
      if (status) {
        const statuses = status.split(",").filter(Boolean);
        if (statuses.length === 1) {
          query += ` AND ps.status = $${idx}`; params.push(status); idx++;
        } else {
          query += ` AND ps.status = ANY($${idx}::text[])`; params.push(statuses); idx++;
        }
      }
      if (date) { query += ` AND DATE(ps.entry_time) = $${idx}`; params.push(date); idx++; }
      if (zone_id) { query += ` AND pz.id = $${idx}`; params.push(parseInt(zone_id)); idx++; }
      if (phone) { query += ` AND (mm.phone ILIKE $${idx} OR pq.visitor_phone ILIKE $${idx} OR pv.owner_phone ILIKE $${idx} OR pq.visitor_name ILIKE $${idx})`; params.push(`%${phone}%`); idx++; }
      const q = searchParams.get("q");
      if (q) {
        query += ` AND (ps.plate_number ILIKE $${idx} OR UPPER(ps.ticket_number) LIKE UPPER($${idx}) OR pv.owner_name ILIKE $${idx} OR mm.full_name ILIKE $${idx})`;
        params.push(`%${q}%`); idx++;
      }
      const paymentStatus = searchParams.get("payment_status");
      if (paymentStatus) { query += ` AND ps.payment_status = $${idx}`; params.push(paymentStatus); idx++; }
      const from = searchParams.get("from");
      if (from) { query += ` AND ps.entry_time::date >= $${idx}`; params.push(from); idx++; }
      const to = searchParams.get("to");
      if (to) { query += ` AND ps.entry_time::date <= $${idx}`; params.push(to); idx++; }

      // Legacy callers (no page param) keep receiving a plain array. Newer UI
      // passes page=1 to receive a paginated envelope with the total count.
      const page = parseInt(searchParams.get("page") || "", 10);
      const sortBy = searchParams.get("sort");
      const dir = (searchParams.get("dir") || "desc").toLowerCase() === "asc" ? "ASC" : "DESC";
      const sortMap: Record<string, string> = {
        entry_time: "ps.entry_time", exit_time: "ps.exit_time", amount: "ps.amount",
        ticket_number: "ps.ticket_number", plate_number: "ps.plate_number", status: "ps.status",
      };
      const orderExpr = sortBy && sortMap[sortBy] ? `${sortMap[sortBy]} ${dir}` : "ps.entry_time DESC";

      if (!page) {
        query += ` ORDER BY ${orderExpr} LIMIT 200`;
        const result = await pool.query(query, params);
        return ok(result.rows);
      }

      const pageSize = Math.min(Math.max(parseInt(searchParams.get("page_size") || "25", 10) || 25, 5), 100);
      const countRes = await pool.query(`SELECT COUNT(*)::int AS total FROM (${query}) c`, params);
      query += ` ORDER BY ${orderExpr} LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`;
      const result = await pool.query(query, params);
      return ok({ rows: result.rows, total: countRes.rows[0]?.total ?? 0, page, page_size: pageSize });
    } catch (e: any) { return err(e.message); }
  });
}

export async function POST(req: Request) {
  return withAuth(req, async (user) => {
    const { allowed } = await requirePermission(user, "create", "parking_sessions");
    if (!allowed) return NextResponse.json({ error: "Permission denied" }, { status: 403 });
    if (!user.company_id) return badRequest("Company required");
    try {
      const body = await req.json();
      const { plate_number, vehicle_id, entry_gate_id, entry_camera_id, slot_id, entry_method, entry_image_url, entry_plate_confidence, qr_ticket_id, notes } = body;
      if (!plate_number && !vehicle_id) return badRequest("Plate number or vehicle is required");

      let finalVehicleId = vehicle_id;
      let finalPlate = plate_number;
      if (!finalVehicleId && finalPlate) {
        const vRes = await pool.query(
          `INSERT INTO parking_vehicles (company_id, plate_number)
           VALUES ($1, $2)
           ON CONFLICT (company_id, plate_number) DO UPDATE SET updated_at = CURRENT_TIMESTAMP
           RETURNING id, plate_number`,
          [user.company_id, finalPlate.toUpperCase()]
        );
        finalVehicleId = vRes.rows[0].id;
        finalPlate = vRes.rows[0].plate_number;
      }

      let assignedSlotId = slot_id;
      if (!assignedSlotId) {
        const slotRes = await pool.query(
          `SELECT id FROM parking_slots
           WHERE company_id = $1 AND status = 'available'
           ORDER BY id LIMIT 1 FOR UPDATE SKIP LOCKED`,
          [user.company_id]
        );
        if (slotRes.rows.length > 0) {
          assignedSlotId = slotRes.rows[0].id;
        }
      }

      const ticketNumber = await generateSequentialId("parking_sessions", "ticket_number", "SES");

      const result = await pool.query(
        `INSERT INTO parking_sessions (company_id, vehicle_id, plate_number, entry_gate_id, entry_camera_id, slot_id, entry_method, entry_image_url, entry_plate_confidence, qr_ticket_id, ticket_number, notes)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
        [user.company_id, finalVehicleId, finalPlate, entry_gate_id || null, entry_camera_id || null, assignedSlotId || null, entry_method || "anpr", entry_image_url, entry_plate_confidence || null, qr_ticket_id || null, ticketNumber, notes]
      );

      if (assignedSlotId) {
        await pool.query("UPDATE parking_slots SET status = 'occupied', current_session_id = $1 WHERE id = $2", [result.rows[0].id, assignedSlotId]);
      }

      if (qr_ticket_id) {
        await pool.query("UPDATE parking_qr_tickets SET is_used = true, used_at = CURRENT_TIMESTAMP, session_id = $1 WHERE id = $2", [result.rows[0].id, qr_ticket_id]);
      }

      return created(result.rows[0]);
    } catch (e: any) { return err(e.message); }
  });
}
