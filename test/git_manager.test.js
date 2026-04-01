const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs/promises");
const os = require("node:os");

const gitManager = require("../bridge/git_manager");
const fsTools = require("../bridge/fs_tools");

async function withTempDir(fn) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "agent_bridge_test_"));
  try {
    return await fn(dir);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

test("applySearchReplaceChanges: overwrite creates file", async () => {
  await withTempDir(async (ws) => {
    await fs.mkdir(ws, { recursive: true });
    await gitManager.ensureRepo(ws, { default_branch: "main", user_name: "t", user_email: "t@t" });
    const snap = await gitManager.createSnapshot(ws);
    await gitManager.applySearchReplaceChanges(
      ws,
      [{ file: "a.txt", search: "", replace: "hello" }],
      fsTools
    );
    const text = await fs.readFile(path.join(ws, "a.txt"), "utf8");
    assert.equal(text, "hello");
    await gitManager.rollback(ws, snap);
  });
});

test("applySearchReplaceChanges: non-unique SEARCH fails", async () => {
  await withTempDir(async (ws) => {
    await fs.mkdir(ws, { recursive: true });
    await gitManager.ensureRepo(ws, { default_branch: "main", user_name: "t", user_email: "t@t" });
    await fs.writeFile(path.join(ws, "a.txt"), "x x x", "utf8");
    await gitManager.runGit(ws, ["add", "-A"]);
    await gitManager.runGit(ws, ["commit", "-m", "seed"]);
    await assert.rejects(
      () =>
        gitManager.applySearchReplaceChanges(
          ws,
          [{ file: "a.txt", search: "x", replace: "y" }],
          fsTools
        ),
      /exactly once/
    );
  });
});

test("safeApplyPatch: non-unique SEARCH returns structured error", async () => {
  await withTempDir(async (ws) => {
    await fs.mkdir(ws, { recursive: true });
    await gitManager.ensureRepo(ws, { default_branch: "main", user_name: "t", user_email: "t@t" });
    await fs.writeFile(path.join(ws, "a.txt"), "x x x", "utf8");
    await gitManager.runGit(ws, ["add", "-A"]);
    await gitManager.runGit(ws, ["commit", "-m", "seed"]);

    const res = await gitManager.safeApplyPatch(
      ws,
      [{ file: "a.txt", search: "x", replace: "y" }],
      fsTools
    );
    assert.equal(res.ok, false);
    assert.equal(res.error.kind, "invalid_change");
  });
});

test("commitCheckpoint: no changes returns null", async () => {
  await withTempDir(async (ws) => {
    await fs.mkdir(ws, { recursive: true });
    await gitManager.ensureRepo(ws, { default_branch: "main", user_name: "t", user_email: "t@t" });
    const sha = await gitManager.commitCheckpoint(ws, { taskId: "t", subtaskId: "s1" });
    assert.equal(sha, null);
  });
});

test("commitCheckpoint: changes creates a checkpoint commit", async () => {
  await withTempDir(async (ws) => {
    await fs.mkdir(ws, { recursive: true });
    await gitManager.ensureRepo(ws, { default_branch: "main", user_name: "t", user_email: "t@t" });
    await fs.writeFile(path.join(ws, "x.txt"), "hello", "utf8");
    const sha = await gitManager.commitCheckpoint(ws, { taskId: "t", subtaskId: "s1" });
    assert.ok(sha);
  });
});

test("squashAndCommit: squashes changes since baseSha into one commit", async () => {
  await withTempDir(async (ws) => {
    await fs.mkdir(ws, { recursive: true });
    await gitManager.ensureRepo(ws, { default_branch: "main", user_name: "t", user_email: "t@t" });
    const base = await gitManager.getHeadSha(ws);

    await fs.writeFile(path.join(ws, "a.txt"), "a1", "utf8");
    await gitManager.commitCheckpoint(ws, { taskId: "t", subtaskId: "s1" });
    await fs.writeFile(path.join(ws, "b.txt"), "b1", "utf8");
    await gitManager.commitCheckpoint(ws, { taskId: "t", subtaskId: "s2" });

    const res = await gitManager.squashAndCommit(ws, { taskId: "t", baseSha: base });
    assert.equal(res.changed, true);
    assert.ok(res.commit);

    const { stdout } = await gitManager.runGit(ws, ["log", "--pretty=%s"]);
    const subjects = stdout.trim().split(/\r?\n/);
    // Expect bootstrap + final squash commit (at least).
    assert.ok(subjects.some((s) => s.startsWith("task: t")));
  });
});
