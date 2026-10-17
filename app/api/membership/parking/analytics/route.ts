import pool from "@/lib/db";
import { withAuth, ok, err, isSuperAdmin } from "@/lib/api-utils";
import { requirePermission } from "@/lib/permissions";

/**
 * GET /api/membership/parking/analytics?from=YYYY-MM-DD&to=YYYY-MM-DD&site_id=N
 *
 * Single aggregate endpoint powering the premium dashboard: the KPI block (with
 * previous-period comparisons) plus every chart series. All numbers derive from
 * parking_sessions / parking_payments / parking_slots — nothing is invented.
 *
 * Param convention: $1 is always the company id (NULL = all companies for
 * super admins), so every query gets its own positional array starting there.
 */
export async function GET(req: Request) {
  return withAuth(req, async (user) => {
    const view = await requirePermission(user, "view", "parking_reports");
    if (!view.allowed) {
      const dash = await requirePermission(user, "view", "parking_zones");
      if (!dash.allowed) return err("Permission denied", 403);
    }

    const { searchParams } = new URL(req.url);
    const now = new Date();
    const to = searchParams.get("to") || now.toISOString().slice(0, 10);
    const from = searchParams.get("from") || new Date(now.getTime() - 6 * 86400000).toISOString().slice(0, 10);
    const siteId = Number(searchParams.get("site_id")) || null;

    const companyId: number | null = isSuperAdmin(user) ? null : (user.company_id ?? null);
    /** Company predicate with alias; $1 = companyId (NULL sees everything). */
    const cpFor = (alias: string) => `(${alias}.company_id = $1 OR $1::int IS NULL)`;
    /** Fresh per-query param array: [companyId, ...rest]. */
    const qp = (...rest: unknown[]) => [companyId, ...rest];
    const P = (arr: unknown[], v: unknown) => {
      arr.push(v);
      return `$${arr.length}`;
    };

    const siteZones = siteId ? `(SELECT id FROM parking_zones WHERE site_id = ${siteId})` : null;
    const sesSite = siteZones ? ` AND ps.slot_id IN (SELECT s.id FROM parking_slots s WHERE s.zone_id IN ${siteZones})` : "";
    const paySite = siteZones ? ` AND pp.session_id IN (SELECT ps2.id FROM parking_sessions ps2 WHERE ps2.slot_id IN (SELECT s.id FROM parking_slots s WHERE s.zone_id IN ${siteZones}))` : "";

    try {
      const [capRes, kpiRes, hourlyRes, revenueRes, methodRes, zoneRes, vtypeRes, subSplitRes, unpaidRes, recentRes, dailyRes, occByDayRes] = await Promise.all([
        pool.query(
          `SELECT COUNT(*)::int AS total,
                  COUNT(*) FILTER (WHERE s.status = 'occupied')::int AS occupied,
                  COUNT(*) FILTER (WHERE s.status = 'reserved')::int AS reserved,
                  COUNT(*) FILTER (WHERE s.status = 'maintenance')::int AS maintenance,
                  COUNT(*) FILTER (WHERE s.type = 'disabled')::int AS accessible
           FROM parking_slots s
           WHERE ${cpFor("s")} ${siteZones ? `AND s.zone_id IN ${siteZones}` : ""}`,
          qp()
        ),
        pool.query(
          `SELECT
             (SELECT COUNT(*)::int FROM parking_sessions ps WHERE ${cpFor("ps")} AND ps.status = 'active' ${sesSite}) AS vehicles_inside,
             (SELECT COUNT(*)::int FROM parking_sessions ps WHERE ${cpFor("ps")} AND ps.entry_time::date = CURRENT_DATE ${sesSite}) AS entries_today,
             (SELECT COUNT(*)::int FROM parking_sessions ps WHERE ${cpFor("ps")} AND ps.exit_time::date = CURRENT_DATE ${sesSite}) AS exits_today,
             (SELECT COUNT(*)::int FROM parking_sessions ps WHERE ${cpFor("ps")} AND ps.entry_time::date = CURRENT_DATE - 1 ${sesSite}) AS entries_yesterday,
             (SELECT COUNT(*)::int FROM parking_sessions ps WHERE ${cpFor("ps")} AND ps.exit_time::date = CURRENT_DATE - 1 ${sesSite}) AS exits_yesterday,
             (SELECT COALESCE(SUM(pp.amount),0)::float FROM parking_payments pp WHERE ${cpFor("pp")} AND pp.payment_date::date = CURRENT_DATE ${paySite}) AS revenue_today,
             (SELECT COALESCE(SUM(pp.amount),0)::float FROM parking_payments pp WHERE ${cpFor("pp")} AND pp.payment_date::date = CURRENT_DATE - 1 ${paySite}) AS revenue_yesterday,
             (SELECT COUNT(*)::int FROM parking_sessions ps WHERE ${cpFor("ps")} AND ps.status = 'active' AND ps.payment_status = 'unpaid' AND ps.entry_time < CURRENT_DATE ${sesSite}) AS unpaid_overnight,
             (SELECT COUNT(*)::int FROM parking_subscriptions x WHERE ${cpFor("x")} AND x.status = 'active' AND x.end_date >= CURRENT_DATE) AS active_subscriptions,
             (SELECT COALESCE(SUM(x.amount),0)::float FROM parking_subscriptions x WHERE ${cpFor("x")} AND x.status = 'active' AND x.start_date <= CURRENT_DATE AND x.end_date >= CURRENT_DATE) AS subscription_mrr
           `,
          qp()
        ),
        pool.query(
          `SELECT EXTRACT(HOUR FROM ps.entry_time)::int AS hour,
                  COUNT(*)::int AS entries,
                  COUNT(ps.exit_time)::int AS exits
           FROM parking_sessions ps
           WHERE ${cpFor("ps")} AND ps.entry_time::date BETWEEN $2 AND $3 ${sesSite}
           GROUP BY 1 ORDER BY 1`,
          qp(from, to)
        ),
        pool.query(
          `SELECT pp.payment_date::date AS day, COALESCE(SUM(pp.amount),0)::float AS total, COUNT(*)::int AS tx
           FROM parking_payments pp
           WHERE ${cpFor("pp")} AND pp.payment_date::date BETWEEN $2 AND $3 ${paySite}
           GROUP BY 1 ORDER BY 1`,
          qp(from, to)
        ),
        pool.query(
          `SELECT pp.payment_method, COALESCE(SUM(pp.amount),0)::float AS total, COUNT(*)::int AS tx
           FROM parking_payments pp
           WHERE ${cpFor("pp")} AND pp.payment_date::date BETWEEN $2 AND $3 ${paySite}
           GROUP BY 1 ORDER BY 2 DESC`,
          qp(from, to)
        ),
        pool.query(
          `SELECT z.id AS zone_id, z.name, z.code, z.floor, z.type,
                  COUNT(s.id)::int AS capacity,
                  COUNT(s.id) FILTER (WHERE s.status = 'occupied')::int AS occupied,
                  COUNT(s.id) FILTER (WHERE s.status = 'reserved')::int AS reserved,
                  COUNT(s.id) FILTER (WHERE s.status = 'maintenance')::int AS maintenance
           FROM parking_zones z LEFT JOIN parking_slots s ON s.zone_id = z.id
           WHERE ${cpFor("z")} AND z.is_active = true ${siteZones ? `AND z.site_id = ${siteId}` : ""}
           GROUP BY z.id ORDER BY z.floor NULLS LAST, z.code`,
          qp()
        ),
        pool.query(
          `SELECT COALESCE(pv.vehicle_type, ps.vehicle_type_snapshot, 'other') AS vehicle_type, COUNT(*)::int AS count
           FROM parking_sessions ps LEFT JOIN parking_vehicles pv ON pv.id = ps.vehicle_id
           WHERE ${cpFor("ps")} AND ps.entry_time::date BETWEEN $2 AND $3 ${sesSite}
           GROUP BY 1 ORDER BY 2 DESC`,
          qp(from, to)
        ),
        pool.query(
          `SELECT COALESCE(SUM(pp.amount) FILTER (
              WHERE EXISTS (
                SELECT 1 FROM parking_subscriptions sx
                WHERE sx.company_id = pp.company_id
                  AND sx.status IN ('active','expired')
                  AND pp.payment_date::date BETWEEN sx.start_date AND sx.end_date
                  AND (sx.vehicle_id = pv.id
                       OR sx.customer_id = pv.customer_id)
              )), 0)::float AS subscription_revenue
           FROM parking_payments pp
           JOIN parking_sessions ps ON ps.id = pp.session_id
           LEFT JOIN parking_vehicles pv ON pv.id = ps.vehicle_id
           WHERE ${cpFor("pp")} AND pp.payment_date::date BETWEEN $2 AND $3 ${paySite}`,
          qp(from, to)
        ),
        pool.query(
          `SELECT COALESCE(SUM(ps.gross_amount - ps.discount_amount - ps.amount_paid), SUM(ps.amount), 0)::float AS amount, COUNT(*)::int AS count
           FROM parking_sessions ps
           WHERE ${cpFor("ps")} AND ps.status = 'active' AND ps.payment_status = 'unpaid' ${sesSite}`,
          qp()
        ),
        pool.query(
          `SELECT ps.id, ps.ticket_number, ps.plate_number, ps.entry_time, ps.exit_time, ps.status, ps.payment_status, ps.amount,
                  pv.vehicle_type, pv.owner_name, z.name AS zone_name, s.slot_number
           FROM parking_sessions ps
           LEFT JOIN parking_vehicles pv ON pv.id = ps.vehicle_id
           LEFT JOIN parking_slots s ON s.id = ps.slot_id
           LEFT JOIN parking_zones z ON z.id = s.zone_id
           WHERE ${cpFor("ps")} ${sesSite}
           ORDER BY GREATEST(ps.entry_time, COALESCE(ps.exit_time, ps.entry_time)) DESC LIMIT 12`,
          qp()
        ),
        pool.query(
          `SELECT d.day::date AS day, COUNT(ps.id)::int AS entries
           FROM generate_series($2::date, $3::date, interval '1 day') AS d(day)
           LEFT JOIN parking_sessions ps ON ${cpFor("ps")} AND ps.entry_time::date = d.day::date ${sesSite}
           GROUP BY 1 ORDER BY 1`,
          qp(from, to)
        ),
        pool.query(
          `SELECT d.day::date AS day,
                  COUNT(DISTINCT ps.id)::int AS occupied
           FROM generate_series($2::date, $3::date, interval '1 day') AS d(day)
           LEFT JOIN parking_sessions ps ON ${cpFor("ps")}
                AND ps.entry_time::date <= d.day::date
                AND COALESCE(ps.exit_time::date, CURRENT_DATE) >= d.day::date
                AND ps.status IN ('active','completed')
                ${sesSite}
           GROUP BY 1 ORDER BY 1`,
          qp(from, to)
        ),
      ]);

      const cap = capRes.rows[0] || {};
      const k = kpiRes.rows[0] || {};
      const totalSlots = Number(cap.total) || 0;
      const occupied = Number(cap.occupied) || 0;
      const occupancyPct = totalSlots > 0 ? Math.round((occupied / totalSlots) * 1000) / 10 : 0;

      const methodRows = methodRes.rows.map((r: any) => ({ method: r.payment_method, total: Number(r.total), tx: Number(r.tx) }));
      const rangeRevenueTotal = methodRows.reduce((a: number, b: any) => a + b.total, 0);
      const subscriptionRevenue = Number(subSplitRes.rows[0]?.subscription_revenue) || 0;
      const dayStr = (d: any) => (typeof d === "string" ? d.slice(0, 10) : new Date(d).toISOString().slice(0, 10));

      return ok({
        range: { from, to },
        capacity: {
          total: totalSlots,
          occupied,
          available: Math.max(0, totalSlots - occupied),
          reserved: Number(cap.reserved) || 0,
          maintenance: Number(cap.maintenance) || 0,
          accessible: Number(cap.accessible) || 0,
          occupancyPct,
        },
        kpis: {
          vehiclesInside: Number(k.vehicles_inside) || 0,
          entriesToday: Number(k.entries_today) || 0,
          exitsToday: Number(k.exits_today) || 0,
          entriesYesterday: Number(k.entries_yesterday) || 0,
          exitsYesterday: Number(k.exits_yesterday) || 0,
          revenueToday: Number(k.revenue_today) || 0,
          revenueYesterday: Number(k.revenue_yesterday) || 0,
          unpaidOvernight: Number(k.unpaid_overnight) || 0,
          unpaidAmount: Number(unpaidRes.rows[0]?.amount) || 0,
          unpaidCount: Number(unpaidRes.rows[0]?.count) || 0,
          activeSubscriptions: Number(k.active_subscriptions) || 0,
          subscriptionMrr: Number(k.subscription_mrr) || 0,
          rangeRevenueTotal,
        },
        charts: {
          hourly: hourlyRes.rows.map((r: any) => ({ hour: Number(r.hour), entries: Number(r.entries), exits: Number(r.exits) })),
          revenueByDay: revenueRes.rows.map((r: any) => ({ day: dayStr(r.day), total: Number(r.total), transactions: Number(r.tx) })),
          revenueByMethod: methodRows,
          zones: zoneRes.rows.map((r: any) => ({
            zoneId: r.zone_id, name: r.name, code: r.code, floor: r.floor, type: r.type,
            capacity: Number(r.capacity), occupied: Number(r.occupied),
            reserved: Number(r.reserved), maintenance: Number(r.maintenance),
          })),
          vehicleTypes: vtypeRes.rows.map((r: any) => ({ type: r.vehicle_type, count: Number(r.count) })),
          subscriptionRevenue,
          casualRevenue: Math.max(0, rangeRevenueTotal - subscriptionRevenue),
          dailyEntries: dailyRes.rows.map((r: any) => ({ day: dayStr(r.day), entries: Number(r.entries) })),
          occupancyByDay: occByDayRes.rows.map((r: any) => ({
            day: dayStr(r.day),
            occupied: Number(r.occupied),
            pct: totalSlots > 0 ? Math.round((Number(r.occupied) / totalSlots) * 1000) / 10 : 0,
          })),
        },
        recent: recentRes.rows,
      });
    } catch (e: any) {
      return err(e.message);
    }
  });
}
