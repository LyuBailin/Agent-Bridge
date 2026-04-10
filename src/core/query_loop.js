/**
 * Query Loop: State Machine for Agentic Sessions
 *
 * This module implements the "heart" of the AI Agent - a robust state machine
 * that governs execution, recovery, and consistency of long-running sessions.
 *
 * Key concepts:
 * - Replaces recursive structures with a while(true) loop
 * - Uses granular transition reasons (not just "loop")
 * - Centralizes state management in QueryEngine
 * - Handles context compression, recovery, and interrupts
 */

const { RISK_LEVELS, classifyBatchRisk } = require("./risk_classifier");
const { yieldMissingToolResultBlocks, mergeResultsWithSynthetic } = require("./synthetic_results");
const { executePreHooks } = require("./adapter/hooks");
const { getToolMetadata } = require("./adapter/schema");

/**
 * State machine states
 */
const State = {
  IDLE: "idle",
  GENERATING: "generating",
  TOOL_EXECUTION: "tool_execution",
  COMPACTING: "compacting",
  RECOVERING: "recovering",
  STOPPED: "stopped"
};

/**
 * Granular transition reasons - the "why" of each loop iteration.
 * Using specific reasons enables better debugging and audit trails.
 */
const TransitionReason = {
  NEXT_TURN: "next_turn",
  REACTIVE_COMPACT: "reactive_compact",
  MAX_OUTPUT_TOKENS_RECOVERY: "max_output_tokens_recovery",
  TOOL_CALL_RECEIVED: "tool_call_received",
  TOOL_RESULT_READY: "tool_result_ready",
  COMPACT_COMPLETE: "compact_complete",
  ERROR_RECOVERY: "error_recovery",
  STOP_HOOK_INTERRUPTION: "stop_hook_interruption",
  BUDGET_EXCEEDED: "budget_exceeded",
  STAGED_COLLAPSE_DRAINED: "staged_collapse_drained",
  RESUME_FIRST: "resume_first",
  CIRCUIT_BROKEN: "circuit_broken"
};

/**
 * Context buffer configuration
 */
const CONTEXT_BUFFERS = {
  // Reserve tokens for model's summary output
  summaryOutputReserve: 20000,

  // Prevent immediate overflow after compact
  overflowPrevention: 13000,

  // Max input tokens target (actual model context - reserves)
  maxInputTokens: null  // Set dynamically based on model
};

/**
 * Circuit breaker configuration
 */
const CIRCUIT_BREAKER = {
  maxConsecutiveFailures: 3,
  maxConsecutiveCompactAttempts: 1
};

/**
 * QueryEngine: Central state machine for agentic sessions
 */
class QueryEngine {
  constructor(options = {}) {
    this.state = State.IDLE;
    this.transcript = [];
    this.turnCount = 0;
    this.toolContexts = new Map();  // tool_use_id -> cached context
    this.budget = {
      tokensUsed: 0,
      maxTokens: options.maxTokens || 128000,
      outputTokensUsed: 0,
      maxOutputTokens: options.maxOutputTokens || 4096
    };

    // Recovery state
    this.consecutiveFailures = 0;
    this.hasAttemptedReactiveCompact = false;
    this.stagedCollapse = null;  // Context currently being summarized

    // Interrupt state
    this.interruptedTools = [];
    this.isStreaming = false;

    // Hooks and providers
    this.toolHooks = options.toolHooks || {};
    this.fsTools = options.fsTools || null;
    this.workspaceDir = options.workspaceDir || null;

    // Session metadata
    this.sessionId = options.sessionId || generateSessionId();
    this.startedAt = null;
  }

  /**
   * Main entry point - runs the state machine until STOPPED
   */
  async run(initialMessages = []) {
    this.startedAt = Date.now();
    this.transcript = initialMessages;
    this.state = State.GENERATING;

    while (this.state !== State.STOPPED) {
      const reason = this.determineTransitionReason();
      await this.transition(reason);
    }

    return this.buildFinalResult();
  }

