import pool from "@/lib/db";
import { withAuth, ok, err, badRequest, isSuperAdmin } from "@/lib/api-utils";
import { requirePermission } from "@/lib/permissions";

/**
 * GET /api/membership/parking/reports?type=<type>&from&to&zone_id&method
 *
 * Reporting center backend. Every report reads the same authoritative tables
 * the operational system writes, so report totals always reconcile.
 *
 * Types: revenue | entries | occupancy | duration | vehicles | cashier |
 *        methods | outstanding | adjustments | zones | subscriptions
 */
export async function GET(req: Request) {
  return withAuth(req, async (user) => {
    const perm = await requirePermission(user, "view", "parking_reports");
    if (!perm.allowed) return err("Permission denied", 403);

    const { searchParams } = new URL(req.url);
    const type = searchParams.get("type") || "revenue";
    const now = new Date();
    const to = searchParams.get("to") || now.toISOString().slice(0, 10);
    const from = searchParams.get("from") || new Date(now.getTime() - 29 * 86400000).toISOString().slice(0, 10);
    const zoneId = Number(searchParams.get("zone_id")) || null;
    const method = searchParams.get("method") || null;

    const companyId: number | null = isSuperAdmin(user) ? null : (user.company_id ?? null);
    const cpFor = (alias: string) => `(${alias}.company_id = $1 OR $1::int IS NULL)`;
    const qp = (...rest: unknown[]) => [companyId, ...rest];
    const P = (arr: unknown[], v: unknown) => {
      arr.push(v);
      return `$${arr.length}`;
    };

    const zoneJoinSite = zoneId
      ? ` JOIN parking_slots sl ON sl.id = ps.slot_id AND sl.zone_id = ${zoneId} `
      : "";
    const zoneJoinPay = zoneId
      ? ` JOIN parking_sessions ps ON ps.id = pp.session_id JOIN parking_slots sl ON sl.id = ps.slot_id AND sl.zone_id = ${zoneId} `
      : "";

    try {
      switch (type) {
        case "revenue": {
          const res = await pool.query(
            `SELECT pp.payment_date::date AS day,
                    COUNT(*)::int AS transactions,
                    COALESCE(SUM(pp.amount),0)::float AS total,
                    COALESCE(SUM(pp.amount) FILTER (WHERE pp.payment_method = 'cash'),0)::float AS cash,
                    COALESCE(SUM(pp.amount) FILTER (WHERE pp.payment_method <> 'cash'),0)::float AS digital
             FROM parking_payments pp ${zoneJoinPay}
             WHERE ${cpFor("pp")} AND pp.payment_date::date BETWEEN $2 AND $3
               ${method ? `AND pp.payment_method = $4` : ""}
             GROUP BY 1 ORDER BY 1`,
            qp(from, to)
          );
          return ok({ type, rows: res.rows });
        }
        case "entries": {
          const res = await pool.query(
            `SELECT ps.entry_time::date AS day,
                    COUNT(*)::int AS entries,
                    COUNT(ps.exit_time)::int AS exits,
                    COUNT(*) FILTER (WHERE ps.exit_time IS NULL AND ps.status = 'active')::int AS still_inside,
                    AVG(ps.duration_minutes)::float AS avg_duration_min
             FROM parking_sessions ps ${zoneJoinSite}
             WHERE ${cpFor("ps")} AND ps.entry_time::date BETWEEN $2 AND $3
             GROUP BY 1 ORDER BY 1`,
            qp(from, to)
          );
          return ok({ type, rows: res.rows });
        }
        case "occupancy": {
          const res = await pool.query(
            `SELECT d.day::date AS day,
                    z.id AS zone_id, z.name AS zone, z.floor,
                    COUNT(DISTINCT s.id)::int AS capacity,
                    COUNT(DISTINCT ps.id)::int AS occupied_sessions
             FROM generate_series($2::date, $3::date, interval '1 day') d(day)
             CROSS JOIN parking_zones z
             LEFT JOIN parking_slots s ON s.zone_id = z.id
             LEFT JOIN parking_sessions ps ON ps.slot_id = s.id
                  AND d.day >= ps.entry_time::date
                  AND COALESCE(ps.exit_time::date, CURRENT_DATE) >= d.day
             WHERE ${cpFor("z")} ${zoneId ? `AND z.id = ${zoneId}` : ""}
             GROUP BY 1, 2, 3, 4 ORDER BY 1, z.name`,
            qp(from, to)
          );
          return ok({ type, rows: res.rows });
        }
        case "duration": {
          const res = await pool.query(
            `SELECT bucket, COUNT(*)::int AS sessions,
                    COALESCE(SUM(ps.amount),0)::float AS revenue
             FROM parking_sessions ps ${zoneJoinSite}
             CROSS JOIN LATERAL (
               SELECT CASE
                 WHEN ps.duration_minutes IS NULL THEN 'incomplete'
                 WHEN ps.duration_minutes < 30 THEN 'Under 30 min'
                 WHEN ps.duration_minutes < 60 THEN '30–60 min'
                 WHEN ps.duration_minutes < 120 THEN '1–2 hours'
                 WHEN ps.duration_minutes < 240 THEN '2–4 hours'
                 WHEN ps.duration_minutes < 480 THEN '4–8 hours'
                 WHEN ps.duration_minutes < 1440 THEN '8–24 hours'
                 ELSE 'Over 24 hours' END AS bucket) b
             WHERE ${cpFor("ps")} AND ps.status = 'completed' AND ps.entry_time::date BETWEEN $2 AND $3
             GROUP BY 1`,
            qp(from, to)
          );
          const order = ["Under 30 min", "30–60 min", "1–2 hours", "2–4 hours", "4–8 hours", "8–24 hours", "Over 24 hours", "incomplete"];
          res.rows.sort((a: any, b: any) => order.indexOf(a.bucket) - order.indexOf(b.bucket));
          return ok({ type, rows: res.rows });
        }
        case "vehicles": {
          const res = await pool.query(
            `SELECT COALESCE(pv.vehicle_type, ps.vehicle_type_snapshot, 'other') AS vehicle_type,
                    COUNT(*)::int AS sessions,
                    COUNT(DISTINCT ps.vehicle_id)::int AS distinct_vehicles,
                    COALESCE(AVG(ps.duration_minutes),0)::float AS avg_duration_min,
                    COALESCE(SUM(ps.amount),0)::float AS revenue
             FROM parking_sessions ps
             LEFT JOIN parking_vehicles pv ON pv.id = ps.vehicle_id
             ${zoneJoinSite}
             WHERE ${cpFor("ps")} AND ps.entry_time::date BETWEEN $2 AND $3
             GROUP BY 1 ORDER BY 2 DESC`,
            qp(from, to)
          );
          return ok({ type, rows: res.rows });
        }
        case "cashier": {
          const res = await pool.query(
            `SELECT COALESCE(uo.name, us.name, 'Unattributed') AS operator,
                    COALESCE(uo.email, us.email) AS email,
                    pp.payment_date::date AS day,
                    COUNT(*)::int AS transactions,
                    COALESCE(SUM(pp.amount),0)::float AS collected,
                    COALESCE(SUM(pp.amount) FILTER (WHERE pp.payment_method = 'cash'),0)::float AS cash,
                    COALESCE(SUM(pp.amount) FILTER (WHERE pp.payment_method <> 'cash'),0)::float AS digital
             FROM parking_payments pp
             JOIN parking_sessions ps2 ON ps2.id = pp.session_id
             LEFT JOIN users uo ON uo.id = pp.created_by
             LEFT JOIN users us ON us.id = ps2.exit_operator_id
             WHERE ${cpFor("pp")} AND pp.payment_date::date BETWEEN $2 AND $3
             GROUP BY 1, 2, 3 ORDER BY 3 DESC, 5 DESC`,
            qp(from, to)
          );
          return ok({ type, rows: res.rows });
        }
        case "methods": {
          const res = await pool.query(
            `SELECT pp.payment_method, COUNT(*)::int AS transactions,
                    COALESCE(SUM(pp.amount),0)::float AS total,
                    ROUND(100.0 * COALESCE(SUM(pp.amount),0) / NULLIF(SUM(SUM(pp.amount)) OVER (), 0), 1)::float AS share_pct
             FROM parking_payments pp ${zoneJoinPay}
             WHERE ${cpFor("pp")} AND pp.payment_date::date BETWEEN $2 AND $3
             GROUP BY 1 ORDER BY 3 DESC`,
            qp(from, to)
          );
          return ok({ type, rows: res.rows });
        }
        case "outstanding": {
          const res = await pool.query(
            `SELECT ps.id, ps.ticket_number, ps.plate_number, ps.entry_time,
                    DATE_PART('hour', NOW() - ps.entry_time)::int AS hours_parked,
                    COALESCE(NULLIF(ps.gross_amount - ps.discount_amount - ps.amount_paid, 0), ps.amount, 0)::float AS amount_due,
                    z.name AS zone, s.slot_number
             FROM parking_sessions ps
             LEFT JOIN parking_slots s ON s.id = ps.slot_id
             LEFT JOIN parking_zones z ON z.id = s.zone_id
             ${zoneJoinSite}
             WHERE ${cpFor("ps")} AND ps.status = 'active' AND ps.payment_status = 'unpaid'
               AND ps.entry_time::date BETWEEN $2 AND $3
             ORDER BY ps.entry_time LIMIT 500`,
            qp(from, to)
          );
          return ok({ type, rows: res.rows });
        }
        case "adjustments": {
          const [disc, ref] = await Promise.all([
            pool.query(
              `SELECT 'discount' AS kind, d.created_at AS date, d.code, d.discount_type,
                      d.value::float, d.computed_amount::float AS amount, d.reason,
                      u.name AS operator, ps.ticket_number
               FROM parking_discounts d
               LEFT JOIN users u ON u.id = d.applied_by
               LEFT JOIN parking_sessions ps ON ps.id = d.session_id
               WHERE ${cpFor("d")} AND d.created_at::date BETWEEN $2 AND $3
               ORDER BY d.created_at DESC`,
              qp(from, to)
            ),
            pool.query(
              `SELECT 'refund' AS kind, r.created_at AS date, NULL AS code, NULL AS discount_type,
                      r.amount::float AS value, r.amount::float AS amount, r.reason,
                      u.name AS operator, ps.ticket_number
               FROM parking_refunds r
               LEFT JOIN users u ON u.id = r.requested_by
               LEFT JOIN parking_sessions ps ON ps.id = r.session_id
               WHERE ${cpFor("r")} AND r.created_at::date BETWEEN $2 AND $3 AND r.status <> 'rejected'
               ORDER BY r.created_at DESC`,
              qp(from, to)
            ),
          ]);
          return ok({ type, rows: [...disc.rows, ...ref.rows] });
        }
        case "zones": {
          const res = await pool.query(
            `SELECT z.name AS zone, z.code, z.floor,
                    COUNT(DISTINCT s.id)::int AS capacity,
                    COUNT(DISTINCT ps.id)::int AS sessions,
                    COALESCE(SUM(ps.amount),0)::float AS revenue,
                    COALESCE(AVG(ps.duration_minutes),0)::float AS avg_duration_min
             FROM parking_zones z
             LEFT JOIN parking_slots s ON s.zone_id = z.id
             LEFT JOIN parking_sessions ps ON ps.slot_id = s.id
                  AND ps.entry_time::date BETWEEN $2 AND $3
                  AND ps.status IN ('completed','active')
             WHERE ${cpFor("z")} ${zoneId ? `AND z.id = ${zoneId}` : ""}
             GROUP BY z.id, z.name, z.code, z.floor ORDER BY z.name`,
            qp(from, to)
          );
          return ok({ type, rows: res.rows });
        }
        case "subscriptions": {
          const res = await pool.query(
            `SELECT s.id, mm.full_name AS customer, pv.plate_number, s.plan_type,
                    s.start_date, s.end_date, s.amount::float, s.status, s.auto_renew,
                    GREATEST(0, s.end_date - CURRENT_DATE) AS days_remaining
             FROM parking_subscriptions s
             LEFT JOIN membership_members mm ON mm.id = s.customer_id
             LEFT JOIN parking_vehicles pv ON pv.id = s.vehicle_id
             WHERE ${cpFor("s")} AND s.start_date <= $3::date
               AND (s.end_date >= $2::date OR s.status = 'active')
             ORDER BY s.end_date DESC LIMIT 1000`,
            qp(from, to)
          );
          return ok({ type, rows: res.rows });
        }
        default:
          return badRequest(`Unknown report type '${type}'`);
      }
    } catch (e: any) {
      return err(e.message);
    }
  });
}
