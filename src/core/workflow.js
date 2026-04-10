const fs = require("node:fs/promises");
const path = require("node:path");

const { nowIso } = require("../shared/time");
const fsTools = require("../utils/fs_tools");
const gitManager = require("./git_manager");
const adapter = require("./adapter");
const planner = require("./planner");
const verifier = require("./verifier");
const snippetFeedback = require("../utils/snippet_feedback");

// Log levels for claude.log
const LEVEL = { INFO: "INFO", WARN: "WARN", ERROR: "ERROR", OK: "OK", DIAG: "DIAG" };

function formatTimestamp(date) {
  const beijingTime = new Date(date.getTime() + 8 * 60 * 60 * 1000);
  const d = beijingTime.toISOString().replace("T", " ").slice(0, 19);
  const ms = String(date.getMilliseconds()).padStart(3, "0");
  return `${d}.${ms}`;
}

async function logClaudeWorkflow(env, message, level = LEVEL.INFO) {
  const claudeLogPath = path.join(env.rootDir, "claude.log");
  const timestamp = formatTimestamp(new Date());
  const logMessage = `[${timestamp}] [${level.padEnd(5)}] ${message}\n`;
  try {
    await fs.appendFile(claudeLogPath, logMessage, "utf8");
  } catch (err) {
    console.error("Failed to write to claude.log:", err);
  }
}

/**
 * Context Modifier Buffer for Parallel Tool Execution
 *
 * When tools execute in parallel, context modifiers (state changes) are buffered
 * and replayed in the original tool-use block order to maintain causal consistency.
 */
class ContextModifierBuffer {
  constructor() {
    this.buffer = [];
    this.enabled = false;
  }

  /**
   * Enable buffering mode
   */
  enable() {
    this.enabled = true;
    this.buffer = [];
  }

  /**
   * Disable buffering and return buffered modifiers
   */
  disable() {
    this.enabled = false;
    const result = this.buffer.slice();
    this.buffer = [];
    return result;
  }

  /**
   * Add a context modifier to the buffer
   * @param {number} toolIndex - Original position in tool-use block
   * @param {Object} modifier - Context modifier object
   */
  add(toolIndex, modifier) {
    if (this.enabled) {
      this.buffer.push({ toolIndex, modifier, timestamp: Date.now() });
    }
  }

  /**
   * Replay buffered modifiers in original order
   * @param {Function} applyFn - Function to apply each modifier
   */
  async replayInOrder(applyFn) {
    // Sort by tool index to maintain causal order
    const sorted = this.buffer.sort((a, b) => a.toolIndex - b.toolIndex);

    for (const entry of sorted) {
      await Promise.resolve(applyFn(entry.modifier));
    }
  }

  /**
   * Clear the buffer without replaying
   */
  clear() {
    this.buffer = [];
  }
}

// Global context modifier buffer instance
const contextModifierBuffer = new ContextModifierBuffer();

// Logging helper shared by workflow functions
async function logOllamaAction(env, { taskId, subtaskId, toolCalls, appliedChanges, result, error, durationMs, provider }) {
  const ollamaLogPath = path.join(env.rootDir, env.config.paths.ollamaLog ?? "ollama.log");
  const model = provider || (env.config.ollama ? env.config.ollama.model : null) || (env.config.openai ? env.config.openai.model : null) || "unknown";

  const logEntry = {
    timestamp: nowIso(),
    taskId,
    subtaskId,
    provider: model,
    duration_ms: durationMs ?? null,
    toolCalls: (toolCalls || []).map((c) => {
      if (c.type === "edit") return { op: "search_replace", file: c.file };
      if (c.type === "mkdir") return { op: "mkdir", path: c.path };
      if (c.type === "mv") return { op: "mv", from: c.from, to: c.to };
      if (c.type === "rm") return { op: "rm", path: c.path };
      return { op: c.type, ...c };
    }),
    applied: (appliedChanges || []).map((c) => c.file || c.path || c),
    result,
    error: error || null
  };

  const ts = logEntry.timestamp.replace("T", " ").slice(0, 23);
  let msg = `[${ts}]`;
  if (taskId) msg += ` [${taskId}]`;
  if (subtaskId) msg += ` [${subtaskId}]`;
  msg += `\n`;

  msg += `  Provider: ${model}\n`;
  if (durationMs != null) msg += `  Duration: ${durationMs}ms\n`;
  if (logEntry.toolCalls.length > 0) {
    msg += `  ToolCalls:\n`;
    for (const tc of logEntry.toolCalls) {
      msg += `    - ${tc.op}`;
      if (tc.file) msg += ` (${tc.file})`;
      if (tc.path) msg += ` -> ${tc.path}`;
      if (tc.from && tc.to) msg += ` ${tc.from} -> ${tc.to}`;
      msg += `\n`;
    }
  }
  if (logEntry.applied.length > 0) {
    msg += `  Applied: ${logEntry.applied.join(", ")}\n`;
  }
  if (result) msg += `  Result: ${result}\n`;
  if (error) msg += `  Error: ${error}\n`;
  msg += `\n`;

  try {
    await fs.appendFile(ollamaLogPath, msg, "utf8");
  } catch (err) {
    console.error("Failed to write to ollama.log:", err);
  }
}

