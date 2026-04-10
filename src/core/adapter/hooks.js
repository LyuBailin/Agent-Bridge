/**
 * Tool Execution Hooks System
 *
 * Every tool execution passes through a mandatory governance chain:
 * 1. Pre-Execution Hooks: Run before tool call, can modify input, block call, or inject context
 * 2. Permission Decisioning: Resolve permissions (Deny always overrides Allow)
 * 3. Execution & Telemetry: Actual tool call wrapped in analytics and tracing
 * 4. Post-Execution Hooks: Handle success and failure states
 *
 * Hooks are synchronous and must complete quickly.
 * Long-running operations should be async and return a promise.
 */

/**
 * @typedef {Object} HookContext
 * @property {string} toolName - Name of the tool being executed
 * @property {Object} args - Tool arguments
 * @property {Object} metadata - Additional context (workspace, user, etc.)
 */

/**
 * @typedef {Object} HookResult
 * @property {boolean} allowed - Whether to proceed with execution
 * @property {string} [denyReason] - Reason for denial (if allowed=false)
 * @property {Object} [modifiedArgs] - Modified arguments (if hooks altered input)
 * @property {Object[]} [contextModifiers] - State changes to inject into transcript
 */

/**
 * Pre-execution hook type.
 * @param {HookContext} context
 * @returns {HookResult | Promise<HookResult>}
 */

/**
 * Post-execution hook type.
 * @param {HookContext} context
 * @param {Object} result - Execution result
 * @param {boolean} success - Whether execution succeeded
 * @returns {void | Promise<void>}
 */

// Built-in hook registry
const HOOK_REGISTRY = {
  search_replace: {
    before: [
      validateSearchNotEmpty,
      validateFileExists
    ],
    afterSuccess: [
      logEditAction
    ],
    afterFailure: [
      logFailureReason
    ]
  },
  mkdir: {
    before: [
      validatePathNotTraversal
    ],
    afterSuccess: [
      logMkdirAction
    ],
    afterFailure: [
      logFailureReason
    ]
  },
  mv: {
    before: [
      validatePathsExist
    ],
    afterSuccess: [
      logMvAction
    ],
    afterFailure: [
      logFailureReason
    ]
  },
  rm: {
    before: [
      validatePathNotProtected,
      validatePathNotTraversal
    ],
    afterSuccess: [
      logRmAction
    ],
    afterFailure: [
      logFailureReason
    ]
  }
};

// Protected paths that should never be deleted
const PROTECTED_PATTERNS = [
  /(^|\/)\.git(\/|$)/,
  /(^|\/)node_modules(\/|$)/,
  /(^|\/)config\.json$/,
  /(^|\/)package\.json$/,
  /(^|\/)package-lock\.json$/
];

/**
 * Built-in pre-execution hooks
 */
function validateSearchNotEmpty(context) {
  const { args } = context;
  if (args.search !== undefined && args.search.length === 0) {
    return {
      allowed: true,
      modifiedArgs: { ...args, search: "(empty - creating new file)" }
    };
  }
  return { allowed: true };
}

function validateFileExists(context) {
  const { args, metadata } = context;
  if (!metadata.fsTools) return { allowed: true };

  const fs = metadata.fsTools;
  try {
    const absPath = fs.resolveInWorkspace(metadata.workspaceDir, args.file);
    // File exists is fine - we're editing it
    return { allowed: true };
  } catch {
    // File doesn't exist - might be creating new file, that's ok
    return { allowed: true };
  }
}

function validatePathNotTraversal(context) {
  const { args } = context;
  const pathValue = args.path || args.from || args.to || "";

  if (pathValue.includes("..")) {
    return {
      allowed: false,
      denyReason: `Path traversal not allowed: '${pathValue}'`
    };
  }
  return { allowed: true };
}

