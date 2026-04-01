const fs = require("node:fs/promises");
const path = require("node:path");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");

// 专门用于存储Claude相关信息的日志文件
const claudeLogPath = path.join(__dirname, "..", "claude.log");

async function logClaudeMessage(message) {
  // Return ISO format in Beijing time (UTC+8)
  const now = new Date();
  // Add 8 hours to convert to Beijing time
  const beijingTime = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  const timestamp = beijingTime.toISOString();
  const logMessage = `[${timestamp}] ${message}\n`;
  try {
    await fs.appendFile(claudeLogPath, logMessage);
  } catch (err) {
    console.error("Failed to write to claude.log:", err);
  }
}

const execFileAsync = promisify(execFile);

/**
 * Detects the type of operations required by the task
 * Returns: 'content-only' | 'fileops-only' | 'mixed'
 */
function detectOperationType(instruction) {
  if (!instruction || typeof instruction !== 'string') {
    return 'mixed'; // Default for safety
  }

  const text = instruction.toLowerCase();
  
  // Keywords indicating file operations
  const fileopsKeywords = ['mv:', 'mkdir:', 'rm:', 'move', 'rename', 'directory', 'folder', 'delete file', 'remove file', 'create dir'];
  const hasFileops = fileopsKeywords.some(kw => text.includes(kw));
  
  // Keywords indicating content changes
  const contentKeywords = ['require', 'import', 'update', 'change', 'modify', 'edit', 'replace', 'fix', 'refactor', 'add to', 'remove from', 'search/replace', 'search replace'];
  const hasContent = contentKeywords.some(kw => text.includes(kw));
  
  if (hasFileops && hasContent) return 'mixed';
  if (hasFileops) return 'fileops-only';
  if (hasContent) return 'content-only';
  
  return 'mixed'; // Default assumption
}

/**
 * Validates that model output matches the required operation type
 * Returns: { valid: boolean, errors: string[], blocksFound: string[] }
 */
function validateOperationSchema(output, operationType) {
  const errors = [];
  const blocksFound = [];
  
  // Find all block types in output
  const srMatches = output.match(/```sr/g) || [];
  const opMatches = output.match(/```op/g) || [];
  
  if (srMatches.length > 0) blocksFound.push('sr');
  if (opMatches.length > 0) blocksFound.push('op');
  
  // Validate based on operation type
  if (operationType === 'fileops-only') {
    if (srMatches.length > 0) {
      errors.push('ERROR: Found ```sr blocks but this is a file-operations-only task. Use ONLY ```op blocks (MKDIR, MV, RM).');
    }
    if (opMatches.length === 0) {
      errors.push('ERROR: No ```op blocks found. This task requires file operations (MKDIR, MV, RM).');
    }
  } else if (operationType === 'content-only') {
    if (opMatches.length > 0) {
      errors.push('ERROR: Found ```op blocks but this is a content-editing-only task. Use ONLY ```sr blocks (SEARCH/REPLACE).');
    }
    if (srMatches.length === 0) {
      errors.push('ERROR: No ```sr blocks found. This task requires content editing (SEARCH/REPLACE).');
    }
  }
  // For 'mixed', both are allowed, so no validation needed
  
  return {
    valid: errors.length === 0,
    errors,
    blocksFound
  };
}

/**
 * Injects operation type constraint into the prompt
 */
