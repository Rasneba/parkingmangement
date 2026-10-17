import { NextResponse } from "next/server";
import pool from "@/lib/db";
import { openDoor } from "@/lib/access-control";
import { withAuth, ok, err, badRequest } from "@/lib/api-utils";
import { lookupCard, logAccess, updateCardLastUsed, daysBetween } from "@/lib/rfid";

export async function POST(req: Request) {
  return withAuth(req, async (user) => {
    try {
      const body = await req.json();
      const { card_uid, gate_id } = body;
      if (!card_uid) return badRequest("Card UID is required");

      const result = await lookupCard(card_uid, user);
      if (!result.found) {
        const reason = result.error || "CARD_NOT_FOUND";
        await logAccess({
          company_id: user.company_id,
          card_uid,
          member_id: null,
          member_name: null,
          granted: false,
          reason,
          message: result.card
            ? `Card is ${result.card.status}`
            : "RFID card not found in system",
          days_remaining: 0,
          door_opened: false,
        });
        return ok({
          granted: false,
          reason,
          message: result.card
            ? `Card is ${result.card.status}`
            : "RFID card not found in system",
          ...(result.card ? { card: { uid: result.card.card_uid, label: result.card.label, status: result.card.status } } : {}),
        });
      }

      if (!result.member) {
        await logAccess({
          company_id: user.company_id,
          card_uid,
          member_id: null,
          member_name: null,
          granted: false,
          reason: "NO_MEMBER",
          message: "Card is not assigned to any member",
          days_remaining: 0,
          door_opened: false,
        });
        return ok({
          granted: false,
          reason: "NO_MEMBER",
          message: "Card is not assigned to any member",
          card: { uid: result.card.card_uid, label: result.card.label },
        });
      }

      const today = new Date().toISOString().split("T")[0];
      const subRes = await pool.query(
        `SELECT ps.id, ps.status, ps.start_date, ps.end_date,
            mp.name as plan_name
         FROM parking_subscriptions ps
         LEFT JOIN membership_plans mp ON ps.plan_id = mp.id
         WHERE ps.customer_id = $1 AND ps.status IN ('active','pending') AND ps.start_date <= $2 AND ps.end_date >= $2
         ORDER BY ps.end_date DESC LIMIT 1`,
        [result.member.id, today]
      );

      if (subRes.rows.length === 0) {
        await logAccess({
          company_id: user.company_id,
          card_uid,
          member_id: result.member.id,
          member_name: result.member.name,
          granted: false,
          reason: "NO_ACTIVE_SUBSCRIPTION",
          message: "No active subscription covering today",
          days_remaining: 0,
          door_opened: false,
        });
        return ok({
          granted: false,
          reason: "NO_ACTIVE_SUBSCRIPTION",
          message: "No active subscription covering today",
          card: { uid: result.card.card_uid, label: result.card.label },
          member: { id: result.member.id, name: result.member.name },
          days_remaining: 0,
        });
      }

      const sub = subRes.rows[0];
      const daysRemaining = daysBetween(sub.end_date);

      await updateCardLastUsed(result.card.id);

      const gate = gate_id
        ? (await pool.query(
            "SELECT ip_address, port FROM parking_gates WHERE id = $1 AND company_id = $2",
            [gate_id, user.company_id]
          )).rows[0]
        : null;
      const ip = gate?.ip_address || "192.168.0.68";
      const port = gate?.port || 80;
      const doorUrl = `http://${ip}:${port}/cdor.cgi?open=1&door=0`;

      await logAccess({
        company_id: user.company_id,
        card_uid,
        member_id: result.member.id,
        member_name: result.member.name,
        granted: true,
        reason: "ACCESS_GRANTED",
        message: "Access granted",
        days_remaining: daysRemaining,
        door_opened: true,
        plan_name: sub.plan_name,
        subscription_id: sub.id,
      });

      return ok({
        granted: true,
        reason: "ACCESS_GRANTED",
        message: "Access granted",
        card: { uid: result.card.card_uid, label: result.card.label },
        member: { id: result.member.id, name: result.member.name },
        subscription: { id: sub.id, end_date: sub.end_date, plan_name: sub.plan_name },
        days_remaining: daysRemaining,
        doorUrl,
      });
    } catch (e: any) { return err(e.message); }
  });
}
