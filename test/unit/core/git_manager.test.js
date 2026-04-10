const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs/promises");
const os = require("node:os");

const gitManager = require("../../../src/core/git_manager");
const fsTools = require("../../../src/utils/fs_tools");

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

test("squashAndCommit: no changes returns changed:false", async () => {
  await withTempDir(async (ws) => {
    await fs.mkdir(ws, { recursive: true });
    await gitManager.ensureRepo(ws, { default_branch: "main", user_name: "t", user_email: "t@t" });
    const base = await gitManager.getHeadSha(ws);
    const res = await gitManager.squashAndCommit(ws, { taskId: "t", baseSha: base });
    assert.equal(res.changed, false);
    assert.equal(res.commit, null);
  });
});

test("squashAndCommit: throws without baseSha", async () => {
  await withTempDir(async (ws) => {
    await fs.mkdir(ws, { recursive: true });
    await gitManager.ensureRepo(ws, { default_branch: "main", user_name: "t", user_email: "t@t" });
    await assert.rejects(() => gitManager.squashAndCommit(ws, {}), /requires baseSha/);
  });
});

// --- rollback ---

test("rollback: resets to snapshot and cleans untracked files", async () => {
  await withTempDir(async (ws) => {
    await fs.mkdir(ws, { recursive: true });
    await gitManager.ensureRepo(ws, { default_branch: "main", user_name: "t", user_email: "t@t" });
    await fs.writeFile(path.join(ws, "a.txt"), "v1", "utf8");
    await gitManager.commitCheckpoint(ws, { taskId: "t", subtaskId: "s1" });
    await fs.writeFile(path.join(ws, "b.txt"), "v2", "utf8"); // uncommitted
    const sha = await gitManager.getHeadSha(ws);

    await fs.writeFile(path.join(ws, "a.txt"), "v2", "utf8"); // modify tracked
    await gitManager.rollback(ws, sha);

    const a = await fs.readFile(path.join(ws, "a.txt"), "utf8");
    assert.equal(a, "v1"); // reverted
    const bExists = await fs.access(path.join(ws, "b.txt")).then(() => true).catch(() => false);
    assert.equal(bExists, false); // untracked cleaned
  });
});

test("rollback: throws without snapshotSha", async () => {
  await withTempDir(async (ws) => {
    await fs.mkdir(ws, { recursive: true });
    await gitManager.ensureRepo(ws, { default_branch: "main", user_name: "t", user_email: "t@t" });
    await assert.rejects(() => gitManager.rollback(ws, null), /requires snapshotSha/);
    await assert.rejects(() => gitManager.rollback(ws, ""), /requires snapshotSha/);
  });
});

// --- rollbackToSha ---

test("rollbackToSha: an alias for rollback", async () => {
  await withTempDir(async (ws) => {
    await fs.mkdir(ws, { recursive: true });
    await gitManager.ensureRepo(ws, { default_branch: "main", user_name: "t", user_email: "t@t" });
    await fs.writeFile(path.join(ws, "a.txt"), "v1", "utf8");
    const sha = await gitManager.commitCheckpoint(ws, { taskId: "t", subtaskId: "s1" });
    await fs.writeFile(path.join(ws, "a.txt"), "v2", "utf8");
    await gitManager.rollbackToSha(ws, sha);
    const a = await fs.readFile(path.join(ws, "a.txt"), "utf8");
    assert.equal(a, "v1");
  });
});

// --- safeApplyPatch: mkdir ---

test("safeApplyPatch: mkdir creates directory", async () => {
  await withTempDir(async (ws) => {
    await fs.mkdir(ws, { recursive: true });
    await gitManager.ensureRepo(ws, { default_branch: "main", user_name: "t", user_email: "t@t" });
    const res = await gitManager.safeApplyPatch(ws, [{ type: "mkdir", path: "newdir/subdir" }], fsTools);
    assert.equal(res.ok, true);
    const stat = await fs.stat(path.join(ws, "newdir", "subdir"));
    assert.ok(stat.isDirectory());
  });
});

