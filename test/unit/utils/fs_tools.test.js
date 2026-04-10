const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const os = require("node:os");
const fs = require("node:fs/promises");

const fsTools = require("../../../src/utils/fs_tools");

async function withTempDir(fn) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "agent_bridge_fs_"));
  try {
    return await fn(dir);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

// --- resolveInWorkspace ---

test("resolveInWorkspace: returns safeRel and abs", async () => {
  await withTempDir(async (ws) => {
    const r = fsTools.resolveInWorkspace(ws, "a.txt");
    assert.equal(r.safeRel, "a.txt");
    assert.equal(r.abs, path.join(ws, "a.txt"));
  });
});

test("resolveInWorkspace: rejects absolute paths", async () => {
  await withTempDir(async (ws) => {
    assert.throws(
      () => fsTools.resolveInWorkspace(ws, "/etc/passwd"),
      /Unsafe FILE path.*absolute/
    );
  });
});

test("resolveInWorkspace: rejects .. escape", async () => {
  await withTempDir(async (ws) => {
    assert.throws(
      () => fsTools.resolveInWorkspace(ws, "../foo"),
      /Unsafe FILE path/
    );
  });
});

test("resolveInWorkspace: rejects .git", async () => {
  await withTempDir(async (ws) => {
    assert.throws(
      () => fsTools.resolveInWorkspace(ws, ".git/config"),
      /do not reference \.git/
    );
  });
});

test("resolveInWorkspace: rejects path outside workspace", async () => {
  await withTempDir(async (ws) => {
    // "../sibling" is caught first by assertSafeRelPath as Unsafe FILE path
    assert.throws(
      () => fsTools.resolveInWorkspace(ws, "../sibling"),
      /Unsafe FILE path/
    );
  });
});

test("resolveInWorkspace: accepts nested paths", async () => {
  await withTempDir(async (ws) => {
    const r = fsTools.resolveInWorkspace(ws, "foo/bar/baz.txt");
    assert.equal(r.safeRel, path.join("foo", "bar", "baz.txt"));
  });
});

// --- isWithinWorkspace ---

test("isWithinWorkspace: true for nested file", async () => {
  await withTempDir(async (ws) => {
    assert.equal(fsTools.isWithinWorkspace(ws, "a.txt"), true);
    assert.equal(fsTools.isWithinWorkspace(ws, "foo/bar.js"), true);
  });
});

test("isWithinWorkspace: false for .. escape", async () => {
  await withTempDir(async (ws) => {
    assert.equal(fsTools.isWithinWorkspace(ws, "../foo"), false);
  });
});

test("isWithinWorkspace: false for absolute path", async () => {
  await withTempDir(async (ws) => {
    assert.equal(fsTools.isWithinWorkspace(ws, "/etc/passwd"), false);
  });
});

test("isWithinWorkspace: false for .git", async () => {
  await withTempDir(async (ws) => {
    assert.equal(fsTools.isWithinWorkspace(ws, ".git/HEAD"), false);
  });
});
