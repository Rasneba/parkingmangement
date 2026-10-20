import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import pool from "@/lib/db";
import { createToken } from "@/lib/auth";
import { logParkingAudit } from "@/lib/audit";

/**
 * Login against the shared ERP identity tables (users / roles / companies).
 * Accepts { email, password, company_tin? }. `company_tin` is only required when
 * the same email exists in more than one company.
 */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const email = String(body.email || "").trim().toLowerCase();
    const password = String(body.password || "");
    const companyTin = body.company_tin ? String(body.company_tin).trim() : null;

    if (!email || !password) {
      return NextResponse.json({ error: "Email and password are required" }, { status: 400 });
    }

    const userRes = await pool.query(
      `SELECT u.*, c.name AS company_name, c.tin AS company_tin, c.status AS company_status
       FROM users u
       LEFT JOIN companies c ON c.id = u.company_id
       WHERE LOWER(u.email) = $1
       ORDER BY u.id`,
      [email]
    );

    if (userRes.rows.length === 0) {
      return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
    }

    let candidates = userRes.rows;
    if (companyTin) {
      candidates = candidates.filter((u) => u.company_tin === companyTin);
      if (candidates.length === 0) {
        return NextResponse.json({ error: "No account for this company TIN" }, { status: 404 });
      }
    } else if (candidates.length > 1) {
      return NextResponse.json(
        {
          error: "This email exists in multiple companies. Provide company_tin.",
          companies: candidates.map((u) => ({ tin: u.company_tin, name: u.company_name })),
        },
        { status: 409 }
      );
    }

    const user = candidates[0];

    if (user.is_active === false) {
      return NextResponse.json({ error: "User account is disabled" }, { status: 403 });
    }
    if (user.company_status && user.company_status !== "active") {
      return NextResponse.json({ error: "Company account is not active" }, { status: 403 });
    }

    const match = await bcrypt.compare(password, user.password);
    if (!match) {
      return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
    }

    let roleName = user.role || "guest";
    if (user.role_id) {
      const roleRes = await pool.query("SELECT name FROM roles WHERE id = $1", [user.role_id]);
      if (roleRes.rows[0]) roleName = roleRes.rows[0].name;
    }

    const token = await createToken({
      id: user.id,
      email: user.email,
      role: roleName,
      company_id: user.company_id ?? undefined,
      company_name: user.company_name ?? undefined,
      company_tin: user.company_tin ?? undefined,
    });

    await logParkingAudit({
      user: { id: user.id, email: user.email, role: roleName, company_id: user.company_id },
      action: "LOGIN",
      entity: "user",
      entity_id: user.id,
      description: `Login from parking app`,
      req,
    });

    return NextResponse.json({
      message: "Login success",
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: roleName,
        role_id: user.role_id,
        branch_id: user.branch_id,
        company_id: user.company_id,
        company_name: user.company_name,
        company_tin: user.company_tin,
      },
    });
  } catch (e: any) {
    console.error("parking login failed:", e);
    return NextResponse.json({ error: "Login failed. Please try again." }, { status: 500 });
  }
}
