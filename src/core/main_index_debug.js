const fs = require("node:fs/promises");
const path = require("node:path");

const { nowIso } = require("../shared/time");
const fsTools = require("../utils/fs_tools");
const gitManager = require("./git_manager");
const planner = require("./planner");
const { pollLoop, parseArgs } = require("./polling");
const {
  executeWorkflow,
  orchestrateTask,
  orchestrateLongTask
} = require("./workflow");

async function loadDotEnv(rootDir) {
  const dotenvPath = path.join(rootDir, ".env");
  const text = await fs.readFile(dotenvPath, "utf8").catch((err) => {
    if (err && err.code === "ENOENT") return null;
    throw err;
  });
  if (text === null) return;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (!key) continue;
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

async function sleep(ms) {
  await new Promise((r) => setTimeout(r, ms));
}

async function safeReadJson(filePath, fallback = null) {
  const text = await fs.readFile(filePath, "utf8").catch((err) => {
    if (err && err.code === "ENOENT") return null;
    throw err;
  });
  if (text === null) return fallback;
  try {
    return JSON.parse(text);
  } catch (e) {
    const err = new Error(`Invalid JSON at ${filePath}: ${e.message}`);
    err.cause = e;
    throw err;
  }
}

async function safeWriteJson(filePath, obj) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(obj, null, 2) + "\n", "utf8");
}

async function appendLog(logPath, line) {
  await fs.appendFile(logPath, `[${nowIso()}] ${line}\n`, "utf8");
}

async function fileExists(p) {
  try {
    await fs.stat(p);
    return true;
  } catch (e) {
    if (e && e.code === "ENOENT") return false;
    throw e;
  }
}

function isQueuedTask(task) {
  return (
    task &&
    task.schema_version === 1 &&
    typeof task.task_id === "string" &&
    task.task_id.trim() !== "" &&
    typeof task.instruction === "string" &&
    task.instruction.trim() !== "" &&
    task.status === "queued"
  );
}

async function markTask(taskPath, updates) {
  const current = (await safeReadJson(taskPath, {})) ?? {};
  const next = { ...current, ...updates, updated_at: nowIso() };
  await safeWriteJson(taskPath, next);
  return next;
}

async function writeResult(tasksDir, result) {
  const resultPath = path.join(tasksDir, "result.json");
  await safeWriteJson(resultPath, result);
}

async function recordMemory(memoryPath, taskId, record) {
  const memory = (await safeReadJson(memoryPath, { processed: {} })) ?? { processed: {} };
  if (!memory.processed || typeof memory.processed !== "object") {
    memory.processed = {};
  }
  memory.processed[taskId] = record;
  await safeWriteJson(memoryPath, memory);
}

function isPlainObject(x) {
  return Boolean(x) && typeof x === "object" && !Array.isArray(x);
}

function mergeDeep(base, override) {
  if (!isPlainObject(base)) return override;
  if (!isPlainObject(override)) return { ...base };
  const out = { ...base };
  for (const [k, v] of Object.entries(override)) {
    if (Array.isArray(v)) out[k] = v.slice();
    else if (isPlainObject(v) && isPlainObject(base[k])) out[k] = mergeDeep(base[k], v);
    else out[k] = v;
  }
  return out;
}

async function initEnvironment(rootDir) {
  const configPath = path.join(rootDir, "config.json");
  const loadedConfig = (await safeReadJson(configPath, null)) ?? null;
  const config = mergeDeep(defaultConfig(), loadedConfig ?? {});
  if (!(await fileExists(configPath))) await safeWriteJson(configPath, config);

  const tasksDir = path.join(rootDir, config.paths.tasks);
  const workspaceDir = path.join(rootDir, config.paths.workspace);
  const logPath = path.join(rootDir, config.paths.log);

  await fs.mkdir(tasksDir, { recursive: true });
  await fs.mkdir(path.join(tasksDir, "raw"), { recursive: true });
  await fs.mkdir(path.join(rootDir, "bridge"), { recursive: true });
  await fs.mkdir(workspaceDir, { recursive: true });

  const taskPath = path.join(tasksDir, "task.json");
  if (!(await fileExists(taskPath))) {
    await safeWriteJson(taskPath, {
      schema_version: 1,
      task_id: "",
      instruction: "",
      status: "idle"
    });
  }

  const memoryPath = path.join(rootDir, "bridge", "memory.json");
  const memory = (await safeReadJson(memoryPath, null)) ?? { processed: {} };
  if (!(await fileExists(memoryPath))) {
    await safeWriteJson(memoryPath, memory);
  }

  await gitManager.ensureRepo(workspaceDir, config.git);
  await appendLog(logPath, `init ok (root=${rootDir})`);

  const priv = { safeReadJson, safeWriteJson, appendLog, isQueuedTask, writeResult, recordMemory, markTask };

  return {
    config,
    rootDir,
    tasksDir,
    taskPath,
    workspaceDir,
    logPath,
    memoryPath,
    get _appendLog() { return priv.appendLog; },
    get _safeReadJson() { return priv.safeReadJson; },
    get _safeWriteJson() { return priv.safeWriteJson; },
    get _isQueuedTask() { return priv.isQueuedTask; },
    get _writeResult() { return priv.writeResult; },
    get _recordMemory() { return priv.recordMemory; },
    get _markTask() { return priv.markTask; }
  };
}

function defaultConfig() {
  return {
    paths: { workspace: "workspace", tasks: "tasks", log: "bridge.log" },
    poll_interval_ms: 1000,
    openai: {
      provider: "ollama",
      model: "qwen-2.5-coder:14b",
      base_url: "http://localhost:11434",
      temperature: 0.2
    },
    anthropic: {
      enabled: true,
      provider: "claude_cli",
      cli_path: "claude",
      model: "",
      timeout_ms: 120000,
      json_strict: true
    },
    routing: {
      thresholds: { medium: 35, high: 70 },
      semantic_verify: true,
      context_policy: {
        ollama_profiles: { default_8k: { max_tokens: 8000 }, extended_32k: { max_tokens: 32000 } },
        ollama_profile: "extended_32k"
      }
    },
    context_limits: {
      max_file_bytes: 32768,
      max_files: 30,
      include_exts: ["js", "ts", "json", "md", "txt", "yml", "yaml", "toml"]
    },
    git: { default_branch: "main", user_name: "agent_bridge", user_email: "agent@local" }
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  await loadDotEnv(args.root);
  const env = await initEnvironment(args.root);

  const deps = { safeReadJson, sleep, appendLog, isQueuedTask, executeWorkflow };

  await pollLoop(env, deps, { once: args.once });
}

console.error("require.main check:", require.main === module, require.main && require.main.filename); if (require.main === module) {
  main().catch((e) => {
    console.error(e);
    process.exitCode = 1;
  });
}

module.exports = {
  initEnvironment,
  executeWorkflow,
  orchestrateTask,
  orchestrateLongTask,
  pollLoop,
  isQueuedTask
};
