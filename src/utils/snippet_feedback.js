const fs = require("node:fs/promises");

function isSearchGot0Error(applyError) {
  if (!applyError || typeof applyError !== "object") return false;

  const occurrences = applyError?.details?.occurrences;
  if (applyError.kind === "search_not_unique" && occurrences === 0) return true;

  const msg = String(applyError.message ?? "");
  return msg.includes("SEARCH must match") && msg.includes("(got 0)");
}

function deriveAnchorsFromPreview(searchPreview) {
  const lines = String(searchPreview ?? "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const anchors = [];
  for (const line of lines) {
    if (anchors.length >= 3) break;
    anchors.push(line.length > 200 ? line.slice(0, 200) : line);
  }
  return anchors;
}

function formatNumberedLines(lines, startLineNo) {
  const base = Number.isFinite(startLineNo) ? startLineNo : 1;
  return lines.map((l, i) => `${String(base + i).padStart(4)}: ${l}`).join("\n");
}

function truncateWithMarker(text, maxChars) {
  const limit = Number.isFinite(maxChars) ? maxChars : 4000;
  if (text.length <= limit) return { text, truncated: false };
  const marker = "\n...(truncated)";
  const cut = Math.max(0, limit - marker.length);
  return { text: text.slice(0, cut) + marker, truncated: true };
}

async function collectSnippetsForFile({ workspaceDir, relPath, fsTools, anchors, maxChars }) {
  const max_chars = Number.isFinite(maxChars) ? maxChars : 4000;
  if (typeof relPath !== "string" || relPath.trim() === "") {
    return { ok: false, relPath: String(relPath ?? ""), max_chars, truncated: false, snippets: [], error: "missing relPath" };
  }
  if (!fsTools || typeof fsTools.resolveInWorkspace !== "function") {
    return { ok: false, relPath, max_chars, truncated: false, snippets: [], error: "missing fsTools" };
  }

  let resolved;
  try {
    resolved = fsTools.resolveInWorkspace(workspaceDir, relPath);
  } catch (e) {
    return { ok: false, relPath, max_chars, truncated: false, snippets: [], error: e?.message ?? String(e) };
  }

  let content;
  try {
    content = await fs.readFile(resolved.abs, "utf8");
  } catch (e) {
    return {
      ok: false,
      relPath: resolved.safeRel,
      max_chars,
      truncated: false,
      snippets: [],
      error: `read failed: ${e?.message ?? String(e)}`
    };
  }

  const lines = String(content).split(/\r?\n/);
  const snippetObjs = [];

  // Always include head snippet.
  const headLines = lines.slice(0, 40);
  snippetObjs.push({
    kind: "head",
    start_line: 1,
    end_line: headLines.length,
    text: formatNumberedLines(headLines, 1)
  });

  const anchorList = Array.isArray(anchors) && anchors.length ? anchors : [];
  const seenLineIdx = new Set();
  for (const anchor of anchorList) {
    if (snippetObjs.filter((s) => s.kind === "anchor").length >= 2) break;
    if (typeof anchor !== "string" || anchor.trim() === "") continue;
    const idx = lines.findIndex((l) => String(l).includes(anchor));
    if (idx === -1) continue;
    if (seenLineIdx.has(idx)) continue;
    seenLineIdx.add(idx);

    const start = Math.max(0, idx - 5);
    const end = Math.min(lines.length, idx + 11);
    const windowLines = lines.slice(start, end);
    snippetObjs.push({
      kind: "anchor",
      anchor: anchor.length > 200 ? anchor.slice(0, 200) : anchor,
      match_line: idx + 1,
      start_line: start + 1,
      end_line: end,
      text: formatNumberedLines(windowLines, start + 1)
    });
  }

  // Enforce size budget across snippet texts to avoid ballooning retry prompts / traces.
  const trimmed = [];
  let remaining = max_chars;
  let truncated = false;
  for (let i = 0; i < snippetObjs.length; i += 1) {
    const s = snippetObjs[i];
    if (remaining <= 0) {
      truncated = true;
      break;
    }
    const { text, truncated: t } = truncateWithMarker(String(s.text ?? ""), remaining);
    trimmed.push({ ...s, text });
    remaining -= text.length + 2; // small separator budget
    if (t) {
      truncated = true;
      break;
    }
  }

  return { ok: true, relPath: resolved.safeRel, max_chars, truncated, snippets: trimmed, error: null };
}

function formatSearchGot0Feedback({ relPath, occurrences, searchPreview, snippets }) {
  const snippetData = snippets && typeof snippets === "object" ? snippets : null;
  const blocks = Array.isArray(snippetData?.snippets) ? snippetData.snippets : [];
  const headBlock = blocks.find((b) => b && b.kind === "head");

  const parts = [];
  parts.push(`FILE: ${relPath}`);
  parts.push(`ERROR: SEARCH pattern not found`);

  if (headBlock && typeof headBlock.text === "string") {
    // Show first 10 lines as hint
    const lines = headBlock.text.split(/\r?\n/).slice(0, 10);
    parts.push(`HINT: The file currently contains:\n${lines.join("\n")}`);
  } else {
    parts.push(`HINT: (file content unavailable)`);
  }

  const maxChars = Number.isFinite(snippetData?.max_chars) ? snippetData.max_chars + 500 : 4500;
  const joined = parts.join("\n");
  return truncateWithMarker(joined, maxChars).text;
}

module.exports = {
  isSearchGot0Error,
  deriveAnchorsFromPreview,
  collectSnippetsForFile,
  formatSearchGot0Feedback
};