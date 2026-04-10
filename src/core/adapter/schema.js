/**
 * Tool Schema with Metadata Flags
 *
 * Each tool includes metadata for governance:
 * - isReadOnly: Whether tool only reads data (no side effects)
 * - isDestructive: Whether tool permanently removes or overwrites data
 * - isConcurrencySafe: Whether tool can run in parallel with other tools
 *   (defaults to false for safety - tools are serial by default)
 */

const TOOLS_SCHEMA = [
  {
    type: "function",
    function: {
      name: "search_replace",
      description: "Edit a file using search/replace. SEARCH is the exact text to find, REPLACE is the new text.",
      metadata: {
        isReadOnly: false,
        isDestructive: false,
        isConcurrencySafe: false  // edits to same file must be serial
      },
      parameters: {
        type: "object",
        properties: {
          file: { type: "string", description: "File path (relative to workspace)" },
          search: { type: "string", description: "Exact text to find in the file" },
          replace: { type: "string", description: "Replacement text" }
        },
        required: ["file", "search", "replace"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "mkdir",
      description: "Create a directory",
      metadata: {
        isReadOnly: false,
        isDestructive: false,
        isConcurrencySafe: true  // creating different directories is safe in parallel
      },
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Directory path to create (relative to workspace)" }
        },
        required: ["path"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "mv",
      description: "Move or rename a file",
      metadata: {
        isReadOnly: false,
        isDestructive: true,  // overwrites destination if exists
        isConcurrencySafe: false
      },
      parameters: {
        type: "object",
        properties: {
          from: { type: "string", description: "Source file path (relative to workspace)" },
          to: { type: "string", description: "Destination file path (relative to workspace)" }
        },
        required: ["from", "to"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "rm",
      description: "Remove a file",
      metadata: {
        isReadOnly: false,
        isDestructive: true,  // permanently removes data
        isConcurrencySafe: false  // removing same file from multiple tools is problematic
      },
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "File path to remove (relative to workspace)" }
        },
        required: ["path"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "touch",
      description: "Create an empty file or update timestamp of existing file",
      metadata: {
        isReadOnly: false,
        isDestructive: false,
        isConcurrencySafe: true
      },
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "File path to touch (relative to workspace)" }
        },
        required: ["path"]
      }
    }
  }
];

/**
 * Lookup table for tool metadata by name.
 * Enables O(1) metadata lookups instead of array searching.
 */
const TOOL_METADATA = {};
for (const tool of TOOLS_SCHEMA) {
  TOOL_METADATA[tool.function.name] = tool.function.metadata;
}

/**
 * Get metadata for a tool by name.
 * Returns fail-closed defaults if tool not found.
 */
function getToolMetadata(toolName) {
  const metadata = TOOL_METADATA[toolName];
  if (!metadata) {
    // Fail-closed: if unknown tool, assume worst-case
    return {
      isReadOnly: false,
      isDestructive: true,
      isConcurrencySafe: false
    };
  }
  return metadata;
}

module.exports = { TOOLS_SCHEMA, TOOL_METADATA, getToolMetadata };
