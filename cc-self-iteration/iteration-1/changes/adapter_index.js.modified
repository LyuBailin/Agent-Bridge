const fs = require("node:fs/promises");
const path = require("node:path");

const { readMockTextFromEnv, SIMULATION_ENV } = require("../../utils/simulation");
const { buildPrompt, buildCorrectionPrompt, buildOperationConstraint } = require("../../prompt");
const { TOOLS_SCHEMA } = require("./schema");
const { callOllama } = require("./providers/ollama");
const { callOpenAI } = require("./providers/openai");
const { callClaudeCliJson, buildJsonSchemaForSr, buildJsonSchemaForOp, buildJsonSchemaForReview, ensureObject } = require("./providers/claude_cli");
const validator = require("./validator");
const parser = require("./parser");

// Re-export validators
const {
  detectOperationType,
  validateOperationSchema,
  validateChangeSet,
  ALLOWED_OPERATIONS,
  DENIED_OPERATIONS
} = validator;

// Re-export parsers
const { extractResponseText, parseResponse, parseToolCalls, parseStructuredTextToToolCalls } = parser;

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

function supportsFunctionCalling(provider) {
  return provider === "openai" || provider === "ollama";
}

async function logOllamaAction(actionLog) {
  const now = new Date();
  const beijingTime = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  const timestamp = beijingTime.toISOString().replace("T", " ").slice(0, 23);
  const { taskId, subtaskId, provider, duration_ms, toolCalls, applied, result, error, ...rest } = actionLog;

  let msg = `[${timestamp}]`;
  if (taskId) msg += ` [${taskId}]`;
  if (subtaskId) msg += ` [${subtaskId}]`;
  msg += `\n`;

  if (provider) msg += `  Provider: ${provider}\n`;
  if (duration_ms != null) msg += `  Duration: ${duration_ms}ms\n`;
  if (toolCalls && toolCalls.length > 0) {
    msg += `  ToolCalls:\n`;
    for (const tc of toolCalls) {
      if (tc.op) {
        msg += `    - ${tc.op}`;
        if (tc.file) msg += ` (${tc.file})`;
        if (tc.path) msg += ` -> ${tc.path}`;
        if (tc.from && tc.to) msg += ` ${tc.from} -> ${tc.to}`;
        msg += `\n`;
      } else {
        msg += `    - ${JSON.stringify(tc)}\n`;
      }
    }
  }
  if (applied && applied.length > 0) {
    msg += `  Applied: ${applied.join(", ")}\n`;
  }
  if (result) msg += `  Result: ${result}\n`;
  if (error) msg += `  Error: ${error}\n`;
  if (Object.keys(rest).length > 0) {
    msg += `  Extra: ${JSON.stringify(rest)}\n`;
  }
  msg += `\n`;

  const ollamaLogPath = path.join(__dirname, "..", "ollama.log");
  try {
    await fs.appendFile(ollamaLogPath, msg);
  } catch (err) {
    console.error("Failed to write to ollama.log:", err);
  }
}

function createProvider(type, config = {}) {
  if (type === "ollama") return createOllamaProvider(config);
  if (type === "openai") return createOpenAIProvider(config);
  if (type === "claude_cli") return createClaudeCliProvider(config);
  throw new Error(`Unknown provider type: ${type}`);
}

function createOllamaProvider(config = {}) {
  const useFunctionCalling = config?.useFunctionCalling ?? false;
  const ollamaCfg = config?.ollama ?? {};
  const functionCallingCfg = config?.functionCalling ?? {};

  return {
    type: "ollama",
    supportsFunctionCalling: true,
    async generateCode(prompt) {
      const mock = await readMockTextFromEnv({
        singleVar: SIMULATION_ENV.RESPONSE_FILE,
        listVar: SIMULATION_ENV.RESPONSE_FILES,
        listIdxVar: SIMULATION_ENV.RESPONSE_FILES_IDX
      });
      if (mock !== null) return mock;

      return callOllama(
        prompt,
        {
          model: ollamaCfg?.model ?? "qwen-2.5-coder:14b",
          base_url: ollamaCfg?.base_url ?? "http://localhost:11434",
          temperature: ollamaCfg?.temperature,
          allowFallback: functionCallingCfg?.allowFallback ?? false
        },
        useFunctionCalling
      );
    }
  };
}