function buildOperationConstraint(operationType) {
  if (operationType === 'fileops-only') {
    return `
========================================
⚠️  OPERATION TYPE: FILE OPERATIONS ONLY
========================================
YOU MUST OUTPUT ONLY \`\`\`op BLOCKS.
DO NOT OUTPUT \`\`\`sr BLOCKS.

Allowed operations:
- MKDIR: dirname (create directory)
- MV: source -> target (move/rename file)
- RM: filepath (delete file)

Examples of CORRECT output:
\`\`\`op
MV: old-path.js -> new-path.js
MKDIR: lib
RM: unused.js
\`\`\`

Examples of INCORRECT output (will be REJECTED):
- \`\`\`sr blocks - NOT ALLOWED for this task
- File content edits - NOT ALLOWED for this task
`;
  } else if (operationType === 'content-only') {
    return `
========================================
⚠️  OPERATION TYPE: CONTENT EDITING ONLY
========================================
YOU MUST OUTPUT ONLY \`\`\`sr BLOCKS.
DO NOT OUTPUT \`\`\`op BLOCKS.

Allowed operations:
- SEARCH/REPLACE: modify file contents
- Create new files with empty SEARCH

Examples of CORRECT output:
\`\`\`sr
FILE: app.js
SEARCH:
<<<
const old = require('./old');
>>>
REPLACE:
<<<
const old = require('./new');
>>>
\`\`\`

Examples of INCORRECT output (will be REJECTED):
- \`\`\`op blocks with MV, MKDIR, RM - NOT ALLOWED for this task
- File system operations - NOT ALLOWED for this task
`;
  }
  
  return ''; // For 'mixed', no additional constraint needed
}

function buildPrompt(task, contextText, feedbackHistory = [], operationType = null) {
  const system = [
    "You are a code editing agent. You MUST use TWO types of code blocks for different operations:",
    "- ```sr blocks = ONLY for file content editing (SEARCH/REPLACE)",
    "- ```op blocks = ONLY for file system operations (create directory, move, delete)",
    "Do NOT output git patches or unified diffs. Only output code blocks, no extra prose.",
    "Only reference paths that are relative to the workspace root. Never use absolute paths.",
    "Edits must be minimal and correct. Prefer modifying existing files over creating many new ones.",
    "",
    "========================================",
    "EXAMPLE 1: SEARCH/REPLACE for content editing",
    "========================================",
    "```sr",
    "FILE: app.js",
    "SEARCH:",
    "<<<",
    "const calculator = require('./calculator');",
    ">>>",
    "REPLACE:",
    "<<<",
    "const calculator = require('./lib/calculator');",
    ">>>",
    "```",
    "",
    "========================================",
    "EXAMPLE 2: File operations",
    "========================================",
    "",
    "To create a directory:",
    "```op",
    "MKDIR: lib",
    "```",
    "",
    "To move/rename a file:",
    "```op",
    "MV: calculator.js -> lib/calculator.js",
    "```",
    "",
    "To delete a file:",
    "```op",
    "RM: old-file.js",
    "```",
    "",
    "========================================",
    "RULES - READ THESE CAREFULLY:",
    "========================================",
    "- For content editing (changing existing text inside a file): use ONLY ```sr blocks",
    "- For creating a directory: use ONLY ```op with MKDIR",
    "- For moving a file from one location to another: use ONLY ```op with MV",
    "- For deleting a file: use ONLY ```op with RM",
    "- If SEARCH is non-empty in a ```sr block, it MUST match exactly once in the current file contents",
    "- If SEARCH is empty, overwrite the whole file with REPLACE (create if missing)",
    "- When creating a new file, always set SEARCH to empty string in a ```sr block",
    "- **MV automatically creates parent directories:** when you do `MV: calculator.js -> lib/calculator.js`, the lib directory is created automatically if it doesn't exist. You don't need to MKDIR first.",
    "- **DO NOT create a file named `lib` when you want a directory called `lib`.** Use `MKDIR: lib` in a ```op block instead.",
    "- **DO NOT use SEARCH/REPLACE to delete files.** That requires matching the entire file content which often fails. Use `RM: filename` in a ```op block instead - it's fast and reliable.",
    "- **DO NOT manually copy content then delete original.** Use MV - it does both steps atomically.",
    "- When updating `require(...)` / `import` paths, the path must be relative to the file being edited. Example: if `app.js` is in the workspace root and you move modules into `lib/`, use `require('./lib/calculator')` (NOT `../lib/calculator`).",
    "- Do NOT include any extra text, explanations, or separators between blocks. Output ONLY the blocks."
  ].join("\n");

  const feedback = Array.isArray(feedbackHistory) && feedbackHistory.length
    ? [
        "",
        "PREVIOUS FAILURES (fix these and retry with correct sr blocks):",
        ...feedbackHistory.slice(-3).map((f, idx) => {
          const rawMsg = f?.message ?? String(f);
          const stage = f?.stage ?? "unknown";
          const details = f?.details ? ` details=${JSON.stringify(f.details).slice(0, 800)}` : "";
          const msg = String(rawMsg ?? "");
          if (!msg.includes("\n")) {
            return `${idx + 1}. stage=${stage}: ${msg}${details}`;
          }

          const lines = msg.split(/\r?\n/);
          const first = lines.shift() ?? "";
          const rest = lines.map((l) => `  ${l}`).join("\n");
          return `${idx + 1}. stage=${stage}: ${first}${details}\n${rest}`;
        }),
        "",
        "Constraints reminder:",
        "- Output ONLY ```sr or ```op blocks (no prose).",
        "- Use ```sr for content editing, ```op for file system operations (mkdir/mv/rm).",
        "- Keep changes minimal.",
        "- Do not touch .git or any path outside workspace."
      ].join("\n")
    : "";

  // Add operation type constraint if specified
  const operationConstraint = operationType ? buildOperationConstraint(operationType) : '';
  
  const user = [
    `TASK_ID: ${task.task_id}`,
    operationConstraint,
    "INSTRUCTION:",
    task.instruction,
    "",
    feedback,
    feedback ? "" : "",
    "WORKSPACE CONTEXT:",
    contextText
  ].join("\n");

  return { system, user, operationType };
}

