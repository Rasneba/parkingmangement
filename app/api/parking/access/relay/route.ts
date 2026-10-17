import { NextResponse } from "next/server";
import pool from "@/lib/db";
import { withAuth, ok } from "@/lib/api-utils";

export async function POST(req: Request) {
  return withAuth(req, async (user) => {
    try {
      const body = await req.json();
      const action = body.action || "open";

      const result = await pool.query(
        `INSERT INTO relay_commands (company_id, action, payload, status)
         VALUES ($1, $2, $3, 'pending') RETURNING id`,
        [user.company_id, action === "open" ? "open_door" : action, JSON.stringify(body)]
      );

      return ok({ success: true, command_id: result.rows[0].id });
    } catch (e: any) {
      return NextResponse.json({ success: false, error: e.message }, { status: 500 });
    }
  });
}

export async function GET(req: Request) {
  return withAuth(req, async (user) => {
    try {
      const r = await pool.query(
        `SELECT COUNT(*) as pending FROM relay_commands 
         WHERE company_id = $1 AND status = 'pending' AND created_at > NOW() - INTERVAL '5 minutes'`,
        [user.company_id]
      );
      const recentDone = await pool.query(
        `SELECT id, action, status, created_at FROM relay_commands 
         WHERE company_id = $1 AND status = 'done' AND created_at > NOW() - INTERVAL '5 minutes'
         ORDER BY created_at DESC LIMIT 5`,
        [user.company_id]
      );
      return ok({ ok: true, relay_online: true, pending: parseInt(r.rows[0].pending), recent: recentDone.rows });
    } catch (e: any) {
      return ok({ ok: true, relay_online: false, pending: 0, recent: [] });
    }
  });
}
