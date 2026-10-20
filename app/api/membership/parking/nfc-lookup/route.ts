import { NextResponse } from "next/server";
import pool from "@/lib/db";
import { withAuth, ok, err, badRequest } from "@/lib/api-utils";
import { requirePermission } from "@/lib/permissions";
import { updateCardLastUsed } from "@/lib/rfid";
import { normalizeCardUid } from "@/lib/card-uid";

/**
 * POST /api/membership/parking/nfc-lookup
 * Cashier-facing lookup for an NFC/RFID tag: returns the member, their
 * registered plates and current/upcoming parking subscriptions.
 */
export async function POST(req: Request) {
  return withAuth(req, async (user) => {
    const { allowed } = await requirePermission(user, "view", "parking_subscriptions");
    if (!allowed) return err("Permission denied", 403);
    if (!user.company_id) return badRequest("Company required");

    const body = await req.json().catch(() => null);
    const rawUid = typeof body?.card_uid === "string" ? body.card_uid : "";
    if (!rawUid.trim()) return badRequest("Card UID is required");
    const cardUid = normalizeCardUid(rawUid);
    if (!cardUid) return badRequest("Card UID is required");

    try {
      const cardRes = await pool.query(
        `SELECT rc.*
         FROM rfid_cards rc
         WHERE rc.company_id = $1
           AND UPPER(REPLACE(REPLACE(REPLACE(rc.card_uid, ' ', ''), ':', ''), '-', '')) = $2
         LIMIT 1`,
        [user.company_id, cardUid]
      );
      const card = cardRes.rows[0];

      if (!card) {
        return ok({
          found: false,
          error: "CARD_NOT_FOUND",
          message: "This NFC card is not registered for this company",
        });
      }

      if (card.status !== "active") {
        return ok({
          found: false,
          error: "CARD_INACTIVE",
          message: `Card is ${card.status}`,
          card: {
            id: card.id,
            uid: card.card_uid,
            label: card.label,
            status: card.status,
            last_used_at: card.last_used_at,
          },
        });
      }

      if (!card.member_id) {
        return ok({
          found: false,
          error: "NO_MEMBER",
          message: "Card is not assigned to a member",
          card: {
            id: card.id,
            uid: card.card_uid,
            label: card.label,
            status: card.status,
            last_used_at: card.last_used_at,
          },
        });
      }

      const memberRes = await pool.query(
        `SELECT id, full_name, phone, email, customer_id, status, start_date, end_date, photo_url
         FROM membership_members
         WHERE id = $1 AND company_id = $2`,
        [card.member_id, user.company_id]
      );
      const member = memberRes.rows[0];

      if (!member) {
        return ok({
          found: false,
          error: "MEMBER_NOT_FOUND",
          message: "The member linked to this card no longer exists",
          card: {
            id: card.id,
            uid: card.card_uid,
            label: card.label,
            status: card.status,
            last_used_at: card.last_used_at,
          },
        });
      }

      const vehiclesRes = await pool.query(
        `SELECT id, plate_number, vehicle_type, vehicle_model, vehicle_color, is_blacklisted
         FROM parking_vehicles
         WHERE company_id = $1 AND customer_id = $2
         ORDER BY plate_number`,
        [user.company_id, member.id]
      );

      const subscriptionsRes = await pool.query(
        `SELECT ps.id, ps.plan_type, ps.start_date, ps.end_date, ps.amount, ps.status, ps.auto_renew,
                mp.name AS plan_name, mp.type AS plan_category, mp.duration_days,
                (ps.status = 'active' AND CURRENT_DATE BETWEEN ps.start_date AND ps.end_date) AS is_current,
                GREATEST(0, ps.end_date - CURRENT_DATE) AS days_remaining
         FROM parking_subscriptions ps
         LEFT JOIN membership_plans mp ON mp.id = ps.plan_id AND mp.company_id = ps.company_id
         WHERE ps.company_id = $1 AND ps.customer_id = $2
         ORDER BY (ps.status = 'active' AND CURRENT_DATE BETWEEN ps.start_date AND ps.end_date) DESC,
                  ps.end_date DESC
         LIMIT 20`,
        [user.company_id, member.id]
      );

      const subscriptions = subscriptionsRes.rows.map((sub: any) => ({
        ...sub,
        is_current: sub.is_current === true,
        days_remaining: Number(sub.days_remaining ?? 0),
      }));
      const current = subscriptions.find((sub: any) => sub.is_current) ?? null;

      await updateCardLastUsed(card.id);

      return NextResponse.json(
        {
          found: true,
          card: {
            id: card.id,
            uid: card.card_uid,
            label: card.label,
            status: card.status,
            last_used_at: new Date().toISOString(),
          },
          member,
          vehicles: vehiclesRes.rows,
          subscription: current,
          subscriptions,
          remaining_days: current?.days_remaining ?? 0,
        },
        { headers: { "Cache-Control": "no-store" } }
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "NFC lookup failed";
      return err(message);
    }
  });
}