  /**
   * Determine the specific reason for this transition.
   * Returns one of the TransitionReason values.
   */
  determineTransitionReason() {
    if (this.state === State.RECOVERING) {
      return TransitionReason.ERROR_RECOVERY;
    }

    if (this.state === State.COMPACTING) {
      return TransitionReason.COMPACT_COMPLETE;
    }

    if (this.budget.outputTokensUsed >= this.budget.maxOutputTokens) {
      return TransitionReason.MAX_OUTPUT_TOKENS_RECOVERY;
    }

    if (this.consecutiveFailures >= CIRCUIT_BREAKER.maxConsecutiveFailures) {
      return TransitionReason.CIRCUIT_BROKEN;
    }

    if (this.interruptedTools.length > 0) {
      return TransitionReason.STOP_HOOK_INTERRUPTION;
    }

    if (this.stagedCollapse) {
      return TransitionReason.REACTIVE_COMPACT;
    }

    return TransitionReason.NEXT_TURN;
  }

  /**
   * Execute a state transition based on the reason
   */
  async transition(reason) {
    switch (this.state) {
      case State.GENERATING:
        return this.handleGeneratingTransition(reason);

      case State.TOOL_EXECUTION:
        return this.handleToolExecutionTransition(reason);

      case State.COMPACTING:
        return this.handleCompactingTransition(reason);

      case State.RECOVERING:
        return this.handleRecoveringTransition(reason);

      default:
        console.warn(`Unexpected state: ${this.state}, forcing STOPPED`);
        this.state = State.STOPPED;
    }
  }

  /**
   * Handle transitions while in GENERATING state
   */
  async handleGeneratingTransition(reason) {
    switch (reason) {
      case TransitionReason.NEXT_TURN:
        // Continue generating - model is producing output
        this.turnCount++;
        // Pre-call pipeline would run here before next API call
        await this.preCallPipeline();
        break;

      case TransitionReason.MAX_OUTPUT_TOKENS_RECOVERY:
        // Model hit max output tokens - inject resume message
        await this.injectResumeMessage();
        this.state = State.GENERATING;
        break;

      case TransitionReason.REACTIVE_COMPACT:
        // Context too long - trigger summarization
        this.state = State.COMPACTING;
        break;

      case TransitionReason.ERROR_RECOVERY:
        this.state = State.RECOVERING;
        break;

      case TransitionReason.STOP_HOOK_INTERRUPTION:
        await this.handleInterrupt();
        break;

      case TransitionReason.CIRCUIT_BROKEN:
        console.error("Circuit breaker triggered - too many consecutive failures");
        this.state = State.STOPPED;
        break;

      default:
        // Continue generating
        break;
    }
  }

  /**
   * Handle transitions while in TOOL_EXECUTION state
   */
  async handleToolExecutionTransition(reason) {
    switch (reason) {
      case TransitionReason.TOOL_RESULT_READY:
        // Tool results ready - replay context modifiers in order
        await this.replayContextModifiers();
        this.state = State.GENERATING;
        break;

      case TransitionReason.STOP_HOOK_INTERRUPTION:
        await this.handleInterrupt();
        break;

      default:
        break;
    }
  }

  /**
   * Handle transitions while in COMPACTING state
   */
  async handleCompactingTransition(reason) {
    if (reason === TransitionReason.COMPACT_COMPLETE) {
      // Resume generation after compaction
      this.hasAttemptedReactiveCompact = true;
      this.stagedCollapse = null;
      this.state = State.GENERATING;
    }
    return this.handleGeneratingTransition(reason);
  }

