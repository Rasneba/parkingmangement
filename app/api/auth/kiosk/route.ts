import { NextResponse } from "next/server";
import pool from "@/lib/db";
import { createToken } from "@/lib/auth";
import { KIOSK_ROLE } from "@/lib/public-kiosk";
import { rateLimit, requestIp } from "@/lib/rate-limit";

/**
 * GET /api/auth/kiosk
 * Issues a short-lived public kiosk token for the configured parking company.
 * This token can only reach the entry/exit kiosk endpoints (enforced per route),
 * never the general dashboard APIs.
 */
export async function GET(req: Request) {
  if (process.env.PARKING_PUBLIC_KIOSK === "false") {
    return NextResponse.json({ error: "Public kiosk is disabled" }, { status: 403 });
  }
  if (!rateLimit(`kiosk-token:${requestIp(req)}`, 20, 60_000)) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  try {
    const configured = Number(process.env.PARKING_PUBLIC_COMPANY_ID);
    let company: { id: number; name: string; tin: string | null } | undefined;

    if (Number.isFinite(configured) && configured > 0) {
      const res = await pool.query(
        "SELECT id, name, tin FROM companies WHERE id = $1 AND status = 'active'",
        [configured]
      );
      company = res.rows[0];
    } else {
      const res = await pool.query(
        "SELECT id, name, tin FROM companies WHERE status = 'active' ORDER BY id LIMIT 2"
      );
      if (res.rows.length > 1) {
        return NextResponse.json(
          { error: "Public kiosk company is not configured" },
          { status: 503 }
        );
      }
      company = res.rows[0];
    }

    if (!company) {
      return NextResponse.json(
        { error: "No active company is available for the public kiosk" },
        { status: 503 }
      );
    }

    const token = await createToken({
      id: 0,
      email: "kiosk@public.local",
      role: KIOSK_ROLE,
      company_id: company.id,
      company_name: company.name,
      company_tin: company.tin ?? undefined,
    });

    return NextResponse.json(
      { token, company: { id: company.id, name: company.name } },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Kiosk authentication failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
