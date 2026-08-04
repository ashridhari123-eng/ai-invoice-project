import { test } from "node:test";
import assert from "node:assert/strict";
import {
  matchLine,
  isFullyMatched,
  MATCH_MATCHED,
  MATCH_QTY_EXCEEDS,
  MATCH_PRICE_VARIANCE,
  MATCH_UNMATCHED,
} from "./invoices";

const PO = { itemCode: "MS-ANGLE-50", qty: 300, unitPrice: 465 };

test("perfect match passes", () => {
  const r = matchLine({ itemCode: "MS-ANGLE-50", qty: 300, unitPrice: 465 }, PO);
  assert.equal(r.matchStatus, MATCH_MATCHED);
});

test("unknown item on invoice → UNMATCHED", () => {
  const r = matchLine({ itemCode: "SOMETHING-ELSE", qty: 10, unitPrice: 100 }, null);
  assert.equal(r.matchStatus, MATCH_UNMATCHED);
});

test("over-billing a line beyond PO qty → QTY_EXCEEDS", () => {
  const r = matchLine({ itemCode: "MS-ANGLE-50", qty: 301, unitPrice: 465 }, PO);
  assert.equal(r.matchStatus, MATCH_QTY_EXCEEDS);
});

test("partial billing within PO qty passes", () => {
  const r = matchLine({ itemCode: "MS-ANGLE-50", qty: 150, unitPrice: 465 }, PO);
  assert.equal(r.matchStatus, MATCH_MATCHED);
});

test("price creep beyond 10% tolerance → PRICE_VARIANCE", () => {
  const r = matchLine({ itemCode: "MS-ANGLE-50", qty: 300, unitPrice: 512 }, PO);
  assert.equal(r.matchStatus, MATCH_PRICE_VARIANCE);
});

test("small price variance within tolerance passes", () => {
  const r = matchLine({ itemCode: "MS-ANGLE-50", qty: 300, unitPrice: 466 }, PO);
  assert.equal(r.matchStatus, MATCH_MATCHED);
});

test("no PO line found (no PO at all) → UNMATCHED", () => {
  const r = matchLine({ itemCode: "MS-ANGLE-50", qty: 300, unitPrice: 465 }, null);
  assert.equal(r.matchStatus, MATCH_UNMATCHED);
});

test("zero unit price on PO does not divide by zero", () => {
  const r = matchLine({ itemCode: "X", qty: 5, unitPrice: 10 }, { itemCode: "X", qty: 5, unitPrice: 0 });
  assert.equal(r.matchStatus, MATCH_MATCHED);
});

test("empty invoice lines never count as fully matched", () => {
  assert.equal(isFullyMatched([]), false);
});

test("one bad line blocks full match", () => {
  assert.equal(
    isFullyMatched([
      { matchStatus: MATCH_MATCHED },
      { matchStatus: MATCH_QTY_EXCEEDS },
    ]),
    false,
  );
  assert.equal(
    isFullyMatched([
      { matchStatus: MATCH_MATCHED },
      { matchStatus: MATCH_MATCHED },
    ]),
    true,
  );
});
