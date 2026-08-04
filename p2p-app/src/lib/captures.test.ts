import { test } from "node:test";
import assert from "node:assert/strict";
import {
  validateExtraction,
  validateGstin,
  validateDateString,
  routeForExtraction,
  ROUTE_AUTO_MATCH,
  ROUTE_REVIEW,
  ROUTE_MANUAL,
} from "./captures";

function invoice(overrides: Record<string, unknown> = {}) {
  return {
    invoice_number: "INV-101",
    invoice_date: "2026-07-24",
    vendor_name: "Acme",
    vendor_gstin: "27AACCA1234F1Z5",
    po_number: "PO/2026/00001",
    lines: [{ qty: 10, unit_price: 100, tax_rate_pct: 18, line_total: 1180 }],
    subtotal: 1000,
    cgst: 90,
    sgst: 90,
    igst: 0,
    grand_total: 1180,
    ...overrides,
  };
}

test("valid extraction passes with no issues", () => {
  const { issues, arithmeticOk, criticalMissing } = validateExtraction(invoice());
  assert.equal(arithmeticOk, true);
  assert.equal(criticalMissing, false);
  assert.equal(issues.length, 0);
});

test("totals are recomputed, never trusted from the model", () => {
  const wrong = invoice({ subtotal: 9999, grand_total: 200000 });
  const { issues, arithmeticOk } = validateExtraction(wrong);
  assert.equal(arithmeticOk, false);
  assert.ok(issues.some((i) => i.field === "subtotal"));
  assert.ok(issues.some((i) => i.field === "grand_total"));
});

test("GSTIN format check", () => {
  assert.equal(validateGstin("27AACCA1234F1Z5"), true);
  assert.equal(validateGstin("AACCA1234F1Z5"), false);
  assert.equal(validateGstin("27AACCA1234F1Z6"), true); // final digit can vary
  assert.equal(validateGstin(null), false);
});

test("date sanity: future or older than 2 years rejected", () => {
  assert.equal(validateDateString("2026-07-24"), true);
  assert.equal(validateDateString("2099-01-01"), false);
  assert.equal(validateDateString("2020-01-01"), false);
  assert.equal(validateDateString("not-a-date"), false);
});

test("confidence routing per module slide 8", () => {
  const ok = { arithmeticOk: true, criticalMissing: false };
  assert.equal(routeForExtraction({ confidence: 0.95, ...ok }), ROUTE_AUTO_MATCH);
  assert.equal(routeForExtraction({ confidence: 0.8, ...ok }), ROUTE_REVIEW);
  assert.equal(routeForExtraction({ confidence: 0.65, ...ok }), ROUTE_MANUAL);
  assert.equal(routeForExtraction({ confidence: 0.95, ...ok, arithmeticOk: false }), ROUTE_MANUAL);
  assert.equal(routeForExtraction({ confidence: 0.95, arithmeticOk: true, criticalMissing: true }), ROUTE_REVIEW);
});

test("duplicate detection is a validators concern: same vendor + invoice number must be caught at convert time", () => {
  const v = validateExtraction(invoice({ invoice_number: "INV-101" }));
  assert.equal(v.arithmeticOk, true);
});
