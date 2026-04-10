const test = require("node:test");
const assert = require("node:assert/strict");

const { nowIso } = require("../../../src/shared/time");

test("nowIso: returns a string", () => {
  assert.equal(typeof nowIso(), "string");
});

test("nowIso: is valid ISO 8601", () => {
  const s = nowIso();
  assert.ok(new Date(s).toString() !== "Invalid Date", `Expected valid date, got: ${s}`);
});

test("nowIso: includes timezone (ends with Z)", () => {
  assert.ok(nowIso().endsWith("Z"));
});

test("nowIso: produces distinct values across calls", () => {
  const a = nowIso();
  // busy-wait to ensure clock advances
  const start = Date.now();
  while (Date.now() - start < 2) { /* spin */ }
  const b = nowIso();
  assert.notEqual(a, b);
});
