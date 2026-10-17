/**
 * Authoritative server-side pricing service.
 *
 * Every monetary decision (exit fees, previews, lookups, reports) resolves the
 * applicable tariff and computes the amount through this module — the UI never
 * calculates fees itself. Pure math lives in lib/tariff.ts (unit-tested); this
 * layer adds database resolution, permit/subscription coverage and discounts.
 */
import pool from "@/lib/db";
import { calculateFee, type FeeResult, type TariffRate } from "@/lib/tariff";
import { percentOf, round2, subtractMoney } from "@/lib/money";

export interface ResolvedTariff extends TariffRate {
  id?: number;
  name?: string;
  vehicle_type?: string;
}

/** Finds the best matching active tariff for a vehicle type, else null (fallback applies). */
export async function resolveTariff(
  companyId: number,
  vehicleType: string | null | undefined,
  rateId?: number | null
): Promise<ResolvedTariff | null> {
  if (rateId) {
    const res = await pool.query(
      `SELECT * FROM parking_rates WHERE id = $1 AND company_id = $2 AND is_active = true LIMIT 1`,
      [rateId, companyId]
    );
    if (res.rows[0]) return res.rows[0];
  }
  const res = await pool.query(
    `SELECT * FROM parking_rates
     WHERE company_id = $1 AND is_active = true
       AND (vehicle_type = $2 OR vehicle_type = 'all' OR vehicle_type IS NULL)
     ORDER BY (vehicle_type = $2) DESC, is_default DESC, id DESC
     LIMIT 1`,
    [companyId, vehicleType || "car"]
  );
  return res.rows[0] || null;
}

export interface ActiveCoverage {
  kind: "permit" | "subscription";
  id: number;
  label: string;
  end_date: string;
}

/** Returns an active permit/subscription covering the vehicle or plate, else null. */
export async function findCoverage(
  companyId: number,
  vehicleId: number | null,
  plateNumber: string | null
): Promise<ActiveCoverage | null> {
  if (vehicleId) {
    const permit = await pool.query(
      `SELECT p.id, p.permit_type, p.end_date FROM parking_permits p
       WHERE p.company_id = $1 AND p.status = 'active' AND p.end_date >= CURRENT_DATE
         AND (p.vehicle_id = $2 OR (p.plate_number IS NOT NULL AND p.plate_number = $3))
       ORDER BY p.end_date DESC LIMIT 1`,
      [companyId, vehicleId, plateNumber]
    );
    if (permit.rows[0]) {
      return { kind: "permit", id: permit.rows[0].id, label: `${permit.rows[0].permit_type} permit`, end_date: permit.rows[0].end_date };
    }
    const sub = await pool.query(
      `SELECT s.id, s.plan_type, s.end_date FROM parking_subscriptions s
       WHERE s.company_id = $1 AND s.status = 'active' AND s.end_date >= CURRENT_DATE
         AND (s.vehicle_id = $2
              OR s.vehicle_id IN (SELECT id FROM parking_vehicles WHERE company_id = $1 AND plate_number = $3))
       ORDER BY s.end_date DESC LIMIT 1`,
      [companyId, vehicleId, plateNumber]
    );
    if (sub.rows[0]) {
      return { kind: "subscription", id: sub.rows[0].id, label: `${sub.rows[0].plan_type} subscription`, end_date: sub.rows[0].end_date };
    }
  }
  return null;
}

export interface DiscountInput {
  discount_type: "amount" | "percent";
  value: number | string;
  code?: string | null;
  reason?: string | null;
}

export interface PricedSession {
  fee: FeeResult;
  tariffId: number | null;
  tariffName: string | null;
  covered: ActiveCoverage | null;
  grossAmount: number;
  discountAmount: number;
  amountDue: number;
  currency: string;
}

export interface PriceOptions {
  /** Force base fee (already-covered subscriber, lost ticket, etc.). */
  forceBase?: number | string | null;
  /** Lost ticket fee replaces the duration-based computation when set. */
  lostTicket?: boolean;
  discount?: DiscountInput | null;
  discountCap?: number | null;
}

const LOST_TICKET_DEFAULT = 200; // ETB when no configured lost-ticket rate exists

/**
 * Prices a parking stay end to end. THE single source of truth for fees.
 */
export async function priceSession(opts: {
  companyId: number;
  entryTime: Date | string;
  exitTime?: Date | string | null;
  vehicleType?: string | null;
  vehicleId?: number | null;
  plateNumber?: string | null;
  rateId?: number | null;
  options?: PriceOptions;
}): Promise<PricedSession> {
  const { companyId, entryTime, vehicleType, vehicleId, plateNumber, rateId, options } = opts;
  const exitTime = opts.exitTime || new Date();

  const covered = await findCoverage(companyId, vehicleId ?? null, plateNumber ?? null);

  let tariff = await resolveTariff(companyId, vehicleType, rateId);
  if (covered && tariff) {
    // Subscribers still pass through the engine with a zero base so the
    // breakdown documents the coverage rather than silently charging 0.
    tariff = { ...tariff, base_rate: 0, per_hour_rate: 0, per_day_rate: 0, min_charge: 0, max_daily_charge: 0 };
  }

  const fee = calculateFee(tariff, entryTime, exitTime);

  let gross = fee.amount;
  if (covered) {
    gross = 0;
    fee.breakdown = [{ label: `Covered by ${covered.label} (until ${String(covered.end_date).slice(0, 10)})`, amount: 0 }];
    fee.note = "No charge — active parking agreement";
  } else if (options?.forceBase != null && Number(options.forceBase) >= 0) {
    gross = round2(Number(options.forceBase));
    fee.breakdown = [{ label: "Manual base amount", amount: gross }];
  } else if (options?.lostTicket) {
    gross = round2(tariff?.min_charge && Number(tariff.min_charge) > LOST_TICKET_DEFAULT ? Number(tariff.min_charge) : LOST_TICKET_DEFAULT);
    fee.breakdown = [{ label: "Lost ticket charge", amount: gross }];
    fee.note = "Lost ticket — flat charge applied";
  }

  let discountAmount = 0;
  const d = options?.discount;
  if (d && !covered && gross > 0) {
    const raw = d.discount_type === "percent" ? percentOf(gross, Number(d.value)) : round2(Number(d.value));
    discountAmount = options?.discountCap != null ? Math.min(raw, Number(options.discountCap)) : raw;
    if (discountAmount < 0) discountAmount = 0;
    if (discountAmount > gross) discountAmount = gross;
  }

  const amountDue = round2(subtractMoney(gross, discountAmount));

  return {
    fee,
    tariffId: tariff?.id ?? null,
    tariffName: tariff?.name ?? null,
    covered,
    grossAmount: gross,
    discountAmount,
    amountDue,
    currency: fee.currency,
  };
}

/** Validates a discount payload; returns an error string or null. */
export function validateDiscount(d: any): string | null {
  if (!d) return null;
  if (d.discount_type !== "amount" && d.discount_type !== "percent") return "Discount type must be amount or percent";
  const v = Number(d.value);
  if (!isFinite(v) || v < 0) return "Discount value must be a non-negative number";
  if (d.discount_type === "percent" && v > 100) return "Percent discount cannot exceed 100";
  return null;
}