  /**
   * Handle transitions while in RECOVERING state
   */
  async handleRecoveringTransition(reason) {
    if (reason === TransitionReason.STAGED_COLLAPSE_DRAINED) {
      this.consecutiveFailures = 0;
      this.state = State.GENERATING;
      return;
    }

    if (reason === TransitionReason.RESUME_FIRST) {
      this.consecutiveFailures = 0;
      this.state = State.GENERATING;
      return;
    }

    if (reason === TransitionReason.CIRCUIT_BROKEN) {
      this.state = State.STOPPED;
      return;
    }

    // For other error recoveries, stay in GENERATING to retry
    this.state = State.GENERATING;
  }

  /**
   * Pre-call pipeline: Tiered context compression
   *
   * Runs before every API call to ensure context fits within budget.
   * Order matters - try cheaper operations first.
   */
  async preCallPipeline() {
    const maxInput = this.getMaxInputTokens();

    // Step 1: History Snip - trim oldest messages if needed
    await this.historySnip(maxInput);

    // Step 2: Micro Compact - edit caches based on tool_use_id
    await this.microCompact();

    // Step 3: Context Collapse - summarize inactive regions
    await this.contextCollapse();

    // Step 4: Auto Compact - only if still over budget
    if (this.estimateTokenCount() > maxInput) {
      await this.autoCompact();
    }
  }

  /**
   * History Snip: Trim oldest messages if transcript too long
   */
  async historySnip(maxTokens) {
    while (this.estimateTokenCount() > maxTokens && this.transcript.length > 2) {
      // Always keep system message and last user message
      const toRemove = this.transcript.findIndex(m => m.role !== "system");
      if (toRemove > 0) {
        this.transcript.splice(toRemove, 1);
      } else {
        break;
      }
    }
  }

  /**
   * Micro Compact: Targeted cache invalidation based on tool_use_id
   */
  async microCompact() {
    // Remove tool contexts for tools whose results are now in transcript
    for (const [toolUseId, context] of this.toolContexts.entries()) {
      if (this.hasResultForToolUse(toolUseId)) {
        this.toolContexts.delete(toolUseId);
      }
    }
  }

  /**
   * Context Collapse: Summarize inactive regions
   */
  async contextCollapse() {
    // Mark regions not touched in N turns as "inactive"
    // This is a placeholder - full implementation would call a summarizer
    const inactiveThreshold = 5;  // turns

    for (const entry of this.toolContexts.entries()) {
      if (this.turnCount - entry[1].lastAccess > inactiveThreshold) {
        entry[1].summarized = true;
      }
    }
  }

  /**
   * Auto Compact: Full summarization as last resort
   * Should rarely trigger if earlier stages work
   */
  async autoCompact() {
    if (this.hasAttemptedReactiveCompact) {
      // Already tried once this turn - don't retry
      return;
    }

    this.stagedCollapse = {
      startTurn: this.turnCount,
      summary: await this.generateSummary()
    };
    this.hasAttemptedReactiveCompact = true;
  }

  /**
   * Generate a summary of the current transcript
   */
  async generateSummary() {
    // Placeholder - in real implementation, call summarization model
    const recentMessages = this.transcript.slice(-20);
    return {
      messageCount: recentMessages.length,
      toolContextsActive: this.toolContexts.size,
      turnCount: this.turnCount
    };
  }

  /**
   * Resume-First Policy: When model hits max_output_tokens,
   * inject a meta-message to resume exactly where left off.
   */
  async injectResumeMessage() {
    this.transcript.push({
      role: "user",
      content: "<resume>Continue from where you left off. Do not summarize or repeat what was said. Resume your response exactly where it was cut off, even if in the middle of a sentence or word.</resume>",
      _meta: {
        type: "resume_first",
        turnCount: this.turnCount
      }
    });
  }

