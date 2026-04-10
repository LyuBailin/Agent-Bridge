# Query Loop & State Machine Plan

> Created: 2026-04-07
> Status: Implementation Complete
> Related: TOOL_GOVERNANCE_PLAN.md (tool-level governance, complete)
> Focus: Query Loop / "Heart" of the AI Agent

**Last Updated:** 2026-04-07
**Implementation Status:** All modules implemented in `src/core/query_loop.js`

---

## Context

The Query Loop is the **state machine** that governs execution, recovery, and consistency of agentic sessions. It is not a simple API wrapper but a complex orchestrator handling:

- Long-running, non-linear conversation flows
- Tool call streaming and orchestration
- Error recovery and retry logic
- Interrupt handling and synthetic result generation
- Context management and compression

**Relationship with TOOL_GOVERNANCE_PLAN.md:**
- This plan: **orchestration layer** (how the loop sequences operations)
- Tool Governance: **tool layer** (how individual tools are governed)
- Both run in parallel and intersect at tool execution points

---

## Module 1: State Machine & Transition Logic

### Goal
Replace any recursive structures with a robust `while(true)` state machine that handles the non-linear nature of agentic sessions.

### 1.1 Core State Machine Structure

```javascript
// src/core/query_loop.js (NEW)

const StateMachine = {
  // States
  IDLE: 'idle',
  GENERATING: 'generating',
  TOOL_EXECUTION: 'tool_execution',
  COMPACTING: 'compacting',
  RECOVERING: 'recovering',
  STOPPED: 'stopped',

  // Transition reasons (9+ granular points)
  TRANSITIONS: {
    next_turn: 'next_turn',              // Continue to next model turn
    reactive_compact: 'reactive_compact', // Context triggered compaction
    max_output_tokens_recovery: 'max_output_tokens_recovery',
    tool_call_received: 'tool_call_received',
    tool_result_ready: 'tool_result_ready',
    compact_complete: 'compact_complete',
    error_recovery: 'error_recovery',
    stop_hook_interruption: 'stop_hook_interruption',
    budget_exceeded: 'budget_exceeded',
  }
};

class QueryEngine {
  constructor() {
    this.state = StateMachine.IDLE;
    this.transcript = [];
    this.turnCount = 0;
    this.budget = { tokensUsed: 0, maxTokens: 128000 };
    this.toolContexts = new Map();
    this.hasAttemptedReactiveCompact = false;
    this.consecutiveFailures = 0;
    this.maxConsecutiveFailures = 3;
  }

  async run(initialMessages) {
    this.transcript = initialMessages;
    this.state = StateMachine.GENERATING;

    while (this.state !== StateMachine.STOPPED) {
      const reason = this.determineTransitionReason();
      await this.transition(reason);
    }
  }

  determineTransitionReason() {
    // Return specific reason for this iteration
  }

  async transition(reason) {
    switch (this.state) {
      case StateMachine.GENERATING:
        return this.handleGeneratingTransition(reason);
      case StateMachine.TOOL_EXECUTION:
        return this.handleToolExecutionTransition(reason);
      case StateMachine.COMPACTING:
        return this.handleCompactingTransition(reason);
      case StateMachine.RECOVERING:
        return this.handleRecoveringTransition(reason);
    }
  }
}
```

### 1.2 Session Data Persistence
- `transcript` - Full conversation history
- `toolContexts` - Map of `tool_use_id` → cached context
- `turnCount` - Iteration counter for budget tracking
- `budget` - Token tracking with reserved buffers

### Files to Modify
- `src/core/query_loop.js` - NEW: Core state machine
- `src/core/main_index.js` - Wire QueryEngine into orchestration

---

## Module 2: Input Governance (Pre-Call Pipeline)

### Goal
"Clean the scene" before the model sees input via a tiered compression pipeline.

### 2.1 Tiered Compression Pipeline (in order)

```javascript
// Execute BEFORE every API call
async function preCallPipeline(transcript, toolContexts) {
  // Step 1: History Snip
  // Trim oldest messages if transcript exceeds threshold

  // Step 2: Micro Compact
  // Edit caches based on specific tool_use_id (targeted cache invalidation)

  // Step 3: Context Collapse
  // Summarize inactive regions (messages not relevant to current task)

  // Step 4: Auto Compact
  // Only trigger full summarization if token count STILL exceeds buffer
  // Should rarely trigger if Steps 1-3 work correctly
}
```

### 2.2 Safety Buffers

```javascript
const CONTEXT_BUFFERS = {
  // Reserve tokens for model's summary output
  summaryOutputReserve: 20000,

  // Prevent immediate overflow after compact
  overflowPrevention: 13000,

  // Target max context before API call
  get maxInputTokens() {
    return this.modelContextWindow - this.summaryOutputReserve - this.overflowPrevention;
  }
};
```

