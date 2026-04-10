const test = require("node:test");
const assert = require("node:assert/strict");

const { TOOLS_SCHEMA, TOOL_METADATA, getToolMetadata } = require("../../../src/core/adapter/schema");

test("TOOLS_SCHEMA: has 5 tools (includes touch)", () => {
  assert.equal(TOOLS_SCHEMA.length, 5);
});

test("TOOLS_SCHEMA: all tools have required fields", () => {
  for (const tool of TOOLS_SCHEMA) {
    assert.equal(tool.type, "function");
    assert.equal(typeof tool.function.name, "string");
    assert.equal(typeof tool.function.description, "string");
    assert.equal(typeof tool.function.parameters, "object");
    assert.equal(tool.function.parameters.type, "object");
    assert.ok(Array.isArray(tool.function.parameters.required));
    assert.ok(typeof tool.function.metadata === "object");
  }
});

test("TOOLS_SCHEMA: names are search_replace, mkdir, mv, rm, touch", () => {
  const names = TOOLS_SCHEMA.map((t) => t.function.name).sort();
  assert.deepEqual(names, ["mkdir", "mv", "rm", "search_replace", "touch"]);
});

test("TOOLS_SCHEMA: search_replace requires file, search, replace", () => {
  const sr = TOOLS_SCHEMA.find((t) => t.function.name === "search_replace");
  assert.deepEqual(sr.function.parameters.required.sort(), ["file", "replace", "search"]);
});

test("TOOL_METADATA: search_replace is not destructive, not readonly, not concurrency-safe", () => {
  const m = TOOL_METADATA.search_replace;
  assert.equal(m.isReadOnly, false);
  assert.equal(m.isDestructive, false);
  assert.equal(m.isConcurrencySafe, false);
});

test("TOOL_METADATA: mkdir is concurrency-safe", () => {
  const m = TOOL_METADATA.mkdir;
  assert.equal(m.isConcurrencySafe, true);
  assert.equal(m.isDestructive, false);
});

test("TOOL_METADATA: mv is destructive", () => {
  const m = TOOL_METADATA.mv;
  assert.equal(m.isDestructive, true);
});

test("TOOL_METADATA: rm is destructive", () => {
  const m = TOOL_METADATA.rm;
  assert.equal(m.isDestructive, true);
});

test("getToolMetadata: returns metadata for known tool", () => {
  const m = getToolMetadata("search_replace");
  assert.equal(m.isDestructive, false);
});

test("getToolMetadata: returns fail-closed defaults for unknown tool", () => {
  const m = getToolMetadata("unknown_tool");
  assert.equal(m.isReadOnly, false);
  assert.equal(m.isDestructive, true);
  assert.equal(m.isConcurrencySafe, false);
});
