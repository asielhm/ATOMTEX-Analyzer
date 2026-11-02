import { test } from "node:test";
import assert from "node:assert/strict";
import { analyzeRoi } from "../src/analysis.js";
const model = { counts: [0, 2, 4, 12, 30, 12, 4, 0] };
test("manual ROI uses inclusive channels and preserves raw data", () => {
  const before = structuredClone(model);
  const r = analyzeRoi(model, { start: 1, end: 6, left: 2, right: 4 });
  assert.equal(r.gross, 64);
  assert.equal(r.background, 18);
  assert.equal(r.net, 46);
  assert.deepEqual(r.baseline, [2, 2.4, 2.8, 3.2, 3.6, 4]);
  assert.deepEqual(model, before);
});
test("linear and constant endpoint means; no energy spacing assumption", () => {
  const m = { counts: [2, 4, 20, 8, 10] };
  const linear = analyzeRoi(m, { start: 0, end: 4, method: "linear", edge: 2 });
  assert.deepEqual(linear.baseline, [3, 4.5, 6, 7.5, 9]);
  const constant = analyzeRoi(m, {
    start: 0,
    end: 4,
    method: "constant",
    edge: 2,
  });
  assert.deepEqual(constant.baseline, [6, 6, 6, 6, 6]);
  assert.equal(constant.net, 14);
});
test("negative net areas remain negative and minimal ROI is supported", () => {
  const r = analyzeRoi(model, { start: 0, end: 1, left: 10, right: 10 });
  assert.equal(r.net, -18);
});
test("invalid ROI, heights, methods and overlapping edge windows rejected", () => {
  const valid = { start: 0, end: 7, left: 0, right: 0 };
  for (const patch of [
    { start: -1 },
    { end: 8 },
    { start: 7 },
    { start: 0.5 },
    { left: NaN },
    { right: -1 },
    { method: "mystery" },
    { method: "linear", edge: 5 },
    { method: "linear", edge: 0 },
  ])
    assert.throws(() => analyzeRoi(model, { ...valid, ...patch }));
});
