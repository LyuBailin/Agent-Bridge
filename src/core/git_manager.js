const fs = require("node:fs/promises");
const path = require("node:path");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");

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
    if (change.search === "") {
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
    for (let changeIndex = 0; changeIndex < changes.length; changeIndex += 1) {
      const change = changes[changeIndex];
      if (!change || !change.type) {
        return {
          ok: false,
          appliedFiles,
          error: {
            kind: "invalid_change",
            file: null,
            message: "Invalid change: missing type",
            details: { change }
          }
        };
      }

      // Handle different operation types
      if (change.type === 'edit') {
        // Original SEARCH/REPLACE edit operation
        if (typeof change.file !== "string") {
          return {
            ok: false,
            appliedFiles,
            error: {
              kind: "invalid_change",
              file: null,
              message: "Invalid edit: missing file",
              details: { change }
            }
          };
        }
        if (typeof change.search !== "string" || typeof change.replace !== "string") {
          return {
            ok: false,
            appliedFiles,
            error: {
              kind: "invalid_change",
              file: change.file,
              message: "Invalid edit: search/replace must be strings",
              details: null
            }
          };
        }

        let resolved;
        try {
          resolved = fsTools.resolveInWorkspace(workspaceDir, change.file);
        } catch (e) {
          return {
            ok: false,
            appliedFiles,
            error: {
              kind: "unsafe_path",
              file: change.file,
              message: e.message,
              details: null
            }
          };
        }

        const existing = await fs.readFile(resolved.abs, "utf8").catch((err) => {
          if (err && err.code === "ENOENT") return "";
          throw err;
        });

        let nextContent;
        if (change.search === "") {
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
              appliedFiles,
              error: {
                kind: "search_not_unique",
                file: resolved.safeRel,
                message: `SEARCH must match exactly once (got ${occurrences})`,
                details: {
                  occurrences,
                  search_preview: rawPreview,
                  search_len: change.search.length,
                  change_index: changeIndex,
                  search_anchors: searchAnchors
                }
              }
            };
          }
          nextContent = existing.replace(change.search, change.replace);
        }

        await fsTools.updateFile(workspaceDir, resolved.safeRel, nextContent);
        appliedFiles.push(resolved.safeRel);
      } else if (change.type === 'mkdir') {
        // Create directory operation
        if (typeof change.path !== "string") {
          return {
            ok: false,
            appliedFiles,
            error: {
              kind: "invalid_mkdir",
              file: null,
              message: "Invalid MKDIR: missing path",
              details: { change }
            }
          };
        }

        let resolved;
        try {
          resolved = fsTools.resolveInWorkspace(workspaceDir, change.path);
        } catch (e) {
          return {
            ok: false,
            appliedFiles,
            error: {
              kind: "unsafe_path",
              file: change.path,
              message: e.message,
              details: null
            }
          };
        }

        // Recursively create directory
        await fs.mkdir(resolved.abs, { recursive: true });
        // We don't add directories to appliedFiles since git tracks files not directories
      } else if (change.type === 'rm') {
        // Remove file operation
        if (typeof change.path !== "string") {
          return {
            ok: false,
            appliedFiles,
            error: {
              kind: "invalid_rm",
              file: null,
              message: "Invalid RM: missing path",
              details: { change }
            }
          };
        }

        let resolved;
        try {
          resolved = fsTools.resolveInWorkspace(workspaceDir, change.path);
        } catch (e) {
          return {
            ok: false,
            appliedFiles,
            error: {
              kind: "unsafe_path",
              file: change.path,
              message: e.message,
              details: null
            }
          };
        }

        // Check if it exists
        try {
          const stat = await fs.stat(resolved.abs);
          if (stat.isFile()) {
            await fs.unlink(resolved.abs);
            appliedFiles.push(resolved.safeRel);
          } else if (stat.isDirectory()) {
            // Remove directory recursively
            // For simplicity, we just do rm -r
            await fs.rm(resolved.abs, { recursive: true, force: true });
          }
        } catch (e) {
          if (e.code !== 'ENOENT') {
            throw e;
          }
          // If it doesn't exist, just ignore - it's already gone
        }
      } else if (change.type === 'mv') {
        // Move/rename file operation
        if (typeof change.from !== "string" || typeof change.to !== "string") {
          return {
            ok: false,
            appliedFiles,
            error: {
              kind: "invalid_mv",
              file: null,
              message: "Invalid MV: missing from/to",
              details: { change }
            }
          };
        }

        let fromResolved, toResolved;
        try {
          fromResolved = fsTools.resolveInWorkspace(workspaceDir, change.from);
          toResolved = fsTools.resolveInWorkspace(workspaceDir, change.to);
        } catch (e) {
          return {
            ok: false,
            appliedFiles,
            error: {
              kind: "unsafe_path",
              file: e.message,
              message: e.message,
              details: null
            }
          };
        }

        // Check source exists
        try {
          await fs.access(fromResolved.abs);
        } catch (e) {
          return {
            ok: false,
            appliedFiles,
            error: {
              kind: "source_missing",
              file: fromResolved.safeRel,
              message: `Source file does not exist: ${fromResolved.safeRel}`,
              details: null
            }
          };
        }

        // Ensure parent directory of target exists
        await fs.mkdir(path.dirname(toResolved.abs), { recursive: true });

        // Move the file
        await fs.rename(fromResolved.abs, toResolved.abs);

        // Add target to appliedFiles, source is removed so not needed
        appliedFiles.push(toResolved.safeRel);
      } else {
        return {
          ok: false,
          appliedFiles,
          error: {
            kind: "unknown_type",
            file: null,
            message: `Unknown change type: ${change.type}`,
            details: { change }
          }
        };
      }
    }

    return { ok: true, appliedFiles, error: null };
  } catch (e) {
    return {
      ok: false,
      appliedFiles: [],
      error: {
        kind: "io_error",
        file: null,
        message: e?.message ?? String(e),
        details: null
      }
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
