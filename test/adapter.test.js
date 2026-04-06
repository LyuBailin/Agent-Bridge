const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs/promises");
const os = require("node:os");

const adapter = require("../src/core/adapter");
const fsTools = require("../src/utils/fs_tools");

async function withTempDir(fn) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "agent_bridge_test_"));
  try {
    return await fn(dir);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

test("parseResponse: parses single sr block", async () => {
  await withTempDir(async (ws) => {
    const out = [
      "some text",
      "```sr",
      "FILE: a.txt",
      "SEARCH:",
      "<<<",
      "hello",
      ">>>",
      "REPLACE:",
      "<<<",
      "world",
      ">>>",
      "```"
    ].join("\n");

    const changes = adapter.parseResponse(out, fsTools, ws);
    assert.equal(changes.length, 1);
    assert.equal(changes[0].file, "a.txt");
    assert.equal(changes[0].search.trim(), "hello");
    assert.equal(changes[0].replace.trim(), "world");
  });
});

test("parseResponse: rejects missing sr blocks", async () => {
  await withTempDir(async (ws) => {
    assert.throws(() => adapter.parseResponse("no blocks", fsTools, ws), /No ```sr or ```op blocks/);
  });
});

test("parseResponse: rejects unsafe paths", async () => {
  await withTempDir(async (ws) => {
    const out = [
      "```sr",
      "FILE: ../escape.txt",
      "SEARCH:",
      "<<<",
      "",
      ">>>",
      "REPLACE:",
      "<<<",
      "x",
      ">>>",
      "```"
    ].join("\n");
    assert.throws(() => adapter.parseResponse(out, fsTools, ws), /Unsafe FILE path/);
  });
});

test("parseResponse: rejects .git paths", async () => {
  await withTempDir(async (ws) => {
    const out = [
      "```sr",
      "FILE: .git/config",
      "SEARCH:",
      "<<<",
      "",
      ">>>",
      "REPLACE:",
      "<<<",
      "x",
      ">>>",
      "```"
    ].join("\n");
    assert.throws(() => adapter.parseResponse(out, fsTools, ws), /Invalid FILE path.*\.git/);
  });
});

test("parseResponse: supports empty SEARCH (overwrite)", async () => {
  await withTempDir(async (ws) => {
    const out = [
      "```sr",
      "FILE: a.txt",
      "SEARCH:",
      "<<<",
      "",
      ">>>",
      "REPLACE:",
      "<<<",
      "new",
      ">>>",
      "```"
    ].join("\n");
    const changes = adapter.parseResponse(out, fsTools, ws);
    assert.equal(changes[0].search, "");
    assert.equal(changes[0].replace.trim(), "new");
  });
});

test("formatErrorPrompt: appends error context and keeps sr-only instruction", () => {
  const original = { system: "sys", user: "user" };
  const p = adapter.formatErrorPrompt(original, { stage: "apply", message: "bad" });
  assert.ok(p.system.includes("sys"));
  assert.ok(p.user.includes("ERROR CONTEXT:"));
  assert.ok(p.user.includes("```sr"));
  assert.ok(p.user.toLowerCase().includes("output only"));
});

test("buildPrompt: includes failure feedback when provided", () => {
  const p = adapter.buildPrompt(
    { task_id: "t", instruction: "do x" },
    "CTX",
    [{ stage: "parse", message: "no sr blocks", details: { x: 1 } }]
  );
  assert.ok(p.user.includes("PREVIOUS FAILURES"));
  assert.ok(p.user.includes("stage=parse"));
});

test("parseStructuredTextToToolCalls: parses sr block to tool_calls format", async () => {
  await withTempDir(async (ws) => {
    const text = [
      "some text",
      "```sr",
      "FILE: a.txt",
      "SEARCH:",
      "<<<",
      "hello",
      ">>>",
      "REPLACE:",
      "<<<",
      "world",
      ">>>",
      "```"
    ].join("\n");

    const toolCalls = adapter.parseStructuredTextToToolCalls(text);
    assert.equal(toolCalls.length, 1);
    assert.equal(toolCalls[0].function.name, "search_replace");
    const args = JSON.parse(toolCalls[0].function.arguments);
    assert.equal(args.file, "a.txt");
    assert.equal(args.search.trim(), "hello");
    assert.equal(args.replace.trim(), "world");
  });
});

test("parseStructuredTextToToolCalls: parses op blocks to tool_calls format", async () => {
  await withTempDir(async (ws) => {
    const text = [
      "```op",
      "MKDIR: newdir",
      "MV: old.js -> new.js",
      "RM: unused.js",
      "```"
    ].join("\n");

    const toolCalls = adapter.parseStructuredTextToToolCalls(text);
    assert.equal(toolCalls.length, 3);

    assert.equal(toolCalls[0].function.name, "mkdir");
    assert.equal(JSON.parse(toolCalls[0].function.arguments).path, "newdir");

    assert.equal(toolCalls[1].function.name, "mv");
    const mvArgs = JSON.parse(toolCalls[1].function.arguments);
    assert.equal(mvArgs.from, "old.js");
    assert.equal(mvArgs.to, "new.js");

    assert.equal(toolCalls[2].function.name, "rm");
    assert.equal(JSON.parse(toolCalls[2].function.arguments).path, "unused.js");
  });
});

test("parseStructuredTextToToolCalls: parses mixed sr and op blocks", async () => {
  await withTempDir(async (ws) => {
    const text = [
      "```sr",
      "FILE: b.txt",
      "SEARCH:",
      "<<<",
      "old",
      ">>>",
      "REPLACE:",
      "<<<",
      "new",
      ">>>",
      "```",
      "some text",
      "```op",
      "MKDIR: dir",
      "```",
      "```sr",
      "FILE: c.txt",
      "SEARCH:",
      "<<<",
      "",
      ">>>",
      "REPLACE:",
      "<<<",
      "content",
      ">>>",
      "```"
    ].join("\n");

    const toolCalls = adapter.parseStructuredTextToToolCalls(text);
    assert.equal(toolCalls.length, 3);
    assert.equal(toolCalls[0].function.name, "search_replace");
    assert.equal(toolCalls[1].function.name, "mkdir");
    assert.equal(toolCalls[2].function.name, "search_replace");
  });
});

test("parseStructuredTextToToolCalls: returns empty array when no blocks", async () => {
  const toolCalls = adapter.parseStructuredTextToToolCalls("no blocks here");
  assert.equal(toolCalls.length, 0);
});
