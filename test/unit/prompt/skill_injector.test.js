const test = require("node:test");
const assert = require("node:assert/strict");

// skill_injector manages a global REGISTERED_SKILLS Map, so we need to test
// in isolation. Save/restore the module to get a clean state.

const skillInjector = require("../../../src/prompt/skill_injector");

test("skill_injector: has expected exports", () => {
  assert.equal(typeof skillInjector.registerSkill, "function");
  assert.equal(typeof skillInjector.registerSkills, "function");
  assert.equal(typeof skillInjector.loadSkill, "function");
  assert.equal(typeof skillInjector.loadSkills, "function");
  assert.equal(typeof skillInjector.buildSkillPrompt, "function");
  assert.equal(typeof skillInjector.hasSkill, "function");
  assert.equal(typeof skillInjector.getRegisteredSkills, "function");
  assert.equal(typeof skillInjector.preloadSkills, "function");
});

test("registerSkill: registers a skill", () => {
  // Use a unique name to avoid collisions with other tests
  skillInjector.registerSkill("test_skill_" + Date.now(), "test content");
  assert.equal(skillInjector.hasSkill("test_skill_" + Date.now()), true);
});

test("registerSkill: accepts string content", () => {
  const name = "str_skill_" + Date.now();
  skillInjector.registerSkill(name, "hello");
  assert.equal(skillInjector.loadSkill(name), "hello");
});

test("registerSkill: accepts function loader", () => {
  const name = "fn_skill_" + Date.now();
  skillInjector.registerSkill(name, () => "computed content");
  assert.equal(skillInjector.loadSkill(name), "computed content");
});

test("registerSkills: registers multiple skills", () => {
  skillInjector.registerSkills({
    ["multi_a_" + Date.now()]: "content a",
    ["multi_b_" + Date.now()]: "content b",
  });
  // Should not throw
});

test("loadSkill: returns null for unknown skill", () => {
  assert.equal(skillInjector.loadSkill("__nonexistent__"), null);
});

test("loadSkill: marks skill as loaded", () => {
  const name = "load_test_" + Date.now();
  skillInjector.registerSkill(name, "x");
  const result = skillInjector.loadSkill(name);
  assert.equal(result, "x");
});

test("loadSkills: loads multiple skills", () => {
  const n1 = "ms1_" + Date.now(), n2 = "ms2_" + Date.now();
  skillInjector.registerSkill(n1, "c1");
  skillInjector.registerSkill(n2, "c2");
  const results = skillInjector.loadSkills([n1, n2]);
  assert.deepEqual(results, ["c1", "c2"]);
});

test("loadSkills: filters out nulls", () => {
  const results = skillInjector.loadSkills(["__nonexistent__"]);
  assert.deepEqual(results, []);
});

test("buildSkillPrompt: empty array returns empty string", () => {
  assert.equal(skillInjector.buildSkillPrompt([]), "");
});

test("buildSkillPrompt: includes SKILLS ACTIVATED header", () => {
  const name = "bp_test_" + Date.now();
  skillInjector.registerSkill(name, "skill content");
  const prompt = skillInjector.buildSkillPrompt([name]);
  assert.ok(prompt.includes("SKILLS ACTIVATED"));
  assert.ok(prompt.includes("skill content"));
});

test("buildSkillPrompt: multiple skills joined with double newline", () => {
  const n1 = "bp2_" + Date.now(), n2 = "bp3_" + Date.now();
  skillInjector.registerSkill(n1, "content1");
  skillInjector.registerSkill(n2, "content2");
  const prompt = skillInjector.buildSkillPrompt([n1, n2]);
  assert.ok(prompt.includes("content1"));
  assert.ok(prompt.includes("content2"));
});

test("buildSkillPrompt: unknown skill names are silently skipped", () => {
  const prompt = skillInjector.buildSkillPrompt(["__unknown__"]);
  assert.equal(prompt, "");
});

test("getRegisteredSkills: returns array", () => {
  assert.ok(Array.isArray(skillInjector.getRegisteredSkills()));
});

test("preloadSkills: is a function (no-op if empty)", () => {
  skillInjector.preloadSkills([]);
  // Should not throw
});
