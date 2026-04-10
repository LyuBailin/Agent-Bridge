const path = require("node:path");

/**
 * Detect the type of operations required by the task.
 * Returns: 'content-only' | 'fileops-only' | 'mixed'
 */
function detectOperationType(instruction) {
  if (!instruction || typeof instruction !== "string") {
    return "mixed";
  }

  const text = instruction.toLowerCase();

  const fileopsKeywords = [
    "mv:",
    "mkdir:",
    "rm:",
    "move",
    "rename",
    "directory",
    "folder",
    "delete file",
    "remove file",
    "create dir"
  ];
  const hasFileops = fileopsKeywords.some((kw) => text.includes(kw));

  const contentKeywords = [
    "require",
    "import",
    "update",
    "change",
    "modify",
    "edit",
    "replace",
    "fix",
    "refactor",
    "add to",
    "remove from",
    "search/replace",
    "search replace"
  ];
  const hasContent = contentKeywords.some((kw) => text.includes(kw));

  if (hasFileops && hasContent) return "mixed";
  if (hasFileops) return "fileops-only";
  if (hasContent) return "content-only";

  return "mixed";
}

/**
 * Validates that model output matches the required operation type.
 * Returns: { valid: boolean, errors: string[], blocksFound: string[] }
 */
function validateOperationSchema(output, operationType) {
  const errors = [];
  const blocksFound = [];

  const srMatches = output.match(/```sr/g) || [];
  const opMatches = output.match(/```op/g) || [];

  if (srMatches.length > 0) blocksFound.push("sr");
  if (opMatches.length > 0) blocksFound.push("op");

  if (operationType === "fileops-only") {
    if (srMatches.length > 0) {
      errors.push(
        "ERROR: Found ```sr blocks but this is a file-operations-only task. Use ONLY ```op blocks (MKDIR, MV, RM)."
      );
    }
    if (opMatches.length === 0) {
      errors.push(
        "ERROR: No ```op blocks found. This task requires file operations (MKDIR, MV, RM)."
      );
    }
  } else if (operationType === "content-only") {
    if (opMatches.length > 0) {
      errors.push(
        "ERROR: Found ```op blocks but this is a content-editing-only task. Use ONLY ```sr blocks (SEARCH/REPLACE)."
      );
    }
    if (srMatches.length === 0) {
      errors.push(
        "ERROR: No ```sr blocks found. This task requires content editing (SEARCH/REPLACE)."
      );
    }
  }

  return { valid: errors.length === 0, errors, blocksFound };
}

const ALLOWED_OPERATIONS = {
  search_replace: true,
  mkdir: true,
  mv: true,
  rm: true,
  touch: true
};

const DENIED_OPERATIONS = {
  bash: true,
  npm: true,
  git: true,
  shell: true,
  exec: true,
  run: true,
  command: true
};

/**
 * Validate operation is allowed.
 */
function validateOperation(name) {
  if (DENIED_OPERATIONS[name]) {
    throw new Error(
      `Operation '${name}' is denied. Only file operations (search_replace, mkdir, mv, rm) are permitted.`
    );
  }
  if (!ALLOWED_OPERATIONS[name]) {
    throw new Error(`Unknown operation: '${name}'. Allowed: search_replace, mkdir, mv, rm, touch.`);
  }
}

/**
 * Get path fields from tool arguments.
 */
function getPathFieldsFromArgs(name, args) {
  switch (name) {
    case "search_replace":
      return [args.file];
    case "mkdir":
      return [args.path];
    case "mv":
      return [args.from, args.to];
    case "rm":
      return [args.path];
    case "touch":
      return [args.path];
    default:
      return [];
  }
}

/**
 * Validate changes for semantic correctness before applying.
 * - Check for duplicate operations on same file
 * - Ensure path-based operations are coherent
 */
function validateChangeSet(changes) {
  const errors = [];
  const editFiles = [];
  const opPaths = {};

  for (const change of changes) {
    if (change.type === "edit") {
      if (editFiles.includes(change.file)) {
        errors.push(`Duplicate edit on same file: '${change.file}' - merge into a single search_replace`);
      }
      editFiles.push(change.file);
    } else if (change.type === "mkdir") {
      opPaths[change.path] = opPaths[change.path] || [];
      opPaths[change.path].push("mkdir");
    } else if (change.type === "rm") {
      opPaths[change.path] = opPaths[change.path] || [];
      opPaths[change.path].push("rm");
    } else if (change.type === "mv") {
      opPaths[change.from] = opPaths[change.from] || [];
      opPaths[change.from].push("mv_from");
      opPaths[change.to] = opPaths[change.to] || [];
      opPaths[change.to].push("mv_to");
    }
  }

  for (const [p, ops] of Object.entries(opPaths)) {
    const uniqueOps = [...new Set(ops)];
    if (uniqueOps.length > 1) {
      errors.push(`Conflicting operations on '${p}': ${uniqueOps.join(" and ")}`);
    }
    if (uniqueOps.includes("rm") && uniqueOps.includes("mkdir")) {
      errors.push(`Cannot mkdir and rm same path '${p}'`);
    }
  }

  return { valid: errors.length === 0, errors };
}

module.exports = {
  detectOperationType,
  validateOperationSchema,
  validateOperation,
  getPathFieldsFromArgs,
  validateChangeSet,
  ALLOWED_OPERATIONS,
  DENIED_OPERATIONS
};
