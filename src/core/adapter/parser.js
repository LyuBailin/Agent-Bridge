const path = require("node:path");
const { validateOperation, getPathFieldsFromArgs } = require("./validator");
const { executePreHooks, executePostHooks } = require("./hooks");
const { classifyBatchRisk, RISK_LEVELS } = require("../risk_classifier");
const { EMPTY_SEARCH_PATTERNS } = require("../../shared/constants");

function extractResponseText(json) {
  if (!json || typeof json !== "object") return "";
  if (typeof json.output_text === "string") return json.output_text;

  const parts = [];
  const output = Array.isArray(json.output) ? json.output : [];
  for (const item of output) {
    const content = Array.isArray(item?.content) ? item.content : [];
    for (const c of content) {
      if (!c) continue;
      if (typeof c.text === "string") parts.push(c.text);
      if (typeof c.output_text === "string") parts.push(c.output_text);
      if (typeof c.content === "string") parts.push(c.content);
    }
  }
  return parts.join("\n").trim();
}

function parseSrBlock(blockText) {
  const cleanedBlockText = blockText.replace(/^\s*---\s*/, "");

  const fileMatch = cleanedBlockText.match(/^\s*FILE:\s*(.+)\s*$/m);
  if (!fileMatch) throw new Error("sr block missing FILE:");
  const file = fileMatch[1].trim();

  // Use \n>>> to ensure end marker is on its own line, preventing content with >>> from being mistaken
  const searchMatch = cleanedBlockText.match(/SEARCH:\s*<<<\n([\s\S]*?)\n>>>\s*/m);
  const replaceMatch = cleanedBlockText.match(/REPLACE:\s*<<<\n([\s\S]*?)\n>>>\s*/m);
  if (!replaceMatch) {
    // Provide helpful error with context
    const preview = blockText.substring(0, 200).replace(/\n/g, '\\n');
    throw new Error(`sr block missing REPLACE for ${file}. Block preview: "${preview}"`);
  }

  let search = searchMatch ? searchMatch[1] : "";
  if (search.trim() !== "" && EMPTY_SEARCH_PATTERNS.includes(search.trim())) {
    search = "";
  }

  return { type: "edit", file, search, replace: replaceMatch[1] };
}

function parseOpBlock(blockText) {
  const cleanedBlockText = blockText.replace(/^\s*---\s*/, "");
  const lines = cleanedBlockText.split("\n").map((l) => l.trim()).filter(Boolean);

  const operations = [];
  for (const line of lines) {
    // Handle MKDIR with or without colon
    if (line.startsWith("MKDIR:") || line.startsWith("MKDIR ")) {
      const separator = line.startsWith("MKDIR:") ? "MKDIR:" : "MKDIR ";
      const dirPath = line.slice(separator.length).trim();
      if (dirPath) operations.push({ type: "mkdir", path: dirPath });
    } else if (line.startsWith("MV:") || line.startsWith("MV ")) {
      // Handle MV with or without colon
      const separator = line.startsWith("MV:") ? "MV:" : "MV ";
      const mvPart = line.slice(separator.length).trim();
      const arrowMatch = mvPart.match(/->|to\s+/i);
      if (arrowMatch) {
        const idx = arrowMatch.index;
        const from = mvPart.slice(0, idx).trim();
        const to = mvPart.slice(idx + arrowMatch[0].length).trim();
        if (from && to) {
          operations.push({ type: "mv", from, to });
          continue;
        }
      }
      const parts = mvPart.split(/\s*->|to\s*/i).map((p) => p.trim()).filter(Boolean);
      if (parts.length >= 2) {
        operations.push({ type: "mv", from: parts[0], to: parts[1] });
        continue;
      }
      throw new Error(`Invalid MV syntax: ${line}. Expected: MV: source -> target`);
    } else if (line.startsWith("RM:") || line.startsWith("RM ")) {
      // Handle RM with or without colon
      const separator = line.startsWith("RM:") ? "RM:" : "RM ";
      const rmPath = line.slice(separator.length).trim();
      if (rmPath) operations.push({ type: "rm", path: rmPath });
    } else if (line.startsWith("TOUCH:") || line.startsWith("TOUCH ")) {
      // Handle TOUCH with or without colon
      const separator = line.startsWith("TOUCH:") ? "TOUCH:" : "TOUCH ";
      const filePath = line.slice(separator.length).trim();
      if (filePath) operations.push({ type: "touch", path: filePath });
    }
  }

  if (operations.length === 0) {
    throw new Error(
      `Invalid op block: no recognized operation found. Expected MKDIR:, MV:, RM:, or TOUCH: (with or without colon). Got: ${blockText}`
    );
  }

  return operations;
}

