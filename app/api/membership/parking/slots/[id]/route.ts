import pool from "@/lib/db";
import { createItemHandlers } from "@/lib/crud";

/**
 * Single parking space. Deleting is refused while an active session occupies
 * the space — close or move that session first (safe workflow).
 */
export const { GET, PUT, DELETE } = createItemHandlers({
  table: "parking_slots",
  resource: "parking_slots",
  columns: ["zone_id", "slot_number", "floor", "status", "type", "current_session_id"],
  auditEntity: "parking_slot",
  deleteGuard: async (existing) => {
    const active = await pool.query(
      `SELECT id, ticket_number FROM parking_sessions WHERE slot_id = $1 AND status = 'active' LIMIT 1`,
      [existing.id]
    );
    if (active.rows[0]) {
      return `Space ${existing.slot_number} still has an active session (${active.rows[0].ticket_number}). Close that session before deleting.`;
    }
    if (existing.status === "occupied" || existing.current_session_id) {
      return `Space ${existing.slot_number} is marked occupied. Release it before deleting.`;
    }
    return null;
  },
});
