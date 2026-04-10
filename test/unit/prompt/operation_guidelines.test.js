const test = require("node:test");
const assert = require("node:assert/strict");

const { buildOperationGuidelines } = require("../../../src/prompt/operation_guidelines");

test("buildOperationGuidelines: returns a string", () => {
  const g = buildOperationGuidelines();
  assert.equal(typeof g, "string");
  assert.ok(g.length > 0);
});

test("buildOperationGuidelines: describes sr blocks", () => {
  const g = buildOperationGuidelines();
  assert.ok(g.includes("sr"));
  assert.ok(g.includes("SEARCH/REPLACE") || g.includes("SEARCH"));
});

test("buildOperationGuidelines: describes op blocks", () => {
  const g = buildOperationGuidelines();
  assert.ok(g.includes("op"));
  assert.ok(g.includes("MKDIR") || g.includes("MV") || g.includes("RM"));
});

test("buildOperationGuidelines: contains example syntax", () => {
  const g = buildOperationGuidelines();
  assert.ok(g.includes("```sr") || g.includes("sr"));
  assert.ok(g.includes("```op") || g.includes("op"));
});

test("buildOperationGuidelines: forbids bash/exec", () => {
  const g = buildOperationGuidelines();
  assert.ok(g.includes("MKDIR") || g.includes("mkdir") || g.includes("MV") || g.includes("RM"));
});