function parseResponse(rawText, fsTools, workspaceDir) {
  const text = String(rawText ?? "");
  const re = /```(sr|op)\s*([\s\S]*?)```/g;
  const changes = [];
  let match;

  while ((match = re.exec(text))) {
    const blockType = match[1];
    const blockContent = match[2];
    if (blockType === "sr") {
      const parsed = parseSrBlock(blockContent);
      try {
        fsTools.resolveInWorkspace(workspaceDir, parsed.file);
      } catch (e) {
        throw new Error(
          `Invalid path "${parsed.file}": ${e.message}. ` +
          `All paths must be inside the workspace directory (${workspaceDir}). ` +
          `Use paths like "backend/" or "frontend/src/" - NOT absolute paths or paths outside workspace.`
        );
      }
      changes.push(parsed);
    } else if (blockType === "op") {
      const parsedOperations = parseOpBlock(blockContent);
      for (const parsed of parsedOperations) {
        try {
          if (parsed.type === "mkdir" || parsed.type === "rm" || parsed.type === "touch") {
            fsTools.resolveInWorkspace(workspaceDir, parsed.path);
          } else if (parsed.type === "mv") {
            fsTools.resolveInWorkspace(workspaceDir, parsed.from);
            fsTools.resolveInWorkspace(workspaceDir, parsed.to);
          }
        } catch (e) {
          const pathVal = parsed.path || parsed.from || parsed.to || "?";
          throw new Error(
            `Invalid path "${pathVal}": ${e.message}. ` +
            `All paths must be inside the workspace directory (${workspaceDir}). ` +
            `Use paths like "backend/" or "frontend/src/" - NOT absolute paths or paths outside workspace.`
          );
        }
        changes.push(parsed);
      }
    }
  }

  if (changes.length === 0) {
    throw new Error("No ```sr or ```op blocks found in model output");
  }

  return changes;
}

/**
 * Parse structured text output (sr/op blocks) into tool_calls format.
 * Allows text-based model output to be processed through parseToolCalls.
 */
function parseStructuredTextToToolCalls(text) {
  const re = /```(sr|op)\s*([\s\S]*?)```/g;
  const toolCalls = [];
  let match;

  while ((match = re.exec(text))) {
    const blockType = match[1];
    const blockContent = match[2];

    if (blockType === "sr") {
      const parsed = parseSrBlock(blockContent);
      toolCalls.push({
        function: {
          name: "search_replace",
          arguments: JSON.stringify({
            file: parsed.file,
            search: parsed.search,
            replace: parsed.replace
          })
        }
      });
    } else if (blockType === "op") {
      const operations = parseOpBlock(blockContent);
      for (const op of operations) {
        if (op.type === "mkdir") {
          toolCalls.push({
            function: {
              name: "mkdir",
              arguments: JSON.stringify({ path: op.path })
            }
          });
        } else if (op.type === "mv") {
          toolCalls.push({
            function: {
              name: "mv",
              arguments: JSON.stringify({ from: op.from, to: op.to })
            }
          });
        } else if (op.type === "rm") {
          toolCalls.push({
            function: {
              name: "rm",
              arguments: JSON.stringify({ path: op.path })
            }
          });
        } else if (op.type === "touch") {
          toolCalls.push({
            function: {
              name: "touch",
              arguments: JSON.stringify({ path: op.path })
            }
          });
        }
      }
    }
  }

  return toolCalls;
}

/**
 * Parse tool calls from function calling response into internal change format.
 * Integrates risk classification and pre-execution hooks.
 *
 * @param {Array} toolCalls - Array of tool call objects from model
 * @param {Object} fsTools - File system tools for path resolution
 * @param {string} workspaceDir - Workspace directory path
 * @param {Object} options - Additional options
 * @param {Object} options.metadata - Metadata for hooks (workspaceDir, fsTools, etc.)
 * @param {boolean} options.skipHooks - Skip hook execution (for testing)
 * @returns {Object} - { changes: Array, riskAssessment: Object }
 */
