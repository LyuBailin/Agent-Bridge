const fs = require("node:fs/promises");
const path = require("node:path");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");

const execFileAsync = promisify(execFile);

function looksLikeClearDeleteInstruction(instruction) {
  const text = String(instruction ?? "");
  return ["清空", "删除", "移除", "remove", "delete", "clear"].some((k) =>
    text.toLowerCase().includes(k.toLowerCase())
  );
}

async function nodeCheckFile(absPath, cwd) {
  const { stderr } = await execFileAsync(process.execPath, ["--check", absPath], {
    cwd,
    encoding: "utf8",
    maxBuffer: 2 * 1024 * 1024
  }).catch((err) => {
    const msg = err?.stderr || err?.message || String(err);
    const e = new Error(msg);
    e.cause = err;
    throw e;
  });
  return stderr?.trim() ?? "";
}

async function readFileSafe(absPath) {
  return fs.readFile(absPath, "utf8").catch((err) => {
    const e = new Error(`Failed to read file: ${absPath}: ${err.message}`);
    e.cause = err;
    throw e;
  });
}

function buildReviewSchema() {
  return JSON.stringify({
    type: "object",
    additionalProperties: false,
    required: ["ok", "issues", "feedback_for_generator"],
    properties: {
      ok: { type: "boolean" },
      feedback_for_generator: { type: "string" },
      issues: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: true,
          required: ["severity", "message"],
          properties: {
            severity: { type: "string" },
            message: { type: "string" },
            file: { type: "string" }
          }
        }
      }
    }
  });
}

function ensureReviewShape(json) {
  if (!json || typeof json !== "object" || Array.isArray(json)) {
    throw new Error("Invalid semantic review: expected JSON object");
  }
  if (typeof json.ok !== "boolean") {
    throw new Error("Invalid semantic review: missing boolean ok");
  }
  if (!Array.isArray(json.issues)) {
    throw new Error("Invalid semantic review: missing issues array");
  }
  if (typeof json.feedback_for_generator !== "string") {
    throw new Error("Invalid semantic review: missing feedback_for_generator string");
  }
  return json;
}

async function semanticVerify(task, workspaceDir, gitManager, claudeProvider, opts = {}) {
  if (!gitManager) {
    return { ok: true, issues: [], feedback_for_generator: "" };
  }
  if (!claudeProvider || typeof claudeProvider.generateJson !== "function") {
    const err = new Error("Claude provider unavailable for semantic verification");
    return {
      ok: false,
      issues: [{ severity: "blocker", message: err.message }],
      feedback_for_generator: err.message
    };
  }

  const maxDiffBytes = Number.isFinite(opts?.max_diff_bytes) ? opts.max_diff_bytes : 200_000;

  let diffText = "";
  try {
    const { stdout } = await gitManager.runGit(workspaceDir, ["diff", "--no-color"]);
    diffText = String(stdout ?? "");
  } catch (e) {
    return {
      ok: false,
      issues: [{ severity: "blocker", message: `Failed to collect git diff: ${e.message}` }],
      feedback_for_generator: `Failed to collect git diff: ${e.message}`
    };
  }

  if (diffText.length > maxDiffBytes) {
    diffText = diffText.slice(0, maxDiffBytes) + "\n... (diff truncated)\n";
  }

  const schema = claudeProvider?.jsonSchemas?.review ?? buildReviewSchema();

  const system = [
    "You are a strict code reviewer.",
    "Your job is to semantically verify the proposed changes are correct, safe, and consistent with the user's instruction.",
    "Treat logic bugs, security issues, and obvious broken behavior as blockers (ok=false).",
    "If there are no blockers, set ok=true (warnings can still be listed).",
    "",
    "CRITICAL: You MUST return a JSON object that matches the provided JSON Schema exactly.",
    "The JSON object MUST contain ALL required fields: ok (boolean), issues (array), and feedback_for_generator (string).",
    "Ensure the JSON is valid and properly formatted.",
    "Do NOT include any extra text, explanations, or code blocks outside the JSON object.",
    "Return ONLY the JSON object, nothing else.",
    "Example of correct output format:",
    '{"ok": true, "issues": [], "feedback_for_generator": "No issues found"}'
  ].join("\n");

  const user = [
    `TASK_ID: ${task?.task_id ?? ""}`,
    "INSTRUCTION:",
    String(task?.instruction ?? ""),
    "",
    "GIT DIFF:",
    diffText || "(no diff)"
  ].join("\n");

  const json = await claudeProvider.generateJson({ system, user, schema, timeout_ms: opts?.timeout_ms });
  const review = ensureReviewShape(json);

  if (review.ok) {
    return { ok: true, issues: review.issues, feedback_for_generator: review.feedback_for_generator };
  }

  const feedback = review.feedback_for_generator?.trim()
    ? review.feedback_for_generator
    : review.issues.map((i) => i.message).filter(Boolean).join(" | ");

  return { ok: false, issues: review.issues, feedback_for_generator: feedback };
}

