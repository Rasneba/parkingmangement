import pool from "@/lib/db";
import type { TariffRate } from "@/lib/tariff";

/** Finds the best matching active tariff for a vehicle type, else null (fallback). */
export async function findRateForVehicle(
  companyId: number,
  vehicleType: string | null | undefined
): Promise<(TariffRate & { id?: number; name?: string }) | null> {
  const res = await pool.query(
    `SELECT * FROM parking_rates
     WHERE company_id = $1 AND is_active = true
       AND (vehicle_type = $2 OR vehicle_type = 'all' OR vehicle_type IS NULL)
     ORDER BY
       (vehicle_type = $2) DESC,
       is_default DESC,
       id DESC
     LIMIT 1`,
    [companyId, vehicleType || "car"]
  );
  return res.rows[0] || null;
}

export interface ActivePermit {
  kind: "permit" | "subscription";
  id: number;
  end_date: string | null;
}

/** Returns an active permit/subscription covering the vehicle or plate, else null. */
export async function findActivePermit(
  companyId: number,
  vehicleId: number | null,
  plateNumber: string | null
): Promise<ActivePermit | null> {
  const permit = await pool.query(
    `SELECT id, end_date FROM parking_permits
     WHERE company_id = $1 AND status = 'active' AND end_date >= CURRENT_DATE
       AND ((vehicle_id IS NOT NULL AND vehicle_id = $2)
            OR (plate_number IS NOT NULL AND plate_number = $3))
     ORDER BY end_date DESC LIMIT 1`,
    [companyId, vehicleId, plateNumber]
  );
  if (permit.rows[0]) {
    return { kind: "permit", id: permit.rows[0].id, end_date: permit.rows[0].end_date };
  }

  const sub = await pool.query(
    `SELECT ps.id, ps.end_date FROM parking_subscriptions ps
     WHERE ps.company_id = $1 AND ps.status = 'active' AND ps.end_date >= CURRENT_DATE
       AND (
         ps.vehicle_id = $2
         OR ps.vehicle_id IN (SELECT id FROM parking_vehicles WHERE company_id = $1 AND plate_number = $3)
       )
     ORDER BY ps.end_date DESC LIMIT 1`,
    [companyId, vehicleId, plateNumber]
  );
  if (sub.rows[0]) {
    return { kind: "subscription", id: sub.rows[0].id, end_date: sub.rows[0].end_date };
  }
  return null;
}
