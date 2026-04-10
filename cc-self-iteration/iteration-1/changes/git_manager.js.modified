const fs = require("node:fs/promises");
const path = require("node:path");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");
const { EMPTY_SEARCH_PATTERNS } = require("../shared/constants");

const execFileAsync = promisify(execFile);

async function runGit(workspaceDir, args) {
  const { stdout, stderr } = await execFileAsync("git", args, {
    cwd: workspaceDir,
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024
  }).catch((err) => {
    const msg = [
      `git ${args.join(" ")} failed`,
      err?.stdout ? `stdout:\n${err.stdout}` : "",
      err?.stderr ? `stderr:\n${err.stderr}` : "",
      err?.message ? `error:\n${err.message}` : ""
    ]
      .filter(Boolean)
      .join("\n");
    const wrapped = new Error(msg);
    wrapped.cause = err;
    throw wrapped;
  });

  return { stdout, stderr };
}

async function pathExists(p) {
  try {
    await fs.stat(p);
    return true;
  } catch (e) {
    if (e && e.code === "ENOENT") return false;
    throw e;
  }
}

async function ensureRepo(workspaceDir, gitCfg) {
  await fs.mkdir(workspaceDir, { recursive: true });
  const gitDir = path.join(workspaceDir, ".git");
  const hasRepo = await pathExists(gitDir);

  if (!hasRepo) {
    await runGit(workspaceDir, ["init", "-b", gitCfg?.default_branch ?? "main"]);
  }

  const userName = gitCfg?.user_name ?? "agent_bridge";
  const userEmail = gitCfg?.user_email ?? "agent@local";
  await runGit(workspaceDir, ["config", "user.name", userName]);
  await runGit(workspaceDir, ["config", "user.email", userEmail]);

  const hasHead = await runGit(workspaceDir, ["rev-parse", "--verify", "HEAD"])
    .then(() => true)
    .catch(() => false);

  if (!hasHead) {
    await runGit(workspaceDir, ["commit", "--allow-empty", "-m", "bootstrap"]);
  }
}

async function createSnapshot(workspaceDir) {
  const { stdout } = await runGit(workspaceDir, ["rev-parse", "HEAD"]);
  return stdout.trim();
}

async function getHeadSha(workspaceDir) {
  return createSnapshot(workspaceDir);
}

async function createCheckpointMarker(workspaceDir, { taskId, subtaskId } = {}) {
  // Marker is just the current HEAD sha; callers store it in plan state.
  // (taskId/subtaskId kept for future expansion.)
  void taskId;
  void subtaskId;
  return getHeadSha(workspaceDir);
}

function countOccurrences(haystack, needle) {
  if (needle === "") return 0;
  let count = 0;
  let start = 0;
  while (true) {
    const idx = haystack.indexOf(needle, start);
    if (idx === -1) break;
    count += 1;
    start = idx + needle.length;
  }
  return count;
}

// Helper: resolve path and wrap unsafe path errors
function resolvePath(fsTools, workspaceDir, relPath) {
  try {
    return { resolved: fsTools.resolveInWorkspace(workspaceDir, relPath), error: null };
  } catch (e) {
    return { resolved: null, error: { kind: "unsafe_path", file: relPath, message: e.message } };
  }
}

// Strategy handlers for change types

async function handleEdit(change, workspaceDir, fsTools) {
  if (typeof change.file !== "string") {
    return { ok: false, error: { kind: "invalid_change", file: null, message: "Invalid edit: missing file", details: { change } } };
  }
  if (typeof change.search !== "string" || typeof change.replace !== "string") {
    return { ok: false, error: { kind: "invalid_change", file: change.file, message: "Invalid edit: search/replace must be strings", details: null } };
  }

  const { resolved, error } = resolvePath(fsTools, workspaceDir, change.file);
  if (error) return { ok: false, error };
  const { abs, safeRel } = resolved;

  const existing = await fs.readFile(abs, "utf8").catch((err) => {
    if (err && err.code === "ENOENT") return "";
    throw err;
  });

  let nextContent;
  const isEmptySearch = change.search === "" || EMPTY_SEARCH_PATTERNS.includes(change.search);
  if (isEmptySearch) {
    nextContent = change.replace;
  } else {
    const occurrences = countOccurrences(existing, change.search);
    if (occurrences !== 1) {
      const previewMax = 200;
      const rawPreview = change.search.length > previewMax
        ? change.search.slice(0, previewMax) + "\n...(truncated)"
        : change.search;
      const searchAnchors = change.search
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean)
        .slice(0, 3)
        .map((l) => (l.length > 200 ? l.slice(0, 200) : l));
      return {
        ok: false,
        error: {
          kind: "search_not_unique",
          file: safeRel,
          message: `SEARCH must match exactly once (got ${occurrences})`,
          details: { occurrences, search_preview: rawPreview, search_len: change.search.length, search_anchors: searchAnchors }
        }
      };
    }
    nextContent = existing.replace(change.search, change.replace);
  }

  await fsTools.updateFile(workspaceDir, safeRel, nextContent);
  return { ok: true, appliedFile: safeRel };
}

