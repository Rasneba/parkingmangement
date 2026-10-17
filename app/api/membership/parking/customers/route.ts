import { NextResponse } from "next/server";
import pool from "@/lib/db";
import { withAuth, ok, created, err, notFound, badRequest, deleted } from "@/lib/api-utils";
import { requirePermission } from "@/lib/permissions";
import { generateSequentialId } from "@/lib/id-generator";

export async function GET(req: Request) {
  return withAuth(req, async (user) => {
    const { allowed } = await requirePermission(user, "view", "parking_customers");
    if (!allowed) return NextResponse.json({ error: "Permission denied" }, { status: 403 });
    const { searchParams } = new URL(req.url);
    const q = searchParams.get("q");
    try {
      let query = `SELECT mm.*,
          (SELECT COUNT(*) FROM parking_vehicles WHERE customer_id = mm.id) as vehicle_count,
          (SELECT COUNT(*) FROM parking_subscriptions WHERE customer_id = mm.id AND status = 'active') as active_subscriptions
         FROM membership_members mm
         WHERE mm.company_id = $1`;
      const params: any[] = [user.company_id];
      let idx = 2;
      if (q) { query += ` AND (mm.full_name ILIKE $${idx} OR mm.phone ILIKE $${idx} OR mm.customer_id ILIKE $${idx} OR mm.id_number ILIKE $${idx})`; params.push(`%${q}%`); idx++; }
      query += " ORDER BY mm.created_at DESC";
      const result = await pool.query(query, params);
      return ok(result.rows);
    } catch (e: any) { return err(e.message); }
  });
}

export async function POST(req: Request) {
  return withAuth(req, async (user) => {
    const { allowed } = await requirePermission(user, "create", "parking_customers");
    if (!allowed) return NextResponse.json({ error: "Permission denied" }, { status: 403 });
    try {
      const body = await req.json();
      const { customer_id, full_name, phone, email, id_number, address, photo_url, notes } = body;
      if (!full_name) return badRequest("Full name is required");
      if (!phone) return badRequest("Phone is required");

      const cid = customer_id || await generateSequentialId("membership_members", "customer_id", "CUT");
      const qrData = JSON.stringify({ cid, n: full_name, p: phone, ts: Date.now() });
      const qrCode = Buffer.from(qrData).toString("base64");

      const result = await pool.query(
        `INSERT INTO membership_members (company_id, customer_id, full_name, phone, email, id_number, address, photo_url, qr_code, end_date, notes)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
        [user.company_id, cid, full_name, phone, email || null, id_number || null, address || null, photo_url || null, qrCode, '2099-12-31', notes || null]
      );
      return created(result.rows[0]);
    } catch (e: any) { return err(e.message); }
  });
}