  /**
   * Handle streaming interrupt - generate synthetic results
   */
  async handleInterrupt() {
    if (this.interruptedTools.length === 0) {
      this.interruptedTools = [];
      return;
    }

    // Generate synthetic results for interrupted tools
    const syntheticResults = yieldMissingToolResultBlocks(
      this.interruptedTools,
      "User interrupted"
    );

    // Add to transcript
    for (const result of syntheticResults) {
      this.transcript.push({
        role: "tool",
        content: JSON.stringify(result.result),
        _meta: {
          synthetic: true,
          toolUseId: result.function.name
        }
      });
    }

    // Add transition marker for audit
    this.addTransitionMarker(TransitionReason.STOP_HOOK_INTERRUPTION);

    this.interruptedTools = [];
    this.state = State.GENERATING;
  }

  /**
   * Replay context modifiers in original causal order
   */
  async replayContextModifiers() {
    // Sort by original tool index to maintain causal chain
    const sorted = Array.from(this.contextModifierBuffer.entries())
      .sort((a, b) => a[1].originalIndex - b[1].originalIndex);

    for (const [toolUseId, entry] of sorted) {
      await this.applyContextModifier(entry.modifier);
    }

    this.contextModifierBuffer.clear();
  }

  /**
   * Apply a context modifier to the session state
   */
  async applyContextModifier(modifier) {
    if (modifier.type === "cache_update") {
      this.toolContexts.set(modifier.toolUseId, {
        data: modifier.data,
        lastAccess: this.turnCount
      });
    }
  }

  /**
   * Record that tool use blocks were parsed from streaming response
   */
  recordToolUseBlocks(toolUseBlocks) {
    for (const block of toolUseBlocks) {
      const toolUseId = block.id || block.function?.name;
      if (toolUseId) {
        this.contextModifierBuffer.set(toolUseId, {
          originalIndex: block._index || 0,
          modifier: {
            type: "cache_update",
            toolUseId,
            data: block
          }
        });
      }
    }
  }

  /**
   * Mark tools as interrupted (for synthetic result generation)
   */
  markToolsInterrupted(toolUseBlocks) {
    this.interruptedTools = toolUseBlocks;
  }

  /**
   * Handle error with layered recovery
   */
  async handleError(error) {
    this.consecutiveFailures++;

    switch (error.code) {
      case "prompt_too_long":
        // Layer 1: Try draining staged collapse first
        if (this.stagedCollapse) {
          await this.drainStagedCollapse();
          return { reason: TransitionReason.STAGED_COLLAPSE_DRAINED, retry: true };
        }
        // Layer 2: Heavy reactive compact
        if (!this.hasAttemptedReactiveCompact) {
          this.hasAttemptedReactiveCompact = true;
          await this.autoCompact();
          this.state = State.COMPACTING;
          return { reason: TransitionReason.REACTIVE_COMPACT, retry: true };
        }
        // Layer 3: Give up
        return { reason: TransitionReason.CIRCUIT_BROKEN, retry: false };

      case "rate_limit":
        await this.backoff(error.retryAfter);
        return { reason: TransitionReason.NEXT_TURN, retry: true };

      case "max_output_tokens":
        await this.injectResumeMessage();
        return { reason: TransitionReason.RESUME_FIRST, retry: true };

      default:
        if (this.consecutiveFailures >= CIRCUIT_BREAKER.maxConsecutiveFailures) {
          return { reason: TransitionReason.CIRCUIT_BROKEN, retry: false };
        }
        return { reason: TransitionReason.ERROR_RECOVERY, retry: true };
    }
  }

  /**
   * Drain staged collapse context
   */
  async drainStagedCollapse() {
    // Apply the summarized context, freeing up token budget
    if (this.stagedCollapse) {
      this.transcript.push({
        role: "system",
        content: `<compact_boundary reason="drained_staged_collapse">${JSON.stringify(this.stagedCollapse.summary)}</compact_boundary>`,
        _meta: { type: "compact_boundary" }
      });
      this.stagedCollapse = null;
    }
  }

  /**
   * Backoff for rate limiting
   */
  async backoff(retryAfterMs) {
    const delay = Math.min(retryAfterMs || 1000, 5000);
    await new Promise(resolve => setTimeout(resolve, delay));
  }

