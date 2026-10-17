import { NextResponse } from "next/server";
import pool from "@/lib/db";
import { withAuth, ok, isAdmin } from "@/lib/api-utils";

export async function GET(req: Request) {
  return withAuth(req, async (user) => {
    const admin = isAdmin(user);
    const { searchParams } = new URL(req.url);
    const limit = parseInt(searchParams.get("limit") || "50");
    const r = await pool.query(
      "SELECT * FROM rfid_access_logs WHERE ($1 = true OR company_id = $2) ORDER BY created_at DESC LIMIT $3",
      [admin, user.company_id, limit]
    );
    return ok(r.rows);
  });
}
