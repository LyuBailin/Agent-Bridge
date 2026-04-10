const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs/promises");
const os = require("node:os");

const gitManager = require("../../../src/core/git_manager");
const fsTools = require("../../../src/utils/fs_tools");
const adapter = require("../../../src/core/adapter");
const verifier = require("../../../src/core/verifier");

async function withTempDir(fn) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "agent_bridge_test_"));
  try {
    return await fn(dir);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

// --- verifyAll: path safety ---

test("verifier: rejects edits to .git files", async () => {
  await withTempDir(async (ws) => {
    await fs.mkdir(ws, { recursive: true });
    await gitManager.ensureRepo(ws, { default_branch: "main", user_name: "t", user_email: "t@t" });

    // verifyAll checks appliedFiles for .git prefix directly — no need to actually modify .git
    const res = await verifier.verifyAll(
      { task_id: "t", instruction: "edit git config" },
      ws,
      { ok: true, appliedFiles: [".git/config"], error: null },
      gitManager,
      fsTools
    );
    assert.equal(res.ok, false);
    assert.ok(res.issues.some((i) => i.kind === "unsafe_path" && i.file === ".git/config"));
  });
});

test("verifier: rejects edits to .git/ prefix paths", async () => {
  await withTempDir(async (ws) => {
    await fs.mkdir(ws, { recursive: true });
    await gitManager.ensureRepo(ws, { default_branch: "main", user_name: "t", user_email: "t@t" });

    await fs.writeFile(path.join(ws, ".git", "HEAD"), "old", "utf8");

    const res = await verifier.verifyAll(
      { task_id: "t", instruction: "edit git HEAD" },
      ws,
      { ok: true, appliedFiles: [".git/HEAD"], error: null },
      gitManager,
      fsTools
    );
    assert.equal(res.ok, false);
    assert.ok(res.issues.some((i) => i.kind === "unsafe_path" && i.file === ".git/HEAD"));
  });
});

// --- verifyAll: JSON/YAML syntax ---

test("verifier: detects JSON parse error", async () => {
  await withTempDir(async (ws) => {
    await fs.mkdir(ws, { recursive: true });
    await gitManager.ensureRepo(ws, { default_branch: "main", user_name: "t", user_email: "t@t" });

    await fs.writeFile(path.join(ws, "bad.json"), '{"invalid": json}', "utf8");

    const res = await verifier.verifyAll(
      { task_id: "t", instruction: "edit bad.json" },
      ws,
      { ok: true, appliedFiles: ["bad.json"], error: null },
      gitManager,
      fsTools
    );
    assert.equal(res.ok, false);
    assert.ok(res.issues.some((i) => i.kind === "json_parse_error"));
  });
});

test("verifier: detects empty YAML file", async () => {
  await withTempDir(async (ws) => {
    await fs.mkdir(ws, { recursive: true });
    await gitManager.ensureRepo(ws, { default_branch: "main", user_name: "t", user_email: "t@t" });

    await fs.writeFile(path.join(ws, "empty.yaml"), "", "utf8");

    const res = await verifier.verifyAll(
      { task_id: "t", instruction: "edit empty.yaml" },
      ws,
      { ok: true, appliedFiles: ["empty.yaml"], error: null },
      gitManager,
      fsTools
    );
    assert.equal(res.ok, false);
    assert.ok(res.issues.some((i) => i.kind === "yaml_empty"));
  });
});

// --- verifyAll: JS syntax ---

test("verifier: detects JS syntax error via node --check", async () => {
  await withTempDir(async (ws) => {
    await fs.mkdir(ws, { recursive: true });
    await gitManager.ensureRepo(ws, { default_branch: "main", user_name: "t", user_email: "t@t" });

    await fs.writeFile(path.join(ws, "bad.js"), "function(){", "utf8");

    const res = await verifier.verifyAll(
      { task_id: "t", instruction: "edit bad.js" },
      ws,
      { ok: true, appliedFiles: ["bad.js"], error: null },
      gitManager,
      fsTools
    );
    assert.equal(res.ok, false);
    assert.ok(res.issues.some((i) => i.kind === "syntax_error"));
  });
});

// --- verifyAll: deletion policy ---

test("verifier: allows deletion when instruction contains delete/remove", async () => {
  await withTempDir(async (ws) => {
    await fs.mkdir(ws, { recursive: true });
    await gitManager.ensureRepo(ws, { default_branch: "main", user_name: "t", user_email: "t@t" });

    await fs.writeFile(path.join(ws, "old.txt"), "content", "utf8");
    await gitManager.runGit(ws, ["add", "-A"]);
    await gitManager.runGit(ws, ["commit", "-m", "seed"]);

    // Simulate a delete (status D) - no file on disk
    const res = await verifier.verifyAll(
      { task_id: "t", instruction: "delete old.txt" },
      ws,
      { ok: true, appliedFiles: ["old.txt"], error: null },
      gitManager,
      fsTools
    );
    // Should NOT have deletion_not_allowed issue
    assert.ok(!res.issues.some((i) => i.kind === "deletion_not_allowed"));
  });
});

test("verifier: blocks deletion when instruction does not imply it", async () => {
  await withTempDir(async (ws) => {
    await fs.mkdir(ws, { recursive: true });
    await gitManager.ensureRepo(ws, { default_branch: "main", user_name: "t", user_email: "t@t" });

    // Commit a file
    await fs.writeFile(path.join(ws, "old.txt"), "content", "utf8");
    await gitManager.runGit(ws, ["add", "-A"]);
    await gitManager.runGit(ws, ["commit", "-m", "seed"]);

    // Manually delete the file from working tree (not staged) — this creates a
    // working-tree deletion that shows in `git diff --name-status`
    await fs.unlink(path.join(ws, "old.txt"));

    // Verify with a neutral instruction
    const res = await verifier.verifyAll(
      { task_id: "t", instruction: "edit old.txt" },
      ws,
      { ok: true, appliedFiles: ["old.txt"], error: null },
      gitManager,
      fsTools
    );
    // Should have deletion_not_allowed issue since "edit" doesn't imply delete
    assert.equal(res.ok, false);
    assert.ok(res.issues.some((i) => i.kind === "deletion_not_allowed"));
  });
});

test("verifier: allows deletion when config allows it", async () => {
  await withTempDir(async (ws) => {
    await fs.mkdir(ws, { recursive: true });
    await gitManager.ensureRepo(ws, { default_branch: "main", user_name: "t", user_email: "t@t" });

    await fs.writeFile(path.join(ws, "old.txt"), "content", "utf8");
    await gitManager.runGit(ws, ["add", "-A"]);
    await gitManager.runGit(ws, ["commit", "-m", "seed"]);

    const res = await verifier.verifyAll(
      { task_id: "t", instruction: "edit old.txt" },
      ws,
      { ok: true, appliedFiles: ["old.txt"], error: null },
      gitManager,
      fsTools,
      { verification: { allow_deletions: true } }
    );
    assert.ok(!res.issues.some((i) => i.kind === "deletion_not_allowed"));
  });
});

// --- verifyAll: missing file ---

test("verifier: handles missing file gracefully", async () => {
  await withTempDir(async (ws) => {
    await fs.mkdir(ws, { recursive: true });
    await gitManager.ensureRepo(ws, { default_branch: "main", user_name: "t", user_email: "t@t" });

    const res = await verifier.verifyAll(
      { task_id: "t", instruction: "edit missing.js" },
      ws,
      { ok: true, appliedFiles: ["missing.js"], error: null },
      gitManager,
      fsTools
    );
    assert.equal(res.ok, false);
    assert.ok(res.issues.some((i) => i.kind === "missing_file"));
  });
});

// --- verifyAll: suspicious truncation ---

test("verifier: detects suspicious truncation (large -> tiny)", async () => {
  await withTempDir(async (ws) => {
    await fs.mkdir(ws, { recursive: true });
    await gitManager.ensureRepo(ws, { default_branch: "main", user_name: "t", user_email: "t@t" });

    // Create a file with substantial content
    await fs.writeFile(path.join(ws, "big.txt"), "x".repeat(200), "utf8");
    await gitManager.runGit(ws, ["add", "-A"]);
    await gitManager.runGit(ws, ["commit", "-m", "seed"]);

    // Replace with tiny content
    await fs.writeFile(path.join(ws, "big.txt"), "x", "utf8");

    const res = await verifier.verifyAll(
      { task_id: "t", instruction: "edit big.txt" },
      ws,
      { ok: true, appliedFiles: ["big.txt"], error: null },
      gitManager,
      fsTools
    );
    assert.equal(res.ok, false);
    assert.ok(res.issues.some((i) => i.kind === "suspicious_truncation"));
  });
});

test("verifier: allows tiny overwrite when instruction implies clear/delete", async () => {
  await withTempDir(async (ws) => {
    await fs.mkdir(ws, { recursive: true });
    await gitManager.ensureRepo(ws, { default_branch: "main", user_name: "t", user_email: "t@t" });

    await fs.writeFile(path.join(ws, "big.txt"), "x".repeat(200), "utf8");
    await gitManager.runGit(ws, ["add", "-A"]);
    await gitManager.runGit(ws, ["commit", "-m", "seed"]);

    await fs.writeFile(path.join(ws, "big.txt"), "", "utf8");

    const res = await verifier.verifyAll(
      { task_id: "t", instruction: "clear big.txt" },
      ws,
      { ok: true, appliedFiles: ["big.txt"], error: null },
      gitManager,
      fsTools
    );
    // Should NOT have suspicious_truncation because instruction implies clear/delete
    assert.ok(!res.issues.some((i) => i.kind === "suspicious_truncation"));
  });
});

// --- semanticVerify ---

test("verifier: semanticVerify returns ok when no gitManager", async () => {
  const res = await verifier.semanticVerify({ task_id: "t" }, "/fake", null, null);
  assert.equal(res.ok, true);
  assert.deepEqual(res.issues, []);
});

test("verifier: semanticVerify returns error when claudeProvider unavailable", async () => {
  await withTempDir(async (ws) => {
    await fs.mkdir(ws, { recursive: true });
    await gitManager.ensureRepo(ws, { default_branch: "main", user_name: "t", user_email: "t@t" });

    const res = await verifier.semanticVerify({ task_id: "t" }, ws, gitManager, null);
    assert.equal(res.ok, false);
    assert.ok(res.issues.some((i) => i.message.includes("unavailable")));
  });
});

test("verifier: semanticVerify returns ok with empty diff", async () => {
  await withTempDir(async (ws) => {
    await fs.mkdir(ws, { recursive: true });
    await gitManager.ensureRepo(ws, { default_branch: "main", user_name: "t", user_email: "t@t" });

    await fs.writeFile(path.join(ws, "a.txt"), "unchanged\n", "utf8");
    await gitManager.runGit(ws, ["add", "-A"]);
    await gitManager.runGit(ws, ["commit", "-m", "seed"]);

    const review = { ok: true, issues: [], feedback_for_generator: "no changes" };
    const reviewPath = path.join(ws, "mock_review.json");
    await fs.writeFile(reviewPath, JSON.stringify(review), "utf8");
    process.env.AGENT_BRIDGE_REVIEW_RESPONSE_FILE = reviewPath;

    const claude = adapter.createProvider("claude_cli", { anthropic: { cli_path: "claude", model: "" } });
    const res = await verifier.semanticVerify({ task_id: "t", instruction: "edit a.txt" }, ws, gitManager, claude);
    assert.equal(res.ok, true);
    assert.ok(res.feedback_for_generator.includes("no changes"));

    delete process.env.AGENT_BRIDGE_REVIEW_RESPONSE_FILE;
  });
});

test("verifier: semanticVerify truncates large diff", async () => {
  await withTempDir(async (ws) => {
    await fs.mkdir(ws, { recursive: true });
    await gitManager.ensureRepo(ws, { default_branch: "main", user_name: "t", user_email: "t@t" });

    await fs.writeFile(path.join(ws, "a.txt"), "start\n", "utf8");
    await gitManager.runGit(ws, ["add", "-A"]);
    await gitManager.runGit(ws, ["commit", "-m", "seed"]);

    // Write a large diff
    await fs.writeFile(path.join(ws, "a.txt"), "x".repeat(500000), "utf8");

    const review = { ok: true, issues: [], feedback_for_generator: "large diff ok" };
    const reviewPath = path.join(ws, "mock_review.json");
    await fs.writeFile(reviewPath, JSON.stringify(review), "utf8");
    process.env.AGENT_BRIDGE_REVIEW_RESPONSE_FILE = reviewPath;

    const claude = adapter.createProvider("claude_cli", { anthropic: { cli_path: "claude", model: "" } });
    // Use a small max_diff_bytes to force truncation
    const res = await verifier.semanticVerify(
      { task_id: "t", instruction: "edit a.txt" },
      ws,
      gitManager,
      claude,
      { max_diff_bytes: 1000 }
    );
    assert.equal(res.ok, true);

    delete process.env.AGENT_BRIDGE_REVIEW_RESPONSE_FILE;
  });
});

test("verifier: semanticVerify consumes structured review JSON (mocked)", async () => {
  await withTempDir(async (ws) => {
    await fs.mkdir(ws, { recursive: true });
    await gitManager.ensureRepo(ws, { default_branch: "main", user_name: "t", user_email: "t@t" });

    await fs.writeFile(path.join(ws, "a.txt"), "old\n", "utf8");
    await gitManager.runGit(ws, ["add", "-A"]);
    await gitManager.runGit(ws, ["commit", "-m", "seed"]);

    await fs.writeFile(path.join(ws, "a.txt"), "new\n", "utf8");

    const review = {
      ok: false,
      issues: [{ severity: "blocker", message: "needs fix", file: "a.txt" }],
      feedback_for_generator: "please fix logic"
    };

    const reviewPath = path.join(ws, "mock_review.json");
    await fs.writeFile(reviewPath, JSON.stringify(review), "utf8");
    process.env.AGENT_BRIDGE_REVIEW_RESPONSE_FILE = reviewPath;

    const claude = adapter.createProvider("claude_cli", { anthropic: { cli_path: "claude", model: "" } });
    const res = await verifier.semanticVerify(
      { task_id: "t", instruction: "edit a.txt" },
      ws,
      gitManager,
      claude
    );
    assert.equal(res.ok, false);
    assert.ok(res.feedback_for_generator.includes("fix"));

    delete process.env.AGENT_BRIDGE_REVIEW_RESPONSE_FILE;
  });
});