  /**
   * Add transition marker to transcript for audit
   */
  addTransitionMarker(reason) {
    this.transcript.push({
      role: "system",
      content: `<transition reason="${reason}" turn="${this.turnCount}" />`,
      _meta: { type: "transition", reason, turnCount: this.turnCount }
    });
  }

  /**
   * Add compact boundary marker to transcript
   */
  addCompactBoundary(reason, summary) {
    this.transcript.push({
      role: "system",
      content: `<compact_boundary reason="${reason}">${summary}</compact_boundary>`,
      _meta: { type: "compact_boundary", reason }
    });
  }

  /**
   * Check if result exists for a tool_use_id
   */
  hasResultForToolUse(toolUseId) {
    return this.transcript.some(m =>
      m.role === "tool" && m._meta?.toolUseId === toolUseId
    );
  }

  /**
   * Estimate token count of transcript (rough approximation)
   */
  estimateTokenCount() {
    // Rough estimate: 4 chars per token
    const totalChars = this.transcript.reduce((sum, m) =>
      sum + (typeof m.content === "string" ? m.content.length : 0), 0
    );
    return Math.ceil(totalChars / 4) + this.budget.tokensUsed;
  }

  /**
   * Get max input tokens based on model context and reserves
   */
  getMaxInputTokens() {
    if (CONTEXT_BUFFERS.maxInputTokens) {
      return CONTEXT_BUFFERS.maxInputTokens;
    }
    return this.budget.maxTokens
      - CONTEXT_BUFFERS.summaryOutputReserve
      - CONTEXT_BUFFERS.overflowPrevention;
  }

  /**
   * Build final result when state machine stops
   */
  buildFinalResult() {
    return {
      sessionId: this.sessionId,
      turnCount: this.turnCount,
      transcript: this.transcript,
      consecutiveFailures: this.consecutiveFailures,
      budget: this.budget,
      durationMs: Date.now() - this.startedAt,
      stoppedReason: this.determineStopReason()
    };
  }

  /**
   * Determine why the session stopped
   */
  determineStopReason() {
    if (this.consecutiveFailures >= CIRCUIT_BREAKER.maxConsecutiveFailures) {
      return "circuit_broken";
    }
    if (this.interruptedTools.length > 0) {
      return "user_interrupt";
    }
    return "complete";
  }

  /**
   * Reset session state for reuse
   */
  reset() {
    this.state = State.IDLE;
    this.transcript = [];
    this.turnCount = 0;
    this.toolContexts.clear();
    this.consecutiveFailures = 0;
    this.hasAttemptedReactiveCompact = false;
    this.stagedCollapse = null;
    this.interruptedTools = [];
    this.contextModifierBuffer.clear();
  }

  // Context modifier buffer - keyed by tool_use_id
  contextModifierBuffer = new Map();
}

/**
 * StreamingToolExecutor: Executes tools as they are parsed from streaming response
 *
 * Moves away from "wait-and-call" patterns. When a tool_use block is parsed
 * from the stream, we immediately start processing it while more content streams.
 *
 * Integrates with:
 * - risk_classifier: Parallel risk assessment
 * - hooks: Pre/post execution hooks
 * - contextModifierBuffer: Causal ordering for parallel execution
 */
class StreamingToolExecutor {
  constructor(options = {}) {
    this.pendingTools = [];  // Tools awaiting execution
    this.contextModifierBuffer = options.contextModifierBuffer || new Map();
    this.riskClassifier = options.riskClassifier || null;
    this.toolHooks = options.toolHooks || {};
    this.fsTools = options.fsTools || null;
    this.workspaceDir = options.workspaceDir || null;
    this.metadata = options.metadata || {};

    // Execution control
    this.isExecuting = false;
    this.shouldStop = false;

    // Callbacks
    this.onToolResult = options.onToolResult || (() => {});
    this.onSiblingFailure = options.onSiblingFailure || (() => {});
  }

