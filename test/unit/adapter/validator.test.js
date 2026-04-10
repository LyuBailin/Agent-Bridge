const test = require("node:test");
const assert = require("node:assert/strict");

const validator = require("../../../src/core/adapter/validator");

// --- detectOperationType ---

test("detectOperationType: 'content-only' for content keywords", () => {
  assert.equal(validator.detectOperationType("update a.txt"), "content-only");
  assert.equal(validator.detectOperationType("edit b.txt"), "content-only");
  assert.equal(validator.detectOperationType("fix c.js"), "content-only");
  assert.equal(validator.detectOperationType("refactor module"), "content-only");
  assert.equal(validator.detectOperationType("require a.js"), "content-only");
  assert.equal(validator.detectOperationType("import b.js"), "content-only");
});

test("detectOperationType: 'fileops-only' for file operation keywords", () => {
  // Keywords include colons for mv:/mkdir:/rm: or full phrases
  assert.equal(validator.detectOperationType("mv: old -> new"), "fileops-only");
  assert.equal(validator.detectOperationType("rename a.txt"), "fileops-only");
  assert.equal(validator.detectOperationType("delete file x"), "fileops-only");
  assert.equal(validator.detectOperationType("rm: unused.js"), "fileops-only");
  assert.equal(validator.detectOperationType("move a.txt to b.txt"), "fileops-only");
});

test("detectOperationType: 'mixed' when both keywords present", () => {
  assert.equal(validator.detectOperationType("move a.txt and update b.txt"), "mixed");
  assert.equal(validator.detectOperationType("rename a.txt and edit b.txt"), "mixed");
});

test("detectOperationType: 'mixed' for empty/null instruction", () => {
  assert.equal(validator.detectOperationType(""), "mixed");
  assert.equal(validator.detectOperationType(null), "mixed");
  assert.equal(validator.detectOperationType(undefined), "mixed");
});

test("detectOperationType: 'mixed' for unrecognized instruction", () => {
  assert.equal(validator.detectOperationType("do something"), "mixed");
});

// --- validateOperationSchema ---

test("validateOperationSchema: content-only accepts sr blocks", () => {
  const out = "```sr\nFILE: a.txt\nSEARCH:\n<<<\n>>>";
  const r = validator.validateOperationSchema(out, "content-only");
  assert.equal(r.valid, true);
  assert.deepEqual(r.blocksFound, ["sr"]);
});

test("validateOperationSchema: content-only rejects op blocks", () => {
  const out = "```op\nMKDIR: dir\n```";
  const r = validator.validateOperationSchema(out, "content-only");
  assert.equal(r.valid, false);
  assert.ok(r.errors.some((e) => e.includes("content-editing-only")));
});

test("validateOperationSchema: content-only rejects no blocks", () => {
  const r = validator.validateOperationSchema("no blocks", "content-only");
  assert.equal(r.valid, false);
  assert.ok(r.errors.some((e) => e.includes("No ```sr blocks")));
});

test("validateOperationSchema: fileops-only accepts op blocks", () => {
  const out = "```op\nMKDIR: dir\nMV: a -> b\nRM: c\n```";
  const r = validator.validateOperationSchema(out, "fileops-only");
  assert.equal(r.valid, true);
  assert.deepEqual(r.blocksFound, ["op"]);
});

test("validateOperationSchema: fileops-only rejects sr blocks", () => {
  const out = "```sr\nFILE: a.txt\nSEARCH:\n<<<\n>>>";
  const r = validator.validateOperationSchema(out, "fileops-only");
  assert.equal(r.valid, false);
  assert.ok(r.errors.some((e) => e.includes("file-operations-only")));
});

test("validateOperationSchema: fileops-only rejects no blocks", () => {
  const r = validator.validateOperationSchema("nothing", "fileops-only");
  assert.equal(r.valid, false);
  assert.ok(r.errors.some((e) => e.includes("No ```op blocks")));
});

test("validateOperationSchema: mixed accepts both", () => {
  const out = "```sr\nFILE: a.txt\nSEARCH:\n<<<\n>>>\n```op\nMKDIR: dir\n```";
  const r = validator.validateOperationSchema(out, "mixed");
  assert.equal(r.valid, true);
  assert.deepEqual(r.blocksFound, ["sr", "op"]);
});

