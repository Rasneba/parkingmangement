import { withAuth, ok, err, badRequest, notFound, conflict } from "@/lib/api-utils";
import { requirePermission } from "@/lib/permissions";
import { createOrder } from "@/lib/addispay";
import { priceSession } from "@/lib/pricing";
import { generateSequentialId } from "@/lib/id-generator";
import { logParkingAudit } from "@/lib/audit";
import { isKiosk } from "@/lib/public-kiosk";
import { rateLimit, requestIp } from "@/lib/rate-limit";
import pool from "@/lib/db";

/**
 * POST /api/membership/parking/addispay/initialize
 * Starts an online (AddisPay) checkout for an active parking session.
 * The amount is always computed server-side from the active tariff - the
 * client can never influence the price.
 */
export async function POST(req: Request) {
  return withAuth(req, async (user) => {
    const kiosk = isKiosk(user);
    if (kiosk && !rateLimit(`kiosk-pay:${requestIp(req)}`, 30, 60_000)) {
      return err("Too many payment attempts from this network. Please try again shortly.", 429);
    }
    if (!kiosk) {
      const perm = await requirePermission(user, "create", "parking_payments");
      if (!perm.allowed) return err("Permission denied", 403);
    }
    if (!user.company_id) return badRequest("Company required");

    const body = await req.json().catch(() => null);
    if (!body) return badRequest("Invalid JSON body");

    const sessionId = Number(body.session_id) || null;
    if (!sessionId) return badRequest("session_id is required");

    const sessionRes = await pool.query(
      `SELECT ps.*, pv.owner_name, pv.owner_email, pv.owner_phone, pv.vehicle_type, pv.plate_number
       FROM parking_sessions ps
       LEFT JOIN parking_vehicles pv ON pv.id = ps.vehicle_id
       WHERE ps.id = $1 AND ps.company_id = $2`,
      [sessionId, user.company_id]
    );
    const session = sessionRes.rows[0];
    if (!session) return notFound("Parking session");
    if (session.status === "completed") return conflict("Session already closed");
    if (session.status === "cancelled") return conflict("Session was cancelled");

    const priced = await priceSession({
      companyId: user.company_id,
      entryTime: session.entry_time,
      exitTime: new Date(),
      vehicleType: session.vehicle_type || session.vehicle_type_snapshot,
      vehicleId: session.vehicle_id,
      plateNumber: session.plate_number,
      rateId: session.rate_id,
    });

    const amount = Number(priced.amountDue);
    if (!isFinite(amount) || amount <= 0) {
      return badRequest("There is nothing to pay for this session");
    }

    const baseRef = await generateSequentialId("parking_payments", "reference", "ADP", 6);
    const txRef = `${baseRef}-${Date.now().toString(36)}`;
    const nonce = `nonce-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const origin = new URL(req.url).origin;
    const returnPath =
      typeof body.return_url === "string" && body.return_url.startsWith("/")
        ? body.return_url
        : `/dashboard/membership/parking/exit?addispay=pending&session=${session.id}`;
    const returnUrl = `${origin}${returnPath}`;

    const result = await createOrder({
      amount,
      currency: priced.currency || "ETB",
      email: body.email || session.owner_email || "customer@example.com",
      first_name: (session.owner_name || "Customer").split(" ")[0] || "Customer",
      last_name: (session.owner_name || "").split(" ").slice(1).join(" "),
      phone_number: body.phone_number || session.owner_phone || "",
      tx_ref: txRef,
      nonce,
      redirect_url: returnUrl,
      success_url: `${origin}/api/membership/parking/addispay/callback?tx_ref=${encodeURIComponent(txRef)}&session_id=${session.id}&return_url=${encodeURIComponent(returnPath)}`,
      cancel_url: returnUrl,
      error_url: returnUrl,
      order_reason: `Parking fee - ${session.plate_number || session.ticket_number}`,
      order_detail: { amount, description: `Parking fee for ${session.plate_number || "vehicle"}` },
    });

    if (result.status !== "success" || !result.data) {
      return err(result.message || "AddisPay order could not be created", 502);
    }

    await pool.query(
      `INSERT INTO parking_payments
         (company_id, session_id, vehicle_id, amount, currency, payment_method, reference, notes, paid_by, created_by)
       VALUES ($1,$2,$3,$4,$5,'addispay',$6,$7,$8,$9)`,
      [
        user.company_id,
        session.id,
        session.vehicle_id,
        amount,
        priced.currency || "ETB",
        txRef,
        `uuid:${result.data.uuid}`,
        session.owner_name || null,
        kiosk ? null : user.id,
      ]
    );

    await logParkingAudit({
      user: kiosk ? null : user,
      company_id: user.company_id,
      action: "PAYMENT",
      entity: "parking_payment",
      entity_id: session.id,
      description: `AddisPay checkout started for ${session.plate_number || session.ticket_number} - ${amount} ${priced.currency}`,
      new_values: { tx_ref: txRef, uuid: result.data.uuid, amount },
      req,
    });

    return ok({
      status: "success",
      tx_ref: txRef,
      uuid: result.data.uuid,
      checkout_url: result.data.checkout_url,
      amount,
      currency: priced.currency || "ETB",
    });
  });
}