function createOpenAIProvider(config = {}) {
  const useFunctionCalling = config?.useFunctionCalling ?? false;
  const openaiCfg = config?.openai ?? {};

  return {
    type: "openai",
    supportsFunctionCalling: true,
    async generateCode(prompt) {
      const mock = await readMockTextFromEnv({
        singleVar: SIMULATION_ENV.RESPONSE_FILE,
        listVar: SIMULATION_ENV.RESPONSE_FILES,
        listIdxVar: SIMULATION_ENV.RESPONSE_FILES_IDX
      });
      if (mock !== null) return mock;

      return callOpenAI(
        prompt,
        {
          model: openaiCfg?.model ?? "gpt-3.5-turbo",
          base_url: openaiCfg?.base_url ?? "https://api.openai.com/v1",
          api_key: openaiCfg?.openai_api_key ?? process.env[openaiCfg?.api_key_env ?? "OPENAI_API_KEY"],
          temperature: openaiCfg?.temperature
        },
        useFunctionCalling
      );
    }
  };
}

function createClaudeCliProvider(config = {}) {
  const anthropicCfg = config?.anthropic ?? config ?? {};

  return {
    type: "claude_cli",
    jsonSchemas: {
      sr: buildJsonSchemaForSr(),
      review: buildJsonSchemaForReview()
    },
    async generateCode(prompt) {
      const mock = await readMockTextFromEnv({
        singleVar: SIMULATION_ENV.RESPONSE_FILE,
        listVar: SIMULATION_ENV.RESPONSE_FILES,
        listIdxVar: SIMULATION_ENV.RESPONSE_FILES_IDX
      });
      if (mock !== null) return mock;

      const operationType = prompt?.operationType;
      const isFileOpsOnly = operationType === "fileops-only";

      const schema = isFileOpsOnly ? buildJsonSchemaForOp() : buildJsonSchemaForSr();
      const jsonInstruction = isFileOpsOnly
        ? "Output a JSON object with a single field 'op' containing your ```op code blocks as a plain string.\nExample: {\"op\": \"```op\\nMKDIR: lib\\nMV: a.js -> b.js\\n```\"}"
        : "Output a JSON object with a single field 'sr' containing your ```sr code blocks as a plain string.\nExample: {\"sr\": \"```sr\\nFILE: test.js\\nSEARCH:\\n...\\n```\"}";

      const json = await callClaudeCliJson(anthropicCfg, {
        system: [
          String(prompt?.system ?? ""),
          "",
          jsonInstruction
        ].join("\n"),
        user: String(prompt?.user ?? ""),
        jsonSchema: schema
      });

      ensureObject(json, "Claude JSON");

      if (isFileOpsOnly) {
        if (typeof json.op === "string" && json.op.trim() !== "") {
          return json.op;
        }
        if (typeof json.output === "string" && json.output.trim() !== "") {
          const hasOpBlocks = /```op/.test(json.output);
          if (hasOpBlocks) {
            return json.output;
          }
        }
        throw new Error("Claude JSON missing non-empty op string");
      } else {
        if (typeof json.sr === "string" && json.sr.trim() !== "") {
          return json.sr;
        }
        if (typeof json.output === "string" && json.output.trim() !== "") {
          const hasSrBlocks = /```sr/.test(json.output);
          if (hasSrBlocks) {
            return json.output;
          }
        }
        throw new Error("Claude JSON missing non-empty sr string");
      }
    },
    async generateJson({ system, user, schema, timeout_ms }) {
      const mock = await readMockTextFromEnv({
        singleVar: SIMULATION_ENV.REVIEW_RESPONSE_FILE,
        listVar: SIMULATION_ENV.REVIEW_RESPONSE_FILES,
        listIdxVar: SIMULATION_ENV.REVIEW_RESPONSE_FILES_IDX
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

async function callCodex(openaiCfg, prompt, opts = {}) {
  const mock = await readMockTextFromEnv({
    singleVar: SIMULATION_ENV.RESPONSE_FILE,
    listVar: SIMULATION_ENV.RESPONSE_FILES,
    listIdxVar: SIMULATION_ENV.RESPONSE_FILES_IDX
  });
  if (mock !== null) return mock;

  const provider = openaiCfg?.provider ?? "ollama";

  if (provider === "ollama") {
    return callOllama(prompt, {
      model: openaiCfg?.model ?? "qwen-2.5-coder:14b",
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
      throw new Error(`Failed to parse OpenAI API response: ${text.slice(0, 2000)}`);
    }

    const out = parser.extractResponseText(json);
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
  buildCorrectionPrompt,
  buildOperationConstraint,
  detectOperationType,
  validateOperationSchema,
  formatErrorPrompt,
  createProvider,
  callCodex,
  parseResponse,
  extractResponseText,
  TOOLS_SCHEMA,
  parseToolCalls,
  parseStructuredTextToToolCalls,
  validateChangeSet,
  supportsFunctionCalling,
  logOllamaAction,
  ALLOWED_OPERATIONS,
  DENIED_OPERATIONS
};
