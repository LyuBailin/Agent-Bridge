const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildPrompt,
  buildCorrectionPrompt,
  buildSystemPrompt,
  buildUserPrompt,
  buildOperationConstraint,
  buildRoleSystemPrompt,
} = require("../../../src/prompt/index");

// --- buildSystemPrompt ---

test("buildSystemPrompt: returns a string", () => {
  const p = buildSystemPrompt();
  assert.equal(typeof p, "string");
  assert.ok(p.length > 0);
});

test("buildSystemPrompt: contains identity keywords", () => {
  const p = buildSystemPrompt();
  assert.ok(p.includes("professional") || p.includes("code editing agent"));
});

// --- buildOperationConstraint ---

test("buildOperationConstraint: fileops-only returns op constraint", () => {
  const c = buildOperationConstraint("fileops-only");
  assert.ok(c.includes("FILE OPERATIONS ONLY"));
  assert.ok(c.includes("```op"));
});

test("buildOperationConstraint: content-only returns sr constraint", () => {
  const c = buildOperationConstraint("content-only");
  assert.ok(c.includes("CONTENT EDITING ONLY"));
  assert.ok(c.includes("```sr"));
});

test("buildOperationConstraint: mixed returns empty string", () => {
  assert.equal(buildOperationConstraint("mixed"), "");
});

test("buildOperationConstraint: null returns empty string", () => {
  assert.equal(buildOperationConstraint(null), "");
  assert.equal(buildOperationConstraint(undefined), "");
});

// --- buildUserPrompt ---

test("buildUserPrompt: contains workspace boundary", () => {
  const user = buildUserPrompt(
    { task_id: "t1", instruction: "do something" },
    [],
    null,
    "context text"
  );
  assert.ok(user.includes("./workspace/"));
  assert.ok(user.includes("TASK_ID: t1"));
});

test("buildUserPrompt: includes operation constraint when provided", () => {
  const user = buildUserPrompt(
    { task_id: "t1", instruction: "do file ops" },
    [],
    "fileops-only",
    ""
  );
  assert.ok(user.includes("FILE OPERATIONS ONLY"));
});

test("buildUserPrompt: omits operation constraint when null", () => {
  const user = buildUserPrompt(
    { task_id: "t1", instruction: "do it" },
    [],
    null,
    ""
  );
  assert.ok(!user.includes("OPERATION TYPE"));
});

test("buildUserPrompt: includes feedback when provided", () => {
  const feedback = [{ stage: "apply", message: "SEARCH not found" }];
  const user = buildUserPrompt(
    { task_id: "t1", instruction: "fix it" },
    feedback,
    null,
    ""
  );
  assert.ok(user.includes("PREVIOUS FAILURES"));
});

test("buildUserPrompt: omits feedback when empty array", () => {
  const user = buildUserPrompt(
    { task_id: "t1", instruction: "do it" },
    [],
    null,
    ""
  );
  assert.ok(!user.includes("PREVIOUS FAILURES"));
});

// --- buildPrompt ---

test("buildPrompt: returns { system, user, operationType }", () => {
  const result = buildPrompt(
    { task_id: "t1", instruction: "do it" },
    "context",
    [],
    "content-only"
  );
  assert.equal(typeof result.system, "string");
  assert.equal(typeof result.user, "string");
  assert.equal(result.operationType, "content-only");
  assert.ok(result.system.length > 0);
  assert.ok(result.user.length > 0);
});

test("buildPrompt: system contains identity", () => {
  const { system } = buildPrompt({ task_id: "t1", instruction: "hi" }, "", [], null);
  assert.ok(system.includes("./workspace/") || system.includes("AGENT BRIDGE"));
});

// --- buildCorrectionPrompt ---

test("buildCorrectionPrompt: returns { system, user, operationType }", () => {
  const result = buildCorrectionPrompt(
    { task_id: "t1", instruction: "fix the bug" },
    "context",
    { message: "SEARCH not found" },
    "snippet text",
    null
  );
  assert.equal(typeof result.system, "string");
  assert.equal(typeof result.user, "string");
  assert.equal(result.operationType, null);
  assert.ok(result.user.includes("PARSE FAILURE"));
  assert.ok(result.user.includes("SEARCH not found"));
});

test("buildCorrectionPrompt: includes snippet feedback", () => {
  const { user } = buildCorrectionPrompt(
    { task_id: "t1", instruction: "fix" },
    "ctx",
    { message: "error" },
    "FILE: a.js\nline 5",
    null
  );
  assert.ok(user.includes("FILE SNIPPETS"));
  assert.ok(user.includes("a.js"));
});

test("buildCorrectionPrompt: handles missing error message", () => {
  const { user } = buildCorrectionPrompt(
    { task_id: "t1", instruction: "fix" },
    "ctx",
    {},
    "",
    null
  );
  assert.ok(user.includes("PARSE FAILURE"));
});

test("buildCorrectionPrompt: truncates long error details", () => {
  const longError = { message: "x", details: "a".repeat(1000) };
  const { user } = buildCorrectionPrompt(
    { task_id: "t1", instruction: "fix" },
    "ctx",
    longError,
    "",
    null
  );
  // Should not include the full 1000-char string
  assert.ok(user.length < 2000);
});