test("safeApplyPatch: mkdir rejects absolute path", async () => {
  await withTempDir(async (ws) => {
    await fs.mkdir(ws, { recursive: true });
    await gitManager.ensureRepo(ws, { default_branch: "main", user_name: "t", user_email: "t@t" });
    const res = await gitManager.safeApplyPatch(ws, [{ type: "mkdir", path: "/tmp/evil" }], fsTools);
    assert.equal(res.ok, false);
    assert.equal(res.error.kind, "unsafe_path");
  });
});

test("safeApplyPatch: mkdir rejects missing path field", async () => {
  await withTempDir(async (ws) => {
    await fs.mkdir(ws, { recursive: true });
    await gitManager.ensureRepo(ws, { default_branch: "main", user_name: "t", user_email: "t@t" });
    const res = await gitManager.safeApplyPatch(ws, [{ type: "mkdir" }], fsTools);
    assert.equal(res.ok, false);
    assert.equal(res.error.kind, "invalid_mkdir");
  });
});

// --- safeApplyPatch: rm ---

test("safeApplyPatch: rm removes file", async () => {
  await withTempDir(async (ws) => {
    await fs.mkdir(ws, { recursive: true });
    await gitManager.ensureRepo(ws, { default_branch: "main", user_name: "t", user_email: "t@t" });
    await fs.writeFile(path.join(ws, "a.txt"), "hello", "utf8");
    const res = await gitManager.safeApplyPatch(ws, [{ type: "rm", path: "a.txt" }], fsTools);
    assert.equal(res.ok, true);
    const exists = await fs.access(path.join(ws, "a.txt")).then(() => true).catch(() => false);
    assert.equal(exists, false);
  });
});

test("safeApplyPatch: rm ignores non-existent file", async () => {
  await withTempDir(async (ws) => {
    await fs.mkdir(ws, { recursive: true });
    await gitManager.ensureRepo(ws, { default_branch: "main", user_name: "t", user_email: "t@t" });
    const res = await gitManager.safeApplyPatch(ws, [{ type: "rm", path: "nonexistent.txt" }], fsTools);
    assert.equal(res.ok, true); // no error for already-gone
  });
});

test("safeApplyPatch: rm rejects absolute path", async () => {
  await withTempDir(async (ws) => {
    await fs.mkdir(ws, { recursive: true });
    await gitManager.ensureRepo(ws, { default_branch: "main", user_name: "t", user_email: "t@t" });
    const res = await gitManager.safeApplyPatch(ws, [{ type: "rm", path: "/etc/passwd" }], fsTools);
    assert.equal(res.ok, false);
    assert.equal(res.error.kind, "unsafe_path");
  });
});

// --- safeApplyPatch: mv ---

test("safeApplyPatch: mv renames file", async () => {
  await withTempDir(async (ws) => {
    await fs.mkdir(ws, { recursive: true });
    await gitManager.ensureRepo(ws, { default_branch: "main", user_name: "t", user_email: "t@t" });
    await fs.writeFile(path.join(ws, "old.txt"), "content", "utf8");
    const res = await gitManager.safeApplyPatch(ws, [{ type: "mv", from: "old.txt", to: "new.txt" }], fsTools);
    assert.equal(res.ok, true);
    const oldExists = await fs.access(path.join(ws, "old.txt")).then(() => true).catch(() => false);
    const newContent = await fs.readFile(path.join(ws, "new.txt"), "utf8");
    assert.equal(oldExists, false);
    assert.equal(newContent, "content");
  });
});

test("safeApplyPatch: mv rejects missing source", async () => {
  await withTempDir(async (ws) => {
    await fs.mkdir(ws, { recursive: true });
    await gitManager.ensureRepo(ws, { default_branch: "main", user_name: "t", user_email: "t@t" });
    const res = await gitManager.safeApplyPatch(ws, [{ type: "mv", from: "ghost.txt", to: "new.txt" }], fsTools);
    assert.equal(res.ok, false);
    assert.equal(res.error.kind, "source_missing");
  });
});

test("safeApplyPatch: mv rejects unsafe from path", async () => {
  await withTempDir(async (ws) => {
    await fs.mkdir(ws, { recursive: true });
    await gitManager.ensureRepo(ws, { default_branch: "main", user_name: "t", user_email: "t@t" });
    const res = await gitManager.safeApplyPatch(ws, [{ type: "mv", from: "/etc/passwd", to: "new.txt" }], fsTools);
    assert.equal(res.ok, false);
    assert.equal(res.error.kind, "unsafe_path");
  });
});