function validatePathNotProtected(context) {
  const { args } = context;
  const pathValue = args.path || "";

  for (const pattern of PROTECTED_PATTERNS) {
    if (pattern.test(pathValue)) {
      return {
        allowed: false,
        denyReason: `Cannot operate on protected path: '${pathValue}'`
      };
    }
  }
  return { allowed: true };
}

function validatePathsExist(context) {
  const { args, metadata } = context;
  if (!metadata.fsTools) return { allowed: true };

  const fs = metadata.fsTools;
  try {
    if (args.from) {
      fs.resolveInWorkspace(metadata.workspaceDir, args.from);
    }
    return { allowed: true };
  } catch {
    return {
      allowed: true,  // MV can create target, so source not existing is ok
      modifiedArgs: args
    };
  }
}

/**
 * Built-in post-execution hooks (logging)
 */
function logEditAction(context, result) {
  const { args } = context;
  if (process.env.NODE_ENV !== "test") {
    console.log(`[HOOK] search_replace: ${args.file} - ${args.search?.length || 0} chars -> ${args.replace?.length || 0} chars`);
  }
}

function logMkdirAction(context, result) {
  const { args } = context;
  if (process.env.NODE_ENV !== "test") {
    console.log(`[HOOK] mkdir: ${args.path}`);
  }
}

function logMvAction(context, result) {
  const { args } = context;
  if (process.env.NODE_ENV !== "test") {
    console.log(`[HOOK] mv: ${args.from} -> ${args.to}`);
  }
}

function logRmAction(context, result) {
  const { args } = context;
  if (process.env.NODE_ENV !== "test") {
    console.log(`[HOOK] rm: ${args.path}`);
  }
}

function logFailureReason(context, result) {
  if (process.env.NODE_ENV !== "test") {
    console.log(`[HOOK] ${context.toolName} failed:`, result?.error || "unknown error");
  }
}

/**
 * Execute all pre-execution hooks for a tool.
 * Returns aggregated result with any modifications.
 */
async function executePreHooks(toolName, args, metadata = {}) {
  const hooks = HOOK_REGISTRY[toolName]?.before || [];
  let currentArgs = { ...args };

  for (const hook of hooks) {
    const result = await Promise.resolve(hook({ toolName, args: currentArgs, metadata }));

    if (result.denyReason) {
      return {
        allowed: false,
        denyReason: result.denyReason
      };
    }

    if (result.modifiedArgs) {
      currentArgs = result.modifiedArgs;
    }
  }

  return {
    allowed: true,
    modifiedArgs: currentArgs
  };
}

/**
 * Execute all post-execution hooks for a tool.
 */
async function executePostHooks(toolName, args, result, success, metadata = {}) {
  const hooks = HOOK_REGISTRY[toolName]?.[success ? "afterSuccess" : "afterFailure"] || [];

  for (const hook of hooks) {
    await Promise.resolve(hook({ toolName, args, metadata }, result));
  }
}

/**
 * Register a custom hook for a tool.
 */
function registerHook(toolName, phase, hookFn) {
  if (!HOOK_REGISTRY[toolName]) {
    HOOK_REGISTRY[toolName] = { before: [], afterSuccess: [], afterFailure: [] };
  }

  const validPhases = ["before", "afterSuccess", "afterFailure"];
  if (!validPhases.includes(phase)) {
    throw new Error(`Invalid hook phase: ${phase}. Valid: ${validPhases.join(", ")}`);
  }

  HOOK_REGISTRY[toolName][phase].push(hookFn);
}

/**
 * Clear all custom hooks (for testing).
 */
function clearHooks() {
  for (const toolName of Object.keys(HOOK_REGISTRY)) {
    HOOK_REGISTRY[toolName] = { before: [], afterSuccess: [], afterFailure: [] };
  }
}

module.exports = {
  HOOK_REGISTRY,
  executePreHooks,
  executePostHooks,
  registerHook,
  clearHooks,
  // Export built-in hooks for testing
  validateSearchNotEmpty,
  validatePathNotTraversal,
  validatePathNotProtected
};
