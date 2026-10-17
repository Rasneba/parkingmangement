import { NextResponse } from "next/server";
import pool from "@/lib/db";
import { withAuth, ok, err } from "@/lib/api-utils";
import { requirePermission } from "@/lib/permissions";

export async function GET(req: Request) {
  return withAuth(req, async (user) => {
    const { allowed } = await requirePermission(user, "view", "parking_zones");
    if (!allowed) return NextResponse.json({ error: "Permission denied" }, { status: 403 });
    try {
      const admin = user.role === "super_admin";
      const scope = (alias: string) => (admin ? "true" : `${alias}.company_id = ${user.company_id}`);
      const [activeRes, totalSlots, occupiedSlots, todayRevenue, todayEntries, todayExits, recentSessions, customerCount, subscriptionCount] = await Promise.all([
        pool.query(`SELECT COUNT(*) as count FROM parking_sessions ps WHERE ps.status = 'active' AND (${scope("ps")})`),
        pool.query(`SELECT COUNT(*) as count FROM parking_slots WHERE (${admin ? "true" : `company_id = ${user.company_id}`})`),
        pool.query(`SELECT COUNT(*) as count FROM parking_slots WHERE status = 'occupied' AND (${admin ? "true" : `company_id = ${user.company_id}`})`),
        pool.query(`SELECT COALESCE(SUM(amount),0) as total FROM parking_payments pp WHERE DATE(pp.payment_date) = CURRENT_DATE AND (${scope("pp")})`),
        pool.query(`SELECT COUNT(*) as count FROM parking_sessions ps WHERE DATE(ps.entry_time) = CURRENT_DATE AND (${scope("ps")})`),
        pool.query(`SELECT COUNT(*) as count FROM parking_sessions ps WHERE DATE(ps.exit_time) = CURRENT_DATE AND ps.status = 'completed' AND (${scope("ps")})`),
        pool.query(
          `SELECT ps.*, pv.plate_number, pv.vehicle_type, pv.owner_name,
            eg.name as entry_gate_name
           FROM parking_sessions ps
           LEFT JOIN parking_vehicles pv ON ps.vehicle_id = pv.id
           LEFT JOIN parking_gates eg ON ps.entry_gate_id = eg.id
           WHERE ps.status = 'active' AND (${scope("ps")})
           ORDER BY ps.entry_time DESC LIMIT 10`
        ),
        pool.query(`SELECT COUNT(*) as count FROM membership_members WHERE ${admin ? "true" : `company_id = ${user.company_id}`}`),
        pool.query(`SELECT COUNT(*) as count FROM parking_subscriptions WHERE status = 'active' AND ${admin ? "true" : `company_id = ${user.company_id}`}`),
      ]);

      return ok({
        activeSessions: parseInt(activeRes.rows[0].count),
        totalSlots: parseInt(totalSlots.rows[0].count),
        occupiedSlots: parseInt(occupiedSlots.rows[0].count),
        availableSlots: parseInt(totalSlots.rows[0].count) - parseInt(occupiedSlots.rows[0].count),
        todayRevenue: parseFloat(todayRevenue.rows[0].total),
        todayEntries: parseInt(todayEntries.rows[0].count),
        todayExits: parseInt(todayExits.rows[0].count),
        totalCustomers: parseInt(customerCount.rows[0].count),
        activeSubscriptions: parseInt(subscriptionCount.rows[0].count),
        recentSessions: recentSessions.rows,
      });
    } catch (e: any) {
      return err(e.message);
    }
  });
}
