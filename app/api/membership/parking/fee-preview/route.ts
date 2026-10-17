import { withAuth, ok, err, badRequest } from "@/lib/api-utils";
import { requirePermission } from "@/lib/permissions";
import { priceSession } from "@/lib/pricing";
import { calculateFee, type TariffRate } from "@/lib/tariff";
import pool from "@/lib/db";

/**
 * GET /api/membership/parking/fee-preview?vehicle_type=car&minutes=90
 * GET /api/membership/parking/fee-preview?entry=ISO&exit=ISO&vehicle_type=car
 *
 * Authoritative tariff preview (same engine + same rate resolution as the
 * exit flow). Also returns sample breakdown rows for the tariff calculator UI.
 */
export async function GET(req: Request) {
  return withAuth(req, async (user) => {
    const perm = await requirePermission(user, "view", "parking_rates");
    if (!perm.allowed) return err("Permission denied", 403);
    if (!user.company_id) return badRequest("Company required");

    const { searchParams } = new URL(req.url);
    const vehicleType = searchParams.get("vehicle_type") || "car";
    const rateId = Number(searchParams.get("rate_id")) || null;
    const entryStr = searchParams.get("entry");
    const minutesParam = Number(searchParams.get("minutes"));

    let entry: Date;
    let exit: Date;
    const now = new Date();
    if (entryStr) {
      entry = new Date(entryStr);
      const exitStr = searchParams.get("exit");
      exit = exitStr ? new Date(exitStr) : now;
    } else {
      const minutes = isFinite(minutesParam) && minutesParam >= 0 ? minutesParam : 60;
      exit = now;
      entry = new Date(now.getTime() - minutes * 60000);
    }
    if (isNaN(entry.getTime()) || isNaN(exit.getTime())) return badRequest("Invalid entry/exit timestamps");
    if (exit < entry) return badRequest("Exit time cannot be before entry time");

    // When previewing a specific tariff row, pass it straight to the engine.
    if (rateId) {
      const r = await pool.query(`SELECT * FROM parking_rates WHERE id = $1 AND company_id = $2`, [rateId, user.company_id]);
      if (!r.rows[0]) return badRequest("Tariff not found");
      const fee = calculateFee(r.rows[0] as TariffRate, entry, exit);
      return ok({ pricing: { fee, grossAmount: fee.amount, discountAmount: 0, amountDue: fee.amount, currency: fee.currency, tariffId: r.rows[0].id, tariffName: r.rows[0].name, covered: null } });
    }

    const pricing = await priceSession({
      companyId: user.company_id,
      entryTime: entry,
      exitTime: exit,
      vehicleType,
    });
    return ok({ pricing });
  });
}