async function verifyAll(task, workspaceDir, applyResult, gitManager, fsTools, config = {}) {
  const issues = [];
  const changedFiles = Array.isArray(applyResult?.appliedFiles) ? applyResult.appliedFiles : [];
  const allowDeletions = config?.verification?.allow_deletions ?? false;

  // Change safety checks via git (also used to skip syntax checks for deleted paths).
  const statusByFile = new Map();
  if (gitManager) {
    try {
      const { stdout: nameStatus } = await gitManager.runGit(workspaceDir, ["diff", "--name-status"]);
      for (const rawLine of nameStatus.split(/\r?\n/).filter(Boolean)) {
        const parts = rawLine.trim().split(/\s+/).filter(Boolean);
        if (parts.length < 2) continue;
        const statusToken = parts[0];
        const code = statusToken[0]; // A/M/D/R/C/...

        if (code === "R" || code === "C") {
          // Format: R100 old new
          const oldPath = parts[1] ?? "";
          const newPath = parts[2] ?? "";
          if (oldPath) statusByFile.set(oldPath, "D");
          if (newPath) statusByFile.set(newPath, "A");
          continue;
        }

        const file = parts[1] ?? "";
        if (file) statusByFile.set(file, code);
      }
    } catch (e) {
      issues.push({
        kind: "git_diff_error",
        file: null,
        message: `Failed to run git diff: ${e.message}`,
        details: null
      });
    }
  }

  for (const rel of changedFiles) {
    if (rel === ".git" || rel.startsWith(".git/")) {
      issues.push({
        kind: "unsafe_path",
        file: rel,
        message: "Edits to .git are not allowed",
        details: null
      });
    }
  }

  // Syntax / parse checks on changed files only
  for (const rel of changedFiles) {
    // If the file was deleted, do not attempt node --check / reads on it.
    // (Deletion validation happens separately via git name-status.)
    if (statusByFile.get(rel) === "D") continue;

    let resolved;
    try {
      resolved = fsTools.resolveInWorkspace(workspaceDir, rel);
    } catch (e) {
      issues.push({
        kind: "path_error",
        file: rel,
        message: e.message,
        details: null
      });
      continue;
    }

    // If file doesn't exist (unexpected), surface it cleanly instead of throwing a misleading "Cannot find module".
    const exists = await fs.stat(resolved.abs).then(() => true).catch((e) => (e && e.code === "ENOENT" ? false : true));
    if (!exists) {
      issues.push({
        kind: "missing_file",
        file: rel,
        message: "File does not exist on disk (skipping syntax check)",
        details: null
      });
      continue;
    }

    const ext = path.extname(rel).toLowerCase();
    if (ext === ".js" || ext === ".cjs" || ext === ".mjs") {
      try {
        await nodeCheckFile(resolved.abs, workspaceDir);
      } catch (e) {
        issues.push({
          kind: "syntax_error",
          file: rel,
          message: `node --check failed: ${e.message}`,
          details: null
        });
      }
    } else if (ext === ".json") {
      try {
        const text = await readFileSafe(resolved.abs);
        JSON.parse(text);
      } catch (e) {
        issues.push({
          kind: "json_parse_error",
          file: rel,
          message: `JSON parse failed: ${e.message}`,
          details: null
        });
      }
    } else if (ext === ".yml" || ext === ".yaml") {
      // Phase 2: zero-deps. Only ensure file exists and is readable and non-empty.
      try {
        const text = await readFileSafe(resolved.abs);
        if (text.trim().length === 0) {
          issues.push({
            kind: "yaml_empty",
            file: rel,
            message: "YAML file is empty",
            details: null
          });
        }
      } catch (e) {
        issues.push({
          kind: "yaml_read_error",
          file: rel,
          message: e.message,
          details: null
        });
      }
    }
  }

  if (gitManager) {
    // Deletion policy: allow deletions only when instruction clearly implies it (move/rename/delete/remove)
    // OR when config.verification.allow_deletions is true.
    const instruction = String(task?.instruction ?? "").toLowerCase();
    const impliedDelete = ["move", "rename", "mv", "rm", "delete", "remove"].some((k) => instruction.includes(k));
    const deletionAllowed = allowDeletions || impliedDelete;
    if (!deletionAllowed) {
      for (const [file, st] of statusByFile.entries()) {
        if (st !== "D") continue;
        issues.push({
          kind: "deletion_not_allowed",
          file,
          message: "File deletion detected (not allowed in Phase 2)",
          details: { status: "D" }
        });
      }
    }

    // Suspicious large overwrite: existing non-empty to tiny content
    // Heuristic: if git shows a file changed and now has < 20 bytes, flag unless instruction indicates clear/delete.
    if (!looksLikeClearDeleteInstruction(task?.instruction)) {
      for (const rel of changedFiles) {
        const st = statusByFile.get(rel);
        if (!st || st === "A") continue; // new files are allowed to be small
        if (st === "D") continue;

        let resolved;
        try {
          resolved = fsTools.resolveInWorkspace(workspaceDir, rel);
        } catch {
          continue;
        }

        let nextSize = null;
        try {
          const stat = await fs.stat(resolved.abs);
          nextSize = stat.size;
        } catch {
          continue;
        }
        if (!(nextSize > 0 && nextSize < 20)) continue;

        let prevSize = null;
        try {
          const { stdout: prev } = await gitManager.runGit(workspaceDir, ["show", `HEAD:${rel}`]);
          prevSize = Buffer.byteLength(prev, "utf8");
        } catch {
          prevSize = null;
        }

        if (prevSize !== null && prevSize >= 20) {
          issues.push({
            kind: "suspicious_truncation",
            file: rel,
            message: "File appears truncated from a larger previous version",
            details: { prev_size: prevSize, next_size: nextSize }
          });
        }
      }
    }
  }

  return { ok: issues.length === 0, issues };
}

module.exports = {
  semanticVerify,
  verifyAll
};