  /**
   * Called when a tool_use block is parsed from the stream.
   * Starts risk assessment immediately (parallel with other checks).
   *
   * @param {Object} toolUse - The parsed tool_use block
   * @param {number} index - Original position in the tool-use block list
   */
  async onToolUseBlock(toolUse, index = 0) {
    const toolName = toolUse.function?.name || toolUse.name;
    const args = typeof toolUse.function?.arguments === "string"
      ? JSON.parse(toolUse.function.arguments)
      : toolUse.function?.arguments || {};

    // Start risk assessment immediately in parallel
    let riskAssessment = { level: "low", message: null };
    if (this.riskClassifier) {
      try {
        riskAssessment = this.riskClassifier.classifyToolRisk(toolName, args);
      } catch (e) {
        // Risk classifier error - continue with caution
        riskAssessment = { level: "medium", message: "Risk assessment failed" };
      }
    }

    const toolEntry = {
      toolUse,
      toolName,
      args,
      riskAssessment,
      index,
      startTime: Date.now(),
      status: "pending"
    };

    // Check concurrency safety
    const metadata = getToolMetadata(toolName);
    const isConcurrencySafe = metadata?.isConcurrencySafe ?? false;

    if (!isConcurrencySafe) {
      // Non-serial tool - must wait for pending tools to complete first
      await this.drainPendingUntil(toolName);
    }

    this.pendingTools.push(toolEntry);

    // Start execution immediately
    this.executeTool(toolEntry);

    return toolEntry;
  }

  /**
   * Execute a single tool, handling pre-hooks and error recovery
   */
  async executeTool(toolEntry) {
    const { toolUse, toolName, args, index } = toolEntry;

    try {
      // Execute pre-hooks
      if (this.toolHooks) {
        const hookResult = await executePreHooks(toolName, args, {
          workspaceDir: this.workspaceDir,
          fsTools: this.fsTools,
          ...this.metadata
        });

        if (!hookResult.allowed) {
          throw new Error(`Pre-hook denied: ${hookResult.denyReason}`);
        }

        // Use modified args from hooks if provided
        if (hookResult.modifiedArgs) {
          toolEntry.args = hookResult.modifiedArgs;
        }
      }

      // Record in context modifier buffer for causal replay
      this.contextModifierBuffer.set(toolName, {
        originalIndex: index,
        modifier: {
          type: "tool_started",
          toolName,
          args: toolEntry.args,
          startTime: toolEntry.startTime
        },
        timestamp: Date.now()
      });

      // Execute the actual tool (delegate to callback)
      const result = await this.executeToolAction(toolName, toolEntry.args);

      toolEntry.status = "completed";
      toolEntry.result = result;

      // Record completion in context modifier buffer
      this.contextModifierBuffer.set(`${toolName}_result`, {
        originalIndex: index,
        modifier: {
          type: "tool_completed",
          toolName,
          result,
          durationMs: Date.now() - toolEntry.startTime
        },
        timestamp: Date.now()
      });

      // Notify via callback
      await this.onToolResult({
        toolUse,
        toolName,
        args: toolEntry.args,
        result,
        riskAssessment: toolEntry.riskAssessment,
        durationMs: Date.now() - toolEntry.startTime
      });

      return result;

    } catch (error) {
      toolEntry.status = "failed";
      toolEntry.error = error.message;

      // Handle sibling failure
      const shouldDiscard = await this.handleSiblingFailure(toolEntry);

      if (shouldDiscard) {
        this.shouldStop = true;
        await this.cancelPendingTools(toolEntry);
      }

      throw error;
    }
  }

  /**
   * Execute the actual tool action.
   * Override this method or provide via options.onExecuteTool.
   */
  async executeToolAction(toolName, args) {
    if (this.onExecuteTool) {
      return this.onExecuteTool(toolName, args);
    }
    throw new Error(`StreamingToolExecutor: No handler for tool '${toolName}'`);
  }

