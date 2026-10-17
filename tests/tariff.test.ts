import test from "node:test";
import assert from "node:assert/strict";
import { calculateFee, durationMinutes, overlapsOvernight, DEFAULT_RATE } from "../lib/tariff.ts";

const U = 60 * 60 * 1000;

test("durationMinutes rounds to whole minutes and never negative", () => {
  const start = new Date("2026-01-01T10:00:00");
  assert.equal(durationMinutes(start, new Date(start.getTime() + 90 * 60 * 1000)), 90);
  assert.equal(durationMinutes(start, new Date(start.getTime() - 1000)), 0);
});

test("hourly: base + per_hour × billed units", () => {
  const entry = new Date("2026-01-01T08:00:00");
  const exit = new Date("2026-01-01T11:00:00");
  const fee = calculateFee(
    { rate_type: "hourly", base_rate: 10, per_hour_rate: 20, billing_increment_minutes: 60 },
    entry,
    exit
  );
  assert.equal(fee.durationMinutes, 180);
  assert.equal(fee.units, 3);
  assert.equal(fee.amount, 70); // 10 + 20*3
});

test("billing increment rounds partial units up (30 min increment)", () => {
  const entry = new Date("2026-01-01T08:00:00");
  const exit = new Date("2026-01-01T09:10:00");
  const fee = calculateFee(
    { rate_type: "hourly", base_rate: 0, per_hour_rate: 30, billing_increment_minutes: 30 },
    entry,
    exit
  );
  assert.equal(fee.units, 3); // 70 min -> ceil(70/30) = 3
  assert.equal(fee.amount, 90);
});

test("grace period makes short stays free", () => {
  const entry = new Date("2026-01-01T08:00:00");
  const exit = new Date("2026-01-01T08:10:00");
  const fee = calculateFee(
    { rate_type: "hourly", per_hour_rate: 50, billing_increment_minutes: 60, grace_period_minutes: 15 },
    entry,
    exit
  );
  assert.equal(fee.amount, 0);
  assert.equal(fee.chargeableMinutes, 0);
});

test("minimum charge is applied to non-zero bills", () => {
  const entry = new Date("2026-01-01T08:00:00");
  const exit = new Date("2026-01-01T08:31:00");
  const fee = calculateFee(
    { rate_type: "hourly", base_rate: 0, per_hour_rate: 5, billing_increment_minutes: 60, min_charge: 25 },
    entry,
    exit
  );
  assert.equal(fee.amount, 25);
});

test("daily rate uses per_day_rate × billed days", () => {
  const entry = new Date("2026-01-01T08:00:00");
  const exit = new Date("2026-01-02T09:00:00"); // 25h -> 2 days
  const fee = calculateFee(
    { rate_type: "daily", base_rate: 0, per_day_rate: 100, billing_increment_minutes: 60 },
    entry,
    exit
  );
  assert.equal(fee.units, 2);
  assert.equal(fee.amount, 200);
});

test("flat rate charges the base once", () => {
  const entry = new Date("2026-01-01T08:00:00");
  const exit = new Date("2026-01-01T20:00:00");
  const fee = calculateFee({ rate_type: "flat", base_rate: 150 }, entry, exit);
  assert.equal(fee.amount, 150);
  assert.equal(fee.units, 1);
});

test("max daily cap limits the total", () => {
  const entry = new Date("2026-01-01T00:00:00");
  const exit = new Date("2026-01-01T02:00:00");
  const fee = calculateFee(
    { rate_type: "hourly", base_rate: 0, per_hour_rate: 1000, billing_increment_minutes: 60, max_daily_charge: 300 },
    entry,
    exit
  );
  assert.equal(fee.amount, 300);
});

test("overnight flat rate applies when the stay overlaps the window", () => {
  const entry = new Date("2026-01-01T22:00:00");
  const exit = new Date("2026-01-02T05:00:00");
  const fee = calculateFee(
    { rate_type: "overnight", overnight_rate: 200, overnight_start_hour: 20, overnight_end_hour: 6 },
    entry,
    exit
  );
  assert.equal(fee.isOvernight, true);
  assert.equal(fee.amount, 200);
});

test("overlapsOvernight detects a window that crosses midnight", () => {
  const entry = new Date("2026-01-01T23:30:00");
  const exit = new Date("2026-01-02T00:30:00");
  assert.equal(overlapsOvernight(entry, exit, 20, 6), true);
  const day = new Date("2026-01-01T10:00:00");
  assert.equal(overlapsOvernight(day, new Date(day.getTime() + U), 20, 6), false);
});

test("no rate falls back to the default 30 ETB per started 30 minutes", () => {
  const entry = new Date("2026-01-01T08:00:00");
  const exit = new Date("2026-01-01T09:10:00");
  const fee = calculateFee(null, entry, exit);
  assert.equal(DEFAULT_RATE.per_hour_rate, 30);
  assert.equal(DEFAULT_RATE.billing_increment_minutes, 30);
  assert.equal(fee.units, 3);
  assert.equal(fee.amount, 90);
});

test("zero/negative duration costs nothing", () => {
  const t = new Date("2026-01-01T08:00:00");
  const fee = calculateFee({ rate_type: "hourly", per_hour_rate: 50 }, t, t);
  assert.equal(fee.amount, 0);
});
