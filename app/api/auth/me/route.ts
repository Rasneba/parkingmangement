import pool from "@/lib/db";
import { withAuth, ok, err } from "@/lib/api-utils";
import { can, getAllResources, PERMISSION_ACTIONS } from "@/lib/permissions";

/** Returns the current user plus their effective parking permissions. */
export async function GET(req: Request) {
  return withAuth(req, async (user) => {
    try {
      const dbUser = await pool.query(
        `SELECT u.id, u.name, u.email, u.branch_id, u.company_id, c.name AS company_name
         FROM users u LEFT JOIN companies c ON c.id = u.company_id WHERE u.id = $1`,
        [user.id]
      );

      const resources = getAllResources();
      const perms: Record<string, string[]> = {};
      if (user.role === "super_admin" || user.role === "admin") {
        for (const r of resources) perms[r] = [...PERMISSION_ACTIONS];
      } else {
        for (const r of resources) {
          const actions: string[] = [];
          for (const a of PERMISSION_ACTIONS) {
            if (await can(user, a, r)) actions.push(a);
          }
          perms[r] = actions;
        }
      }

      return ok({ user: { ...user, ...(dbUser.rows[0] || {}) }, permissions: perms });
    } catch (e: any) {
      return err(e.message);
    }
  });
}
