const fs = require("node:fs/promises");
const path = require("node:path");

// Log file for Claude CLI output
const claudeLogPath = path.join(__dirname, "..", "..", "claude.log");

async function logClaudeMessage(message) {
  const now = new Date();
  const beijingTime = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  const timestamp = beijingTime.toISOString();
  const logMessage = `[${timestamp}] ${message}\n`;
  try {
    await fs.appendFile(claudeLogPath, logMessage);
  } catch (err) {
    console.error("Failed to write to claude.log:", err);
  }
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

function ensureObject(x, label) {
  if (!x || typeof x !== "object" || Array.isArray(x)) {
    throw new Error(`Invalid ${label}: expected object`);
  }
  return x;
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
      stdio: ["pipe", "pipe", "pipe"]
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

    child.stdin.end();

    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error(`Claude CLI timeout after ${timeoutMs}ms`));
    }, timeoutMs);

    child.on("close", () => {
      clearTimeout(timeout);
    });
  });
}

module.exports = {
  callClaudeCliJson,
  buildJsonSchemaForSr,
  buildJsonSchemaForReview,
  ensureObject,
  logClaudeMessage
};
