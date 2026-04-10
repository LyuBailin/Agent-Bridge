const test = require("node:test");
const assert = require("node:assert/strict");

const {
  QueryEngine,
  StreamingToolExecutor,
  State,
  TransitionReason,
  CONTEXT_BUFFERS,
  CIRCUIT_BREAKER,
  createQueryEngine,
  createStreamingToolExecutor,
  generateSessionId,
} = require("../../../src/core/query_loop");

// --- State ---

test("State: has expected states", () => {
  assert.equal(State.IDLE, "idle");
  assert.equal(State.GENERATING, "generating");
  assert.equal(State.TOOL_EXECUTION, "tool_execution");
  assert.equal(State.COMPACTING, "compacting");
  assert.equal(State.RECOVERING, "recovering");
  assert.equal(State.STOPPED, "stopped");
});

// --- TransitionReason ---

test("TransitionReason: has expected reasons", () => {
  assert.equal(TransitionReason.NEXT_TURN, "next_turn");
  assert.equal(TransitionReason.REACTIVE_COMPACT, "reactive_compact");
  assert.equal(TransitionReason.MAX_OUTPUT_TOKENS_RECOVERY, "max_output_tokens_recovery");
  assert.equal(TransitionReason.ERROR_RECOVERY, "error_recovery");
  assert.equal(TransitionReason.CIRCUIT_BROKEN, "circuit_broken");
  assert.equal(TransitionReason.STOP_HOOK_INTERRUPTION, "stop_hook_interruption");
});

// --- CONTEXT_BUFFERS ---

test("CONTEXT_BUFFERS: has expected fields", () => {
  assert.ok(typeof CONTEXT_BUFFERS.summaryOutputReserve === "number");
  assert.ok(typeof CONTEXT_BUFFERS.overflowPrevention === "number");
});

// --- CIRCUIT_BREAKER ---

test("CIRCUIT_BREAKER: has maxConsecutiveFailures and maxConsecutiveCompactAttempts", () => {
  assert.ok(typeof CIRCUIT_BREAKER.maxConsecutiveFailures === "number");
  assert.ok(typeof CIRCUIT_BREAKER.maxConsecutiveCompactAttempts === "number");
  assert.equal(CIRCUIT_BREAKER.maxConsecutiveFailures, 3);
});

// --- generateSessionId ---

test("generateSessionId: returns a string", () => {
  const id = generateSessionId();
  assert.equal(typeof id, "string");
  assert.ok(id.startsWith("session_"));
});

test("generateSessionId: returns unique values", () => {
  const id1 = generateSessionId();
  const id2 = generateSessionId();
  assert.notEqual(id1, id2);
});

// --- createQueryEngine ---

test("createQueryEngine: returns a QueryEngine instance", () => {
  const engine = createQueryEngine();
  assert.ok(engine instanceof QueryEngine);
});

test("createQueryEngine: accepts options", () => {
  const engine = createQueryEngine({ maxTokens: 10000, maxOutputTokens: 500 });
  assert.ok(engine instanceof QueryEngine);
  assert.equal(engine.budget.maxTokens, 10000);
  assert.equal(engine.budget.maxOutputTokens, 500);
});

// --- QueryEngine constructor ---

test("QueryEngine: starts in IDLE state", () => {
  const engine = new QueryEngine();
  assert.equal(engine.state, State.IDLE);
});

test("QueryEngine: transcript starts empty", () => {
  const engine = new QueryEngine();
  assert.deepEqual(engine.transcript, []);
});

test("QueryEngine: turnCount starts at 0", () => {
  const engine = new QueryEngine();
  assert.equal(engine.turnCount, 0);
});

test("QueryEngine: consecutiveFailures starts at 0", () => {
  const engine = new QueryEngine();
  assert.equal(engine.consecutiveFailures, 0);
});

test("QueryEngine: contextModifierBuffer is a Map", () => {
  const engine = new QueryEngine();
  assert.ok(engine.contextModifierBuffer instanceof Map);
});

test("QueryEngine: budget has correct defaults", () => {
  const engine = new QueryEngine();
  assert.equal(engine.budget.tokensUsed, 0);
  assert.equal(engine.budget.maxTokens, 128000);
  assert.equal(engine.budget.outputTokensUsed, 0);
  assert.equal(engine.budget.maxOutputTokens, 4096);
});

// --- QueryEngine.reset ---

test("QueryEngine.reset: restores initial state", () => {
  const engine = new QueryEngine();
  engine.turnCount = 5;
  engine.consecutiveFailures = 2;
  engine.transcript = [{ role: "user", content: "hi" }];
  engine.reset();
  assert.equal(engine.state, State.IDLE);
  assert.equal(engine.turnCount, 0);
  assert.equal(engine.consecutiveFailures, 0);
  assert.deepEqual(engine.transcript, []);
  assert.equal(engine.toolContexts.size, 0);
});

// --- QueryEngine.estimateTokenCount ---

