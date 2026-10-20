import type { AuthUser } from "@/lib/auth";

export const KIOSK_ROLE = "parking_kiosk";

export const PUBLIC_KIOSK_PATHS = [
  "/dashboard/membership/parking/entry",
  "/dashboard/membership/parking/exit",
];

export function isPublicKioskPath(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  return PUBLIC_KIOSK_PATHS.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`)
  );
}

export function isKiosk(user: Pick<AuthUser, "role"> | null | undefined): boolean {
  return user?.role === KIOSK_ROLE;
}

/**
 * Routes a public kiosk token may call. Everything else must remain
 * inaccessible even though the token is a valid JWT.
 */
const KIOSK_API_ALLOWLIST = [
  { method: "GET", path: "/api/membership/parking/slots" },
  { method: "GET", path: "/api/membership/parking/gates" },
  { method: "GET", path: "/api/membership/parking/floor-map" },
  { method: "POST", path: "/api/membership/parking/sessions/entry" },
  { method: "GET", path: "/api/membership/parking/sessions/exit" },
  { method: "POST", path: "/api/membership/parking/sessions/exit" },
  { method: "POST", path: "/api/membership/parking/addispay/initialize" },
  { method: "GET", path: "/api/membership/parking/addispay/verify/" },
];

export function isKioskApiRequestAllowed(method: string, pathname: string): boolean {
  const normalized = pathname.replace(/\/+$/, "") || "/";
  const verb = method.toUpperCase();
  return KIOSK_API_ALLOWLIST.some((entry) => {
    if (entry.method !== verb) return false;
    if (entry.path.endsWith("/")) {
      return `${normalized}/`.startsWith(entry.path);
    }
    return normalized === entry.path;
  });
}
