const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs/promises");
const os = require("node:os");

const fsTools = require("../../../src/utils/fs_tools");
const snippetFeedback = require("../../../src/utils/snippet_feedback");

async function withTempDir(fn) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "agent_bridge_snip_"));
  try {
    return await fn(dir);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

test("snippet_feedback: detects search got 0 errors", () => {
  assert.equal(
    snippetFeedback.isSearchGot0Error({ kind: "search_not_unique", message: "SEARCH must match exactly once (got 0)", details: { occurrences: 0 } }),
    true
  );
  assert.equal(
    snippetFeedback.isSearchGot0Error({ kind: "search_not_unique", message: "SEARCH must match exactly once (got 2)", details: { occurrences: 2 } }),
    false
  );
});

test("snippet_feedback: collects and formats compact snippets", async () => {
  await withTempDir(async (ws) => {
    await fs.mkdir(ws, { recursive: true });
    const rel = "a.txt";
    const abs = path.join(ws, rel);
    const content = Array.from({ length: 120 }, (_, i) => `line ${i + 1}`).join("\n");
    await fs.writeFile(abs, content, "utf8");

    const snippets = await snippetFeedback.collectSnippetsForFile({
      workspaceDir: ws,
      relPath: rel,
      fsTools,
      anchors: ["line 60", "line 90"],
      maxChars: 4000
    });
    assert.equal(snippets.ok, true);
    assert.equal(snippets.relPath, rel);
    assert.ok(Array.isArray(snippets.snippets));
    assert.ok(snippets.snippets.length >= 1);

    const formatted = snippetFeedback.formatSearchGot0Feedback({
      relPath: rel,
      occurrences: 0,
      searchPreview: "nope",
      snippets
    });
    assert.ok(formatted.includes(`FILE: ${rel}`));
    assert.ok(formatted.includes("ERROR: SEARCH pattern not found"));
    assert.ok(formatted.includes("HINT: The file currently contains:"));
    assert.ok(formatted.includes("1: line 1"));

    const tiny = await snippetFeedback.collectSnippetsForFile({
      workspaceDir: ws,
      relPath: rel,
      fsTools,
      anchors: ["line 60"],
      maxChars: 200
    });
    assert.equal(tiny.ok, true);
    assert.equal(tiny.truncated, true);
  });
});

