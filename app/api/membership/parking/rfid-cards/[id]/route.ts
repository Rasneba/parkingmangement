import { NextResponse } from "next/server";
import pool from "@/lib/db";
import { withAuth, ok, err, deleted, badRequest } from "@/lib/api-utils";
import { requirePermission } from "@/lib/permissions";
import { normalizeCardUid } from "@/lib/card-uid";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return withAuth(req, async (user) => {
    const { allowed } = await requirePermission(user, "view", "parking_rfid_cards");
    if (!allowed) return NextResponse.json({ error: "Permission denied" }, { status: 403 });
    const { id } = await params;
    try {
      const result = await pool.query(
        `SELECT rc.*,
            mm.full_name as member_name, mm.phone as member_phone, mm.customer_id as member_code,
            u.name as created_by_name
         FROM rfid_cards rc
         LEFT JOIN membership_members mm ON rc.member_id = mm.id
         LEFT JOIN users u ON rc.created_by = u.id
         WHERE rc.id = $1 AND rc.company_id = $2`,
        [id, user.company_id]
      );
      if (result.rows.length === 0) return NextResponse.json({ error: "Card not found" }, { status: 404 });
      return ok(result.rows[0]);
    } catch (e: any) { return err(e.message); }
  });
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return withAuth(req, async (user) => {
    const { allowed } = await requirePermission(user, "edit", "parking_rfid_cards");
    if (!allowed) return NextResponse.json({ error: "Permission denied" }, { status: 403 });
      const { id } = await params;
      try {
        const body = await req.json();
        if (body.card_uid !== undefined) {
          body.card_uid = normalizeCardUid(body.card_uid);
          if (!body.card_uid) return badRequest("Card UID is required");
          const duplicate = await pool.query(
            `SELECT id FROM rfid_cards
             WHERE company_id = $1 AND id <> $2
               AND UPPER(REPLACE(REPLACE(REPLACE(card_uid, ' ', ''), ':', ''), '-', '')) = $3`,
            [user.company_id, id, body.card_uid]
          );
          if (duplicate.rows[0]) return badRequest("Card UID already exists");
        }
        if (body.member_id) {
          const member = await pool.query(
            "SELECT id FROM membership_members WHERE id = $1 AND company_id = $2",
            [body.member_id, user.company_id]
          );
          if (!member.rows[0]) return badRequest("Member not found");
        }

        const allowedFields = ["card_uid", "member_id", "label", "status"];
        const sets: string[] = [];
        const vals: any[] = [];
        let idx = 1;
        for (const key of allowedFields) {
          if (body[key] !== undefined) { sets.push(`${key} = $${idx}`); vals.push(body[key]); idx++; }
        }
        if (sets.length === 0) return NextResponse.json({ error: "No fields to update" }, { status: 400 });
        sets.push("updated_at = CURRENT_TIMESTAMP");
        vals.push(id);
        vals.push(user.company_id);
        const result = await pool.query(
          `UPDATE rfid_cards SET ${sets.join(", ")}
           WHERE id = $${idx} AND company_id = $${idx + 1} RETURNING *`,
          vals
        );
        if (result.rows.length === 0) return NextResponse.json({ error: "Card not found" }, { status: 404 });
        return ok(result.rows[0]);
      } catch (e: any) { return err(e.message); }
  });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return withAuth(req, async (user) => {
    const { allowed } = await requirePermission(user, "delete", "parking_rfid_cards");
    if (!allowed) return NextResponse.json({ error: "Permission denied" }, { status: 403 });
      const { id } = await params;
      try {
        const result = await pool.query(
          "DELETE FROM rfid_cards WHERE id = $1 AND company_id = $2 RETURNING id",
          [id, user.company_id]
        );
        if (result.rows.length === 0) return NextResponse.json({ error: "Card not found" }, { status: 404 });
        return deleted("Card");
      } catch (e: any) { return err(e.message); }
  });
}