async function handleMkdir(change, workspaceDir, fsTools) {
  if (typeof change.path !== "string") {
    return { ok: false, error: { kind: "invalid_mkdir", file: null, message: "Invalid MKDIR: missing path", details: { change } } };
  }

  const { resolved, error } = resolvePath(fsTools, workspaceDir, change.path);
  if (error) return { ok: false, error };
  await fs.mkdir(resolved.abs, { recursive: true });
  return { ok: true, appliedFile: null }; // directories not tracked by git
}

async function handleRm(change, workspaceDir, fsTools) {
  if (typeof change.path !== "string") {
    return { ok: false, error: { kind: "invalid_rm", file: null, message: "Invalid RM: missing path", details: { change } } };
  }

  const { resolved, error } = resolvePath(fsTools, workspaceDir, change.path);
  if (error) return { ok: false, error };

  try {
    const stat = await fs.stat(resolved.abs);
    if (stat.isFile()) {
      await fs.unlink(resolved.abs);
      return { ok: true, appliedFile: resolved.safeRel };
    } else if (stat.isDirectory()) {
      await fs.rm(resolved.abs, { recursive: true, force: true });
    }
  } catch (e) {
    if (e.code !== "ENOENT") throw e;
  }
  return { ok: true, appliedFile: null };
}

async function handleMv(change, workspaceDir, fsTools) {
  if (typeof change.from !== "string" || typeof change.to !== "string") {
    return { ok: false, error: { kind: "invalid_mv", file: null, message: "Invalid MV: missing from/to", details: { change } } };
  }

  const fromResolved = resolvePath(fsTools, workspaceDir, change.from);
  if (fromResolved.error) return { ok: false, error: fromResolved.error };

  const toResolved = resolvePath(fsTools, workspaceDir, change.to);
  if (toResolved.error) return { ok: false, error: toResolved.error };

  try {
    await fs.access(fromResolved.resolved.abs);
  } catch {
    return { ok: false, error: { kind: "source_missing", file: fromResolved.resolved.safeRel, message: `Source file does not exist: ${fromResolved.resolved.safeRel}` } };
  }

  await fs.mkdir(path.dirname(toResolved.resolved.abs), { recursive: true });
  await fs.rename(fromResolved.resolved.abs, toResolved.resolved.abs);
  return { ok: true, appliedFile: toResolved.resolved.safeRel };
}

async function handleTouch(change, workspaceDir, fsTools) {
  if (typeof change.path !== "string") {
    return { ok: false, error: { kind: "invalid_touch", file: null, message: "Invalid TOUCH: missing path", details: { change } } };
  }

  const { resolved, error } = resolvePath(fsTools, workspaceDir, change.path);
  if (error) return { ok: false, error };

  await fs.mkdir(path.dirname(resolved.abs), { recursive: true });
  const date = new Date();
  await fs.utimes(resolved.abs, date, date).catch(async (e) => {
    if (e.code === "ENOENT") {
      await fs.writeFile(resolved.abs, "");
    } else {
      throw e;
    }
  });
  return { ok: true, appliedFile: resolved.safeRel };
}

const CHANGE_HANDLERS = {
  edit: handleEdit,
  mkdir: handleMkdir,
  rm: handleRm,
  mv: handleMv,
  touch: handleTouch
};

async function applySearchReplaceChanges(workspaceDir, changes, fsTools) {
  if (!Array.isArray(changes) || changes.length === 0) {
    throw new Error("No changes to apply");
  }

  for (const change of changes) {
    if (!change || typeof change.file !== "string") {
      throw new Error("Invalid change: missing file");
    }
    if (typeof change.search !== "string" || typeof change.replace !== "string") {
      throw new Error(`Invalid change for ${change.file}: search/replace must be strings`);
    }

    const { abs, safeRel } = fsTools.resolveInWorkspace(workspaceDir, change.file);
    const existing = await fs.readFile(abs, "utf8").catch((err) => {
      if (err && err.code === "ENOENT") return "";
      throw err;
    });

    let nextContent;
    const isEmptySearch = change.search === "" || EMPTY_SEARCH_PATTERNS.includes(change.search);
    if (isEmptySearch) {
      nextContent = change.replace;
    } else {
      const occurrences = countOccurrences(existing, change.search);
      if (occurrences !== 1) {
        throw new Error(
          `SEARCH must match exactly once for ${safeRel} (got ${occurrences})`
        );
      }
      nextContent = existing.replace(change.search, change.replace);
    }

    await fsTools.updateFile(workspaceDir, safeRel, nextContent);
  }
}

