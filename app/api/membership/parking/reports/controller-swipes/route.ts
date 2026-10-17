import { NextResponse } from "next/server";
import pool from "@/lib/db";
import { getAuthUser, unauthorized } from "@/lib/auth";

export async function GET(req: Request) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();
  const { searchParams } = new URL(req.url);
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const card = searchParams.get("card");
  const granted = searchParams.get("granted");
  const direction = searchParams.get("direction");
  const limit = parseInt(searchParams.get("limit") || "200");
  const offset = parseInt(searchParams.get("offset") || "0");

  try {
    let query = `SELECT ral.*,
                        mm.full_name as member_name,
                        mp.name as plan_name
                 FROM rfid_access_logs ral
                 LEFT JOIN membership_members mm ON ral.member_id = mm.id
                 LEFT JOIN membership_plans mp ON mm.plan_id = mp.id
                 WHERE ral.company_id = $1`;
    const params: any[] = [user.company_id];
    let idx = 2;

    if (from) { query += ` AND ral.created_at >= $${idx}`; params.push(from); idx++; }
    if (to) { query += ` AND ral.created_at <= $${idx}`; params.push(to + "T23:59:59"); idx++; }
    if (card) { query += ` AND ral.card_uid ILIKE $${idx}`; params.push(`%${card}%`); idx++; }
    if (granted !== null && granted !== "") {
      query += ` AND ral.granted = $${idx}`; params.push(granted === "true"); idx++;
    }
    if (direction) { query += ` AND ral.direction = $${idx}`; params.push(direction); idx++; }

    const countRes = await pool.query(
      `SELECT COUNT(*) as total FROM rfid_access_logs ral WHERE ral.company_id = $1`,
      [user.company_id]
    );
    const total = parseInt(countRes.rows[0].total);

    query += " ORDER BY ral.created_at DESC LIMIT $" + idx + " OFFSET $" + (idx + 1);
    params.push(limit, offset);

    const result = await pool.query(query, params);

    const summary = await pool.query(
      `SELECT COUNT(*) as total_swipes,
              COUNT(*) FILTER (WHERE granted = true) as granted_count,
              COUNT(*) FILTER (WHERE granted = false) as denied_count,
              COUNT(*) FILTER (WHERE reason = 'RAW_SWIPE') as raw_count,
              COUNT(DISTINCT card_uid) as unique_cards
       FROM rfid_access_logs
       WHERE company_id = $1`,
      [user.company_id]
    );

    return NextResponse.json({
      rows: result.rows,
      summary: summary.rows[0],
      total,
      limit,
      offset,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
