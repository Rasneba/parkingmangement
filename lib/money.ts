/**
 * Money helpers. All arithmetic is done in integer minor units (cents) to avoid
 * floating point drift, then converted back to a 2-decimal number for storage in
 * PostgreSQL `numeric(12,2)` columns.
 */

export function toMinor(amount: number | string | null | undefined): number {
  const n = typeof amount === "string" ? parseFloat(amount) : amount ?? 0;
  if (!isFinite(n as number)) return 0;
  return Math.round((n as number) * 100);
}

export function fromMinor(minor: number): number {
  return Math.round(minor) / 100;
}

export function round2(amount: number): number {
  return fromMinor(toMinor(amount));
}

export function addMoney(...amounts: Array<number | string>): number {
  return fromMinor(amounts.reduce<number>((sum, a) => sum + toMinor(a), 0));
}

export function subtractMoney(a: number | string, b: number | string): number {
  return fromMinor(toMinor(a) - toMinor(b));
}

export function multiplyMoney(a: number | string, factor: number): number {
  return fromMinor(Math.round(toMinor(a) * factor));
}

/** Apply a percentage (0-100) and round to 2 decimals. */
export function percentOf(amount: number | string, percent: number): number {
  return fromMinor(Math.round((toMinor(amount) * percent) / 100));
}

export function formatMoney(
  amount: number | string | null | undefined,
  currency = "ETB"
): string {
  const n = typeof amount === "string" ? parseFloat(amount) : amount ?? 0;
  const safe = isFinite(n as number) ? (n as number) : 0;
  return `${currency} ${safe.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}
