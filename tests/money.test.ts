import test from "node:test";
import assert from "node:assert/strict";
import {
  toMinor, fromMinor, round2, addMoney, subtractMoney, multiplyMoney, percentOf, formatMoney,
} from "../lib/money.ts";

test("toMinor converts to integer cents safely", () => {
  assert.equal(toMinor(10.1), 1010);
  assert.equal(toMinor("3.005"), 301);
  assert.equal(toMinor(null), 0);
  assert.equal(toMinor("nope"), 0);
});

test("round2 removes floating point drift", () => {
  assert.equal(round2(0.1 + 0.2), 0.3);
  assert.equal(round2(19.994), 19.99);
});

test("addMoney sums without drift", () => {
  assert.equal(addMoney(0.1, 0.2), 0.3);
  assert.equal(addMoney(10, 20.5, 0.25), 30.75);
});

test("subtractMoney and multiplyMoney", () => {
  assert.equal(subtractMoney(10, 3.5), 6.5);
  assert.equal(multiplyMoney(2.5, 3), 7.5);
});

test("percentOf applies a percentage with cent rounding", () => {
  assert.equal(percentOf(200, 10), 20);
  assert.equal(percentOf(199.99, 15), 30); // 29.9985 -> 3000 cents -> 30
});

test("formatMoney renders currency with two decimals", () => {
  assert.equal(formatMoney(1234.5), "ETB 1,234.50");
  assert.equal(formatMoney(0, "USD"), "USD 0.00");
  assert.equal(formatMoney(null), "ETB 0.00");
});

test("fromMinor inverse of toMinor", () => {
  assert.equal(fromMinor(toMinor(42.42)), 42.42);
});
