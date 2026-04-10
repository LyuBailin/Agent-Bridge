const test = require("node:test");
const assert = require("node:assert/strict");

const { parseArgs } = require("../../../src/core/polling");

test("parseArgs: defaults", () => {
  const result = parseArgs([]);
  assert.equal(result.once, false);
  assert.equal(result.root, process.cwd());
});

test("parseArgs: --once sets once=true", () => {
  const result = parseArgs(["--once"]);
  assert.equal(result.once, true);
});

test("parseArgs: --root sets root", () => {
  const result = parseArgs(["--root", "/tmp/foo"]);
  assert.equal(result.once, false);
  assert.equal(result.root, "/tmp/foo");
});

test("parseArgs: --root resolves relative paths", () => {
  const result = parseArgs(["--root", "foo/bar"]);
  assert.equal(result.root, require("node:path").resolve("foo/bar"));
});

test("parseArgs: --root followed by --once", () => {
  const result = parseArgs(["--root", "/tmp/x", "--once"]);
  assert.equal(result.root, "/tmp/x");
  assert.equal(result.once, true);
});

test("parseArgs: --once followed by --root", () => {
  const result = parseArgs(["--once", "--root", "/tmp/y"]);
  assert.equal(result.once, true);
  assert.equal(result.root, "/tmp/y");
});

test("parseArgs: --root at end without value keeps cwd", () => {
  // When --root is last with no following arg, path.resolve(undefined) returns cwd
  const result = parseArgs(["--root"]);
  assert.equal(result.root, process.cwd());
});