function formatErrorPrompt(originalPrompt, errorContext) {
  const errText =
    typeof errorContext === "string"
      ? errorContext
      : JSON.stringify(errorContext, null, 2).slice(0, 4000);

  return {
    system: originalPrompt?.system ?? "",
    user: [
      originalPrompt?.user ?? "",
      "",
      "ERROR CONTEXT:",
      errText,
      "",
      "Fix the error. Output ONLY valid ```sr blocks."
    ].join("\n")
  };
}

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
  // Remove any leading --- separators
  const cleanedBlockText = blockText.replace(/^\s*---\s*/, '');

  const fileMatch = cleanedBlockText.match(/^\s*FILE:\s*(.+)\s*$/m);
  if (!fileMatch) throw new Error("sr block missing FILE:");
  const file = fileMatch[1].trim();

  const searchMatch = cleanedBlockText.match(/SEARCH:\s*<<<\s*([\s\S]*?)\s*>>>\s*/m);
  if (!searchMatch) throw new Error(`sr block missing SEARCH for ${file}`);
  const replaceMatch = cleanedBlockText.match(/REPLACE:\s*<<<\s*([\s\S]*?)\s*>>>\s*/m);
  if (!replaceMatch) throw new Error(`sr block missing REPLACE for ${file}`);

  let search = searchMatch[1];
  // Handle special cases where model uses placeholder text for empty search
  const emptySearchPatterns = [
    "(exact text from file; must be empty when creating new file)",
    "(empty)",
    "(exact text from the file; must be empty when creating a new file)"
  ];
  if (emptySearchPatterns.includes(search.trim())) {
    search = "";
  }

  return {
    type: 'edit',
    file,
    search,
    replace: replaceMatch[1]
  };
}