test("safeApplyPatch: mv rejects missing from/to", async () => {
  await withTempDir(async (ws) => {
    await fs.mkdir(ws, { recursive: true });
    await gitManager.ensureRepo(ws, { default_branch: "main", user_name: "t", user_email: "t@t" });
    const res = await gitManager.safeApplyPatch(ws, [{ type: "mv", from: "a.txt" }], fsTools);
    assert.equal(res.ok, false);
    assert.equal(res.error.kind, "invalid_mv");
  });
});

// --- safeApplyPatch: unknown type ---

test("safeApplyPatch: rejects unknown change type", async () => {
  await withTempDir(async (ws) => {
    await fs.mkdir(ws, { recursive: true });
    await gitManager.ensureRepo(ws, { default_branch: "main", user_name: "t", user_email: "t@t" });
    const res = await gitManager.safeApplyPatch(ws, [{ type: "unknown_op" }], fsTools);
    assert.equal(res.ok, false);
    assert.equal(res.error.kind, "unknown_type");
  });
});

// --- safeApplyPatch: empty changes ---

test("safeApplyPatch: no changes returns ok:false with invalid_change", async () => {
  await withTempDir(async (ws) => {
    await fs.mkdir(ws, { recursive: true });
    await gitManager.ensureRepo(ws, { default_branch: "main", user_name: "t", user_email: "t@t" });
    const res = await gitManager.safeApplyPatch(ws, [], fsTools);
    assert.equal(res.ok, false);
    assert.equal(res.error.kind, "invalid_change");
  });
});

test("safeApplyPatch: missing change type field returns ok:false", async () => {
  await withTempDir(async (ws) => {
    await fs.mkdir(ws, { recursive: true });
    await gitManager.ensureRepo(ws, { default_branch: "main", user_name: "t", user_email: "t@t" });
    const res = await gitManager.safeApplyPatch(ws, [{ file: "a.txt" }], fsTools);
    assert.equal(res.ok, false);
    assert.equal(res.error.kind, "invalid_change");
  });
});

// --- ensureRepo ---

test("ensureRepo: creates new repo with bootstrap commit", async () => {
  await withTempDir(async (ws) => {
    await gitManager.ensureRepo(ws, { default_branch: "main", user_name: "t", user_email: "t@t" });
    const sha = await gitManager.getHeadSha(ws);
    assert.ok(sha);
    const { stdout } = await gitManager.runGit(ws, ["log", "--pretty=%s"]);
    assert.ok(stdout.includes("bootstrap"));
  });
});

// --- verifyAndCommit ---

test("verifyAndCommit: no changes returns changed:false", async () => {
  await withTempDir(async (ws) => {
    await fs.mkdir(ws, { recursive: true });
    await gitManager.ensureRepo(ws, { default_branch: "main", user_name: "t", user_email: "t@t" });
    const res = await gitManager.verifyAndCommit(ws, "t1");
    assert.equal(res.changed, false);
    assert.equal(res.commit, null);
  });
});

test("verifyAndCommit: staged+unstaged changes creates commit", async () => {
  await withTempDir(async (ws) => {
    await fs.mkdir(ws, { recursive: true });
    await gitManager.ensureRepo(ws, { default_branch: "main", user_name: "t", user_email: "t@t" });
    await fs.writeFile(path.join(ws, "a.txt"), "hello", "utf8");
    const res = await gitManager.verifyAndCommit(ws, "t1");
    assert.equal(res.changed, true);
    assert.ok(res.commit);
  });
});

// --- runGit ---

test("runGit: throws with stderr on bad command", async () => {
  await withTempDir(async (ws) => {
    await fs.mkdir(ws, { recursive: true });
    await gitManager.ensureRepo(ws, { default_branch: "main", user_name: "t", user_email: "t@t" });
    await assert.rejects(() => gitManager.runGit(ws, ["nonexistent-command"]), /failed/);
  });
});
