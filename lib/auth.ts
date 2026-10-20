import { SignJWT, jwtVerify } from "jose";
import { NextResponse } from "next/server";
import { KIOSK_ROLE, isKioskApiRequestAllowed } from "@/lib/public-kiosk";

export interface AuthUser {
  id: number;
  email: string;
  role: string;
  company_id?: number;
  company_name?: string;
  company_tin?: string;
}

// Must match the ERP secret so a token minted by either app is accepted by both.
// Required in every environment: there is no fallback, so a missing value fails closed.
function getSecret(): Uint8Array {
  const value = process.env.JWT_SECRET;
  if (!value) throw new Error("JWT_SECRET is not configured");
  return new TextEncoder().encode(value);
}

export async function createToken(payload: AuthUser) {
  return await new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("24h")
    .sign(getSecret());
}

export async function verifyToken(token: string): Promise<AuthUser | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret());
    return payload as unknown as AuthUser;
  } catch {
    return null;
  }
}

export async function getAuthUser(req: Request): Promise<AuthUser | null> {
  const authHeader = req.headers.get("authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) return null;
  const user = await verifyToken(authHeader.slice(7));
  if (!user) return null;

  // Public kiosk tokens are long-lived and unauthenticated to obtain, so they
  // may only reach the handful of endpoints the kiosk UI actually needs.
  if (user.role === KIOSK_ROLE && !isKioskApiRequestAllowed(req.method, new URL(req.url).pathname)) {
    return null;
  }

  return user;
}

export function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}
