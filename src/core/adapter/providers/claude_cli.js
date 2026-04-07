const fs = require("node:fs/promises");
const path = require("node:path");

// Log file for Claude CLI output
const claudeLogPath = path.join(__dirname, "..", "..", "..", "..", "claude.log");

// Log levels
const LEVEL = { INFO: "INFO", WARN: "WARN", ERROR: "ERROR", OK: "OK", DIAG: "DIAG" };

// Format timestamp for readability (Beijing time)
function formatTimestamp(date) {
  const beijingTime = new Date(date.getTime() + 8 * 60 * 60 * 1000);
  const d = beijingTime.toISOString().replace("T", " ").slice(0, 19);
  const ms = String(date.getMilliseconds()).padStart(3, "0");
  return `${d}.${ms}`;
}

async function logClaudeMessage(message, level = LEVEL.INFO) {
  const timestamp = formatTimestamp(new Date());
  const logMessage = `[${timestamp}] [${level.padEnd(5)}] ${message}\n`;
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

function buildJsonSchemaForOp() {
  return JSON.stringify({
    type: "object",
    additionalProperties: false,
    required: ["op"],
    properties: { op: { type: "string" } }
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

  // Note: --json-schema is not supported by MiniMax proxy, using prompt-based JSON instruction instead
  const jsonInstruction = jsonSchema
    ? `\n\nIMPORTANT: You MUST respond with ONLY valid JSON matching this schema:\n${jsonSchema}\nDo not include any text before or after the JSON.`
    : "";

  const args = [
    "-p",
    "--output-format",
    "json",
    "--tools", // Disable all tools to prevent agent behavior
    "",
    "--system-prompt",
    String(system ?? "") + jsonInstruction
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

    const pid = child.pid;
    const spawnTime = Date.now();
    logClaudeMessage(`═══ Claude CLI Spawned | PID=${pid} ═══`, LEVEL.INFO);
    logClaudeMessage(`Model: ${model || "(default)"}, Timeout: ${timeoutMs}ms`, LEVEL.DIAG);

    let stdout = "";
    let stderr = "";
    let closed = false;

    child.stdout.on("data", (data) => {
      stdout += data;
    });

    child.stderr.on("data", (data) => {
      stderr += data;
    });

    // Log when process exits for any reason
    child.on("exit", async (code, signal) => {
      const elapsed = Date.now() - spawnTime;
      logClaudeMessage(`Process exited | PID=${pid} | Code=${code} | Signal=${signal || "none"} | Duration=${elapsed}ms`, LEVEL.INFO);
    });

    child.on("close", async (code) => {
      if (closed) {
        logClaudeMessage(`Duplicate close event received for PID=${pid}, ignoring`, LEVEL.WARN);
        return;
      }
      closed = true;
      const elapsed = Date.now() - spawnTime;
      logClaudeMessage(`Close event | PID=${pid} | Exit code=${code} | Output=${stdout.length} chars | Errors=${stderr.length} chars | Elapsed=${elapsed}ms`, LEVEL.INFO);

      if (code !== 0) {
        const err = new Error(`Claude CLI error (exit code ${code}): ${stderr || "no error message"}`);
        logClaudeMessage(`Request failed: ${err.message}`, LEVEL.ERROR);
        reject(err);
        return;
      }

      const out = stdout.trim();
      if (!out) {
        const err = new Error(`Claude CLI returned empty output (stderr=${stderr.slice(0, 2000)})`);
        logClaudeMessage(`Empty response from Claude CLI. stderr: ${stderr.slice(0, 1000)}`, LEVEL.ERROR);
        reject(err);
        return;
      }

      logClaudeMessage(`Raw response (${out.length} chars): ${out.slice(0, 200)}${out.length > 200 ? "..." : ""}`, LEVEL.INFO);

      try {
        const json = JSON.parse(out);
        logClaudeMessage(`JSON parsed successfully | keys: ${Object.keys(json).join(", ")}`, LEVEL.OK);
        if (json.structured_output) {
          logClaudeMessage(`Using structured_output field`, LEVEL.INFO);
          resolve(json.structured_output);
        } else if (json.result) {
          // --output-format json returns {result: "text", ...} - try to parse result as JSON
          logClaudeMessage(`Parsing result field as JSON`, LEVEL.INFO);
          try {
            const resultJson = JSON.parse(json.result);
            logClaudeMessage(`Result field parsed as JSON | keys: ${Object.keys(resultJson).join(", ")}`, LEVEL.OK);
            resolve(resultJson);
          } catch {
            // result is markdown code block string - extract content
            logClaudeMessage(`Result is markdown code block, extracting content`, LEVEL.INFO);
            // Extract code block type (json, sr, or op) and content
            const blockMatch = json.result.match(/```(\w+)?\n([\s\S]*?)```/);
            if (blockMatch && blockMatch[0]) {
              const blockType = blockMatch[1] || "sr"; // default to sr if no type specified
              const blockContent = blockMatch[2].trim(); // Content inside the fences
              if (blockType === "json") {
                // For JSON code blocks (used by semantic review), parse and return the JSON directly
                try {
                  const parsedJson = JSON.parse(blockContent);
                  logClaudeMessage(`JSON block parsed successfully | keys: ${Object.keys(parsedJson).join(", ")}`, LEVEL.OK);
                  resolve(parsedJson);
                } catch (parseErr) {
                  // If JSON parsing fails, treat as raw text in sr block
                  logClaudeMessage(`JSON block parse failed, treating as sr block`, LEVEL.WARN);
                  resolve({ sr: blockMatch[0].trim() });
                }
              } else if (blockType === "op") {
                resolve({ op: blockMatch[0].trim() });
              } else {
                // "sr" or any other type - return wrapped for parseResponse to handle
                resolve({ sr: blockMatch[0].trim() });
              }
            } else {
              resolve({ sr: json.result });
            }
          }
        } else {
          resolve(json);
        }
      } catch (e) {
        const err = new Error(`Failed to parse Claude CLI JSON output: ${e.message}: ${out.slice(0, 500)}`);
        logClaudeMessage(`JSON parse error: ${err.message}`, LEVEL.ERROR);
        err.cause = e;
        reject(err);
      }
    });

    child.on("error", async (err) => {
      const elapsed = Date.now() - spawnTime;
      logClaudeMessage(`Process spawn error after ${elapsed}ms: ${err.message}`, LEVEL.ERROR);
      reject(new Error(`Claude CLI spawn error: ${err.message}`));
    });

    child.stdin.end();

    let timeoutFired = false;
    let killedByUs = false;
    const timeout = setTimeout(() => {
      timeoutFired = true;
      killedByUs = true;
      const elapsed = Date.now() - spawnTime;
      logClaudeMessage(`TIMEOUT after ${elapsed}ms > ${timeoutMs}ms, sending SIGTERM`, LEVEL.WARN);
      child.kill("SIGTERM");
      logClaudeMessage(`SIGTERM sent to PID=${pid}`, LEVEL.INFO);
      reject(new Error(`Claude CLI timeout after ${timeoutMs}ms`));
    }, timeoutMs);

    child.on("close", () => {
      clearTimeout(timeout);
      if (timeoutFired && !killedByUs) {
        logClaudeMessage(`Race condition: close event fired after timeout reject for PID=${pid}`, LEVEL.WARN);
      }
    });

    // Periodic alive check disabled by default - only logs on process death
    // Uncomment below to enable alive logging every 60s
    // let checkCount = 0;
    // const aliveInterval = setInterval(() => {
    //   checkCount++;
    //   try {
    //     process.kill(pid, 0);
    //     logClaudeMessage(`Alive check #${checkCount}: PID=${pid} at ${Date.now() - spawnTime}ms`, LEVEL.DIAG);
    //   } catch (e) {
    //     logClaudeMessage(`PID=${pid} died at ${Date.now() - spawnTime}ms: ${e.message}`, LEVEL.DIAG);
    //     clearInterval(aliveInterval);
    //   }
    // }, 60000);
    // aliveInterval.unref();
  });
}

module.exports = {
  callClaudeCliJson,
  buildJsonSchemaForSr,
  buildJsonSchemaForOp,
  buildJsonSchemaForReview,
  ensureObject,
  logClaudeMessage,
  LEVEL
};
