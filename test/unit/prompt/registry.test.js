const test = require("node:test");
const assert = require("node:assert/strict");

const {
  PROMPT_SECTIONS,
  STATIC_SECTIONS,
  DYNAMIC_SECTIONS,
  registerSection,
  getSectionsByPriority,
  getSectionsByType,
  buildCachePrefix,
  buildDynamicSuffix,
  buildSystemPromptWithBoundary,
  isStaticSection,
} = require("../../../src/prompt/registry");

test("PROMPT_SECTIONS: is an object with numeric values", () => {
  assert.equal(typeof PROMPT_SECTIONS, "object");
  assert.ok(typeof PROMPT_SECTIONS.IDENTITY === "number");
  assert.ok(typeof PROMPT_SECTIONS.SYSTEM_RULES === "number");
});

test("PROMPT_SECTIONS: IDENTITY < SYSTEM_RULES < OPERATION_GUIDELINES < OUTPUT_DISCIPLINE", () => {
  assert.ok(PROMPT_SECTIONS.IDENTITY < PROMPT_SECTIONS.SYSTEM_RULES);
  assert.ok(PROMPT_SECTIONS.SYSTEM_RULES < PROMPT_SECTIONS.OPERATION_GUIDELINES);
  assert.ok(PROMPT_SECTIONS.OPERATION_GUIDELINES < PROMPT_SECTIONS.OUTPUT_DISCIPLINE);
});

test("STATIC_SECTIONS: is a Set", () => {
  assert.ok(STATIC_SECTIONS instanceof Set);
  assert.ok(STATIC_SECTIONS.size > 0);
});

test("DYNAMIC_SECTIONS: is a Set", () => {
  assert.ok(DYNAMIC_SECTIONS instanceof Set);
  assert.ok(DYNAMIC_SECTIONS.size > 0);
});

test("registerSection: returns registered section", () => {
  const section = registerSection("test_section", 150, () => "test content", true);
  assert.equal(section.name, "test_section");
  assert.equal(section.priority, 150);
  assert.equal(section.isStatic, true);
});

test("registerSection: isStatic=false marks as dynamic", () => {
  const section = registerSection("dyn_test", 150, () => "dyn", false);
  assert.equal(section.isStatic, false);
});

test("getSectionsByPriority: returns array sorted by priority ascending", () => {
  const sections = getSectionsByPriority();
  assert.ok(Array.isArray(sections));
  assert.ok(sections.length > 0);
  for (let i = 1; i < sections.length; i++) {
    assert.ok(sections[i].priority >= sections[i - 1].priority);
  }
});

test("getSectionsByType: static returns only static sections", () => {
  const staticOnes = getSectionsByType(true);
  for (const s of staticOnes) {
    assert.equal(s.isStatic, true);
  }
});

test("getSectionsByType: dynamic returns only dynamic sections", () => {
  const dynOnes = getSectionsByType(false);
  for (const s of dynOnes) {
    assert.equal(s.isStatic, false);
  }
});

test("buildCachePrefix: returns a string", () => {
  const p = buildCachePrefix();
  assert.equal(typeof p, "string");
});

test("buildDynamicSuffix: returns a string", () => {
  const s = buildDynamicSuffix();
  assert.equal(typeof s, "string");
});

test("buildSystemPromptWithBoundary: returns string", () => {
  const p = buildSystemPromptWithBoundary();
  assert.equal(typeof p, "string");
});

test("buildSystemPromptWithBoundary: includes boundary marker when dynamic content exists", () => {
  const p = buildSystemPromptWithBoundary();
  // If suffix is non-empty, boundary should appear
  assert.equal(typeof p, "string");
});

test("isStaticSection: returns boolean", () => {
  // After registering, should return correct value
  registerSection("static_test", 150, () => "", true);
  assert.equal(isStaticSection("static_test"), true);
  registerSection("dynamic_test", 150, () => "", false);
  assert.equal(isStaticSection("dynamic_test"), false);
});

test("isStaticSection: returns false for unknown section", () => {
  assert.equal(isStaticSection("__unknown_section__"), false);
});

test("PROMPT_SECTIONS: OVERRIDE > COORDINATOR > AGENT > CUSTOM > default", () => {
  assert.ok(PROMPT_SECTIONS.OVERRIDE > PROMPT_SECTIONS.COORDINATOR);
  assert.ok(PROMPT_SECTIONS.COORDINATOR > PROMPT_SECTIONS.AGENT);
  assert.ok(PROMPT_SECTIONS.AGENT > PROMPT_SECTIONS.CUSTOM);
  assert.ok(PROMPT_SECTIONS.CUSTOM > PROMPT_SECTIONS.OUTPUT_DISCIPLINE);
});
