import pool from "@/lib/db";
import type { AuthUser } from "@/lib/api-utils";

export interface CardLookupResult {
  found: boolean;
  card?: any;
  member?: any;
  error?: string;
}

export interface AccessLogEntry {
  company_id?: number;
  card_uid: string;
  member_id: number | null;
  member_name: string | null;
  granted: boolean;
  reason: string;
  message: string;
  days_remaining: number;
  door_opened: boolean;
  plan_name?: string | null;
  subscription_id?: number | null;
  event_type?: string | null;
}

export async function lookupCard(
  card_uid: string,
  user: AuthUser
): Promise<CardLookupResult> {
  const cardRes = await pool.query(
    `SELECT rc.*,
        mm.full_name as member_name, mm.phone as member_phone,
        mm.customer_id as member_code,
        mm.start_date as member_start_date, mm.end_date as member_end_date,
        mm.plan_id,
        mp.name as plan_name, mp.type as plan_type
     FROM rfid_cards rc
     LEFT JOIN membership_members mm ON rc.member_id = mm.id
     LEFT JOIN membership_plans mp ON mm.plan_id = mp.id
     WHERE rc.card_uid = $1
       AND rc.company_id = $2`,
    [card_uid, user.company_id]
  );

  if (cardRes.rows.length === 0) {
    return { found: false, error: "CARD_NOT_FOUND" };
  }

  const card = cardRes.rows[0];

  if (card.status !== "active") {
    return {
      found: false,
      card,
      error: "CARD_INACTIVE",
    };
  }

  if (!card.member_id) {
    return {
      found: false,
      card,
      error: "NO_MEMBER",
    };
  }

  return {
    found: true,
    card,
    member: {
      id: card.member_id,
      name: card.member_name,
      phone: card.member_phone,
      code: card.member_code,
      plan_id: card.plan_id,
      plan_name: card.plan_name,
      plan_type: card.plan_type,
      start_date: card.member_start_date,
      end_date: card.member_end_date,
    },
  };
}

export async function logAccess(entry: AccessLogEntry): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO rfid_access_logs (company_id, card_uid, member_id, member_name, granted, reason, message, days_remaining, door_opened, plan_name, subscription_id, event_type)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [entry.company_id, entry.card_uid, entry.member_id, entry.member_name, entry.granted, entry.reason, entry.message, entry.days_remaining, entry.door_opened, entry.plan_name || null, entry.subscription_id || null, entry.event_type || null]
    );
  } catch {}
}

export async function updateCardLastUsed(cardId: number): Promise<void> {
  try {
    await pool.query("UPDATE rfid_cards SET last_used_at = CURRENT_TIMESTAMP WHERE id = $1", [cardId]);
  } catch {}
}

export function daysBetween(endDate: string | Date): number {
  return Math.max(0, Math.ceil((new Date(endDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24)));
}