test("QueryEngine.estimateTokenCount: returns rough token estimate", () => {
  const engine = new QueryEngine();
  engine.transcript = [{ role: "user", content: "hello world" }];
  const tokens = engine.estimateTokenCount();
  assert.ok(tokens >= 0);
});

// --- QueryEngine.hasResultForToolUse ---

test("QueryEngine.hasResultForToolUse: false when no transcript", () => {
  const engine = new QueryEngine();
  assert.equal(engine.hasResultForToolUse("tool_1"), false);
});

test("QueryEngine.hasResultForToolUse: true when tool result exists", () => {
  const engine = new QueryEngine();
  engine.transcript = [
    { role: "tool", content: "{}", _meta: { toolUseId: "tool_1" } }
  ];
  assert.equal(engine.hasResultForToolUse("tool_1"), true);
  assert.equal(engine.hasResultForToolUse("tool_99"), false);
});

// --- QueryEngine.buildFinalResult ---

test("QueryEngine.buildFinalResult: returns result object", () => {
  const engine = new QueryEngine();
  engine.turnCount = 3;
  engine.budget.tokensUsed = 1000;
  engine.consecutiveFailures = 1;
  const result = engine.buildFinalResult();
  assert.equal(result.sessionId.startsWith("session_"), true);
  assert.equal(result.turnCount, 3);
  assert.ok(Array.isArray(result.transcript));
  assert.equal(result.consecutiveFailures, 1);
  assert.ok(typeof result.budget === "object");
  assert.ok(typeof result.durationMs === "number");
});

// --- QueryEngine.recordToolUseBlocks ---

test("QueryEngine.recordToolUseBlocks: records blocks in contextModifierBuffer", () => {
  const engine = new QueryEngine();
  engine.recordToolUseBlocks([
    { id: "tool_1", function: { name: "search_replace" }, _index: 0 }
  ]);
  assert.equal(engine.contextModifierBuffer.has("tool_1"), true);
  const entry = engine.contextModifierBuffer.get("tool_1");
  assert.equal(entry.originalIndex, 0);
  assert.equal(entry.modifier.type, "cache_update");
});

// --- QueryEngine.markToolsInterrupted ---

test("QueryEngine.markToolsInterrupted: stores interrupted tools", () => {
  const engine = new QueryEngine();
  engine.markToolsInterrupted([{ id: "tool_1" }]);
  assert.equal(engine.interruptedTools.length, 1);
});

// --- QueryEngine.injectResumeMessage ---

test("QueryEngine.injectResumeMessage: adds resume message to transcript", () => {
  const engine = new QueryEngine();
  engine.turnCount = 2;
  engine.injectResumeMessage();
  assert.equal(engine.transcript.length, 1);
  assert.equal(engine.transcript[0].role, "user");
  assert.ok(engine.transcript[0].content.includes("resume"));
  assert.ok(engine.transcript[0]._meta.type, "resume_first");
});

// --- StreamingToolExecutor ---

test("createStreamingToolExecutor: returns StreamingToolExecutor instance", () => {
  const executor = createStreamingToolExecutor();
  assert.ok(executor instanceof StreamingToolExecutor);
});

test("StreamingToolExecutor: pendingTools starts empty", () => {
  const executor = new StreamingToolExecutor();
  assert.deepEqual(executor.pendingTools, []);
});

test("StreamingToolExecutor: shouldStop starts false", () => {
  const executor = new StreamingToolExecutor();
  assert.equal(executor.shouldStop, false);
});

test("StreamingToolExecutor: getPendingTools returns pending tools", () => {
  const executor = new StreamingToolExecutor();
  assert.ok(Array.isArray(executor.getPendingTools()));
});

test("StreamingToolExecutor: getCompletedTools returns completed tools", () => {
  const executor = new StreamingToolExecutor();
  assert.ok(Array.isArray(executor.getCompletedTools()));
});

test("StreamingToolExecutor: getFailedTools returns failed tools", () => {
  const executor = new StreamingToolExecutor();
  assert.ok(Array.isArray(executor.getFailedTools()));
});

test("StreamingToolExecutor: reset clears state", () => {
  const executor = new StreamingToolExecutor();
  executor.shouldStop = true;
  executor.reset();
  assert.equal(executor.shouldStop, false);
  assert.deepEqual(executor.pendingTools, []);
});

test("StreamingToolExecutor: isStopped returns shouldStop", () => {
  const executor = new StreamingToolExecutor();
  assert.equal(executor.isStopped(), false);
  executor.shouldStop = true;
  assert.equal(executor.isStopped(), true);
});

test("StreamingToolExecutor: isConcurrencySafe delegates to getToolMetadata", () => {
  const executor = new StreamingToolExecutor();
  // search_replace: isConcurrencySafe = false (not safe - edits can conflict)
  assert.equal(executor.isConcurrencySafe("search_replace"), false);
  // mkdir: isConcurrencySafe = true (safe to parallelize)
  assert.equal(executor.isConcurrencySafe("mkdir"), true);
  // rm: isConcurrencySafe = false
  assert.equal(executor.isConcurrencySafe("rm"), false);
});