async function safeApplyPatch(workspaceDir, changes, fsTools) {
  try {
    if (!Array.isArray(changes) || changes.length === 0) {
      return {
        ok: false,
        appliedFiles: [],
        error: { kind: "invalid_change", file: null, message: "No changes to apply", details: null }
      };
    }

    const appliedFiles = [];
    for (const change of changes) {
      if (!change || !change.type) {
        return {
          ok: false,
          appliedFiles,
          error: { kind: "invalid_change", file: null, message: "Invalid change: missing type", details: { change } }
        };
      }

      const handler = CHANGE_HANDLERS[change.type];
      if (!handler) {
        return {
          ok: false,
          appliedFiles,
          error: { kind: "unknown_type", file: null, message: `Unknown change type: ${change.type}`, details: { change } }
        };
      }

      const result = await handler(change, workspaceDir, fsTools);
      if (!result.ok) {
        return { ok: false, appliedFiles, error: result.error };
      }
      if (result.appliedFile) {
        appliedFiles.push(result.appliedFile);
      }
    }

    return { ok: true, appliedFiles, error: null };
  } catch (e) {
    return {
      ok: false,
      appliedFiles: [],
      error: { kind: "io_error", file: null, message: e?.message ?? String(e), details: null }
    };
  }
}

async function verifyAndCommit(workspaceDir, taskId) {
  const { stdout } = await runGit(workspaceDir, ["status", "--porcelain"]);
  const changed = stdout.trim().length > 0;
  if (!changed) {
    return { changed: false, commit: null };
  }

  await runGit(workspaceDir, ["add", "-A"]);
  await runGit(workspaceDir, ["commit", "-m", `task: ${taskId}`]);
  const { stdout: headOut } = await runGit(workspaceDir, ["rev-parse", "HEAD"]);
  return { changed: true, commit: headOut.trim() };
}

async function commitCheckpoint(workspaceDir, { taskId, subtaskId, message } = {}) {
  const { stdout } = await runGit(workspaceDir, ["status", "--porcelain"]);
  const changed = stdout.trim().length > 0;
  if (!changed) return null;

  const msg =
    typeof message === "string" && message.trim()
      ? message.trim()
      : `checkpoint: ${String(taskId ?? "").trim()} ${String(subtaskId ?? "").trim()}`.trim();

  await runGit(workspaceDir, ["add", "-A"]);
  await runGit(workspaceDir, ["commit", "-m", msg]);
  const { stdout: headOut } = await runGit(workspaceDir, ["rev-parse", "HEAD"]);
  return headOut.trim();
}

async function rollback(workspaceDir, snapshotSha) {
  if (!snapshotSha) throw new Error("rollback requires snapshotSha");
  await runGit(workspaceDir, ["reset", "--hard", snapshotSha]);
  await runGit(workspaceDir, ["clean", "-fd"]);
}

async function autoRollback(workspaceDir, snapshotSha) {
  return rollback(workspaceDir, snapshotSha);
}

async function rollbackToSha(workspaceDir, sha) {
  return rollback(workspaceDir, sha);
}

async function squashAndCommit(workspaceDir, { taskId, baseSha, finalMessage } = {}) {
  if (!baseSha) throw new Error("squashAndCommit requires baseSha");

  // Determine if anything changed since baseSha.
  let changed = false;
  try {
    const { stdout } = await runGit(workspaceDir, ["diff", "--name-only", baseSha]);
    changed = stdout.trim().length > 0;
  } catch {
    // If diff fails, be conservative and attempt squash path.
    changed = true;
  }

  if (!changed) return { changed: false, commit: null };

  await runGit(workspaceDir, ["reset", "--soft", baseSha]);
  const msg =
    typeof finalMessage === "string" && finalMessage.trim()
      ? finalMessage.trim()
      : `task: ${String(taskId ?? "").trim()}`.trim();
  await runGit(workspaceDir, ["commit", "-m", msg]);
  const { stdout: headOut } = await runGit(workspaceDir, ["rev-parse", "HEAD"]);
  return { changed: true, commit: headOut.trim() };
}

module.exports = {
  ensureRepo,
  createSnapshot,
  getHeadSha,
  createCheckpointMarker,
  applySearchReplaceChanges,
  safeApplyPatch,
  verifyAndCommit,
  commitCheckpoint,
  rollback,
  autoRollback,
  rollbackToSha,
  squashAndCommit,
  runGit
};
