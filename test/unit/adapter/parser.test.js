const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs/promises");
const os = require("node:os");

const adapter = require("../../../src/core/adapter");
const parser = require("../../../src/core/adapter/parser");
const fsTools = require("../../../src/utils/fs_tools");

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

// --- parseSrBlock edge cases ---

test("parseSrBlock: throws missing FILE", () => {
  assert.throws(() => parser.parseSrBlock("SEARCH:\n<<<\n>>>\nREPLACE:\n<<<\n>>>\n"), /sr block missing FILE/);
});

test("parseSrBlock: allows missing SEARCH (treated as empty for new file creation)", () => {
  const block = "FILE: a.txt\nREPLACE:\n<<<\nx\n>>>\n";
  const result = parser.parseSrBlock(block);
  assert.equal(result.file, "a.txt");
  assert.equal(result.search, "");
  assert.equal(result.replace, "x");
});

test("parseSrBlock: throws missing REPLACE", () => {
  const block = "FILE: a.txt\nSEARCH:\n<<<\nx\n>>>\n";
  assert.throws(() => parser.parseSrBlock(block), /sr block missing REPLACE/);
});

test("parseSrBlock: strips leading ---", () => {
  const block = [
    "---",
    "FILE: a.txt",
    "SEARCH:",
    "<<<",
    "hello",
    ">>>",
    "REPLACE:",
    "<<<",
    "world",
    ">>>"
  ].join("\n");
  const result = parser.parseSrBlock(block);
  assert.equal(result.file, "a.txt");
  assert.equal(result.search.trim(), "hello");
  assert.equal(result.replace.trim(), "world");
});

test("parseSrBlock: normalizes empty search patterns to empty string", () => {
  const patterns = [
    "(exact text from file; must be empty when creating new file)",
    "(empty)",
    "(exact text from the file; must be empty when creating a new file)"
  ];
  for (const pattern of patterns) {
    const block = `FILE: a.txt\nSEARCH:\n<<<\n${pattern}\n>>>\nREPLACE:\n<<<\nnew\n>>>\n`;
    const result = parser.parseSrBlock(block);
    assert.equal(result.search, "", `should normalize: ${pattern}`);
    assert.equal(result.replace.trim(), "new");
  }
});

test("parseSrBlock: preserves regular search content", () => {
  const block = "FILE: a.txt\nSEARCH:\n<<<\nhello world\n>>>\nREPLACE:\n<<<\nhi planet\n>>>\n";
  const result = parser.parseSrBlock(block);
  assert.equal(result.search.trim(), "hello world");
  assert.equal(result.replace.trim(), "hi planet");
  assert.equal(result.type, "edit");
});

// --- parseOpBlock edge cases ---

test("parseOpBlock: throws on empty block", () => {
  assert.throws(() => parser.parseOpBlock(""), /no recognized operation/);
  assert.throws(() => parser.parseOpBlock("  \n  "), /no recognized operation/);
});

test("parseOpBlock: parses MKDIR", () => {
  const ops = parser.parseOpBlock("MKDIR: newdir");
  assert.equal(ops.length, 1);
  assert.equal(ops[0].type, "mkdir");
  assert.equal(ops[0].path, "newdir");
});

test("parseOpBlock: parses RM", () => {
  const ops = parser.parseOpBlock("RM: old.js");
  assert.equal(ops.length, 1);
  assert.equal(ops[0].type, "rm");
  assert.equal(ops[0].path, "old.js");
});

test("parseOpBlock: parses MV with ->", () => {
  const ops = parser.parseOpBlock("MV: a.js -> b.js");
  assert.equal(ops.length, 1);
  assert.equal(ops[0].type, "mv");
  assert.equal(ops[0].from, "a.js");
  assert.equal(ops[0].to, "b.js");
});

test("parseOpBlock: parses MV with 'to' keyword", () => {
  const ops = parser.parseOpBlock("MV: old.js to new.js");
  assert.equal(ops.length, 1);
  assert.equal(ops[0].type, "mv");
  assert.equal(ops[0].from, "old.js");
  assert.equal(ops[0].to, "new.js");
});

test("parseOpBlock: single word MV: throws invalid syntax", () => {
  assert.throws(() => parser.parseOpBlock("MV: singlefile"), /Invalid MV syntax/);
});

test("parseOpBlock: parses mixed operations", () => {
  const ops = parser.parseOpBlock("MKDIR: dir\nRM: old.txt\nMV: a -> b");
  assert.equal(ops.length, 3);
  assert.equal(ops[0].type, "mkdir");
  assert.equal(ops[1].type, "rm");
  assert.equal(ops[2].type, "mv");
});

test("parseOpBlock: strips leading ---", () => {
  const ops = parser.parseOpBlock("---\nMKDIR: dir\n");
  assert.equal(ops.length, 1);
  assert.equal(ops[0].type, "mkdir");
});

// --- extractResponseText ---

test("extractResponseText: returns output_text when present", () => {
  const json = { output_text: "hello world" };
  assert.equal(parser.extractResponseText(json), "hello world");
});