function parseOpBlock(blockText) {
  const cleanedBlockText = blockText.replace(/^\s*---\s*/, '');
  const lines = cleanedBlockText.split('\n').map(l => l.trim()).filter(Boolean);

  const operations = [];
  for (const line of lines) {
    if (line.startsWith('MKDIR:')) {
      const dirPath = line.slice('MKDIR:'.length).trim();
      operations.push({ type: 'mkdir', path: dirPath });
    } else if (line.startsWith('MV:')) {
      const mvPart = line.slice('MV:'.length).trim();
      // Split more robustly - find the first arrow and split there
      const arrowMatch = mvPart.match(/->|to\s+/i);
      if (arrowMatch) {
        const idx = arrowMatch.index;
        const from = mvPart.slice(0, idx).trim();
        const to = mvPart.slice(idx + arrowMatch[0].length).trim();
        if (from && to) {
          operations.push({ type: 'mv', from, to });
          continue;
        }
      }
      // Fallback split on any occurrence
      const parts = mvPart.split(/\s*->|to\s*/i).map(p => p.trim()).filter(Boolean);
      if (parts.length >= 2) {
        operations.push({ type: 'mv', from: parts[0], to: parts[1] });
        continue;
      }
      throw new Error(`Invalid MV syntax: ${line}. Expected: MV: source -> target`);
    } else if (line.startsWith('RM:')) {
      const rmPath = line.slice('RM:'.length).trim();
      operations.push({ type: 'rm', path: rmPath });
    }
  }

  if (operations.length === 0) {
    throw new Error(`Invalid op block: no recognized operation found. Expected MKDIR, MV, or RM. Got: ${blockText}`);
  }

  // Return all operations found in this block
  return operations;
}

