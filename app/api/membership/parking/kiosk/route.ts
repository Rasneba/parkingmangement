import { NextResponse } from "next/server";
import pool from "@/lib/db";
import { withAuth, ok, created, err, badRequest, notFound } from "@/lib/api-utils";
import { requirePermission } from "@/lib/permissions";
import { generateSequentialId } from "@/lib/id-generator";
import QRCode from "qrcode";

export async function POST(req: Request) {
  return withAuth(req, async (user) => {
    const { allowed } = await requirePermission(user, "create", "parking_sessions");
    if (!allowed) return NextResponse.json({ error: "Permission denied" }, { status: 403 });
    try {
      const body = await req.json();
      const { customer_id, zone_id, full_name, phone } = body;

      let displayName = "Guest";
      let displayPhone = "";

      if (customer_id) {
        const customerRes = await pool.query(
          `SELECT id, full_name, phone, customer_id FROM membership_members WHERE id = $1 AND ($2 = true OR company_id = $3)`,
          [customer_id, user.role === "super_admin", user.company_id]
        );
        if (customerRes.rows.length === 0) return notFound("Customer");
        const c = customerRes.rows[0];
        displayName = c.full_name;
        displayPhone = c.phone || "";
      } else {
        if (!full_name) return badRequest("Customer or walk-in name is required");
        displayName = full_name;
        displayPhone = phone || "";
      }

      const ticketNumber = await generateSequentialId("parking_qr_tickets", "ticket_number", "QR");
      const qrData = JSON.stringify({
        t: ticketNumber,
        c: user.company_id,
        n: displayName,
        ts: Date.now()
      });
      const qrDataUrl = await QRCode.toDataURL(qrData, { width: 300, margin: 2 });
      const qrCode = Buffer.from(qrData).toString("base64");

      const qrRes = await pool.query(
        `INSERT INTO parking_qr_tickets (company_id, ticket_number, qr_code, visitor_name, visitor_phone, valid_from, valid_until, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
        [user.company_id, ticketNumber, qrCode, displayName, displayPhone || null, new Date(), new Date(Date.now() + 24 * 60 * 60 * 1000), user.id]
      );
      const qrTicket = qrRes.rows[0];

      let assignedSlotId = null;
      if (zone_id) {
        const slotRes = await pool.query(
          `SELECT id FROM parking_slots
           WHERE company_id = $1 AND zone_id = $2 AND status = 'available'
           ORDER BY id LIMIT 1 FOR UPDATE SKIP LOCKED`,
          [user.company_id, zone_id]
        );
        if (slotRes.rows.length > 0) {
          assignedSlotId = slotRes.rows[0].id;
        }
      }

      const sessionTicket = await generateSequentialId("parking_sessions", "ticket_number", "SES");
      const sessionRes = await pool.query(
        `INSERT INTO parking_sessions (company_id, plate_number, slot_id, entry_method, qr_ticket_id, ticket_number, notes, status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
        [user.company_id, `KIO-${ticketNumber}`, assignedSlotId, "qr", qrTicket.id, sessionTicket, `Kiosk entry: ${displayName}`, 'pending_payment']
      );
      const session = sessionRes.rows[0];

      if (assignedSlotId) {
        await pool.query("UPDATE parking_slots SET status = 'occupied', current_session_id = $1 WHERE id = $2", [session.id, assignedSlotId]);
      }

      await pool.query("UPDATE parking_qr_tickets SET is_used = true, used_at = CURRENT_TIMESTAMP, session_id = $1 WHERE id = $2", [session.id, qrTicket.id]);

      return created({
        session,
        qr_ticket: { ...qrTicket, qr_data: qrData, qr_data_url: qrDataUrl },
        customer: { full_name: displayName, phone: displayPhone }
      });
    } catch (e: any) {
      return err(e.message);
    }
  });
}
