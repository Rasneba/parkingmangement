import { NextResponse } from "next/server";
import pool from "@/lib/db";
import { withAuth, ok } from "@/lib/api-utils";

export async function GET(req: Request) {
  return withAuth(req, async (user) => {
    try {
      const { searchParams } = new URL(req.url);
      const since = searchParams.get("since");
      const limit = parseInt(searchParams.get("limit") || "200");

      let query = `SELECT ral.*, 
        mm.phone as member_phone, mm.customer_id as member_code, mm.photo_url,
        mp.name as plan_name_full
      FROM rfid_access_logs ral
      LEFT JOIN membership_members mm ON ral.member_id = mm.id
      LEFT JOIN membership_plans mp ON mm.plan_id = mp.id
      WHERE ral.company_id = $1 AND (ral.event_type = 'QR_SCAN' OR ral.card_uid LIKE 'QR-%')`;

      const params: any[] = [user.company_id];
      let idx = 2;

      if (since) {
        query += ` AND ral.created_at > $${idx}`;
        params.push(since);
        idx++;
      }

      query += ` ORDER BY ral.created_at DESC LIMIT $${idx}`;
      params.push(limit);

      const result = await pool.query(query, params);

      const rows = result.rows.map((r: any) => ({
        id: r.id,
        card_uid: r.card_uid,
        member_id: r.member_id,
        member_name: r.member_name || null,
        granted: r.granted,
        reason: r.reason,
        message: r.message,
        days_remaining: r.days_remaining,
        door_opened: r.door_opened,
        direction: r.direction || "IN",
        event_type: r.event_type || "QR_SCAN",
        plan_name: r.plan_name || r.plan_name_full || null,
        subscription_id: r.subscription_id,
        time: r.created_at,
        photo_url: r.photo_url,
        member_code: r.member_code,
      }));

      return ok({ ok: true, data: rows, total: rows.length });
    } catch (e: any) {
      return NextResponse.json({ error: e.message }, { status: 500 });
    }
  });
}