### Files to Modify
- `src/core/query_loop.js` - Add `preCallPipeline()` method
- `src/core/adapter/parser.js` - Integrate compression triggers

---

## Module 3: Streaming Execution & Tool Orchestration

### Goal
Move away from "wait-and-call" patterns. Execute tools as soon as `tool_use` blocks are parsed.

### 3.1 StreamingToolExecutor

```javascript
class StreamingToolExecutor {
  constructor(toolHooks, riskClassifier) {
    this.toolHooks = toolHooks;
    this.riskClassifier = riskClassifier;
    this.pendingTools = [];
    this.contextModifierBuffer = [];
  }

  // Called when tool_use block is parsed from stream
  async onToolUseBlock(toolUse) {
    // Start risk assessment immediately (parallel with permission check)
    const riskTask = this.riskClassifier.classify(toolUse.function.name, toolUse.function.arguments);

    // Buffer the tool for potential parallel execution
    this.pendingTools.push({
      toolUse,
      riskAssessment: await riskTask,
      startTime: Date.now()
    });

    // If not parallel-safe, wait for previous tools to complete first
    if (!this.isConcurrencySafe(toolUse.function.name)) {
      await this.drainPendingUntil(toolUse.function.name);
    }
  }

  isConcurrencySafe(toolName) {
    // Check metadata from TOOLS_SCHEMA
    return this.getToolMetadata(toolName)?.isConcurrencySafe ?? false;
  }
}
```

### 3.2 Causal Replay for Parallelism

```javascript
// When tools run in parallel, buffer context modifiers
// Replay them in ORIGINAL order from assistant message

async function replayContextModifiers() {
  this.contextModifierBuffer
    .sort((a, b) => a.originalIndex - b.originalIndex)
    .forEach(entry => this.applyContextModifier(entry.modifier));
}
```

### 3.3 Sibling Failure Handling

```javascript
async function handleSiblingFailure(failedTool, batch) {
  // If one tool fails critically, cancel remaining in batch
  if (failedTool.critical) {
    // Generate synthetic results for remaining tools
    const remaining = batch.filter(t => t !== failedTool);
    return yieldMissingToolResultBlocks(remaining, 'Sibling tool failed');
  }
  // Otherwise, continue with remaining tools
}
```

### Files to Modify
- `src/core/query_loop.js` - Add `StreamingToolExecutor` class
- `src/core/workflow.js` - Integrate streaming tool execution
- `src/core/adapter/hooks.js` - Hook into tool execution lifecycle

---

## Module 4: Recovery Architecture

### Goal
Treat errors as standard execution paths. Recovery continues work, not apologizing.

### 4.1 Layered Error Recovery

```javascript
async function handleError(error, state) {
  this.consecutiveFailures++;

  switch (error.code) {
    case 'prompt_too_long':
      // Layer 1: Try draining staged collapse first
      if (this.hasStagedCollapse()) {
        await this.drainStagedCollapse();
        return { reason: 'drained_staged_collapse', retry: true };
      }
      // Layer 2: Heavy reactive compact
      if (!this.hasAttemptedReactiveCompact) {
        this.hasAttemptedReactiveCompact = true;
        await this.reactiveCompact();
        return { reason: 'reactive_compact', retry: true };
      }
      // Layer 3: Give up
      return { reason: 'compact_failed', retry: false };

    case 'rate_limit':
      await this.backoff(error.retryAfter);
      return { reason: 'backoff_complete', retry: true };

    default:
      if (this.consecutiveFailures >= this.maxConsecutiveFailures) {
        return { reason: 'circuit_broken', retry: false };
      }
      return { reason: 'retry_attempt', retry: true };
  }
}
```

### 4.2 Resume-First Policy for max_output_tokens

```javascript
// Instead of summarizing when model hits max_output_tokens:
// Inject meta-message to resume exactly where left off

function buildResumeMessage(lastCompletion) {
  return {
    role: 'user',
    content: `<resume>Continue from where you left off. Do not summarize or repeat what was said. Resume your response exactly where it was cut off, even if in the middle of a sentence or word.</resume>`
  };
}
```

### 4.3 Circuit Breaker Pattern

```javascript
const CIRCUIT_BREAKER = {
  maxConsecutiveFailures: 3,
  hasAttemptedReactiveCompact: false,  // Reset each turn
  maxConsecutiveCompactAttempts: 1     // Only try heavy recovery once per turn
};
```

### Files to Modify
- `src/core/query_loop.js` - Add recovery methods
- `src/core/adapter/parser.js` - Detect and handle max_output_tokens

---

## Module 5: Consistency & Interrupt Handling

### Goal
The ledger of actions is always balanced, even on forceful stop.

### 5.1 Synthetic Tool Results on Interrupt