  /**
   * Drain pending tools until a specific tool type completes.
   * Used to enforce serial execution for non-concurrency-safe tools.
   */
  async drainPendingUntil(targetToolName) {
    while (this.pendingTools.some(t => t.status === "pending" || t.status === "executing")) {
      const stillPending = this.pendingTools.some(
        t => t.status !== "completed" && t.toolName !== targetToolName
      );

      if (!stillPending) break;

      // Wait a bit before checking again
      await new Promise(resolve => setTimeout(resolve, 10));
    }
  }

  /**
   * Handle sibling failure - decide whether to continue or cancel batch
   *
   * @param {Object} failedTool - The tool that failed
   * @returns {boolean} - True if batch should be discarded
   */
  async handleSiblingFailure(failedTool) {
    const toolName = failedTool.toolName;
    const errorReason = failedTool.error;

    // Critical tools that should cause batch discard
    const criticalTools = ["rm", "mv"];

    if (criticalTools.includes(toolName)) {
      await this.onSiblingFailure({
        action: "discard",
        reason: `Critical tool '${toolName}' failed: ${errorReason}`,
        failedTool,
        remainingTools: this.pendingTools.filter(t => t !== failedTool)
      });
      return true;
    }

    // High risk failure - check if we should discard
    if (failedTool.riskAssessment?.level === "high" ||
        failedTool.riskAssessment?.level === "critical") {
      await this.onSiblingFailure({
        action: "discard",
        reason: `High-risk tool '${toolName}' failed: ${errorReason}`,
        failedTool,
        remainingTools: this.pendingTools.filter(t => t !== failedTool)
      });
      return true;
    }

    // Non-critical - continue with remaining
    await this.onSiblingFailure({
      action: "continue",
      reason: `Non-critical tool '${toolName}' failed but continuing`,
      failedTool,
      remainingTools: this.pendingTools.filter(t => t !== failedTool)
    });
    return false;
  }

  /**
   * Cancel pending tools when batch is discarded
   */
  async cancelPendingTools(failedTool) {
    const remaining = this.pendingTools.filter(
      t => t !== failedTool && t.status === "pending"
    );

    for (const tool of remaining) {
      tool.status = "cancelled";
      tool.error = "Sibling tool failed";
    }
  }

  /**
   * Check if a tool is concurrency safe based on metadata
   */
  isConcurrencySafe(toolName) {
    const metadata = getToolMetadata(toolName);
    return metadata?.isConcurrencySafe ?? false;
  }

  /**
   * Get all pending tools
   */
  getPendingTools() {
    return this.pendingTools.filter(t => t.status === "pending");
  }

  /**
   * Get all completed tools
   */
  getCompletedTools() {
    return this.pendingTools.filter(t => t.status === "completed");
  }

  /**
   * Get all failed tools
   */
  getFailedTools() {
    return this.pendingTools.filter(t => t.status === "failed");
  }

  /**
   * Check if execution should stop
   */
  isStopped() {
    return this.shouldStop;
  }

  /**
   * Reset the executor for reuse
   */
  reset() {
    this.pendingTools = [];
    this.isExecuting = false;
    this.shouldStop = false;
    this.contextModifierBuffer.clear();
  }
}

/**
 * Generate a unique session ID
 */
function generateSessionId() {
  return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Create a QueryEngine instance with standard configuration
 */
function createQueryEngine(options = {}) {
  return new QueryEngine(options);
}

/**
 * Create a StreamingToolExecutor instance with standard configuration
 */
function createStreamingToolExecutor(options = {}) {
  return new StreamingToolExecutor(options);
}

module.exports = {
  QueryEngine,
  StreamingToolExecutor,
  State,
  TransitionReason,
  CONTEXT_BUFFERS,
  CIRCUIT_BREAKER,
  createQueryEngine,
  createStreamingToolExecutor,
  generateSessionId
};
