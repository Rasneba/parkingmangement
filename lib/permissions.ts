import pool from "@/lib/db";
import type { AuthUser } from "@/lib/auth";

export type PermissionAction = "view" | "create" | "edit" | "delete" | "approve";

export const PERMISSION_ACTIONS: PermissionAction[] = [
  "view",
  "create",
  "edit",
  "delete",
  "approve",
];

/** Parking resources registered for server-side RBAC. */
export const RESOURCE_GROUPS: Record<string, { label: string; resources: string[] }> = {
  Operations: {
    label: "Operations",
    resources: [
      "parking_sites",
      "parking_zones",
      "parking_slots",
      "parking_gates",
      "parking_cameras",
      "parking_devices",
      "parking_sessions",
      "parking_tickets",
      "parking_qr_tickets",
    ],
  },
  Commercial: {
    label: "Commercial",
    resources: [
      "parking_rates",
      "parking_payments",
      "parking_refunds",
      "parking_discounts",
      "parking_subscriptions",
      "parking_permits",
    ],
  },
  Registry: {
    label: "Registry",
    resources: ["parking_vehicles", "parking_customers", "parking_rfid_cards"],
  },
  Finance: {
    label: "Finance",
    resources: ["parking_shifts"],
  },
  Reporting: {
    label: "Reporting",
    resources: ["parking_reports", "parking_audit_logs"],
  },
  System: {
    label: "System",
    resources: ["parking_users", "parking_roles", "parking_settings"],
  },
};

export const PARKING_ROLES = {
  admin: "parking_admin",
  supervisor: "parking_supervisor",
  operator: "parking_operator",
  cashier: "parking_cashier",
};

export function getAllResources(): string[] {
  return Object.values(RESOURCE_GROUPS).flatMap((g) => g.resources);
}

let cache: Record<string, Record<string, boolean[]>> | null = null;
let cacheTime = 0;
const CACHE_TTL = 30000;

async function rolePermissionMap(): Promise<Record<string, Record<string, boolean[]>>> {
  if (cache && Date.now() - cacheTime < CACHE_TTL) return cache;
  try {
    const res = await pool.query(
      `SELECT r.name AS role_name, rp.resource,
              rp.can_view, rp.can_create, rp.can_edit, rp.can_delete, rp.can_approve
       FROM role_permissions rp
       JOIN roles r ON r.id = rp.role_id`
    );
    const map: Record<string, Record<string, boolean[]>> = {};
    for (const row of res.rows) {
      if (!map[row.role_name]) map[row.role_name] = {};
      map[row.role_name][row.resource] = [
        !!row.can_view,
        !!row.can_create,
        !!row.can_edit,
        !!row.can_delete,
        !!row.can_approve,
      ];
    }
    cache = map;
    cacheTime = Date.now();
    return map;
  } catch {
    return {};
  }
}

export function clearPermissionCache(): void {
  cache = null;
  cacheTime = 0;
}

export async function can(
  user: AuthUser,
  action: PermissionAction,
  resource: string
): Promise<boolean> {
  if (user.role === "super_admin") return true;

  const map = await rolePermissionMap();
  const perms = map[user.role]?.[resource];

  if (!perms) {
    // Admins keep full access by default (matches ERP behaviour).
    if (user.role === "admin") return true;
    return false;
  }
  return perms[PERMISSION_ACTIONS.indexOf(action)] === true;
}

export async function requirePermission(
  user: AuthUser,
  action: PermissionAction,
  resource: string
): Promise<{ allowed: boolean }> {
  return { allowed: await can(user, action, resource) };
}

export function isGuest(user: AuthUser): boolean {
  return user.role === "guest";
}
