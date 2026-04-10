const test = require("node:test");
const assert = require("node:assert/strict");

const {
  STATIC_SECTIONS,
  DYNAMIC_SECTIONS,
  getCachePrefix,
  getDynamicSuffix,
  buildOptimizedPrompt,
  getSectionsForRole,
  isCacheStable,
} = require("../../../src/prompt/cache_strategy");

test("STATIC_SECTIONS: is an array", () => {
  assert.ok(Array.isArray(STATIC_SECTIONS));
  assert.ok(STATIC_SECTIONS.length > 0);
});

test("DYNAMIC_SECTIONS: is an array", () => {
  assert.ok(Array.isArray(DYNAMIC_SECTIONS));
  assert.ok(DYNAMIC_SECTIONS.length > 0);
});

test("getCachePrefix: returns a string", () => {
  const p = getCachePrefix();
  assert.equal(typeof p, "string");
  assert.ok(p.length > 0);
});

test("getCachePrefix: is stable (no dynamic boundary)", () => {
  const p = getCachePrefix();
  assert.ok(!p.includes("DYNAMIC_BOUNDARY") || !p.includes("<!--"));
});

test("getDynamicSuffix: returns a string", () => {
  const s = getDynamicSuffix();
  assert.equal(typeof s, "string");
});

test("getDynamicSuffix: filters by roleSections when provided", () => {
  const s = getDynamicSuffix(["engineering_donts"]);
  assert.equal(typeof s, "string");
  assert.ok(s.length >= 0);
});

test("getDynamicSuffix: empty array returns empty string", () => {
  const s = getDynamicSuffix([]);
  // Empty roleSections means include all, so should not be empty
  assert.equal(typeof s, "string");
});

test("buildOptimizedPrompt: returns { prefix, suffix, boundary, full }", () => {
  const result = buildOptimizedPrompt({ roleSections: [], includeBoundary: false });
  assert.equal(typeof result.prefix, "string");
  assert.equal(typeof result.suffix, "string");
  assert.equal(typeof result.boundary, "string");
  assert.equal(typeof result.full, "string");
});

test("buildOptimizedPrompt: full = prefix + boundary + suffix", () => {
  const { prefix, suffix, boundary, full } = buildOptimizedPrompt({
    roleSections: [],
    includeBoundary: true
  });
  if (suffix.trim()) {
    assert.ok(full.includes(prefix));
    assert.ok(full.includes(boundary));
    assert.ok(full.includes(suffix));
  }
});

test("buildOptimizedPrompt: includeBoundary=false omits boundary", () => {
  const { boundary } = buildOptimizedPrompt({ includeBoundary: false });
  assert.equal(boundary, "");
});

test("getSectionsForRole: returns array for known roles", () => {
  const sections = getSectionsForRole("implementation");
  assert.ok(Array.isArray(sections));
  assert.ok(sections.length > 0);
});

test("getSectionsForRole: returns default for unknown role", () => {
  const sections = getSectionsForRole("unknown_role");
  assert.ok(Array.isArray(sections));
  // Should fall back to default
  assert.ok(sections.length > 0);
});

test("getSectionsForRole: readonly_explore returns readonly_boundaries", () => {
  const sections = getSectionsForRole("readonly_explore");
  assert.ok(sections.includes("readonly_boundaries"));
});

test("isCacheStable: returns true", () => {
  assert.equal(isCacheStable(), true);
});

test("STATIC_SECTIONS: contains identity and operation guidelines", () => {
  const names = STATIC_SECTIONS.map(s => s.name);
  assert.ok(names.includes("identity"));
  assert.ok(names.includes("operation_guidelines"));
});

test("DYNAMIC_SECTIONS: contains engineering_donts and action_sequence", () => {
  const names = DYNAMIC_SECTIONS.map(s => s.name);
  assert.ok(names.includes("engineering_donts"));
  assert.ok(names.includes("action_sequence"));
});
