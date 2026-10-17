import { test } from "node:test";
import assert from "node:assert/strict";
import {
  calculateFee,
  durationMinutes,
  overlapsOvernight,
  DEFAULT_RATE,
  type TariffRate,
} from "../lib/tariff.ts";
import { toMinor, fromMinor, percentOf, round2 } from "../lib/money.ts";

/** Entry at a fixed reference time so tests are deterministic. */
const ENTRY = new Date("2026-03-10T08:00:00Z");
const at = (minutes: number) => new Date(ENTRY.getTime() + minutes * 60000);

test("grace period: stays within grace are free", () => {
  const rate: TariffRate = { ...DEFAULT_RATE, grace_period_minutes: 15, per_hour_rate: 30 };
  const r = calculateFee(rate, ENTRY, at(10));
  assert.equal(r.amount, 0);
  assert.match(r.note!, /grace/i);
});

test("billing increment rounds up per started increment", () => {
  const rate: TariffRate = { ...DEFAULT_RATE, per_hour_rate: 30, billing_increment_minutes: 30, grace_period_minutes: 0 };
  // 31 minutes → 2 started 30-min blocks
  assert.equal(calculateFee(rate, ENTRY, at(31)).amount, 60);
  // exactly 30 minutes → 1 block
  assert.equal(calculateFee(rate, ENTRY, at(30)).amount, 30);
});

test("base fee is added once", () => {
  const rate: TariffRate = { ...DEFAULT_RATE, base_rate: 20, per_hour_rate: 30, billing_increment_minutes: 60, grace_period_minutes: 0 };
  assert.equal(calculateFee(rate, ENTRY, at(120)).amount, 80);
});

test("daily cap applies across multi-day stays", () => {
  const rate: TariffRate = { ...DEFAULT_RATE, per_hour_rate: 50, billing_increment_minutes: 60, grace_period_minutes: 0, max_daily_charge: 300 };
  // 3 days = 72h → uncapped 3600, capped at 300*3
  const r = calculateFee(rate, ENTRY, at(72 * 60));
  assert.equal(r.amount, 900);
});

test("minimum charge floors small bills", () => {
  const rate: TariffRate = { ...DEFAULT_RATE, per_hour_rate: 10, billing_increment_minutes: 60, grace_period_minutes: 0, min_charge: 25 };
  assert.equal(calculateFee(rate, ENTRY, at(30)).amount, 25);
});

test("flat rate ignores duration", () => {
  const rate: TariffRate = { ...DEFAULT_RATE, rate_type: "flat", base_rate: 150 };
  assert.equal(calculateFee(rate, ENTRY, at(600)).amount, 150);
});

test("daily model bills per started day", () => {
  const rate: TariffRate = { ...DEFAULT_RATE, rate_type: "daily", per_day_rate: 200, base_rate: 50, grace_period_minutes: 0 };
  // 25 hours spans 2 started days: base 50 + 2 x 200
  const r = calculateFee(rate, ENTRY, at(25 * 60));
  assert.equal(r.amount, 450);
  assert.equal(r.units, 2);
});

test("overnight detection across midnight", () => {
  // window 20:00 → 06:00
  const entry = new Date("2026-03-10T21:30:00Z");
  const exit = new Date("2026-03-11T02:00:00Z");
  assert.equal(overlapsOvernight(entry, exit, 20, 6), true);
  const dayEntry = new Date("2026-03-10T10:00:00Z");
  const dayExit = new Date("2026-03-10T15:00:00Z");
  assert.equal(overlapsOvernight(dayEntry, dayExit, 20, 6), false);
});

test("overnight flat rate overrides hourly when overlapping", () => {
  const rate: TariffRate = {
    ...DEFAULT_RATE, rate_type: "overnight", overnight_rate: 120,
    overnight_start_hour: 20, overnight_end_hour: 6, grace_period_minutes: 0,
  };
  const entry = new Date("2026-03-10T21:30:00Z");
  const exit = new Date("2026-03-11T02:00:00Z");
  const r = calculateFee(rate, entry, exit);
  assert.equal(r.amount, 120);
  assert.equal(r.isOvernight, true);
});

test("duration helper is minute-exact and never negative", () => {
  assert.equal(durationMinutes(ENTRY, at(90)), 90);
  assert.equal(durationMinutes(at(90), ENTRY), 0);
});

/* ------------------------------ money helpers ----------------------------- */

test("money math is exact in minor units", () => {
  assert.equal(round2(0.1 + 0.2), 0.3);
  assert.equal(toMinor("19.99"), 1999);
  assert.equal(fromMinor(1999), 19.99);
  // classic float drift avoided: 3 * 10.03
  assert.equal(fromMinor(3 * toMinor(10.03)), 30.09);
});

test("percentOf rounds half-even-ish deterministically", () => {
  assert.equal(percentOf(100, 15), 15);
  assert.equal(percentOf("199.99", 10), 20);
  assert.equal(percentOf(0, 25), 0);
});