async function parseToolCalls(toolCalls, fsTools, workspaceDir, options = {}) {
  const changes = [];
  const metadata = { workspaceDir, fsTools };

  // Run risk classification in parallel with validation
  const riskAssessment = classifyBatchRisk(toolCalls);

  // If blocking issues found, throw early (synchronous)
  if (riskAssessment.blockingIssues.length > 0) {
    const blocking = riskAssessment.blockingIssues[0];
    throw new Error(
      `Blocking risk detected in ${blocking.tool}: ${blocking.message} ` +
      `(risk level: ${blocking.level})`
    );
  }

  for (const toolCall of toolCalls) {
    const func = toolCall.function || toolCall;
    const name = func.name;
    let args;

    if (typeof func.arguments === "string") {
      try {
        args = JSON.parse(func.arguments);
      } catch {
        throw new Error(`Failed to parse tool arguments: ${func.arguments}`);
      }
    } else {
      args = func.arguments || {};
    }

    // Validate operation (checks DENIED_OPERATIONS whitelist)
    validateOperation(name);

    const pathFields = getPathFieldsFromArgs(name, args);
    for (const pf of pathFields) {
      if (pf && typeof pf === "string" && path.isAbsolute(pf)) {
        throw new Error(`Absolute paths not allowed: '${pf}'. Use relative paths within workspace.`);
      }
    }

    if (name === "search_replace") {
      const { file, search, replace } = args;
      if (!file || typeof search !== "string" || typeof replace !== "string") {
        throw new Error(`Invalid search_replace arguments: ${JSON.stringify(args)}`);
      }
      if (replace.length === 0) {
        throw new Error(`search_replace: REPLACE content cannot be empty for file '${file}'`);
      }
      try {
        fsTools.resolveInWorkspace(workspaceDir, file);
      } catch (e) {
        throw new Error(
          `Invalid path "${file}": ${e.message}. ` +
          `All paths must be inside the workspace directory (${workspaceDir}). ` +
          `Use paths like "backend/" or "frontend/src/" - NOT absolute paths or paths outside workspace.`
        );
      }
      changes.push({ type: "edit", file, search, replace });
    } else if (name === "mkdir") {
      const { path: dirPath } = args;
      if (!dirPath) {
        throw new Error(`Invalid mkdir arguments: ${JSON.stringify(args)}`);
      }
      try {
        fsTools.resolveInWorkspace(workspaceDir, dirPath);
      } catch (e) {
        throw new Error(
          `Invalid path "${dirPath}": ${e.message}. ` +
          `All paths must be inside the workspace directory (${workspaceDir}). ` +
          `Use paths like "backend/" or "frontend/src/" - NOT absolute paths or paths outside workspace.`
        );
      }
      changes.push({ type: "mkdir", path: dirPath });
    } else if (name === "mv") {
      const { from, to } = args;
      if (!from || !to) {
        throw new Error(`Invalid mv arguments: ${JSON.stringify(args)}`);
      }
      try {
        fsTools.resolveInWorkspace(workspaceDir, from);
        fsTools.resolveInWorkspace(workspaceDir, to);
      } catch (e) {
        throw new Error(
          `Invalid path "${e.message.includes(from) ? from : to}": ${e.message}. ` +
          `All paths must be inside the workspace directory (${workspaceDir}). ` +
          `Use paths like "backend/" or "frontend/src/" - NOT absolute paths or paths outside workspace.`
        );
      }
      changes.push({ type: "mv", from, to });
    } else if (name === "rm") {
      const { path: rmPath } = args;
      if (!rmPath) {
        throw new Error(`Invalid rm arguments: ${JSON.stringify(args)}`);
      }
      try {
        fsTools.resolveInWorkspace(workspaceDir, rmPath);
      } catch (e) {
        throw new Error(
          `Invalid path "${rmPath}": ${e.message}. ` +
          `All paths must be inside the workspace directory (${workspaceDir}). ` +
          `Use paths like "backend/" or "frontend/src/" - NOT absolute paths or paths outside workspace.`
        );
      }
      changes.push({ type: "rm", path: rmPath });
    } else {
      throw new Error(`Unknown tool: ${name}`);
    }
  }

  // Execute pre-hooks to apply transformations (e.g., validateSearchNotEmpty sets empty search to placeholder)
  for (const change of changes) {
    const toolName = change.type === "edit" ? "search_replace" : change.type;
    const args = change.type === "edit"
      ? { file: change.file, search: change.search, replace: change.replace }
      : change;
    const hookResult = await executePreHooks(toolName, args, metadata);
    if (!hookResult.allowed) {
      throw new Error(`Hook denied ${toolName}: ${hookResult.denyReason}`);
    }
    if (hookResult.modifiedArgs) {
      // Apply hook modifications back to change
      if (hookResult.modifiedArgs.search !== undefined) {
        change.search = hookResult.modifiedArgs.search;
      }
    }
  }

  return { changes, riskAssessment };
}

/**
 * Execute pre-execution hooks for a batch of tool calls.
 * This is separate from parseToolCalls to keep sync validation clean.
 *
 * @param {Array} toolCalls - Array of tool calls to run hooks for
 * @param {Object} metadata - Metadata for hooks
 * @returns {Promise<Array>} - Array of hook results
 */
async function executePreHooksBatch(toolCalls, metadata = {}) {
  const results = [];
  for (const toolCall of toolCalls) {
    const func = toolCall.function || toolCall;
    const name = func.name;
    const args = typeof func.arguments === "string"
      ? JSON.parse(func.arguments)
      : func.arguments || {};

    const hookResult = await executePreHooks(name, args, metadata);
    results.push({ name, args, hookResult });
  }
  return results;
}

module.exports = {
  extractResponseText,
  parseSrBlock,
  parseOpBlock,
  parseResponse,
  parseToolCalls,
  parseStructuredTextToToolCalls
};
