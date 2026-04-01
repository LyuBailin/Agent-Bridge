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
  const occ = Number.isFinite(occurrences) ? occurrences : null;
  const sp = typeof searchPreview === "string" ? searchPreview : "";

  const snippetData = snippets && typeof snippets === "object" ? snippets : null;
  const blocks = Array.isArray(snippetData?.snippets) ? snippetData.snippets : [];

  const parts = [];
  parts.push(`SEARCH mismatch (got 0) on ${relPath}`);
  if (occ !== null) parts.push(`Occurrences: ${occ}`);
  if (sp.trim()) parts.push(`SEARCH preview:\n${sp.trim()}`);

  if (blocks.length === 0) {
    parts.push("Current file snippets: (unavailable)");
    return parts.join("\n");
  }

  parts.push("Current file snippets:");
  for (const b of blocks) {
    if (!b || typeof b !== "object") continue;
    if (b.kind === "head") {
      parts.push("---- HEAD (first 40 lines) ----");
    } else if (b.kind === "anchor") {
      const line = Number.isFinite(b.match_line) ? b.match_line : "?";
      const anchor = typeof b.anchor === "string" ? b.anchor : "";
      parts.push(`---- AROUND match at line ${line} (anchor: ${anchor}) ----`);
    } else {
      parts.push("---- SNIPPET ----");
    }
    parts.push(String(b.text ?? "").trimEnd());
  }

  const maxChars = Number.isFinite(snippetData?.max_chars) ? snippetData.max_chars + 1000 : 5000;
  const joined = parts.join("\n");
  return truncateWithMarker(joined, maxChars).text;
}

module.exports = {
  isSearchGot0Error,
  deriveAnchorsFromPreview,
  collectSnippetsForFile,
  formatSearchGot0Feedback
};

