import { NextResponse } from "next/server";
import pool from "@/lib/db";
import { withAuth, ok, created, err, notFound, badRequest, deleted } from "@/lib/api-utils";
import { requirePermission } from "@/lib/permissions";
import QRCode from "qrcode";

export async function GET(req: Request) {
  return withAuth(req, async (user) => {
    const { allowed } = await requirePermission(user, "view", "parking_subscriptions");
    if (!allowed) return NextResponse.json({ error: "Permission denied" }, { status: 403 });
    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status");
    const customerId = searchParams.get("customer_id");
    try {
      let query = `SELECT ps.*,
          mm.full_name as customer_name, mm.phone as customer_phone, mm.customer_id as customer_code,
          pv.plate_number, pv.vehicle_type, pv.vehicle_model,
          u.name as created_by_name,
          mp.name as plan_name, mp.duration_days as plan_duration_days
         FROM parking_subscriptions ps
         JOIN membership_members mm ON ps.customer_id = mm.id
         LEFT JOIN parking_vehicles pv ON ps.vehicle_id = pv.id
         LEFT JOIN users u ON ps.created_by = u.id
         LEFT JOIN membership_plans mp ON ps.plan_id = mp.id
         WHERE ps.company_id = $1`;
      const params: any[] = [user.company_id];
      let idx = 2;
      if (status) { query += ` AND ps.status = $${idx}`; params.push(status); idx++; }
      if (customerId) { query += ` AND ps.customer_id = $${idx}`; params.push(customerId); idx++; }
      query += " ORDER BY ps.created_at DESC LIMIT 200";
      const result = await pool.query(query, params);
      return ok(result.rows);
    } catch (e: any) { return err(e.message); }
  });
}

export async function POST(req: Request) {
  return withAuth(req, async (user) => {
    const { allowed } = await requirePermission(user, "create", "parking_subscriptions");
    if (!allowed) return NextResponse.json({ error: "Permission denied" }, { status: 403 });
    try {
      const body = await req.json();
      const { customer_id, vehicle_id, plan_id, start_date, payment_method, payment_reference, auto_renew, notes } = body;
      let { plan_type, end_date, amount } = body;
      if (!customer_id) return badRequest("Customer is required");
      if (!end_date) return badRequest("End date is required");
      if (amount === undefined || amount === null) return badRequest("Amount is required");

      if (plan_id) {
        const planRes = await pool.query("SELECT * FROM membership_plans WHERE id = $1 AND company_id = $2", [plan_id, user.company_id]);
        if (planRes.rows.length === 0) return badRequest("Selected plan not found");
        const plan = planRes.rows[0];
        plan_type = plan.type === "parking" ? "plan" : plan.type;
        if (!body.amount && plan.price) amount = plan.price;
        if (plan.duration_days && plan.duration_days > 0) {
          const s = new Date(start_date || new Date());
          s.setDate(s.getDate() + plan.duration_days);
          end_date = s.toISOString().split("T")[0];
        }
      }

      const result = await pool.query(
        `INSERT INTO parking_subscriptions (company_id, customer_id, vehicle_id, plan_id, plan_type, start_date, end_date, amount, payment_method, payment_reference, auto_renew, notes, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
        [user.company_id, customer_id, vehicle_id || null, plan_id || null, plan_type || "monthly", start_date || new Date().toISOString().split("T")[0], end_date, amount, payment_method || "cash", payment_reference, auto_renew || false, notes, user.id]
      );

      if (vehicle_id) {
        await pool.query("UPDATE parking_vehicles SET is_resident = true WHERE id = $1", [vehicle_id]);
      }

      const sub = result.rows[0];
      const qrData = JSON.stringify({ t: "sub", sid: sub.id, cid: user.company_id, exp: sub.end_date });
      const qrImage = await QRCode.toDataURL(qrData, { width: 300, margin: 2 });
      await pool.query("UPDATE parking_subscriptions SET qr_code = $1, qr_image = $2 WHERE id = $3", [Buffer.from(qrData).toString("base64"), qrImage, sub.id]);
      sub.qr_code = Buffer.from(qrData).toString("base64");
      sub.qr_image = qrImage;

      return created(sub);
    } catch (e: any) { return err(e.message); }
  });
}