test("extractResponseText: extracts from output array with text field", () => {
  const json = {
    output: [
      { content: [{ text: "part1" }] },
      { content: [{ text: "part2" }] }
    ]
  };
  assert.equal(parser.extractResponseText(json), "part1\npart2");
});

test("extractResponseText: extracts output_text from nested content", () => {
  const json = {
    output: [
      { content: [{ output_text: "out1" }, { text: "regular" }] }
    ]
  };
  assert.equal(parser.extractResponseText(json), "out1\nregular");
});

test("extractResponseText: extracts content string directly", () => {
  const json = {
    output: [
      { content: [{ content: "inline content" }] }
    ]
  };
  assert.equal(parser.extractResponseText(json), "inline content");
});

test("extractResponseText: returns empty string for null/undefined/non-object", () => {
  assert.equal(parser.extractResponseText(null), "");
  assert.equal(parser.extractResponseText(undefined), "");
  assert.equal(parser.extractResponseText(42), "");
  assert.equal(parser.extractResponseText("string"), "");
});

test("extractResponseText: returns empty string when output is not array", () => {
  assert.equal(parser.extractResponseText({ output: "not array" }), "");
});

// --- parseToolCalls risk blocking ---

test("parseToolCalls: throws on blocking risk in batch", async () => {
  // Use valid search_replace args so validation passes, then risk classifier throws
  const toolCalls = [
    { function: { name: "search_replace", arguments: JSON.stringify({ file: "test.js", search: "rm -rf /", replace: "safe" }) } }
  ];
  await assert.rejects(
    () => adapter.parseToolCalls(toolCalls, fsTools, "/fake/ws"),
    /Blocking risk detected/
  );
});

// --- parseJsonToolCalls tests ---

test("parseJsonToolCalls: parses valid JSON tool_calls format", () => {
  const json = {
    tool_calls: [
      {
        function: {
          name: "search_replace",
          arguments: { file: "test.js", search: "old", replace: "new" }
        }
      }
    ]
  };
  const result = parser.parseJsonToolCalls(json);
  assert.equal(result.length, 1);
  assert.equal(result[0].function.name, "search_replace");
  const args = JSON.parse(result[0].function.arguments);
  assert.equal(args.file, "test.js");
  assert.equal(args.search, "old");
  assert.equal(args.replace, "new");
});

test("parseJsonToolCalls: parses arguments as string", () => {
  const json = {
    tool_calls: [
      {
        function: {
          name: "mkdir",
          arguments: JSON.stringify({ path: "lib" })
        }
      }
    ]
  };
  const result = parser.parseJsonToolCalls(json);
  assert.equal(result.length, 1);
  const args = JSON.parse(result[0].function.arguments);
  assert.equal(args.path, "lib");
});

test("parseJsonToolCalls: rejects unknown tool names", () => {
  const json = {
    tool_calls: [
      {
        function: {
          name: "unknown_tool",
          arguments: {}
        }
      }
    ]
  };
  const result = parser.parseJsonToolCalls(json);
  assert.equal(result.length, 0);
});

test("parseJsonToolCalls: handles content with >>> symbols", () => {
  const json = {
    tool_calls: [
      {
        function: {
          name: "search_replace",
          arguments: {
            file: "test.js",
            search: "code with >>> operator",
            replace: "safe code"
          }
        }
      }
    ]
  };
  const result = parser.parseJsonToolCalls(json);
  assert.equal(result.length, 1);
  const args = JSON.parse(result[0].function.arguments);
  assert.equal(args.search, "code with >>> operator");
});

// --- parseStructuredTextToToolCalls JSON-first tests ---

test("parseStructuredTextToToolCalls: prefers JSON format over sr blocks", () => {
  // JSON that looks like sr block syntax should be parsed as JSON
  const jsonInput = JSON.stringify({
    tool_calls: [
      {
        function: {
          name: "touch",
          arguments: { path: "newfile.txt" }
        }
      }
    ]
  });
  const result = parser.parseStructuredTextToToolCalls(jsonInput);
  assert.equal(result.length, 1);
  assert.equal(result[0].function.name, "touch");
});

test("parseStructuredTextToToolCalls: falls back to sr blocks when JSON fails", () => {
  const srInput = [
    "```sr",
    "FILE: test.txt",
    "SEARCH:",
    "<<<",
    "old",
    ">>>",
    "REPLACE:",
    "<<<",
    "new",
    ">>>",
    "```"
  ].join("\n");
  const result = parser.parseStructuredTextToToolCalls(srInput);
  assert.equal(result.length, 1);
  assert.equal(result[0].function.name, "search_replace");
});

test("parseStructuredTextToToolCalls: handles JSON with >>> in content", () => {
  const jsonInput = JSON.stringify({
    tool_calls: [
      {
        function: {
          name: "search_replace",
          arguments: {
            file: "test.js",
            search: "a >>> b",
            replace: "c >>> d"
          }
        }
      }
    ]
  });
  const result = parser.parseStructuredTextToToolCalls(jsonInput);
  assert.equal(result.length, 1);
  const args = JSON.parse(result[0].function.arguments);
  assert.equal(args.search, "a >>> b");
  assert.equal(args.replace, "c >>> d");
});
