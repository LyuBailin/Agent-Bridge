function createToolRegistry({ fsTools, gitManager } = {}) {
  const tools = new Map();

  function register(tool) {
    if (!tool || typeof tool.name !== "string" || !tool.name.trim()) {
      throw new Error("Invalid tool: missing name");
    }
    if (typeof tool.run !== "function") {
      throw new Error(`Invalid tool ${tool.name}: missing run()`);
    }
    tools.set(tool.name, tool);
  }

  register({
    name: "tool.fs.collectContext",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: { limits: { type: "object" } }
    },
    async run(ctx, args) {
      return fsTools.collectContext(ctx.workspaceDir, args?.limits);
    }
  });

  register({
    name: "tool.fs.extractImportGraph",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        includeExts: { type: "array", items: { type: "string" } },
        maxFiles: { type: "number" },
        maxBytes: { type: "number" }
      }
    },
    async run(ctx, args) {
      return fsTools.extractImportGraph(ctx.workspaceDir, args ?? {});
    }
  });

  register({
    name: "tool.git.getHeadSha",
    inputSchema: { type: "object", additionalProperties: false, properties: {} },
    async run(ctx) {
      return gitManager.getHeadSha(ctx.workspaceDir);
    }
  });

  register({
    name: "tool.git.rollbackToSha",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["sha"],
      properties: { sha: { type: "string" } }
    },
    async run(ctx, args) {
      return gitManager.rollbackToSha(ctx.workspaceDir, args.sha);
    }
  });

  register({
    name: "tool.git.commitCheckpoint",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        taskId: { type: "string" },
        subtaskId: { type: "string" },
        message: { type: "string" }
      }
    },
    async run(ctx, args) {
      return gitManager.commitCheckpoint(ctx.workspaceDir, args ?? {});
    }
  });

  return {
    get(name) {
      return tools.get(name) ?? null;
    },
    list() {
      return Array.from(tools.keys()).sort();
    }
  };
}

module.exports = { createToolRegistry };

