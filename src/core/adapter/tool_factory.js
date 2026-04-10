/**
 * Tool Factory with Fail-Closed Defaults
 *
 * When building tool interfaces, security is the default state.
 * If a property is forgotten, the system defaults to the strictest setting
 * to avoid accidental dangerous operations.
 */

const { getToolMetadata } = require("./schema");

/**
 * Default flags for tools without explicit metadata.
 * These are the "strictest" settings - any unknown tool is treated
 * as potentially dangerous and must run serially.
 */
const DEFAULT_TOOL_FLAGS = {
  isReadOnly: false,        // assume write operation
  isDestructive: true,      // assume dangerous until proven safe
  isConcurrencySafe: false // assume serial to prevent race conditions
};

/**
 * Create a tool interface with validated metadata.
 * Applies fail-closed defaults for any missing properties.
 */
function createToolInterface(toolName, overrides = {}) {
  const metadata = getToolMetadata(toolName);

  return {
    name: toolName,
    isReadOnly: overrides.isReadOnly ?? metadata.isReadOnly ?? DEFAULT_TOOL_FLAGS.isReadOnly,
    isDestructive: overrides.isDestructive ?? metadata.isDestructive ?? DEFAULT_TOOL_FLAGS.isDestructive,
    isConcurrencySafe: overrides.isConcurrencySafe ?? metadata.isConcurrencySafe ?? DEFAULT_TOOL_FLAGS.isConcurrencySafe,
    prompt: overrides.prompt ?? null  // optional dynamic description generator
  };
}

/**
 * Validate a batch of tool calls for concurrency safety.
 * Returns issues found when mixing parallel tools.
 */
function validateConcurrencyBatch(toolCalls) {
  const issues = [];
  const toolsByFile = {};

  for (const toolCall of toolCalls) {
    const name = toolCall.function?.name || toolCall.name;
    const args = typeof toolCall.function?.arguments === "string"
      ? JSON.parse(toolCall.function.arguments)
      : toolCall.function?.arguments || {};

    const meta = createToolInterface(name);

    // Check concurrency safety
    if (!meta.isConcurrencySafe) {
      // Build a key for file-level locking
      let fileKey = null;
      if (name === "search_replace" || name === "rm" || name === "mv") {
        fileKey = args.file || args.path || args.from || args.to;
      }

      if (fileKey) {
        if (toolsByFile[fileKey]) {
          issues.push({
            type: "concurrency_conflict",
            tool: name,
            file: fileKey,
            message: `Non-serializable operation '${name}' on '${fileKey}' conflicts with '${toolsByFile[fileKey]}'`
          });
        }
        toolsByFile[fileKey] = name;
      }
    }

    // Warn about destructive operations in batch
    if (meta.isDestructive) {
      issues.push({
        type: "destructive_warning",
        tool: name,
        file: args.file || args.path || args.from || args.to,
        message: `Destructive operation '${name}' in parallel batch`
      });
    }
  }

  return issues;
}

module.exports = {
  DEFAULT_TOOL_FLAGS,
  createToolInterface,
  validateConcurrencyBatch
};
