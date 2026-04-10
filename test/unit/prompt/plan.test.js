const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildPlanSystemPrompt,
  buildPlanUserPrompt,
  buildReplanSystemPrompt,
  buildReplanUserPrompt,
} = require("../../../src/prompt/plan");

// --- buildPlanSystemPrompt ---

test("buildPlanSystemPrompt: returns a string", () => {
  const p = buildPlanSystemPrompt(5);
  assert.equal(typeof p, "string");
  assert.ok(p.length > 0);
});

test("buildPlanSystemPrompt: includes maxSubtasks in output", () => {
  const p = buildPlanSystemPrompt(5);
  assert.ok(p.includes("5") || p.includes("at most"));
});

test("buildPlanSystemPrompt: contains PLANNER keyword", () => {
  const p = buildPlanSystemPrompt(12);
  assert.ok(p.includes("PLANNER") || p.includes("planner"));
});

test("buildPlanSystemPrompt: contains workspace boundary rule", () => {
  const p = buildPlanSystemPrompt(5);
  assert.ok(p.includes("workspace") || p.includes("workspace"));
});

// --- buildPlanUserPrompt ---

test("buildPlanUserPrompt: returns a string", () => {
  const p = buildPlanUserPrompt("do the thing", "some context");
  assert.equal(typeof p, "string");
  assert.ok(p.length > 0);
});

test("buildPlanUserPrompt: includes instruction", () => {
  const p = buildPlanUserPrompt("refactor the module", "context");
  assert.ok(p.includes("refactor the module"));
});

test("buildPlanUserPrompt: includes global context", () => {
  const p = buildPlanUserPrompt("do it", "here is context");
  assert.ok(p.includes("here is context"));
});

test("buildPlanUserPrompt: handles null instruction", () => {
  const p = buildPlanUserPrompt(null, "ctx");
  assert.equal(typeof p, "string");
  assert.ok(p.includes("GLOBAL CONTEXT"));
});

test("buildPlanUserPrompt: handles null context", () => {
  const p = buildPlanUserPrompt("do it", null);
  assert.equal(typeof p, "string");
});

// --- buildReplanSystemPrompt ---

test("buildReplanSystemPrompt: returns a string", () => {
  const p = buildReplanSystemPrompt(5);
  assert.equal(typeof p, "string");
  assert.ok(p.length > 0);
});

test("buildReplanSystemPrompt: includes remainingBudget", () => {
  const p = buildReplanSystemPrompt(3);
  assert.ok(p.includes("3") || p.includes("at most"));
});

test("buildReplanSystemPrompt: contains REPLANNER keyword", () => {
  const p = buildReplanSystemPrompt(5);
  assert.ok(p.includes("REPLANNER") || p.includes("replan"));
});

test("buildReplanSystemPrompt: contains workspace boundary", () => {
  const p = buildReplanSystemPrompt(5);
  assert.ok(p.includes("workspace"));
});

// --- buildReplanUserPrompt ---

test("buildReplanUserPrompt: returns a string", () => {
  const p = buildReplanUserPrompt("do it", "s1: done", "s2", "failed desc", {}, "ctx");
  assert.equal(typeof p, "string");
  assert.ok(p.length > 0);
});

test("buildReplanUserPrompt: includes original instruction", () => {
  const p = buildReplanUserPrompt("original task", "", "s1", "desc", {}, "ctx");
  assert.ok(p.includes("original task"));
});

test("buildReplanUserPrompt: includes done summary", () => {
  const p = buildReplanUserPrompt("task", "s1: completed", "s2", "desc", {}, "ctx");
  assert.ok(p.includes("COMPLETED SUBTASKS"));
  assert.ok(p.includes("s1: completed"));
});

test("buildReplanUserPrompt: includes failed subtask id and description", () => {
  const p = buildReplanUserPrompt("task", "", "s3", "could not find SEARCH pattern", {}, "ctx");
  assert.ok(p.includes("FAILED SUBTASK"));
  assert.ok(p.includes("s3"));
  assert.ok(p.includes("could not find SEARCH pattern"));
});

test("buildReplanUserPrompt: includes failure context", () => {
  const ctx = JSON.stringify({ stage: "apply", file: "a.js" });
  const p = buildReplanUserPrompt("task", "", "s1", "desc", ctx, "global");
  assert.ok(p.includes("FAILURE CONTEXT"));
});

test("buildReplanUserPrompt: handles null/empty doneSummary", () => {
  const p = buildReplanUserPrompt("task", null, "s1", "desc", {}, "ctx");
  assert.ok(p.includes("(none)"));
  const p2 = buildReplanUserPrompt("task", "", "s1", "desc", {}, "ctx");
  assert.ok(p2.includes("(none)"));
});

test("buildReplanUserPrompt: handles non-string failureContext", () => {
  const p = buildReplanUserPrompt("task", "", "s1", "desc", { key: "val" }, "ctx");
  assert.ok(p.includes("FAILURE CONTEXT"));
  assert.ok(p.includes("key"));
});

test("buildReplanUserPrompt: handles null context", () => {
  const p = buildReplanUserPrompt("task", "", "s1", "desc", {}, null);
  assert.equal(typeof p, "string");
});
