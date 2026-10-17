import { SignJWT, jwtVerify } from "jose";
import { NextResponse } from "next/server";

export interface AuthUser {
  id: number;
  email: string;
  role: string;
  company_id?: number;
  company_name?: string;
  company_tin?: string;
}

// Must match the ERP secret so a token minted by either app is accepted by both.
const SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || "genius-hrms-secret-key-2026"
);

export async function createToken(payload: AuthUser) {
  return await new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("24h")
    .sign(SECRET);
}

export async function verifyToken(token: string): Promise<AuthUser | null> {
  try {
    const { payload } = await jwtVerify(token, SECRET);
    return payload as unknown as AuthUser;
  } catch {
    return null;
  }
}

export async function getAuthUser(req: Request): Promise<AuthUser | null> {
  const authHeader = req.headers.get("authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) return null;
  return await verifyToken(authHeader.slice(7));
}

export function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}