```javascript
// src/core/synthetic_results.js (from TOOL_GOVERNANCE_PLAN)
// Used here for interrupt handling

function yieldMissingToolResultBlocks(interruptedTools, reason) {
  return interruptedTools.map(toolUse => ({
    function: toolUse.function,
    result: {
      success: false,
      error: reason,  // "User interrupted" or "Sibling tool failed"
      synthetic: true
    }
  }));
}
```

### 5.2 Narrative Consistency Markers

```javascript
// Add transition markers to transcript for audit/debug

function addCompactBoundary(transcript, reason, summary) {
  transcript.push({
    role: 'system',
    content: `<compact_boundary reason="${reason}">${summary}</compact_boundary>`
  });
}

function addTransitionMarker(transcript, reason) {
  transcript.push({
    role: 'system',
    content: `<transition reason="${reason}" turn="${this.turnCount}" />`
  });
}
```

### 5.3 Interrupt Handler

```javascript
// Called when user/stop_hook interrupts streaming
async function handleInterrupt(interruptedTools) {
  // Generate synthetic results for tools already sent
  const syntheticResults = yieldMissingToolResultBlocks(
    interruptedTools,
    'User interrupted'
  );

  // Add to transcript so model sees consistent state
  for (const result of syntheticResults) {
    this.transcript.push({
      role: 'tool',
      tool_use_id: result.function.name,
      content: JSON.stringify(result.result)
    });
  }

  // Mark transition for audit
  addTransitionMarker(this.transcript, 'stop_hook_interruption');
}
```

### Files to Modify
- `src/core/query_loop.js` - Add interrupt handling
- `src/core/synthetic_results.js` - Reference from TOOL_GOVERNANCE_PLAN
- `src/core/workflow.js` - Wire interrupt signals

---

## Intersection Points with TOOL_GOVERNANCE_PLAN

| This Plan (Query Loop) | Tool Governance Plan |
|------------------------|----------------------|
| Module 3: StreamingToolExecutor | Module 1: Tool metadata (isConcurrencySafe) |
| Module 3: Sibling failure | Module 5: Synthetic results |
| Module 5: Interrupt handling | Module 5: Synthetic results |
| Module 3: Hook integration | Module 2: Hook system |

**Shared files:**
- `src/core/synthetic_results.js` - Defined in Tool Governance, used here
- `src/core/adapter/hooks.js` - Defined in Tool Governance, called here
- `src/core/risk_classifier.js` - Defined in Tool Governance, called here

---

## Implementation Order

| Phase | Module | Priority | Dependencies | Status |
|-------|--------|----------|--------------|--------|
| 1 | Module 1: State Machine | High | None | ✅ Implemented |
| 2 | Module 2: Pre-Call Pipeline | High | Phase 1 | ✅ Implemented |
| 3 | Module 3: Streaming Executor | High | Phase 1, Tool Gov Module 1 | ✅ Implemented |
| 4 | Module 4: Recovery Architecture | Medium | Phase 1 | ✅ Implemented |
| 5 | Module 5: Interrupt Handling | Medium | Phase 3, Tool Gov Module 5 | ✅ Implemented |

### Files Created/Modified

| Module | File | Status |
|--------|------|--------|
| 1 | `src/core/query_loop.js` | ✅ New - State machine implementation |
| 2 | `src/core/query_loop.js` | ✅ `preCallPipeline()` method |
| 3 | `src/core/query_loop.js` | ✅ `StreamingToolExecutor` class |
| 4 | `src/core/query_loop.js` | ✅ `handleError()`, circuit breaker |
| 5 | `src/core/query_loop.js` | ✅ `handleInterrupt()`, `yieldMissingToolResultBlocks` integration |

---

## Risk Assessment

| Change | Risk | Mitigation |
|--------|------|------------|
| State machine replacing recursion | Medium | Extensive testing with long conversations |
| Pre-call compression pipeline | Low | Configurable thresholds, logging |
| Streaming tool execution | Medium | Feature flag, graceful degradation |
| Recovery architecture | Low | Circuit breaker prevents infinite loops |
| Interrupt handling | Medium | Synthetic results tested thoroughly |

---

## Testing Checklist

- [x] State machine transitions correctly through all states
- [x] Pre-call pipeline respects safety buffers
- [x] StreamingToolExecutor starts execution on tool_use parse
- [x] Context modifiers replay in original order
- [x] Sibling failure cancels remaining batch
- [x] max_output_tokens triggers resume-first, not summary
- [x] prompt_too_long tries staged collapse before reactive compact
- [x] Circuit breaker activates after 3 consecutive failures
- [x] Interrupt generates synthetic results for pending tools
- [x] Compact boundaries recorded in transcript
- [ ] Integration test with long-running session (>50 turns)
