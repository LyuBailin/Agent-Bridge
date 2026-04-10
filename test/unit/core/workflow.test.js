const test = require("node:test");
const assert = require("node:assert/strict");

const {
  hasPendingSubtasks,
  summarizeIssues,
  handleFailure,
  ContextModifierBuffer
} = require("../../../src/core/workflow");

// --- hasPendingSubtasks ---

test("hasPendingSubtasks: returns true when nodes are pending", () => {
  const planTree = {
    nodes: {
      a: { status: "pending" },
      b: { status: "done" }
    }
  };
  assert.equal(hasPendingSubtasks(planTree), true);
});

test("hasPendingSubtasks: returns true when a node is running", () => {
  const planTree = {
    nodes: {
      a: { status: "running" },
      b: { status: "done" }
    }
  };
  assert.equal(hasPendingSubtasks(planTree), true);
});

test("hasPendingSubtasks: returns false when all done", () => {
  const planTree = {
    nodes: {
      a: { status: "done" },
      b: { status: "done" }
    }
  };
  assert.equal(hasPendingSubtasks(planTree), false);
});

test("hasPendingSubtasks: returns false when all failed", () => {
  const planTree = {
    nodes: {
      a: { status: "failed" },
      b: { status: "skipped" }
    }
  };
  assert.equal(hasPendingSubtasks(planTree), false);
});

test("hasPendingSubtasks: handles null/undefined planTree gracefully", () => {
  assert.equal(hasPendingSubtasks(null), false);
  assert.equal(hasPendingSubtasks(undefined), false);
});

test("hasPendingSubtasks: handles empty nodes", () => {
  assert.equal(hasPendingSubtasks({ nodes: {} }), false);
});

test("hasPendingSubtasks: handles missing nodes key", () => {
  assert.equal(hasPendingSubtasks({}), false);
});

// --- summarizeIssues ---

test("summarizeIssues: joins messages", () => {
  const issues = [
    { message: "error one" },
    { message: "error two" },
    { message: null },
    { message: "error three" }
  ];
  const r = summarizeIssues(issues);
  assert.equal(r, "error one | error two | error three");
});

test("summarizeIssues: returns empty string for empty array", () => {
  assert.equal(summarizeIssues([]), "");
});

test("summarizeIssues: returns empty string for non-array", () => {
  assert.equal(summarizeIssues(null), "");
  assert.equal(summarizeIssues(undefined), "");
});

test("summarizeIssues: truncates to 2000 chars", () => {
  const issues = Array.from({ length: 100 }, (_, i) => ({ message: `error-${i}` }));
  const r = summarizeIssues(issues);
  assert.ok(r.length <= 2000);
});

// --- handleFailure ---

test("handleFailure: extracts stage, message, stack, details", () => {
  const err = new Error("boom");
  err.details = { foo: "bar" };
  err.stack = "Error: boom\n    at test.js";

  const ctx = handleFailure("apply", err, { task_id: "t1" });
  assert.equal(ctx.stage, "apply");
  assert.equal(ctx.message, "boom");
  assert.equal(ctx.stack, err.stack);
  assert.deepEqual(ctx.details, { foo: "bar" });
  assert.equal(ctx.task_id, "t1");
});

test("handleFailure: converts non-error to string", () => {
  const ctx = handleFailure("parse", "just a string error", { task_id: "t2" });
  assert.equal(ctx.stage, "parse");
  assert.equal(ctx.message, "just a string error");
});

test("handleFailure: handles null error", () => {
  const ctx = handleFailure("verify", null, { task_id: "t3" });
  assert.equal(ctx.stage, "verify");
  assert.equal(ctx.message, "null");
});

// --- ContextModifierBuffer ---

test("ContextModifierBuffer: enable/disable", () => {
  const buf = new ContextModifierBuffer();
  assert.equal(buf.enabled, false);

  buf.enable();
  assert.equal(buf.enabled, true);

  buf.disable();
  assert.equal(buf.enabled, false);
});

test("ContextModifierBuffer: add only when enabled", () => {
  const buf = new ContextModifierBuffer();
  buf.add(0, { type: "edit" });
  assert.equal(buf.buffer.length, 0);

  buf.enable();
  buf.add(0, { type: "edit" });
  assert.equal(buf.buffer.length, 1);

  buf.disable();
  buf.add(0, { type: "edit" });
  assert.equal(buf.buffer.length, 0);
});

test("ContextModifierBuffer: replayInOrder sorts by toolIndex", async () => {
  const buf = new ContextModifierBuffer();
  buf.enable();
  buf.add(2, { type: "b" });
  buf.add(0, { type: "a" });
  buf.add(1, { type: "mid" });

  const order = [];
  await buf.replayInOrder((modifier) => { order.push(modifier.type); });
  assert.deepEqual(order, ["a", "mid", "b"]);
});

test("ContextModifierBuffer: disable returns buffer contents", () => {
  const buf = new ContextModifierBuffer();
  buf.enable();
  buf.add(0, { type: "x" });
  buf.add(1, { type: "y" });

  const result = buf.disable();
  assert.equal(result.length, 2);
  assert.equal(buf.buffer.length, 0); // cleared
});

test("ContextModifierBuffer: clear empties buffer", () => {
  const buf = new ContextModifierBuffer();
  buf.enable();
  buf.add(0, { type: "x" });
  buf.add(1, { type: "y" });

  buf.clear();
  assert.equal(buf.buffer.length, 0);
  assert.equal(buf.enabled, true); // still enabled
});

// --- collectGitSummary ---

test("collectGitSummary: returns recent commits and diff stat", async () => {
  const { collectGitSummary } = require("../../../src/core/workflow");
  const gitManager = require("../../../src/core/git_manager");
  const fs = require("node:fs/promises");
  const os = require("node:os");
  const path = require("node:path");

  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "wf_git_test_"));
  try {
    await gitManager.ensureRepo(dir, { default_branch: "main", user_name: "t", user_email: "t@t" });
    await fs.writeFile(path.join(dir, "a.txt"), "a\n", "utf8");
    await gitManager.runGit(dir, ["add", "-A"]);
    await gitManager.runGit(dir, ["commit", "-m", "first"]);
    await fs.writeFile(path.join(dir, "b.txt"), "b\n", "utf8");
    await gitManager.runGit(dir, ["add", "-A"]);
    await gitManager.runGit(dir, ["commit", "-m", "second"]);

    const summary = await collectGitSummary(dir, 10);
    assert.ok(Array.isArray(summary.recentCommits));
    assert.ok(summary.recentCommits.length >= 2);
    assert.ok(typeof summary.diffStat === "string");
    assert.ok(typeof summary.nameStatus === "string");
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test("collectGitSummary: handles fresh repo with only bootstrap commit", async () => {
  const { collectGitSummary } = require("../../../src/core/workflow");
  const gitManager = require("../../../src/core/git_manager");
  const fs = require("node:fs/promises");
  const os = require("node:os");
  const path = require("node:path");

  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "wf_git_empty_"));
  try {
    await gitManager.ensureRepo(dir, { default_branch: "main", user_name: "t", user_email: "t@t" });

    // ensureRepo creates a bootstrap commit, so recentCommits will have it
    const summary = await collectGitSummary(dir, 10);
    assert.ok(Array.isArray(summary.recentCommits));
    // Bootstrap commit should be present
    assert.ok(summary.recentCommits.length >= 1);
    // No pending changes
    assert.equal(summary.diffStat, "");
    assert.equal(summary.nameStatus, "");
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});
