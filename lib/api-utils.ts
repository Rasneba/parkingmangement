import { NextResponse } from "next/server";
import { getAuthUser, type AuthUser } from "@/lib/auth";

export type { AuthUser };

export function ok<T>(data: T, status = 200) {
  return NextResponse.json(data, { status });
}

export function created<T>(data: T) {
  return NextResponse.json(data, { status: 201 });
}

export function err(message: string, status = 500) {
  return NextResponse.json({ error: message }, { status });
}

export function unauthorized() {
  return err("Unauthorized", 401);
}

export function forbidden(message = "Permission denied") {
  return err(message, 403);
}

export function notFound(entity = "Resource") {
  return err(`${entity} not found`, 404);
}

export function badRequest(message: string) {
  return err(message, 400);
}

export function conflict(message: string) {
  return err(message, 409);
}

export function deleted(entity = "Resource") {
  return NextResponse.json({ message: `${entity} deleted` });
}

export async function withAuth(
  req: Request,
  handler: (user: AuthUser, req: Request) => Promise<Response>
): Promise<Response> {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();
  return handler(user, req);
}

export function isSuperAdmin(user: AuthUser): boolean {
  return user.role === "super_admin";
}

/** Alias kept for the ported parking module (source repo naming). */
export function isAdmin(user: AuthUser): boolean {
  return user.role === "super_admin";
}

/**
 * Builds a SQL fragment constraining a query by company (source repo naming).
 * Always scopes to the caller's company id.
 */
export function buildCompanyFilter(
  user: AuthUser,
  params: unknown[],
  alias = ""
): string {
  const table = alias ? `${alias}.` : "";
  params.push(user.company_id);
  return ` AND ${table}company_id = $${params.length}`;
}

/**
 * Returns a SQL fragment constraining a query by company.
 * Super admins are not constrained (they see all companies).
 * The company id is pushed as a bound parameter to avoid injection.
 */
export function companyScope(
  user: AuthUser,
  params: unknown[],
  column = "company_id"
): string {
  if (isSuperAdmin(user)) return "";
  params.push(user.company_id);
  return ` AND ${column} = $${params.length}`;
}

/** Resolve the effective company id for writes (super admin must choose one). */
export function resolveCompanyId(user: AuthUser, body?: any): number | null {
  if (isSuperAdmin(user)) {
    const id = body?.company_id;
    return id ? Number(id) : user.company_id ?? null;
  }
  return user.company_id ?? null;
}
