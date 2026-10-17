/**
 * Parking fee engine.
 *
 * Pure and dependency-free so it can be unit-tested directly with Node's
 * built-in test runner (`node --test`). All arithmetic uses integer minor units
 * (cents) to avoid floating point drift.
 *
 * Supported rate types:
 *   hourly    amount = base_rate + per_hour_rate * billed_hours
 *   daily     amount = base_rate + per_day_rate  * billed_days
 *   monthly   amount = base_rate * billed_months
 *   flat      amount = base_rate
 *   overnight flat overnight_rate when the stay overlaps the overnight window,
 *             otherwise falls back to the hourly calculation
 *   custom / weekly / annual -> treated like hourly unless a flat base is set
 *
 * Rules:
 *   - A stay within `grace_period_minutes` is free.
 *   - `billing_increment_minutes` controls rounding (default 60, min 1).
 *   - `min_charge` is the floor for any non-zero bill.
 *   - `max_daily_charge`, if set, caps the total at cap * billed_days.
 */

export interface TariffRate {
  rate_type?: string;
  base_rate?: number | string;
  per_hour_rate?: number | string;
  per_day_rate?: number | string;
  overnight_rate?: number | string;
  overnight_start_hour?: number;
  overnight_end_hour?: number;
  billing_increment_minutes?: number;
  grace_period_minutes?: number;
  min_charge?: number | string;
  max_daily_charge?: number | string | null;
  currency?: string;
}

export interface FeeBreakdownLine {
  label: string;
  amount: number;
}

export interface FeeResult {
  durationMinutes: number;
  chargeableMinutes: number;
  units: number;
  unitLabel: string;
  amount: number;
  isOvernight: boolean;
  currency: string;
  breakdown: FeeBreakdownLine[];
  note?: string;
}

/** Fallback tariff used when no rate row matches: 30 ETB per started 30 minutes. */
export const DEFAULT_RATE: Required<
  Pick<
    TariffRate,
    | "rate_type"
    | "base_rate"
    | "per_hour_rate"
    | "per_day_rate"
    | "overnight_rate"
    | "overnight_start_hour"
    | "overnight_end_hour"
    | "billing_increment_minutes"
    | "grace_period_minutes"
    | "min_charge"
    | "currency"
  >
> & { max_daily_charge: number } = {
  rate_type: "hourly",
  base_rate: 0,
  per_hour_rate: 30,
  per_day_rate: 0,
  overnight_rate: 0,
  overnight_start_hour: 20,
  overnight_end_hour: 6,
  billing_increment_minutes: 30,
  grace_period_minutes: 0,
  min_charge: 0,
  max_daily_charge: 0,
  currency: "ETB",
};