function hasPendingSubtasks(planTree) {
  const nodes = planTree?.nodes && typeof planTree.nodes === "object" ? planTree.nodes : {};
  return Object.values(nodes).some((n) => n && (n.status === "pending" || n.status === "running"));
}

function summarizeIssues(issues) {
  if (!Array.isArray(issues) || issues.length === 0) return "";
  return issues.map((i) => i?.message).filter(Boolean).join(" | ").slice(0, 2000);
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

/**
 * Handle apply failure with snippet feedback for SEARCH/REPLACE errors.
 * @param {Object} env - Environment with workspaceDir
 * @param {Object} subtaskTask - Subtask info
 * @param {Object} applyResult - Result from safeApplyPatch
 * @returns {Object} - { ctx, snippetText } or { ctx, snippetText: null }
 */
async function handleApplyFailure(env, subtaskTask, applyResult) {
  const ctx = handleFailure("apply", applyResult.error ?? new Error("apply failed"), subtaskTask);
  let snippetText = null;

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
    snippetText = snippetFeedback.formatSearchGot0Feedback({
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

  return { ctx, snippetText };
}

/**
 * Build optimized context for a subtask.
 * @param {Object} env - Environment
 * @param {Object} nextSubtask - Subtask with target_files, description
 * @param {string} difficulty - Overall task difficulty
 * @param {Object} difficultyInfo - Task difficulty info with likelyPaths
 * @param {Object} importGraph - Import graph (may be null)
 * @param {Object} routingCfg - Routing config
 * @param {string} generatorProviderType - Provider type (ollama/openai/claude_cli)
 * @returns {Promise<string>} - Optimized context string
 */
async function buildSubtaskContext(env, nextSubtask, difficulty, difficultyInfo, importGraph, routingCfg, generatorProviderType) {
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
      edges: importGraph.edges,
      depth: 1,
      maxFiles: maxExpandedFiles,
      direction: "both"
    });
  }

  const optimizedContext = planner.optimizeContext(difficulty, contextWithGit, {
    max_tokens: maxTokens,
    likely_paths: likelyPaths
  });

  return optimizedContext;
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

async function executeWorkflow(env, task) {
  return orchestrateTask(env, task);
}

async function orchestrateTask(env, task) {
  return orchestrateLongTask(env, task);
}

async function orchestrateLongTask(env, task) {
  const MAX_RETRY = 3;
  const startedAt = nowIso();
  await env._appendLog(env.logPath, `task ${task.task_id} start`);

  const alreadyProcessed = await env._safeReadJson(env.memoryPath, { processed: {} }).then(
    (m) => Boolean(m?.processed && m.processed[task.task_id])
  );

  if (alreadyProcessed) {
    const finishedAt = nowIso();
    await env._appendLog(env.logPath, `task ${task.task_id} skipped (duplicate)`);
    await env._writeResult(env.tasksDir, {
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
    await env._recordMemory(env.memoryPath, task.task_id, {
      status: "skipped",
      final_status: "skipped",
      attempts: 0,
      commit: null,
      error_summary: null,
      diff_stat: null,
      finished_at: finishedAt
    });
    await env._markTask(env.taskPath, { status: "done" });
    return { ok: true, skipped: true };
  }

  await env._markTask(env.taskPath, { status: "running", started_at: startedAt });

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
      const likelyPaths = planner.extractLikelyPaths(task?.instruction, env.workspaceDir);
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
    const useFunctionCalling = env.config?.useFunctionCalling ?? false;
    const providerType = useOllama ? "ollama" : "openai";

    let generatorProvider;
    if (providerType === "openai") {
      generatorProvider = adapter.createProvider("openai", { openai: env.config.openai, useFunctionCalling });
    } else {
      generatorProvider = adapter.createProvider("ollama", { ollama: env.config.ollama, useFunctionCalling, functionCalling: env.config.functionCalling });
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

      await logClaudeWorkflow(env, `═══ Subtask [${subtaskId}] START ═══ Task=${task.task_id} | Files: ${(nextSubtask.target_files || []).join(", ") || "N/A"}`, LEVEL.INFO);

      const subtaskFeedback = [];
      let subtaskOk = false;
      let subtaskAttempt = 0;
      let generatorProviderType = null;
      let checkpointCommitSha = null;
      let subtaskDifficulty = "medium";
      let semanticVerifyEnabled = false;
      let changes = [];
      let applyResult = null;

      for (let attempt = 1; attempt <= MAX_RETRY; attempt += 1) {
        subtaskAttempt = attempt;
        await logClaudeWorkflow(env, `  Attempt ${attempt}/${MAX_RETRY} for Subtask [${subtaskId}]`, LEVEL.DIAG);
        await gitManager.rollbackToSha(env.workspaceDir, checkpointBeforeSha);

        const operationType = adapter.detectOperationType(nextSubtask.description);

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

        generatorProviderType = phase3Enabled && subtaskDifficulty === "high" ? "claude_cli" : providerType;
        const currentGeneratorProvider = generatorProviderType === "claude_cli" ? claudeProvider : generatorProvider;

        semanticVerifyEnabled = Boolean(phase3Enabled && subtaskDifficulty !== "low");

        const optimizedContext = await buildSubtaskContext(
          env,
          nextSubtask,
          difficulty,
          difficultyInfo,
          importGraph,
          routingCfg,
          generatorProviderType
        );

        const subtaskTask = {
          task_id: `${task.task_id}:${subtaskId}`,
          instruction: nextSubtask.description
        };

        const prompt = adapter.buildPrompt(subtaskTask, optimizedContext, subtaskFeedback, operationType);
        lastStage = "generate";
        let rawResponse = await currentGeneratorProvider.generateCode(prompt);

        let rawText;
        const rawOutPath = path.join(
          env.tasksDir,
          "raw",
          `${task.task_id}.${subtaskId}.attempt${attempt}.txt`
        );
        lastRawOutPath = rawOutPath;

        const selfCorrectionEnabled = env.config?.selfCorrection?.enabled ?? false;
        let correctionAttempted = false;
        let correctionFailed = false;
        let parseSuccess = false;

        parseBlock: while (!parseSuccess) {
          try {
            lastStage = "parse";

            if (rawResponse && typeof rawResponse === "object" && Array.isArray(rawResponse.tool_calls)) {
              rawText = JSON.stringify(rawResponse, null, 2);
              await fs.writeFile(rawOutPath, rawText, "utf8");
              const parsedResult = await adapter.parseToolCalls(rawResponse.tool_calls, fsTools, env.workspaceDir);
              changes = parsedResult.changes;
              // Risk assessment is logged but not used to block - hooks handle blocking
              const riskAssessment = parsedResult.riskAssessment;
            } else {
              rawText = String(rawResponse ?? "");
              await fs.writeFile(rawOutPath, rawText, "utf8");
              changes = adapter.parseResponse(rawText, fsTools, env.workspaceDir);

              if (operationType && operationType !== "mixed") {
                const schemaValidation = adapter.validateOperationSchema(rawText, operationType);
                if (!schemaValidation.valid) {
                  const schemaError = new Error(`Schema validation failed: ${schemaValidation.errors.join("; ")}`);
                  schemaError.details = { validation: schemaValidation };
                  throw schemaError;
                }
              }
            }

            const validation = adapter.validateChangeSet(changes);
            if (!validation.valid) {
              const validationError = new Error(`Change validation failed: ${validation.errors.join("; ")}`);
              validationError.details = { validation };
              throw validationError;
            }

            parseSuccess = true;
          } catch (e) {
            if (correctionAttempted || !selfCorrectionEnabled) {
              const ctx = handleFailure("parse", e, subtaskTask);
              errors.push({ attempt, stage: ctx.stage, message: ctx.message, details: ctx.details });
              subtaskFeedback.push(ctx);
              planTree = planner.updatePlanState(planTree, subtaskId, {
                attempts_delta: 1,
                errors: [{ attempt, stage: ctx.stage, message: ctx.message, details: ctx.details }]
              });
              parseSuccess = true;
              correctionFailed = true;
              break parseBlock;
            }

            correctionAttempted = true;

            const errorInfo = { message: e.message, details: e.details };
            const snippetText = subtaskFeedback.length > 0
              ? subtaskFeedback.map((f) => f?.message ?? String(f)).join("\n")
              : e.message;

            const correctionPrompt = adapter.buildCorrectionPrompt(
              subtaskTask,
              optimizedContext,
              errorInfo,
              snippetText,
              operationType
            );

            lastStage = "generate_correction";
            const correctionRawResponse = await currentGeneratorProvider.generateCode(correctionPrompt);

            if (correctionRawResponse && typeof correctionRawResponse === "object" && Array.isArray(correctionRawResponse.tool_calls)) {
              rawResponse = correctionRawResponse;
            } else {
              rawResponse = correctionRawResponse;
            }
          }
        }

        if (correctionFailed) {
          continue;
        }

        planTree = planner.updatePlanState(planTree, subtaskId, {
          raw_outputs: [path.relative(env.rootDir, rawOutPath)],
          providers: { generator_provider: generatorProviderType, review_provider: semanticVerifyEnabled ? "claude_cli" : null }
        });

        lastStage = "apply";
        applyResult = await gitManager.safeApplyPatch(env.workspaceDir, changes, fsTools);
        if (!applyResult.ok) {
          const { ctx } = await handleApplyFailure(env, subtaskTask, applyResult);
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
          fsTools,
          env.config
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
            claudeProvider,
            { changed_files: applyResult?.appliedFiles ?? [] }
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
            await env._appendLog(env.logPath, `task ${task.task_id}:${subtaskId} semantic_verify feedback: ${feedbackMessage.slice(0, 500)}`);
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

        await logOllamaAction(env, {
          taskId: task.task_id,
          subtaskId,
          toolCalls: changes.map((c) => ({ type: c.type, ...c })),
          appliedChanges: applyResult?.changes?.map((c) => ({ type: c.type, ...c })) || [],
          result: "success",
          error: null
        });

        await logClaudeWorkflow(env, `  [${subtaskId}] SUCCESS | Changes: ${(changes || []).map((c) => `${c.type}:${c.file || c.path || c.target}`).join(", ") || "none"} | Commit: ${checkpointCommitSha}`, LEVEL.OK);

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
          review_provider: semanticVerifyEnabled ? "claude_cli" : null,
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
          review_provider: semanticVerifyEnabled ? "claude_cli" : null,
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

        const lastError = planTree.nodes[subtaskId].errors.length
          ? planTree.nodes[subtaskId].errors[planTree.nodes[subtaskId].errors.length - 1].message
          : "unknown error";
        await logOllamaAction(env, {
          taskId: task.task_id,
          subtaskId,
          toolCalls: changes ? changes.map((c) => ({ type: c.type, ...c })) : [],
          appliedChanges: applyResult?.changes?.map((c) => ({ type: c.type, ...c })) || [],
          result: "failure",
          error: lastError
        });

        await logClaudeWorkflow(env, `  [${subtaskId}] FAILED | Error: ${lastError?.slice(0, 200)} | Stage: ${lastStage}`, LEVEL.ERROR);

        await gitManager.rollbackToSha(env.workspaceDir, lastStableSha || checkpointBeforeSha);

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
          await env._appendLog(env.logPath, `task ${task.task_id}:${subtaskId}: max replans (${planTree.replans}) exceeded, marking subtask as skipped to allow independent subtasks to proceed`);
          planTree = planner.updatePlanState(planTree, subtaskId, { status: "skipped" });
        }
      }
    }

    lastStage = "squash_commit";
    const squashRes = await gitManager.squashAndCommit(env.workspaceDir, {
      taskId: task.task_id,
      baseSha: taskBaseSha
    });

    const totalAttempts = executionTrace.reduce(
      (sum, t) => sum + (Number.isFinite(t?.attempts) ? t.attempts : 0),
      0
    );

    const finishedAt = nowIso();
    await env._writeResult(env.tasksDir, {
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
    await env._recordMemory(env.memoryPath, task.task_id, {
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

    await env._markTask(env.taskPath, { status: "done", finished_at: finishedAt });
    await env._appendLog(
      env.logPath,
      `task ${task.task_id} ok (attempts=${totalAttempts}, changed=${Boolean(squashRes.changed)}, commit=${squashRes.commit ?? "null"})`
    );
    return { ok: true, changed: Boolean(squashRes.changed), commit: squashRes.commit, attempts: totalAttempts };
  } catch (e) {
    const finishedAt = nowIso();
    await env._appendLog(env.logPath, `task ${task.task_id} failed: ${e?.message ?? String(e)}`);
    await gitManager.rollback(env.workspaceDir, taskBaseSha);
    await env._writeResult(env.tasksDir, {
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
    await env._recordMemory(env.memoryPath, task.task_id, {
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
    await env._markTask(env.taskPath, { status: "failed", finished_at: finishedAt });
    return { ok: false, error: e };
  }
}

module.exports = {
  orchestrateTask,
  orchestrateLongTask,
  executeWorkflow,
  hasPendingSubtasks,
  summarizeIssues,
  handleFailure,
  collectGitSummary,
  logOllamaAction,
  logClaudeWorkflow,
  ContextModifierBuffer,
  contextModifierBuffer,
  LEVEL
};
