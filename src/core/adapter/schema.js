const TOOLS_SCHEMA = [
  {
    type: "function",
    function: {
      name: "search_replace",
      description: "Edit a file using search/replace. SEARCH is the exact text to find, REPLACE is the new text.",
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
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "File path to remove (relative to workspace)" }
        },
        required: ["path"]
      }
    }
  }
];

module.exports = { TOOLS_SCHEMA };
