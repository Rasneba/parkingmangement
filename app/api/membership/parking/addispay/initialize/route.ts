import { NextResponse } from "next/server";
import { withAuth, ok, err, badRequest, notFound } from "@/lib/api-utils";
import { requirePermission } from "@/lib/permissions";
import { createOrder } from "@/lib/addispay";
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
      const parsedAmount = parseFloat(amount);
      if (!amount || isNaN(parsedAmount) || parsedAmount <= 0) return badRequest("Amount is required");

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
      const txRef = await generateSequentialId("parking_payments", "reference", "ADP");
      const nonce = `nonce-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const uniqueRef = `${txRef}-${Date.now()}`;

      const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
      const result = await createOrder({
        amount: parsedAmount,
        currency: "ETB",
        email: email || session.owner_email || "customer@example.com",
        first_name: session.owner_name?.split(" ")[0] || "Customer",
        last_name: session.owner_name?.split(" ").slice(1).join(" ") || "",
        phone_number: phone_number || session.owner_phone || "",
        tx_ref: uniqueRef,
        nonce,
        redirect_url: return_url || `${appUrl}/dashboard/membership/parking/pos?session=${session.id}`,
        success_url: `${appUrl}/api/membership/parking/addispay/callback?tx_ref=${uniqueRef}&session_id=${session.id}`,
        cancel_url: `${appUrl}/dashboard/membership/parking/pos?session=${session.id}`,
        error_url: `${appUrl}/dashboard/membership/parking/pos?session=${session.id}`,
        order_reason: `Parking payment for ${session.plate_number || session.ticket_number}`,
        order_detail: { amount: parsedAmount, description: `Parking fee for ${session.plate_number || "vehicle"}` },
      });

      if (result.status === "success" && result.data) {
        await pool.query(
          `INSERT INTO parking_payments (company_id, session_id, vehicle_id, amount, payment_method, reference, notes)
           VALUES ($1, $2, $3, $4, 'addispay', $5, $6)
           ON CONFLICT DO NOTHING`,
          [user.company_id, session.id, session.vehicle_id, parsedAmount, uniqueRef, `uuid:${result.data.uuid}`]
        );
      }

      return ok(result);
    } catch (e: any) {
      return err(e.message);
    }
  });
}