test("validateOperationSchema: counts multiple sr/op blocks correctly", () => {
  const out = "```sr\n...\n```\n```sr\n...\n```\n```op\n...\n```";
  const r = validator.validateOperationSchema(out, "mixed");
  assert.equal(r.valid, true);
  assert.deepEqual(r.blocksFound, ["sr", "op"]);
});

// --- validateOperation ---

test("validateOperation: allows search_replace, mkdir, mv, rm", () => {
  validator.validateOperation("search_replace");
  validator.validateOperation("mkdir");
  validator.validateOperation("mv");
  validator.validateOperation("rm");
  // Should not throw
});

test("validateOperation: denies bash, npm, git, shell", () => {
  for (const denied of ["bash", "npm", "git", "shell", "exec", "run", "command"]) {
    assert.throws(() => validator.validateOperation(denied), new RegExp(`denied|not permitted`));
  }
});

test("validateOperation: throws on unknown operation", () => {
  assert.throws(() => validator.validateOperation("unknown_op"), /Unknown operation/);
});

// --- getPathFieldsFromArgs ---

test("getPathFieldsFromArgs: search_replace returns file", () => {
  const fields = validator.getPathFieldsFromArgs("search_replace", { file: "a.txt" });
  assert.deepEqual(fields, ["a.txt"]);
});

test("getPathFieldsFromArgs: mkdir returns path", () => {
  const fields = validator.getPathFieldsFromArgs("mkdir", { path: "dir" });
  assert.deepEqual(fields, ["dir"]);
});

test("getPathFieldsFromArgs: mv returns from and to", () => {
  const fields = validator.getPathFieldsFromArgs("mv", { from: "a.js", to: "b.js" });
  assert.deepEqual(fields, ["a.js", "b.js"]);
});

test("getPathFieldsFromArgs: rm returns path", () => {
  const fields = validator.getPathFieldsFromArgs("rm", { path: "c.js" });
  assert.deepEqual(fields, ["c.js"]);
});

test("getPathFieldsFromArgs: unknown returns empty", () => {
  const fields = validator.getPathFieldsFromArgs("unknown", {});
  assert.deepEqual(fields, []);
});

// --- validateChangeSet ---

test("validateChangeSet: no errors for valid changes", () => {
  const changes = [
    { type: "edit", file: "a.txt" },
    { type: "mkdir", path: "dir" },
    { type: "mv", from: "x.js", to: "y.js" },
    { type: "rm", path: "z.js" }
  ];
  const r = validator.validateChangeSet(changes);
  assert.equal(r.valid, true);
  assert.deepEqual(r.errors, []);
});

test("validateChangeSet: detects duplicate edit on same file", () => {
  const changes = [
    { type: "edit", file: "a.txt" },
    { type: "edit", file: "a.txt" }
  ];
  const r = validator.validateChangeSet(changes);
  assert.equal(r.valid, false);
  assert.ok(r.errors.some((e) => e.includes("Duplicate edit")));
});

test("validateChangeSet: detects conflicting operations on same path", () => {
  const changes = [
    { type: "mkdir", path: "dir" },
    { type: "rm", path: "dir" }
  ];
  const r = validator.validateChangeSet(changes);
  assert.equal(r.valid, false);
  assert.ok(r.errors.some((e) => e.includes("Conflicting operations")));
});

test("validateChangeSet: detects rm + mkdir on same path", () => {
  const changes = [
    { type: "mkdir", path: "foo" },
    { type: "rm", path: "foo" }
  ];
  const r = validator.validateChangeSet(changes);
  assert.equal(r.valid, false);
  assert.ok(r.errors.some((e) => e.includes("Cannot mkdir and rm")));
});

test("validateChangeSet: duplicate mkdir on same path is ok", () => {
  const changes = [
    { type: "mkdir", path: "dir" },
    { type: "mkdir", path: "dir" }
  ];
  const r = validator.validateChangeSet(changes);
  assert.equal(r.valid, true);
});

test("validateChangeSet: mv on different paths is ok", () => {
  const changes = [
    { type: "mv", from: "a.js", to: "b.js" },
    { type: "mv", from: "c.js", to: "d.js" }
  ];
  const r = validator.validateChangeSet(changes);
  assert.equal(r.valid, true);
});
