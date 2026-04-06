const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs/promises");
const os = require("node:os");

const gitManager = require("../src/core/git_manager");
const fsTools = require("../src/utils/fs_tools");
const adapter = require("../src/core/adapter");
const verifier = require("../src/core/verifier");

async function withTempDir(fn) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "agent_bridge_test_"));
  try {
    return await fn(dir);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

test("verifier: detects JS syntax error via node --check", async () => {
  await withTempDir(async (ws) => {
    await fs.mkdir(ws, { recursive: true });
    await gitManager.ensureRepo(ws, { default_branch: "main", user_name: "t", user_email: "t@t" });

    // Create a JS file with invalid syntax and stage it as a working-tree change.
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
