import { NextResponse } from "next/server";
import { withAuth, ok, err, badRequest, notFound } from "@/lib/api-utils";
import { requirePermission } from "@/lib/permissions";
import { initializePayment } from "@/lib/chapa";
import pool from "@/lib/db";
import { generateSequentialId } from "@/lib/id-generator";

export async function POST(req: Request) {
  return withAuth(req, async (user) => {
    const { allowed } = await requirePermission(user, "create", "parking_payments");
    if (!allowed) return NextResponse.json({ error: "Permission denied" }, { status: 403 });
    try {
      const body = await req.json();
      const { session_id, amount, phone_number, email, return_url } = body;

      if (!session_id) return badRequest("Session ID is required");
      if (!amount) return badRequest("Amount is required");

      const sessionRes = await pool.query(
        `SELECT ps.*, pv.owner_name, pv.owner_email, pv.owner_phone, pv.plate_number
         FROM parking_sessions ps
         LEFT JOIN parking_vehicles pv ON ps.vehicle_id = pv.id
         WHERE ps.id = $1 AND ps.company_id = $2`,
        [session_id, user.company_id]
      );

      if (sessionRes.rows.length === 0) {
        return notFound("Session");
      }

      const session = sessionRes.rows[0];
      const txRef = await generateSequentialId("parking_payments", "reference", "CHP");

      const result = await initializePayment({
        amount: Number(amount),
        currency: "ETB",
        email: email || session.owner_email || "customer@example.com",
        first_name: session.owner_name?.split(" ")[0] || "Customer",
        last_name: session.owner_name?.split(" ").slice(1).join(" ") || "",
        phone_number: phone_number || session.owner_phone || "",
        tx_ref: txRef,
        callback_url: `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/api/membership/parking/chapa/callback?session_id=${session.id}&company_id=${user.company_id}`,
        return_url: return_url || `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/dashboard/membership/parking/pos?session=${session.id}`,
        customization: {
          title: `Parking Payment - ${session.plate_number || session.ticket_number}`,
          description: `Parking fee for ${session.plate_number || "vehicle"}`,
        },
      });

      if (result.status === "success") {
        await pool.query(
          `INSERT INTO parking_payments (company_id, session_id, vehicle_id, amount, payment_method, reference, notes)
           VALUES ($1, $2, $3, $4, 'chapa', $5, 'Chapa payment initiated')
           ON CONFLICT DO NOTHING`,
          [user.company_id, session.id, session.vehicle_id, amount, txRef]
        );
      }

      return ok(result);
    } catch (e: any) {
      return err(e.message);
    }
  });
}
