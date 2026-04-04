const fs = require("node:fs/promises");
const path = require("node:path");

const fsTools = require("./fs_tools");
const gitManager = require("./git_manager");
const adapter = require("./adapter");
const planner = require("./planner");
const verifier = require("./verifier");
const snippetFeedback = require("./snippet_feedback");

function nowIso() {
  // Return ISO format in Beijing time (UTC+8)
  const now = new Date();
  // Convert to Beijing time (UTC+8)
  const beijingTime = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  return beijingTime.toISOString();
}

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

function defaultConfig() {
  return {
    paths: { workspace: "workspace", tasks: "tasks", log: "bridge.log" },
    poll_interval_ms: 1000,
    openai: {
      provider: "ollama",
      model: "deepseek-coder:6.7b",
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

  return {
    config,
    rootDir,
    tasksDir,
    taskPath,
    workspaceDir,
    logPath,
    memoryPath
  };
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

async function executeWorkflow(env, task) {
  return orchestrateTask(env, task);
}

function handleFailure(stage, err, taskContext) {
  const message = err?.message ?? String(err);
  return {
    stage,
    message,
    stack: typeof err?.stack === "string" ? err.stack : null,
    details: err?.details ?? null,
    task_id: taskContext?.task_id ?? null
  };
}

async function collectGitSummary(workspaceDir, recentCommits = 10) {

  const summary = { recentCommits: [], diffStat: "", nameStatus: "" };
  try {
    const { stdout: logOut } = await gitManager.runGit(workspaceDir, [
      "log",
      `-n`,
      String(recentCommits),
      "--pretty=format:%h %s"
    ]);
    summary.recentCommits = logOut.split(/\r?\n/).filter(Boolean);
  } catch {
    // ignore
  }

  try {
    const { stdout: statOut } = await gitManager.runGit(workspaceDir, ["diff", "--stat"]);
    summary.diffStat = statOut.trim();
  } catch {
    // ignore
  }

  try {
    const { stdout: nsOut } = await gitManager.runGit(workspaceDir, ["diff", "--name-status"]);
    summary.nameStatus = nsOut.trim();
  } catch {
    // ignore
  }

  return summary;
}

async function orchestrateTask(env, task) {
  // Phase 4: long-horizon orchestrator (DAG + loop).
  return orchestrateLongTask(env, task);
}

function hasPendingSubtasks(planTree) {
  const nodes = planTree?.nodes && typeof planTree.nodes === "object" ? planTree.nodes : {};
  return Object.values(nodes).some((n) => n && (n.status === "pending" || n.status === "running"));
}

function summarizeIssues(issues) {
  if (!Array.isArray(issues) || issues.length === 0) return "";
  return issues.map((i) => i?.message).filter(Boolean).join(" | ").slice(0, 2000);
}

async function orchestrateLongTask(env, task) {
  const MAX_RETRY = 3;
  const startedAt = nowIso();
  await appendLog(env.logPath, `task ${task.task_id} start`);

  const alreadyProcessed = await safeReadJson(env.memoryPath, { processed: {} }).then(
    (m) => Boolean(m?.processed && m.processed[task.task_id])
  );

  if (alreadyProcessed) {
    const finishedAt = nowIso();
    await appendLog(env.logPath, `task ${task.task_id} skipped (duplicate)`);
    await writeResult(env.tasksDir, {
      task_id: task.task_id,
      ok: true,
      changed: false,
      commit: null,
      summary: "skipped duplicate task_id",
      error: null,
      raw_output_path: null,
      attempts: 0,
      errors: [],
      last_error_stage: null,
      started_at: startedAt,
      finished_at: finishedAt
    });
    await recordMemory(env.memoryPath, task.task_id, {
      status: "skipped",
      final_status: "skipped",
      attempts: 0,
      commit: null,
      error_summary: null,
      diff_stat: null,
      finished_at: finishedAt
    });
    await markTask(env.taskPath, { status: "done" });
    return { ok: true, skipped: true };
  }

  await markTask(env.taskPath, { status: "running", started_at: startedAt });

  const taskBaseSha = await gitManager.getHeadSha(env.workspaceDir);
  const errors = [];
  const feedbackHistory = [];
  let lastRawOutPath = null;
  let lastStage = null;
  let difficultyInfo = null;
  const executionTrace = [];
  let planTree = null;

  try {
    if (!difficultyInfo) {
      const likelyPaths = planner.extractLikelyPaths(task?.instruction);
      let lineSum = 0;
      for (const rel of likelyPaths) {
        try {
          const resolved = fsTools.resolveInWorkspace(env.workspaceDir, rel);
          const text = await fs.readFile(resolved.abs, "utf8");
          lineSum += text.split(/\r?\n/).length;
        } catch {
          // ignore missing/unreadable likely files
        }
      }
      difficultyInfo = planner.evaluateComplexity(
        task?.instruction,
        {
          likelyPaths,
          likelyPathCount: likelyPaths.length,
          existingLikelyFilesLineSum: lineSum
        },
        env.config?.routing?.thresholds
      );
    }

    const difficulty = difficultyInfo.difficulty;
    const complexityScore = difficultyInfo.score;

    const phase3Enabled = Boolean(env.config?.anthropic?.enabled);
    const routingCfg = env.config?.routing ?? {};
    const useOllama = env.config?.useOllama ?? true;
    const providerType = useOllama ? "ollama" : "openai";

    let generatorProvider;
    if (providerType === "openai") {
      generatorProvider = adapter.createProvider("openai", { openai: env.config.openai });
    } else {
      generatorProvider = adapter.createProvider("ollama", { ollama: env.config.ollama });
    }
    const claudeProvider = phase3Enabled
      ? adapter.createProvider("claude_cli", { anthropic: env.config.anthropic })
      : null;

    const gitSummaryForPlan = await collectGitSummary(env.workspaceDir, 10);
    const baseContextTextForPlan = await fsTools.collectContext(env.workspaceDir, env.config.context_limits);
    const globalContextUnoptimized = [
      baseContextTextForPlan,
      "",
      "GIT SUMMARY:",
      gitSummaryForPlan.recentCommits.length
        ? "Recent commits:\n" + gitSummaryForPlan.recentCommits.map((l) => `- ${l}`).join("\n")
        : "Recent commits: (unavailable)",
      gitSummaryForPlan.diffStat ? `\nDiff stat:\n${gitSummaryForPlan.diffStat}` : "",
      gitSummaryForPlan.nameStatus ? `\nName status:\n${gitSummaryForPlan.nameStatus}` : ""
    ]
      .filter(Boolean)
      .join("\n");

    // Optimize global context for planning to reduce token usage
    // Use a reasonable token budget for planning: 16k chars (~4k tokens)
    const planningMaxTokens = 4000;
    const globalContext = planner.optimizeContext(difficulty, globalContextUnoptimized, {
      max_tokens: planningMaxTokens,
      likely_paths: difficultyInfo.likelyPaths
    });

    const limits = { max_subtasks: 12, max_replans: 2 };
    if (difficulty === "high") {
      planTree = await planner.decomposeTask({
        instruction: task.instruction,
        globalContext,
        claudeProvider,
        limits,
        task_id: task.task_id
      });
    } else {
      planTree = planner.buildSingleNodePlanTree(task.task_id, task.instruction, difficultyInfo.likelyPaths, limits);
    }

    // Precompute import graph once; used for subtask context expansion.
    let importGraph = null;
    try {
      importGraph = await fsTools.extractImportGraph(env.workspaceDir, {});
    } catch {
      importGraph = null;
    }

    let lastStableSha = taskBaseSha;
    while (hasPendingSubtasks(planTree)) {
      const nextSubtask = planner.getNextExecutableSubtask(planTree);
      if (!nextSubtask) {
        throw new Error("No executable subtask found (DAG blocked)");
      }

      const subtaskId = nextSubtask.id;
      const subStartedAt = nowIso();

      const checkpointBeforeSha = await gitManager.createCheckpointMarker(env.workspaceDir, {
        taskId: task.task_id,
        subtaskId
      });
      planTree = planner.updatePlanState(planTree, subtaskId, {
        status: "running",
        attempts_delta: 0,
        timing: { started_at: subStartedAt, finished_at: null },
        checkpoint_shas: { before: checkpointBeforeSha, commit: null }
      });

      const subtaskFeedback = [];
      let subtaskOk = false;
      let subtaskAttempt = 0;
      let generatorProviderType = null;
      let reviewProviderType = null;
      let checkpointCommitSha = null;
      let subtaskDifficulty = "medium"; // Default difficulty

      for (let attempt = 1; attempt <= MAX_RETRY; attempt += 1) {
        subtaskAttempt = attempt;
        await gitManager.rollbackToSha(env.workspaceDir, checkpointBeforeSha);

        // Detect operation type for schema-driven routing
        const operationType = adapter.detectOperationType(nextSubtask.description);

        // Evaluate subtask difficulty instead of using original task difficulty
        const subtaskDifficultyInfo = planner.evaluateComplexity(
          nextSubtask.description,
          {
            likelyPaths: nextSubtask.target_files,
            likelyPathCount: nextSubtask.target_files.length,
            existingLikelyFilesLineSum: 0
          },
          env.config?.routing?.thresholds
        );
        subtaskDifficulty = subtaskDifficultyInfo.difficulty;

        // Provider routing per subtask: route by subtask difficulty, not operation type.
        // OpenAI/Ollama handles simple fileops and content edits with schema constraints.
        // Claude handles high-complexity tasks only.
        generatorProviderType = (phase3Enabled && subtaskDifficulty === "high") ? "claude_cli" : providerType;
        const currentGeneratorProvider = generatorProviderType === "claude_cli" ? claudeProvider : generatorProvider;

        // Verify+semantic verify for non-low difficulty (Phase 4 default)
        const semanticVerifyEnabled = Boolean(phase3Enabled && subtaskDifficulty !== "low");
        reviewProviderType = semanticVerifyEnabled ? "claude_cli" : null;

        const gitSummary = await collectGitSummary(env.workspaceDir, 10);
        const contextText = await fsTools.collectContext(env.workspaceDir, env.config.context_limits);
        const contextWithGit = [
          contextText,
          "",
          "GIT SUMMARY:",
          gitSummary.recentCommits.length
            ? "Recent commits:\n" + gitSummary.recentCommits.map((l) => `- ${l}`).join("\n")
            : "Recent commits: (unavailable)",
          gitSummary.diffStat ? `\nDiff stat:\n${gitSummary.diffStat}` : "",
          gitSummary.nameStatus ? `\nName status:\n${gitSummary.nameStatus}` : ""
        ]
          .filter(Boolean)
          .join("\n");

        const contextPolicy = routingCfg.context_policy ?? {};
        let maxTokens = null;
        if (generatorProviderType === "ollama" || generatorProviderType === "openai") {
          const profileName = contextPolicy.ollama_profile ?? "default_8k";
          const profile = contextPolicy.ollama_profiles?.[profileName] ?? null;
          if (profile && Number.isFinite(profile.max_tokens)) {
            maxTokens = profile.max_tokens;
          }
        }

        let likelyPaths = Array.isArray(nextSubtask.target_files) && nextSubtask.target_files.length
          ? nextSubtask.target_files
          : difficultyInfo.likelyPaths;

        // Dynamic max files based on difficulty: lower difficulty = fewer related files = lower token usage
        let maxExpandedFiles = 20;
        if (difficulty === "low") {
          maxExpandedFiles = 8;
        } else if (difficulty === "medium") {
          maxExpandedFiles = 15;
        }

        if (importGraph?.reverseEdges) {
          likelyPaths = fsTools.expandRelatedFiles({
            seedFiles: likelyPaths,
            reverseEdges: importGraph.reverseEdges,
            depth: 1,
            maxFiles: maxExpandedFiles
          });
        }

        const optimizedContext = planner.optimizeContext(difficulty, contextWithGit, {
          max_tokens: maxTokens,
          likely_paths: likelyPaths
        });

        const subtaskTask = {
          task_id: `${task.task_id}:${subtaskId}`,
          instruction: nextSubtask.description
        };

        const prompt = adapter.buildPrompt(subtaskTask, optimizedContext, subtaskFeedback, operationType);
        lastStage = "generate";
        const rawText = await currentGeneratorProvider.generateCode(prompt);
        const rawOutPath = path.join(
          env.tasksDir,
          "raw",
          `${task.task_id}.${subtaskId}.attempt${attempt}.txt`
        );
        lastRawOutPath = rawOutPath;
        await fs.writeFile(rawOutPath, rawText, "utf8");

        planTree = planner.updatePlanState(planTree, subtaskId, {
          raw_outputs: [path.relative(env.rootDir, rawOutPath)],
          providers: { generator_provider: generatorProviderType, review_provider: reviewProviderType }
        });

        let changes;
        try {
          lastStage = "parse";
          changes = adapter.parseResponse(rawText, fsTools, env.workspaceDir);
          
          // Validate against operation type schema
          if (operationType && operationType !== 'mixed') {
            const schemaValidation = adapter.validateOperationSchema(rawText, operationType);
            if (!schemaValidation.valid) {
              const schemaError = new Error(`Schema validation failed: ${schemaValidation.errors.join('; ')}`);
              schemaError.details = { validation: schemaValidation };
              throw schemaError;
            }
          }
        } catch (e) {
          const ctx = handleFailure("parse", e, subtaskTask);
          errors.push({ attempt, stage: ctx.stage, message: ctx.message, details: ctx.details });
          subtaskFeedback.push(ctx);
          planTree = planner.updatePlanState(planTree, subtaskId, {
            attempts_delta: 1,
            errors: [{ attempt, stage: ctx.stage, message: ctx.message, details: ctx.details }]
          });
          continue;
        }

        lastStage = "apply";
        const applyResult = await gitManager.safeApplyPatch(env.workspaceDir, changes, fsTools);
        if (!applyResult.ok) {
          const ctx = handleFailure("apply", applyResult.error ?? new Error("apply failed"), subtaskTask);
          if (snippetFeedback.isSearchGot0Error(applyResult.error) && typeof applyResult?.error?.file === "string") {
            const relPath = applyResult.error.file;
            const occurrences = applyResult?.error?.details?.occurrences;
            const searchPreview = applyResult?.error?.details?.search_preview;
            const anchors =
              Array.isArray(applyResult?.error?.details?.search_anchors) && applyResult.error.details.search_anchors.length
                ? applyResult.error.details.search_anchors
                : snippetFeedback.deriveAnchorsFromPreview(searchPreview);

            const snippetRes = await snippetFeedback.collectSnippetsForFile({
              workspaceDir: env.workspaceDir,
              relPath,
              fsTools,
              anchors,
              maxChars: 4000
            });
            const snippetText = snippetFeedback.formatSearchGot0Feedback({
              relPath,
              occurrences,
              searchPreview,
              snippets: snippetRes
            });

            if (snippetText && typeof snippetText === "string") {
              ctx.message = `${ctx.message}\n\n${snippetText}`;
            }
            ctx.details = {
              ...(ctx.details && typeof ctx.details === "object" ? ctx.details : {}),
              file: relPath,
              occurrences: Number.isFinite(occurrences) ? occurrences : undefined,
              search_preview: typeof searchPreview === "string" ? searchPreview : undefined,
              file_snippets: snippetRes && typeof snippetRes === "object" ? snippetRes : undefined,
              snippet_feedback: snippetText
            };
          }
          errors.push({ attempt, stage: ctx.stage, message: ctx.message, details: ctx.details });
          subtaskFeedback.push(ctx);
          planTree = planner.updatePlanState(planTree, subtaskId, {
            attempts_delta: 1,
            errors: [{ attempt, stage: ctx.stage, message: ctx.message, details: ctx.details }]
          });
          continue;
        }

        lastStage = "verify";
        const verifyResult = await verifier.verifyAll(
          subtaskTask,
          env.workspaceDir,
          applyResult,
          gitManager,
          fsTools
        );
        if (!verifyResult.ok) {
          const err = new Error(`verification failed: ${summarizeIssues(verifyResult.issues)}`);
          err.details = { issues: verifyResult.issues };
          const ctx = handleFailure("verify", err, subtaskTask);
          errors.push({ attempt, stage: ctx.stage, message: ctx.message, details: ctx.details });
          subtaskFeedback.push(ctx);
          planTree = planner.updatePlanState(planTree, subtaskId, {
            attempts_delta: 1,
            errors: [{ attempt, stage: ctx.stage, message: ctx.message, details: ctx.details }]
          });
          continue;
        }

        if (semanticVerifyEnabled) {
          lastStage = "semantic_verify";
          const semRes = await verifier.semanticVerify(
            subtaskTask,
            env.workspaceDir,
            gitManager,
            claudeProvider
          );
          if (!semRes.ok) {
            const err = new Error(
              `semantic verification failed: ${
                Array.isArray(semRes.issues) && semRes.issues.length ? semRes.issues[0].message : "blocked"
              }`
            );
            err.details = semRes;
            const ctx = handleFailure("semantic_verify", err, subtaskTask);
            errors.push({ attempt, stage: ctx.stage, message: ctx.message, details: ctx.details });
            const feedbackMessage = semRes.feedback_for_generator || ctx.message;
            await appendLog(env.logPath, `task ${task.task_id}:${subtaskId} semantic_verify feedback: ${feedbackMessage.slice(0, 500)}`);
            subtaskFeedback.push({
              stage: ctx.stage,
              message: feedbackMessage,
              details: ctx.details,
              task_id: ctx.task_id
            });
            planTree = planner.updatePlanState(planTree, subtaskId, {
              attempts_delta: 1,
              errors: [{ attempt, stage: ctx.stage, message: ctx.message, details: ctx.details }]
            });
            continue;
          }
        }

        lastStage = "commit_checkpoint";
        checkpointCommitSha = await gitManager.commitCheckpoint(env.workspaceDir, {
          taskId: task.task_id,
          subtaskId
        });

        lastStableSha = await gitManager.getHeadSha(env.workspaceDir);

        planTree = planner.updatePlanState(planTree, subtaskId, {
          status: "done",
          timing: { started_at: subStartedAt, finished_at: nowIso() },
          checkpoint_shas: { before: checkpointBeforeSha, commit: checkpointCommitSha }
        });

        executionTrace.push({
          subtask_id: subtaskId,
          status: "done",
          attempts: attempt,
          generator_provider: generatorProviderType,
          review_provider: reviewProviderType,
          difficulty: subtaskDifficulty,
          started_at: subStartedAt,
          finished_at: nowIso(),
          checkpoint_before_sha: checkpointBeforeSha,
          checkpoint_commit_sha: checkpointCommitSha,
          raw_output_paths: planTree.nodes[subtaskId].raw_outputs.slice(),
          error_summary: null
        });

        subtaskOk = true;
        break;
      }

      if (!subtaskOk) {
        const subFinishedAt = nowIso();
        planTree = planner.updatePlanState(planTree, subtaskId, {
          status: "failed",
          timing: { started_at: subStartedAt, finished_at: subFinishedAt }
        });

        executionTrace.push({
          subtask_id: subtaskId,
          status: "failed",
          attempts: subtaskAttempt,
          generator_provider: generatorProviderType,
          review_provider: reviewProviderType,
          difficulty: subtaskDifficulty,
          started_at: subStartedAt,
          finished_at: subFinishedAt,
          checkpoint_before_sha: checkpointBeforeSha,
          checkpoint_commit_sha: checkpointCommitSha,
          raw_output_paths: planTree.nodes[subtaskId].raw_outputs.slice(),
          error_summary: planTree.nodes[subtaskId].errors.length
            ? planTree.nodes[subtaskId].errors[planTree.nodes[subtaskId].errors.length - 1].message
            : "failed"
        });

        await gitManager.rollbackToSha(env.workspaceDir, lastStableSha || checkpointBeforeSha);

        // Build failure context for replanning
        let diffStat = "";
        try {
          const { stdout } = await gitManager.runGit(env.workspaceDir, ["diff", "--stat"]);
          diffStat = stdout.trim();
        } catch {
          diffStat = "";
        }

        const failureContext = {
          task_id: task.task_id,
          failed_subtask_id: subtaskId,
          last_error_stage: lastStage,
          last_error: planTree.nodes[subtaskId].errors.length
            ? planTree.nodes[subtaskId].errors[planTree.nodes[subtaskId].errors.length - 1]
            : null,
          diff_stat: diffStat,
          related_files: Array.isArray(nextSubtask.target_files) ? nextSubtask.target_files : []
        };

        // Refresh context with current file state before replanning to ensure accurate subtask generation
        const refreshedContextText = await fsTools.collectContext(env.workspaceDir, env.config.context_limits);
        const refreshedGitSummary = await collectGitSummary(env.workspaceDir, 10);
        const refreshedContextUnoptimized = [
          refreshedContextText,
          "",
          "GIT SUMMARY:",
          refreshedGitSummary.recentCommits.length
            ? "Recent commits:\n" + refreshedGitSummary.recentCommits.map((l) => `- ${l}`).join("\n")
            : "Recent commits: (unavailable)",
          refreshedGitSummary.diffStat ? `\nDiff stat:\n${refreshedGitSummary.diffStat}` : "",
          refreshedGitSummary.nameStatus ? `\nName status:\n${refreshedGitSummary.nameStatus}` : ""
        ]
          .filter(Boolean)
          .join("\n");
        
        const refreshedGlobalContext = planner.optimizeContext(difficulty, refreshedContextUnoptimized, {
          max_tokens: 4000,
          likely_paths: difficultyInfo.likelyPaths
        });

        planTree = await planner.replanFromFailure({
          instruction: task.instruction,
          globalContext: refreshedGlobalContext,
          planTree,
          failedSubtask: nextSubtask,
          failureContext,
          claudeProvider,
          limits
        });

        const maxReplans = Number.isFinite(planTree?.limits?.max_replans) ? planTree.limits.max_replans : 2;
        if ((planTree.replans ?? 0) > maxReplans) {
          throw new Error("Exceeded max replans; aborting");
        }
      }
    }

    lastStage = "squash_commit";
    const squashRes = await gitManager.squashAndCommit(env.workspaceDir, {
      taskId: task.task_id,
      baseSha: taskBaseSha
    });

    const totalAttempts = executionTrace.reduce((sum, t) => sum + (Number.isFinite(t?.attempts) ? t.attempts : 0), 0);

    const finishedAt = nowIso();
    await writeResult(env.tasksDir, {
      task_id: task.task_id,
      ok: true,
      changed: Boolean(squashRes.changed),
      commit: squashRes.commit,
      final_commit: squashRes.commit,
      difficulty,
      complexity_score: complexityScore,
      generator_provider: difficulty === "high" && phase3Enabled ? "claude_cli" : providerType,
      review_provider: difficulty !== "low" && phase3Enabled ? "claude_cli" : null,
      plan_tree: planTree,
      execution_trace: executionTrace,
      summary: squashRes.changed ? "applied subtasks and squashed final commit" : "no changes (no-op)",
      error: null,
      raw_output_path: lastRawOutPath ? path.relative(env.rootDir, lastRawOutPath) : null,
      attempts: totalAttempts,
      errors,
      last_error_stage: null,
      started_at: startedAt,
      finished_at: finishedAt
    });

    const diffStatFinal = await collectGitSummary(env.workspaceDir, 0).then((s) => s.diffStat || null);
    await recordMemory(env.memoryPath, task.task_id, {
      status: "done",
      final_status: "done",
      attempts: totalAttempts,
      commit: squashRes.commit,
      final_commit: squashRes.commit,
      difficulty,
      complexity_score: complexityScore,
      generator_provider: difficulty === "high" && phase3Enabled ? "claude_cli" : providerType,
      review_provider: difficulty !== "low" && phase3Enabled ? "claude_cli" : null,
      plan_tree: planTree,
      execution_trace: executionTrace,
      replans: planTree?.replans ?? 0,
      error_summary: errors.length ? errors[errors.length - 1].message : null,
      diff_stat: diffStatFinal,
      finished_at: finishedAt
    });

    await markTask(env.taskPath, { status: "done", finished_at: finishedAt });
    await appendLog(
      env.logPath,
      `task ${task.task_id} ok (attempts=${totalAttempts}, changed=${Boolean(
        squashRes.changed
      )}, commit=${squashRes.commit ?? "null"})`
    );
    return { ok: true, changed: Boolean(squashRes.changed), commit: squashRes.commit, attempts: totalAttempts };
  } catch (e) {
    const finishedAt = nowIso();
    await appendLog(env.logPath, `task ${task.task_id} failed: ${e?.message ?? String(e)}`);
    await gitManager.rollback(env.workspaceDir, taskBaseSha);
    await writeResult(env.tasksDir, {
      task_id: task.task_id,
      ok: false,
      changed: false,
      commit: null,
      summary: "failed; rolled back",
      error: e?.message ?? String(e),
      raw_output_path: lastRawOutPath ? path.relative(env.rootDir, lastRawOutPath) : null,
      attempts: errors.length ? errors[errors.length - 1].attempt ?? 0 : 0,
      errors,
      last_error_stage: lastStage,
      plan_tree: planTree,
      execution_trace: executionTrace,
      started_at: startedAt,
      finished_at: finishedAt
    });
    await recordMemory(env.memoryPath, task.task_id, {
      status: "failed",
      final_status: "failed",
      attempts: errors.length ? errors[errors.length - 1].attempt ?? 0 : 0,
      commit: null,
      error_summary: e?.message ?? String(e),
      diff_stat: null,
      plan_tree: planTree,
      execution_trace: executionTrace,
      replans: planTree?.replans ?? 0,
      finished_at: finishedAt
    });
    await markTask(env.taskPath, { status: "failed", finished_at: finishedAt });
    return { ok: false, error: e };
  }
}

async function pollLoop(env, { once = false } = {}) {
  while (true) {
    let task;
    try {
      task = await safeReadJson(env.taskPath, null);
    } catch (e) {
      await appendLog(env.logPath, `task.json read error: ${e.message}`);
      if (once) return;
      await sleep(env.config.poll_interval_ms);
      continue;
    }

    if (isQueuedTask(task)) {
      await executeWorkflow(env, task);
      if (once) return;
    } else if (once) {
      return;
    }

    await sleep(env.config.poll_interval_ms);
  }
}

function parseArgs(argv) {
  const out = { once: false, root: process.cwd() };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--once") out.once = true;
    else if (a === "--root") out.root = path.resolve(argv[i + 1] ?? out.root);
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  await loadDotEnv(args.root);
  const env = await initEnvironment(args.root);
  await pollLoop(env, { once: args.once });
}

if (require.main === module) {
  main().catch((e) => {
    // last-resort logging to stderr
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