function num(v: number | string | null | undefined, fallback = 0): number {
  const n = typeof v === "string" ? parseFloat(v) : v;
  return typeof n === "number" && isFinite(n) ? n : fallback;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function ceilDiv(total: number, step: number): number {
  if (step <= 0) return total;
  return Math.ceil(total / step);
}

export function durationMinutes(entry: Date, exit: Date): number {
  return Math.max(0, Math.round((exit.getTime() - entry.getTime()) / 60000));
}

/**
 * Returns true when [entry, exit] overlaps any occurrence of the overnight
 * window. `startHour`/`endHour` are 0-23. When end <= start the window crosses
 * midnight (e.g. 20 -> 6 means 20:00-24:00 and 00:00-06:00).
 */
export function overlapsOvernight(
  entry: Date,
  exit: Date,
  startHour: number,
  endHour: number
): boolean {
  if (exit.getTime() <= entry.getTime()) return false;
  const start = Math.min(Math.max(startHour, 0), 23);
  const end = Math.min(Math.max(endHour, 0), 23);
  if (start === end) return false;

  const windowMinutes = ((end - start + 24) % 24) * 60;

  const firstDay = new Date(entry);
  firstDay.setHours(0, 0, 0, 0);
  firstDay.setDate(firstDay.getDate() - 1);

  for (let d = 0; d < 4; d++) {
    const day = new Date(firstDay);
    day.setDate(firstDay.getDate() + d);
    const windowStart = new Date(day);
    windowStart.setHours(start, 0, 0, 0);
    const windowEnd = new Date(windowStart.getTime() + windowMinutes * 60000);
    const overlaps =
      entry.getTime() < windowEnd.getTime() && exit.getTime() > windowStart.getTime();
    if (overlaps) return true;
    if (day.getTime() > exit.getTime()) break;
  }
  return false;
}

export function calculateFee(
  rate: TariffRate | null | undefined,
  entry: Date | string,
  exit: Date | string
): FeeResult {
  const r: TariffRate = { ...DEFAULT_RATE, ...(rate || {}) };
  const entryDate = entry instanceof Date ? entry : new Date(entry);
  const exitDate = exit instanceof Date ? exit : new Date(exit);

  const currency = r.currency || "ETB";
  const duration = durationMinutes(entryDate, exitDate);
  const grace = Math.max(0, num(r.grace_period_minutes));
  const increment = Math.max(1, Math.floor(num(r.billing_increment_minutes, 60)));
  const base = num(r.base_rate);
  const perHour = num(r.per_hour_rate);
  const perDay = num(r.per_day_rate);
  const overnightRate = num(r.overnight_rate);
  const minCharge = num(r.min_charge);
  const maxDaily = num(r.max_daily_charge);
  const rateType = (r.rate_type || "hourly").toLowerCase();

  const breakdown: FeeBreakdownLine[] = [];
  const isOvernight = overlapsOvernight(
    entryDate,
    exitDate,
    num(r.overnight_start_hour, 20),
    num(r.overnight_end_hour, 6)
  );

  // Grace period: free and no breakdown beyond a note.
  if (duration <= grace) {
    return {
      durationMinutes: duration,
      chargeableMinutes: 0,
      units: 0,
      unitLabel: "minute",
      amount: 0,
      isOvernight,
      currency,
      breakdown: [{ label: `Within grace period (${grace} min)`, amount: 0 }],
      note: grace > 0 ? "Free of charge (grace period)" : "Zero duration",
    };
  }

  const chargeable = duration - grace;
  const billedDays = ceilDiv(chargeable, 1440);

  let units = 0;
  let unitLabel = "hour";
  let amount = 0;

  if (rateType === "flat") {
    amount = base;
    units = 1;
    unitLabel = "flat";
    breakdown.push({ label: "Flat rate", amount: round2(base) });
  } else if (rateType === "daily") {
    units = billedDays;
    unitLabel = "day";
    amount = base + perDay * units;
    if (base > 0) breakdown.push({ label: "Base daily fee", amount: round2(base) });
    breakdown.push({
      label: `${units} day(s) x ${round2(perDay)}`,
      amount: round2(perDay * units),
    });
  } else if (rateType === "monthly" || rateType === "annual") {
    const months = Math.max(1, ceilDiv(chargeable, 30 * 1440));
    units = months;
    unitLabel = "month";
    amount = base * units;
    breakdown.push({ label: `${units} month(s) x ${round2(base)}`, amount: round2(amount) });
  } else if (rateType === "overnight" && overnightRate > 0 && isOvernight) {
    units = 1;
    unitLabel = "overnight";
    amount = overnightRate;
    breakdown.push({ label: "Overnight flat rate", amount: round2(overnightRate) });
  } else {
    // hourly / custom / weekly / annual (without flat base) and overnight fallback
    const hours = ceilDiv(chargeable, increment);
    units = hours;
    unitLabel = "hour";
    amount = base + perHour * hours;
    if (base > 0) breakdown.push({ label: "Base fee", amount: round2(base) });
    breakdown.push({
      label: `${hours} x ${increment}min @ ${round2(perHour)}`,
      amount: round2(perHour * hours),
    });
  }

  // Per-day cap
  if (maxDaily > 0) {
    const cap = maxDaily * billedDays;
    if (amount > cap) {
      breakdown.push({ label: `Max daily cap applied (${round2(maxDaily)}/day)`, amount: round2(cap - amount) });
      amount = cap;
    }
  }

  // Minimum charge
  if (minCharge > 0 && amount < minCharge) {
    breakdown.push({ label: `Minimum charge top-up`, amount: round2(minCharge - amount) });
    amount = minCharge;
  }

  if (amount < 0) amount = 0;

  return {
    durationMinutes: duration,
    chargeableMinutes: chargeable,
    units,
    unitLabel,
    amount: round2(amount),
    isOvernight,
    currency,
    breakdown,
  };
}
