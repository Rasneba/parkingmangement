import pool from "@/lib/db";
import { withAuth, ok, err, isSuperAdmin } from "@/lib/api-utils";
import { requirePermission } from "@/lib/permissions";

/**
 * GET /api/membership/parking/notifications
 * Computed operational alerts (no dedicated table needed):
 *  - subscriptions expiring within 7 days / already expired but still 'active'
 *  - pending refunds awaiting authorization
 *  - vehicles parked beyond 24h without payment
 *  - spaces under maintenance
 *  - near-full capacity warning
 */
export async function GET(req: Request) {
  return withAuth(req, async (user) => {
    const view = await requirePermission(user, "view", "parking_subscriptions");
    if (!view.allowed) return err("Permission denied", 403);

    const params: unknown[] = [];
    let cp = "TRUE";
    if (!isSuperAdmin(user)) {
      params.push(user.company_id);
      cp = "company_id = $1";
    }

    try {
      const [expiring, expiredStillActive, pendingRefunds, longParked, maintenance, occupancy] = await Promise.all([
        pool.query(
          `SELECT s.id, s.plan_type, s.end_date, mm.full_name, pv.plate_number,
                  s.end_date - CURRENT_DATE AS days_left
           FROM parking_subscriptions s
           LEFT JOIN membership_members mm ON mm.id = s.customer_id
           LEFT JOIN parking_vehicles pv ON pv.id = s.vehicle_id
           WHERE s.${cp} AND s.status = 'active'
             AND s.end_date >= CURRENT_DATE AND s.end_date <= CURRENT_DATE + 7
           ORDER BY s.end_date LIMIT 10`,
          params
        ),
        pool.query(
          `SELECT s.id, s.plan_type, s.end_date, mm.full_name, pv.plate_number,
                  CURRENT_DATE - s.end_date AS days_overdue
           FROM parking_subscriptions s
           LEFT JOIN membership_members mm ON mm.id = s.customer_id
           LEFT JOIN parking_vehicles pv ON pv.id = s.vehicle_id
           WHERE s.${cp} AND s.status = 'active' AND s.end_date < CURRENT_DATE
           ORDER BY s.end_date LIMIT 10`,
          params
        ),
        pool.query(
          `SELECT r.id, r.amount, r.reason, r.created_at
           FROM parking_refunds r WHERE r.${cp} AND r.status = 'pending'
           ORDER BY r.created_at DESC LIMIT 10`,
          params
        ),
        pool.query(
          `SELECT ps.id, ps.ticket_number, ps.plate_number, ps.entry_time,
                  DATE_PART('hour', NOW() - ps.entry_time)::int AS hours_parked
           FROM parking_sessions ps
           WHERE ps.${cp} AND ps.status = 'active' AND ps.payment_status = 'unpaid'
             AND ps.entry_time < NOW() - interval '24 hours'
           ORDER BY ps.entry_time LIMIT 10`,
          params
        ),
        pool.query(
          `SELECT COUNT(*)::int AS count FROM parking_slots WHERE ${cp} AND status = 'maintenance'`,
          params
        ),
        pool.query(
          `SELECT COUNT(*)::int AS total,
                  COUNT(*) FILTER (WHERE status = 'occupied')::int AS occupied
           FROM parking_slots WHERE ${cp}`,
          params
        ),
      ]);

      const total = Number(occupancy.rows[0]?.total) || 0;
      const occupied = Number(occupancy.rows[0]?.occupied) || 0;

      const notifications: any[] = [];
      for (const r of expiredStillActive.rows) {
        notifications.push({
          id: `sub-expired-${r.id}`,
          type: "error",
          category: "membership",
          title: "Subscription expired",
          body: `${r.full_name || "Customer"}${r.plate_number ? ` (${r.plate_number})` : ""} — expired ${r.days_overdue} day(s) ago`,
          href: "/dashboard/membership/parking/memberships",
          date: r.end_date,
        });
      }
      for (const r of expiring.rows) {
        notifications.push({
          id: `sub-expiring-${r.id}`,
          type: "warning",
          category: "membership",
          title: "Subscription expiring soon",
          body: `${r.full_name || "Customer"}${r.plate_number ? ` (${r.plate_number})` : ""} — expires in ${r.days_left} day(s)`,
          href: "/dashboard/membership/parking/memberships",
          date: r.end_date,
        });
      }
      for (const r of pendingRefunds.rows) {
        notifications.push({
          id: `refund-${r.id}`,
          type: "warning",
          category: "finance",
          title: "Refund awaiting authorization",
          body: `${r.amount} — ${r.reason || "no reason given"}`,
          href: "/dashboard/membership/parking/cashier",
          date: r.created_at,
        });
      }
      for (const r of longParked.rows) {
        notifications.push({
          id: `longparked-${r.id}`,
          type: "info",
          category: "operations",
          title: "Vehicle parked 24h+ unpaid",
          body: `${r.plate_number || "Unknown plate"} — ${r.hours_parked}h since entry (${r.ticket_number})`,
          href: "/dashboard/membership/parking/sessions",
          date: r.entry_time,
        });
      }
      if (Number(maintenance.rows[0]?.count) > 0) {
        notifications.push({
          id: "maintenance",
          type: "info",
          category: "facility",
          title: "Spaces under maintenance",
          body: `${maintenance.rows[0].count} space(s) are closed for maintenance`,
          href: "/dashboard/membership/parking/spaces",
          date: new Date().toISOString(),
        });
      }
      if (total > 0 && occupied / total >= 0.9) {
        notifications.push({
          id: "capacity",
          type: "error",
          category: "facility",
          title: "Facility nearly full",
          body: `${occupied}/${total} spaces occupied (${Math.round((occupied / total) * 100)}%)`,
          href: "/dashboard/membership/parking",
          date: new Date().toISOString(),
        });
      }

      return ok({ notifications, unread: notifications.length });
    } catch (e: any) {
      return err(e.message);
    }
  });
}
