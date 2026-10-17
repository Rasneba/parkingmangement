import { NextResponse } from "next/server";
import pool from "@/lib/db";
import { withAuth, ok, err, notFound, badRequest } from "@/lib/api-utils";
import { requirePermission } from "@/lib/permissions";

export async function POST(req: Request) {
  return withAuth(req, async (user) => {
    const { allowed } = await requirePermission(user, "view", "parking_customers");
    if (!allowed) return NextResponse.json({ error: "Permission denied" }, { status: 403 });
    try {
      const body = await req.json();
      const { qr_data, ticket_number } = body;
      const admin = user.role === "super_admin";

      let ticketNum = ticket_number;
      if (qr_data) {
        try {
          const decoded = JSON.parse(Buffer.from(qr_data, "base64").toString());
          ticketNum = decoded.t;
        } catch {
          try {
            const parsed = JSON.parse(qr_data);
            ticketNum = parsed.t || parsed.ticket_number || parsed.ticket;
          } catch {
            ticketNum = qr_data;
          }
        }
      }

      if (!ticketNum) return badRequest("Ticket number or QR data required");

      const result = await pool.query(
        `SELECT ps.*,
          pq.ticket_number as qr_ticket_number, pq.visitor_name, pq.visitor_phone, pq.qr_code,
          pz.name as zone_name, pz.id as zone_id, psl.slot_number
         FROM parking_sessions ps
         JOIN parking_qr_tickets pq ON ps.qr_ticket_id = pq.id
         LEFT JOIN parking_slots psl ON ps.slot_id = psl.id
         LEFT JOIN parking_zones pz ON psl.zone_id = pz.id
         WHERE pq.ticket_number = $1 AND ($2 = true OR ps.company_id = $3)`,
        [ticketNum, admin, user.company_id]
      );

      if (result.rows.length === 0) {
        return notFound("Active session");
      }

      const session = result.rows[0];
      if (session.status === "completed") {
        return badRequest("Session already completed");
      }
      if (session.status === "cancelled") {
        return badRequest("Session was cancelled");
      }

      const entryTime = new Date(session.entry_time);
      const now = new Date();
      const durationMs = now.getTime() - entryTime.getTime();
      const durationMinutes = Math.round(durationMs / 60000);
      const durationHours = Math.floor(durationMinutes / 60);
      const durationRemainderMin = durationMinutes % 60;

      return ok({
        ...session,
        calculated_duration_minutes: durationMinutes,
        calculated_duration_display: `${durationHours}h ${durationRemainderMin}m`,
        calculated_amount: 0,
      });
    } catch (e: any) {
      return err(e.message);
    }
  });
}
