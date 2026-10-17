import { NextResponse } from "next/server";
import pool from "@/lib/db";
import { withAuth, ok, created, err, badRequest } from "@/lib/api-utils";
import { requirePermission } from "@/lib/permissions";

export async function GET(req: Request) {
  return withAuth(req, async (user) => {
    const { allowed } = await requirePermission(user, "view", "parking_rfid_cards");
    if (!allowed) return NextResponse.json({ error: "Permission denied" }, { status: 403 });
    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status");
    const memberId = searchParams.get("member_id");
    const q = searchParams.get("q");
    try {
      let query = `SELECT rc.*,
          mm.full_name as member_name, mm.phone as member_phone, mm.customer_id as member_code,
          u.name as created_by_name
         FROM rfid_cards rc
         LEFT JOIN membership_members mm ON rc.member_id = mm.id
         LEFT JOIN users u ON rc.created_by = u.id
         WHERE rc.company_id = $1`;
      const params: any[] = [user.company_id];
      let idx = 2;
      if (status) { query += ` AND rc.status = $${idx}`; params.push(status); idx++; }
      if (memberId) { query += ` AND rc.member_id = $${idx}`; params.push(parseInt(memberId)); idx++; }
      if (q) { query += ` AND (rc.card_uid ILIKE $${idx} OR rc.label ILIKE $${idx} OR mm.full_name ILIKE $${idx})`; params.push(`%${q}%`); idx++; }
      query += " ORDER BY rc.created_at DESC LIMIT 200";
      const result = await pool.query(query, params);
      return ok(result.rows);
    } catch (e: any) { return err(e.message); }
  });
}

export async function POST(req: Request) {
  return withAuth(req, async (user) => {
    const { allowed } = await requirePermission(user, "create", "parking_rfid_cards");
    if (!allowed) return NextResponse.json({ error: "Permission denied" }, { status: 403 });
    try {
      const body = await req.json();
      const { card_uid, member_id, label, status } = body;
      if (!card_uid) return badRequest("Card UID is required");

      const existing = await pool.query(
        "SELECT id FROM rfid_cards WHERE company_id = $1 AND card_uid = $2",
        [user.company_id, card_uid]
      );
      if (existing.rows.length > 0) return badRequest("Card UID already exists");

      const result = await pool.query(
        `INSERT INTO rfid_cards (company_id, member_id, card_uid, label, status, created_by)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
        [user.company_id, member_id || null, card_uid, label || null, status || "active", user.id]
      );
      return created(result.rows[0]);
    } catch (e: any) { return err(e.message); }
  });
}
