import { test } from "node:test";
import assert from "node:assert/strict";
import {
  computeLandedQuote,
  scoreQuotes,
  COST_OF_CAPITAL_ANNUAL,
} from "./rfq";

test("landed cost: freight is apportioned across lines and added per unit", () => {
  const r = computeLandedQuote(
    [
      { qty: 100, unitPrice: 480 },
      { qty: 50, unitPrice: 200 },
    ],
    { freight: 2500, packing: 0, otherCharges: 0, advancePct: 0, creditDays: 30, deliveryDays: 7, warrantyMonths: 12, validityDays: 15 },
  );
  assert.equal(r.goodsTotal, 58000);
  assert.equal(r.totalLanded, 60500);
  assert.equal(r.cashCost, 0);
  // freight share 48000/58000 = 2068.97 → per 100 units ≈ 20.69
  const a = r.landedUnitCosts[0];
  const expected = Math.round((480 + (2500 * (48000 / 58000)) / 100) * 100) / 100;
  assert.equal(a, expected);
});

test("cash cost: 100% advance on net30 adds cost of capital for 30 days", () => {
  const r = computeLandedQuote(
    [{ qty: 100, unitPrice: 455 }],
    { freight: 2500, packing: 0, otherCharges: 0, advancePct: 100, creditDays: 30, deliveryDays: 21, warrantyMonths: 6, validityDays: 0 },
  );
  assert.equal(r.goodsTotal, 45500);
  assert.equal(r.totalLanded, 48000);
  assert.equal(r.cashCost, Math.round(48000 * COST_OF_CAPITAL_ANNUAL * (30 / 365) * 100) / 100);
  assert.equal(r.comparableTotal, r.totalLanded + r.cashCost);
});

test("module slide 3 scenario: lowest unit price is NOT the cheapest landed cost", () => {
  const a = computeLandedQuote(
    [{ qty: 100, unitPrice: 480 }],
    { freight: 0, packing: 0, otherCharges: 0, advancePct: 0, creditDays: 45, deliveryDays: 7, warrantyMonths: 12, validityDays: 0 },
  );
  const b = computeLandedQuote(
    [{ qty: 100, unitPrice: 455 }],
    { freight: 2500, packing: 0, otherCharges: 0, advancePct: 100, creditDays: 30, deliveryDays: 21, warrantyMonths: 6, validityDays: 0 },
  );
  const c = computeLandedQuote(
    [{ qty: 100, unitPrice: 470 }],
    { freight: 0, packing: 0, otherCharges: 0, advancePct: 0, creditDays: 30, deliveryDays: 10, warrantyMonths: 12, validityDays: 0 },
  );
  assert.equal(a.comparableTotal, 48000);
  assert.equal(b.comparableTotal, 48000 + Math.round(48000 * COST_OF_CAPITAL_ANNUAL * (30 / 365) * 100) / 100);
  assert.equal(c.comparableTotal, 47000);
  assert.ok(c.comparableTotal < b.comparableTotal, "C beats B once freight + cash cost are added");
});

test("weighted scoring: lowest landed cost gets 100, delivery and credit scale linearly", () => {
  const scores = scoreQuotes([
    { comparableTotal: 47000, deliveryDays: 10, creditDays: 30, vendorRating: 50 },
    { comparableTotal: 48000, deliveryDays: 7, creditDays: 45, vendorRating: 60 },
    { comparableTotal: 49100, deliveryDays: 21, creditDays: 30, vendorRating: 70 },
  ]);
  assert.equal(scores[0].landedCost, 100);
  assert.equal(scores[1].landedCost, Math.round((47000 / 48000) * 10000) / 100);
  assert.equal(scores[0].delivery, Math.round((7 / 10) * 10000) / 100);
  assert.equal(scores[1].delivery, 100);
  assert.equal(scores[1].paymentTerms, 100);
  assert.ok(scores[0].total < scores[1].total, "A's low price is outweighed by slower delivery and worse terms");
});

test("scoreQuotes returns empty for no quotes and handles a single quote without dividing by zero", () => {
  assert.deepEqual(scoreQuotes([]), []);
  const single = scoreQuotes([{ comparableTotal: 100, deliveryDays: 5, creditDays: 10, vendorRating: 80 }]);
  assert.equal(single[0].landedCost, 100);
  assert.equal(single[0].delivery, 100);
  assert.equal(single[0].paymentTerms, 100);
  assert.equal(single[0].vendorRating, 80);
  assert.equal(single[0].total, 97);
});
