const test = require("node:test");
const assert = require("node:assert/strict");

const { buildFeedbackModule } = require("../../../src/prompt/feedback");

test("buildFeedbackModule: returns empty string for empty array", () => {
  assert.equal(buildFeedbackModule([]), "");
});

test("buildFeedbackModule: returns empty string for null", () => {
  assert.equal(buildFeedbackModule(null), "");
});

test("buildFeedbackModule: returns empty string for undefined", () => {
  assert.equal(buildFeedbackModule(undefined), "");
});

test("buildFeedbackModule: returns empty string for non-array", () => {
  assert.equal(buildFeedbackModule("string"), "");
  assert.equal(buildFeedbackModule(123), "");
});

test("buildFeedbackModule: includes PREVIOUS FAILURES header for non-empty array", () => {
  const out = buildFeedbackModule([{ stage: "apply", message: "failed" }]);
  assert.ok(out.includes("PREVIOUS FAILURES"));
});

test("buildFeedbackModule: limits to last 3 entries", () => {
  const history = Array.from({ length: 5 }, (_, i) => ({
    stage: "s",
    message: `msg${i}`
  }));
  const out = buildFeedbackModule(history);
  assert.ok(!out.includes("msg0"));
  assert.ok(out.includes("msg2"));
  assert.ok(out.includes("msg4"));
});

test("buildFeedbackModule: includes stage in output", () => {
  const out = buildFeedbackModule([{ stage: "verify", message: "err" }]);
  assert.ok(out.includes("stage=verify"));
});

test("buildFeedbackModule: handles single-line message", () => {
  const out = buildFeedbackModule([{ stage: "apply", message: "SEARCH not found" }]);
  assert.ok(out.includes("SEARCH not found"));
});

test("buildFeedbackModule: handles multi-line message with indentation", () => {
  const out = buildFeedbackModule([{ stage: "apply", message: "line1\nline2\nline3" }]);
  assert.ok(out.includes("line1"));
  assert.ok(out.includes("  line2")); // indented continuation
});

test("buildFeedbackModule: includes details when present", () => {
  const out = buildFeedbackModule([{
    stage: "apply",
    message: "error",
    details: { file: "a.js" }
  }]);
  assert.ok(out.includes("details=") || out.includes("a.js"));
});

test("buildFeedbackModule: includes constraints reminder", () => {
  const out = buildFeedbackModule([{ stage: "s", message: "m" }]);
  assert.ok(out.includes("Constraints reminder") || out.includes("sr") || out.includes("op"));
});
