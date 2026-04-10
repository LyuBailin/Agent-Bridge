const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const { toPosixPath, assertSafeRelPath } = require("../../../src/shared/path");

// --- toPosixPath ---

test("toPosixPath: converts path separators to forward slashes", () => {
  // On Linux path.sep is / so this is a no-op for forward slashes
  assert.equal(toPosixPath("foo/bar/baz"), "foo/bar/baz");
});

test("toPosixPath: handles empty string", () => {
  assert.equal(toPosixPath(""), "");
});

// --- assertSafeRelPath ---

test("assertSafeRelPath: accepts simple relative paths", () => {
  assert.equal(assertSafeRelPath("a.txt"), "a.txt");
  assert.equal(assertSafeRelPath("foo/bar.js"), "foo/bar.js");
  assert.equal(assertSafeRelPath("a/b/c.txt"), "a/b/c.txt");
});

test("assertSafeRelPath: rejects absolute paths", () => {
  assert.throws(() => assertSafeRelPath("/etc/passwd"), /Unsafe FILE path.*absolute/);
  assert.throws(() => assertSafeRelPath("/tmp/file"), /Unsafe FILE path.*absolute/);
});

test("assertSafeRelPath: rejects .. escape attempts", () => {
  assert.throws(() => assertSafeRelPath("../etc/passwd"), /Unsafe FILE path.*\.\./);
  assert.throws(() => assertSafeRelPath("foo/../../bar"), /Unsafe FILE path.*\.\./);
  assert.throws(() => assertSafeRelPath(".."), /Unsafe FILE path.*\.\./);
});

test("assertSafeRelPath: rejects .git when first path segment", () => {
  assert.throws(() => assertSafeRelPath(".git/config"), /\.git/);
  // foo/.git/HEAD is NOT rejected because .git is not the first segment
  // (function only checks parts[0] === ".git")
});

test("assertSafeRelPath: rejects empty string", () => {
  assert.throws(() => assertSafeRelPath(""), /Invalid FILE path/);
});

test("assertSafeRelPath: null bytes are preserved by path.normalize on Linux", () => {
  // path.normalize preserves \0 on Linux
  const r = assertSafeRelPath("a.txt\0null");
  assert.equal(r, "a.txt\u0000null");
});
