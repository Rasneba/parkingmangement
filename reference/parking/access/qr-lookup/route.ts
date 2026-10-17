import { NextResponse } from "next/server";
import pool from "@/lib/db";
import { withAuth, ok, err, badRequest } from "@/lib/api-utils";
import { logAccess, daysBetween } from "@/lib/rfid";

export async function POST(req: Request) {
  return withAuth(req, async (user) => {
    try {
      const body = await req.json();
      const { subscription_id, company_id } = body;
      if (!subscription_id) return badRequest("subscription_id is required");

      const cid = company_id || user.company_id;

      const subRes = await pool.query(
        `SELECT ps.*,
          mm.full_name as member_name, mm.phone as member_phone, mm.customer_id as member_code,
          mp.name as plan_name, mp.duration_days as plan_duration_days
         FROM parking_subscriptions ps
         JOIN membership_members mm ON ps.customer_id = mm.id
         LEFT JOIN membership_plans mp ON ps.plan_id = mp.id
         WHERE ps.id = $1 AND ps.company_id = $2`,
        [subscription_id, cid]
      );

      if (subRes.rows.length === 0) {
        await logAccess({
          company_id: cid, card_uid: `QR-${subscription_id}`, member_id: null,
          member_name: null, granted: false, reason: "SUBSCRIPTION_NOT_FOUND",
          message: "QR subscription not found", days_remaining: 0, door_opened: false,
          event_type: "QR_SCAN",
        });
        return ok({ granted: false, reason: "SUBSCRIPTION_NOT_FOUND", message: "QR subscription not found" });
      }

      const sub = subRes.rows[0];
      const today = new Date().toISOString().split("T")[0];

      const recentScan = await pool.query(
        `SELECT id FROM rfid_access_logs
         WHERE subscription_id = $1 AND event_type = 'QR_SCAN' AND granted = true
         AND created_at > NOW() - INTERVAL '5 seconds'
         ORDER BY created_at DESC LIMIT 1`,
        [sub.id]
      );
      if (recentScan.rows.length > 0) {
        return ok({
          granted: true, reason: "ACCESS_GRANTED", message: "Access granted (deduplicated)",
          member: { id: sub.customer_id, name: sub.member_name, phone: sub.member_phone, code: sub.member_code },
          subscription: { id: sub.id, status: sub.status, end_date: sub.end_date, plan_name: sub.plan_name },
          days_remaining: daysBetween(sub.end_date),
        });
      }

      const denyChecks = [
        { cond: sub.status === "cancelled", reason: "SUBSCRIPTION_CANCELLED", msg: "Subscription is cancelled" },
        { cond: sub.status === "expired" || sub.end_date < today, reason: "SUBSCRIPTION_EXPIRED", msg: "Subscription has expired" },
        { cond: sub.status === "frozen" || (sub.freeze_start && sub.freeze_end && today >= sub.freeze_start && today <= sub.freeze_end), reason: "SUBSCRIPTION_FROZEN", msg: "Subscription is frozen" },
        { cond: sub.start_date > today, reason: "SUBSCRIPTION_NOT_STARTED", msg: "Subscription not yet active" },
      ];

      for (const check of denyChecks) {
        if (check.cond) {
          await logAccess({
            company_id: cid, card_uid: `QR-${subscription_id}`,
            member_id: sub.customer_id, member_name: sub.member_name,
            granted: false, reason: check.reason, message: check.msg,
            days_remaining: 0, door_opened: false,
            plan_name: sub.plan_name, subscription_id: sub.id, event_type: "QR_SCAN",
          });
          return ok({
            granted: false, reason: check.reason, message: check.msg,
            member: { id: sub.customer_id, name: sub.member_name },
            subscription: { id: sub.id, status: sub.status, plan_name: sub.plan_name },
          });
        }
      }

      const daysRemaining = daysBetween(sub.end_date);

      await logAccess({
        company_id: cid, card_uid: `QR-${subscription_id}`,
        member_id: sub.customer_id, member_name: sub.member_name,
        granted: true, reason: "ACCESS_GRANTED", message: "QR access granted",
        days_remaining: daysRemaining, door_opened: true,
        plan_name: sub.plan_name, subscription_id: sub.id, event_type: "QR_SCAN",
      });

      await pool.query(
        `INSERT INTO relay_commands (company_id, action, payload, status) VALUES ($1, 'open_door', $2, 'pending')`,
        [cid, JSON.stringify({ source: "QR_SCAN", subscription_id: sub.id })]
      );

      return ok({
        granted: true, reason: "ACCESS_GRANTED", message: "Access granted",
        member: { id: sub.customer_id, name: sub.member_name, phone: sub.member_phone, code: sub.member_code },
        subscription: { id: sub.id, status: sub.status, end_date: sub.end_date, plan_name: sub.plan_name },
        days_remaining: daysRemaining,
      });
    } catch (e: any) {
      return err(e.message);
    }
  });
}
