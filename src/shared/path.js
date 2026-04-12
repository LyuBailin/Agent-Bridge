/**
 * Shared path utilities for Agent Bridge.
 */

const path = require("node:path");

function toPosixPath(p) {
  return p.split(path.sep).join("/");
}

function assertSafeRelPath(relPath) {
  if (typeof relPath !== "string" || relPath.trim() === "") {
    throw new Error("Invalid FILE path: empty");
  }
  if (path.isAbsolute(relPath)) {
    throw new Error(`Unsafe FILE path (absolute): ${relPath}`);
  }
  const normalized = path.normalize(relPath);
  const parts = normalized.split(path.sep);

  if (normalized === ".") {
    throw new Error("Invalid FILE path (.): use a specific file path, not a directory reference");
  }
  if (parts[0] === ".") {
    const remainder = parts.slice(1).join("/");
    if (remainder === "" || remainder === ".") {
      throw new Error("Invalid FILE path (.): use a specific file path like 'src/index.js'");
    }
  }
  if (parts.includes("..")) {
    throw new Error(`Unsafe FILE path (..): ${relPath}`);
  }
  if (normalized.startsWith("..") || normalized === "..") {
    throw new Error(`Unsafe FILE path (..): ${relPath}`);
  }
  if (parts[0] === ".git") {
    throw new Error(`Invalid FILE path (.git): ${relPath} - do not reference .git directory directly`);
  }
  // Reject paths that start with 'workspace/' - paths are always relative to workspace root
  if (parts[0] === "workspace") {
    throw new Error(
      `Invalid FILE path (\`workspace/\` prefix): \`${relPath}\` - do not include 'workspace/' prefix. ` +
      `Paths are relative to the workspace root, e.g., use \`project/backend/package.json\` instead of \`workspace/project/backend/package.json\`.`
    );
  }
  return normalized;
}

module.exports = { toPosixPath, assertSafeRelPath };