function parseResponse(rawText, fsTools, workspaceDir) {
  const text = String(rawText ?? "");
  // Match both ```sr and ```op blocks
  const re = /```(sr|op)\s*([\s\S]*?)```/g;
  const changes = [];
  let match;
  while ((match = re.exec(text))) {
    const blockType = match[1]; // 'sr' or 'op'
    const blockContent = match[2];
    if (blockType === 'sr') {
      const parsed = parseSrBlock(blockContent);
      fsTools.resolveInWorkspace(workspaceDir, parsed.file);
      changes.push(parsed);
    } else if (blockType === 'op') {
      const parsedOperations = parseOpBlock(blockContent);
      for (const parsed of parsedOperations) {
        if (parsed.type === 'mkdir' || parsed.type === 'rm') {
          fsTools.resolveInWorkspace(workspaceDir, parsed.path);
        } else if (parsed.type === 'mv') {
          fsTools.resolveInWorkspace(workspaceDir, parsed.from);
          fsTools.resolveInWorkspace(workspaceDir, parsed.to);
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

async function callOllama(prompt, modelConfig = {}) {
  const baseUrl = modelConfig?.base_url ?? "http://localhost:11434";
  const url = `${String(baseUrl).replace(/\/+$/, "")}/api/generate`;
  const model = modelConfig?.model ?? "deepseek-coder:6.7b";
  const temperature = typeof modelConfig?.temperature === "number" ? modelConfig.temperature : undefined;

  const body = {
    model,
    prompt: `System: ${prompt.system}\n\nUser: ${prompt.user}`,
    stream: false,
    ...(temperature !== undefined ? { temperature } : {})
  };

  const controller = new AbortController();
  const timeoutMs = 120000;
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body),
      signal: controller.signal
    });

    const text = await res.text();
    if (!res.ok) {
      throw new Error(`Ollama API error ${res.status}: ${text.slice(0, 2000)}`);
    }

    let json;
    try {
      json = JSON.parse(text);
    } catch {
      throw new Error(`Failed to parse Ollama JSON response: ${text.slice(0, 2000)}`);
    }

    const out = json.response;
    if (!out) {
      throw new Error("Ollama response contained no text output");
    }
    return out;
  } finally {
    clearTimeout(timeout);
  }
}

async function callOpenAI(prompt, modelConfig = {}) {
  const baseUrl = modelConfig?.base_url ?? "https://api.openai.com/v1";
  const url = `${String(baseUrl).replace(/\/+$/, "")}/chat/completions`;
  const model = modelConfig?.model ?? "gpt-3.5-turbo";
  const apiKey = modelConfig?.api_key;
  const temperature = typeof modelConfig?.temperature === "number" ? modelConfig.temperature : undefined;

  if (!apiKey) {
    throw new Error("Missing OpenAI API key");
  }

  const body = {
    model,
    messages: [
      { role: "system", content: prompt.system },
      { role: "user", content: prompt.user }
    ],
    stream: false,
    ...(temperature !== undefined ? { temperature } : {})
  };

  const controller = new AbortController();
  const timeoutMs = 120000;
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`
      },
      body: JSON.stringify(body),
      signal: controller.signal
    });

    const text = await res.text();
    if (!res.ok) {
      throw new Error(`OpenAI API error ${res.status}: ${text.slice(0, 2000)}`);
    }

    let json;
    try {
      json = JSON.parse(text);
    } catch {
      throw new Error(`Failed to parse OpenAI JSON response: ${text.slice(0, 2000)}`);
    }

    const out = json.choices?.[0]?.message?.content;
    if (!out) {
      throw new Error("OpenAI response contained no text output");
    }
    return out;
  } finally {
    clearTimeout(timeout);
  }
}

async function readMockTextFromEnv({ singleVar, listVar, listIdxVar }) {
  const mockPath = process.env[singleVar];
  if (mockPath) {
    const abs = path.resolve(mockPath);
    return fs.readFile(abs, "utf8");
  }

  const mockList = process.env[listVar];
  if (mockList) {
    const files = mockList
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (files.length > 0) {
      const idx = Math.min(Number.parseInt(process.env[listIdxVar] ?? "0", 10) || 0, files.length - 1);
      const abs = path.resolve(files[idx]);
      process.env[listIdxVar] = String(idx + 1);
      return fs.readFile(abs, "utf8");
    }
  }
  return null;
}

function ensureObject(x, label) {
  if (!x || typeof x !== "object" || Array.isArray(x)) {
    throw new Error(`Invalid ${label}: expected object`);
  }
  return x;
}

function buildJsonSchemaForSr() {
  return JSON.stringify({
    type: "object",
    additionalProperties: false,
    required: ["sr"],
    properties: { sr: { type: "string" } }
  });
}

function buildJsonSchemaForReview() {
  return JSON.stringify({
    type: "object",
    additionalProperties: false,
    required: ["ok", "issues", "feedback_for_generator"],
    properties: {
      ok: { type: "boolean" },
      feedback_for_generator: { type: "string" },
      issues: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: true,
          required: ["severity", "message"],
          properties: {
            severity: { type: "string" },
            message: { type: "string" },
            file: { type: "string" }
          }
        }
      }
    }
  });
}

async function callClaudeCliJson(anthropicCfg, { system, user, jsonSchema, timeout_ms }) {
  const cfg = anthropicCfg ?? {};
  const cliPath = cfg.cli_path ?? "claude";
  const model = typeof cfg.model === "string" ? cfg.model.trim() : "";
  const timeoutMs = timeout_ms ?? cfg.timeout_ms ?? 120000;

  const args = [
    "-p",
    "--output-format",
    "json",
    "--json-schema",
    jsonSchema,
    "--system-prompt",
    String(system ?? "")
  ];
  if (model) {
    args.push("--model", model);
  }
  args.push(String(user ?? ""));

  return new Promise((resolve, reject) => {
    const { spawn } = require("node:child_process");
    const child = spawn(cliPath, args, {
      encoding: "utf8",
      stdio: ['pipe', 'pipe', 'pipe']
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (data) => {
      stdout += data;
    });

    child.stderr.on("data", (data) => {
      stderr += data;
    });

    child.on("close", async (code) => {
      if (code !== 0) {
        const err = new Error(`Claude CLI error (exit code ${code}): ${stderr || "no error message"}`);
        await logClaudeMessage(`Error: ${err.message}`);
        reject(err);
        return;
      }

      const out = stdout.trim();
      if (!out) {
        const err = new Error(`Claude CLI returned empty output (stderr=${stderr.slice(0, 2000)})`);
        await logClaudeMessage(`Error: ${err.message}`);
        reject(err);
        return;
      }

      await logClaudeMessage(`Raw output: ${out}`);

      try {
        const json = JSON.parse(out);
        await logClaudeMessage(`Parsed JSON: ${JSON.stringify(json, null, 2)}`);
        // 检查是否存在structured_output字段，如果存在则返回它
        if (json.structured_output) {
          await logClaudeMessage(`Using structured_output: ${JSON.stringify(json.structured_output, null, 2)}`);
          resolve(json.structured_output);
        } else {
          resolve(json);
        }
      } catch (e) {
        const err = new Error(`Failed to parse Claude CLI JSON output: ${e.message}: ${out.slice(0, 2000)}`);
        await logClaudeMessage(`Error parsing JSON: ${err.message}`);
        err.cause = e;
        reject(err);
      }
    });

    child.on("error", (err) => {
      reject(new Error(`Claude CLI spawn error: ${err.message}`));
    });

    // 关闭标准输入，告知 Claude CLI 输入结束
    child.stdin.end();

    // 设置超时处理
    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error(`Claude CLI timeout after ${timeoutMs}ms`));
    }, timeoutMs);

    child.on("close", () => {
      clearTimeout(timeout);
    });
  });
}

function createProvider(type, config = {}) {
  if (type === "ollama") {
    const ollamaCfg = config?.ollama ?? {};
    return {
      type: "ollama",
      async generateCode(prompt) {
        const mock = await readMockTextFromEnv({
          singleVar: "AGENT_BRIDGE_RESPONSE_FILE",
          listVar: "AGENT_BRIDGE_RESPONSE_FILES",
          listIdxVar: "AGENT_BRIDGE_RESPONSE_FILES_IDX"
        });
        if (mock !== null) return mock;

        return callOllama(prompt, {
          model: ollamaCfg?.model ?? "deepseek-coder:6.7b",
          base_url: ollamaCfg?.base_url ?? "http://localhost:11434",
          temperature: ollamaCfg?.temperature
        });
      }
    };
  }

  if (type === "openai") {
    const openaiCfg = config?.openai ?? {};
    return {
      type: "openai",
      async generateCode(prompt) {
        const mock = await readMockTextFromEnv({
          singleVar: "AGENT_BRIDGE_RESPONSE_FILE",
          listVar: "AGENT_BRIDGE_RESPONSE_FILES",
          listIdxVar: "AGENT_BRIDGE_RESPONSE_FILES_IDX"
        });
        if (mock !== null) return mock;

        return callOpenAI(prompt, {
          model: openaiCfg?.model ?? "gpt-3.5-turbo",
          base_url: openaiCfg?.base_url ?? "https://api.openai.com/v1",
          api_key: openaiCfg?.openai_api_key ?? process.env[openaiCfg?.api_key_env ?? "OPENAI_API_KEY"],
          temperature: openaiCfg?.temperature
        });
      }
    };
  }

  if (type === "claude_cli") {
    const anthropicCfg = config?.anthropic ?? config ?? {};
    return {
      type: "claude_cli",
      jsonSchemas: {
        sr: buildJsonSchemaForSr(),
        review: buildJsonSchemaForReview()
      },
      async generateCode(prompt) {
        const mock = await readMockTextFromEnv({
          singleVar: "AGENT_BRIDGE_RESPONSE_FILE",
          listVar: "AGENT_BRIDGE_RESPONSE_FILES",
          listIdxVar: "AGENT_BRIDGE_RESPONSE_FILES_IDX"
        });
        if (mock !== null) return mock;

        const schema = buildJsonSchemaForSr();
        const json = await callClaudeCliJson(anthropicCfg, {
          system: [
            String(prompt?.system ?? ""),
            "",
            "Return a JSON object that matches the provided JSON Schema.",
            "Put ALL your ```sr blocks into the single string field: sr.",
            "Do not include any extra fields."
          ].join("\n"),
          user: String(prompt?.user ?? ""),
          jsonSchema: schema
        });

        ensureObject(json, "Claude JSON");
        if (typeof json.sr !== "string" || json.sr.trim() === "") {
          throw new Error("Claude JSON missing non-empty sr string");
        }
        return json.sr;
      },
      async generateJson({ system, user, schema, timeout_ms }) {
        const mock = await readMockTextFromEnv({
          singleVar: "AGENT_BRIDGE_REVIEW_RESPONSE_FILE",
          listVar: "AGENT_BRIDGE_REVIEW_RESPONSE_FILES",
          listIdxVar: "AGENT_BRIDGE_REVIEW_RESPONSE_FILES_IDX"
        });
        if (mock !== null) {
          let json;
          try {
            json = JSON.parse(String(mock));
          } catch (e) {
            const err = new Error(`Failed to parse mock review JSON: ${e.message}`);
            err.cause = e;
            throw err;
          }
          return json;
        }
        return callClaudeCliJson(anthropicCfg, { system, user, jsonSchema: schema, timeout_ms });
      }
    };
  }

  throw new Error(`Unknown provider type: ${type}`);
}

async function callCodex(openaiCfg, prompt, opts = {}) {
  const mockPath = process.env.AGENT_BRIDGE_RESPONSE_FILE;
  if (mockPath) {
    const abs = path.resolve(mockPath);
    return fs.readFile(abs, "utf8");
  }

  const mockList = process.env.AGENT_BRIDGE_RESPONSE_FILES;
  if (mockList) {
    const files = mockList
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (files.length > 0) {
      const idx = Math.min(
        Number.parseInt(process.env.AGENT_BRIDGE_RESPONSE_FILES_IDX ?? "0", 10) || 0,
        files.length - 1
      );
      const abs = path.resolve(files[idx]);
      process.env.AGENT_BRIDGE_RESPONSE_FILES_IDX = String(idx + 1);
      return fs.readFile(abs, "utf8");
    }
  }

  // Default to Ollama if no provider specified
  const provider = openaiCfg?.provider ?? "ollama";
  
  if (provider === "ollama") {
    return callOllama(prompt, {
      model: openaiCfg?.model ?? "deepseek-coder:6.7b",
      base_url: openaiCfg?.base_url ?? "http://localhost:11434",
      temperature: openaiCfg?.temperature
    });
  }

  const baseUrl = openaiCfg?.base_url ?? "https://api.openai.com/v1";
  const model = openaiCfg?.model;
  const apiKeyEnv = openaiCfg?.api_key_env ?? "OPENAI_API_KEY";
  const apiKey = process.env[apiKeyEnv];

  if (!apiKey) {
    throw new Error(`Missing API key env var: ${apiKeyEnv}`);
  }
  if (!model) throw new Error("Missing openai.model in config");

  const body = {
    model,
    input: [
      { role: "system", content: [{ type: "text", text: prompt.system }] },
      { role: "user", content: [{ type: "text", text: prompt.user }] }
    ]
  };

  const controller = new AbortController();
  const timeoutMs = opts.timeout_ms ?? 120000;
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(`${baseUrl.replace(/\/+$/, "")}/responses`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify(body),
      signal: controller.signal
    });

    const text = await res.text();
    if (!res.ok) {
      throw new Error(`OpenAI API error ${res.status}: ${text.slice(0, 2000)}`);
    }

    let json;
    try {
      json = JSON.parse(text);
    } catch {
      throw new Error(`Failed to parse OpenAI JSON response: ${text.slice(0, 2000)}`);
    }

    const out = extractResponseText(json);
    if (!out) {
      throw new Error("OpenAI response contained no extractable text output");
    }
    return out;
  } finally {
    clearTimeout(timeout);
  }
}

module.exports = {
  buildPrompt,
  buildOperationConstraint,
  detectOperationType,
  validateOperationSchema,
  formatErrorPrompt,
  createProvider,
  callCodex,
  parseResponse,
  extractResponseText
};