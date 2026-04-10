# Tool Governance Improvement Plan

> Created: 2026-04-07
> Status: Implementation Complete
> Based on: 6-Module Tool Governance Framework

**Last Updated:** 2026-04-07
**Test Status:** 35/35 tests passing

---

## Context

The existing IMPROVEMENT_PLAN_v2 already addresses:
- **P1**: Tool calling required (no fallback to text parsing)
- **P2**: Workspace path validation and auto-resolution
- **P3**: Denied operations whitelist (ALLOWED_OPERATIONS / DENIED_OPERATIONS)
- **P4**: Ollama action logging

This plan builds on that foundation with a **6-module governance framework** that transforms tools from simple function calls into **managed execution interfaces** with resilience, governance, and safety built in.

---

## Module 1: Tool Interface & Structural Integrity

### Goal
Design tools using a "fail-closed" philosophy where security is the default state.

### 1.1 Tool Schema Enhancement
**Current:** `TOOLS_SCHEMA` defines basic parameter types
**Proposed:** Add metadata flags to each tool definition:

```javascript
// src/core/adapter/schema.js
const TOOLS_SCHEMA = [
  {
    type: "function",
    function: {
      name: "search_replace",
      description: "Edit file content using search/replace",
      metadata: {
        isReadOnly: false,
        isDestructive: false,
        isConcurrencySafe: false,  // defaults to false (serial)
      },
      parameters: { /* ... */ }
    }
  },
  {
    type: "function",
    function: {
      name: "rm",
      description: "Remove a file",
      metadata: {
        isReadOnly: false,
        isDestructive: true,
        isConcurrencySafe: false,
      },
      parameters: { /* ... */ }
    }
  }
];
```

### 1.2 Tool Factory with Fail-Closed Defaults
**New file:** `src/core/adapter/tool_factory.js`

```javascript
// If metadata is missing, default to strictest settings
const DEFAULT_TOOL_FLAGS = {
  isReadOnly: false,        // assume write operation
  isDestructive: true,      // assume dangerous
  isConcurrencySafe: false, // assume serial to prevent race conditions
};
```

### 1.3 Zod Input Validation (Optional Enhancement)
**Status:** Medium priority
- Current manual validation in `parseToolCalls` works but is ad-hoc
- Zod would provide strict runtime schema validation
- Consider adding if complexity grows

### Files to Modify
- `src/core/adapter/schema.js` - Add metadata flags to TOOLS_SCHEMA
- `src/core/adapter/tool_factory.js` - NEW: Tool factory with fail-closed defaults

---

## Module 2: The Governance Pipeline (Pre/Post Hooks)

### Goal
Never allow a model to "direct-call" a tool. Every request passes through a mandatory governance chain.

### Current State
Validation exists in `validateOperation()` but there's no formal hook system.

### 2.1 Add Pre-Execution Hook Support
**New file:** `src/core/adapter/hooks.js`

```javascript
// Hook types: 'before', 'afterSuccess', 'afterFailure'
const TOOL_HOOKS = {
  search_replace: {
    before: [validateSearchPattern, checkFileWritable],
    afterSuccess: [logEditAction],
    afterFailure: [logFailureReason]
  },
  rm: {
    before: [confirmNotProtected, checkDiskSpace],
    afterSuccess: [logDeleteAction],
    afterFailure: [logFailureReason]
  }
};
```

### 2.2 Add Post-Execution Hook Support
- Success hooks can inject context modifiers into the transcript
- Failure hooks can trigger cleanup or replanning

### 2.3 Telemetry Layer
**Enhancement to existing logging:**
- Add OTel-style tracing (span IDs, parent IDs)
- Log execution duration per tool
- Track hook execution times

### Files to Modify
- `src/core/adapter/hooks.js` - NEW: Hook registration and execution
- `src/core/adapter/parser.js` - Integrate hooks into `parseToolCalls()`
- `src/core/workflow.js` - Call hooks around tool application

---

## Module 3: Risk Intelligence (Speculative Classifiers)

### Goal
Reduce latency for the user without sacrificing safety by using parallel risk prediction.

### 3.1 Speculative Risk Classifier
**New file:** `src/core/risk_classifier.js`

```javascript
// Runs in parallel with permission checks
// Returns risk assessment before user approval needed

const RISK_PATTERNS = {
  rm: [
    { pattern: /^\/$/, risk: "critical", message: "Would delete root directory" },
    { pattern: /\.git\/config$/, risk: "high", message: "Would delete git config" },
  ],
  mv: [
    { pattern: /.*/, risk: "medium", message: "Moving files can break imports" },
  ],
  search_replace: [
    { pattern: /git/, risk: "low" },
    { pattern: /rm\s+-rf/i, risk: "critical" },
  ]
};

function classifyRisk(toolName, args) {
  // Returns { level: "low"|"medium"|"high"|"critical", message: string }
}
```

### 3.2 Parallel Processing with Permission Hooks
- Risk classifier runs immediately when input is parsed
- Permission hooks also start in parallel
- By the time system is ready to ask for approval, risk assessment is ready to display

### Files to Modify
- `src/core/risk_classifier.js` - NEW: Risk classification logic
- `src/core/adapter/parser.js` - Call risk classifier in parallel with validation

---

## Module 4: Concurrency & Causal Consistency

### Goal
Ensure parallel execution does not lead to "logical amnesia" or causal confusion.

### Current State
The system processes subtasks but context modifier ordering is implicit.

### 4.1 Context Modifier Buffer
**Enhancement to `workflow.js`:**

```javascript
// When tools execute in parallel batch:
const contextModifierBuffer = [];

function onToolResult(toolResult, contextModifier) {
  contextModifierBuffer.push({
    toolIndex: currentToolIndex,
    modifier: contextModifier
  });
}

// After all parallel tools complete, replay in original order
function replayContextModifiers() {
  contextModifierBuffer
    .sort((a, b) => a.toolIndex - b.toolIndex)
    .forEach(entry => applyContextModifier(entry.modifier));
}
```

### 4.2 Orderly Replay Guarantee
- Store original tool-use block order when model returns parallel calls
- Replay context modifiers in that exact order
- Prevents causal chain confusion

### Files to Modify
- `src/core/workflow.js` - Add context modifier buffering and orderly replay

---

## Module 5: Lifecycle & Interrupt Recovery

### Goal
The tool system must be responsible for "balancing the ledger" even when things go wrong.

### 5.1 Synthetic Result Generators
**New file:** `src/core/synthetic_results.js`

```javascript
// When user interrupts or sibling tool fails, generate synthetic results
function yieldMissingToolResultBlocks(interruptedToolCalls, reason) {
  return interruptedToolCalls.map(toolCall => ({
    function: toolCall.function,
    result: {
      success: false,
      error: reason,  // "Action cancelled by user" or "Sibling tool failed"
      synthetic: true
    }
  }));
}
```

### 5.2 Streaming Interrupt Handler
- When streaming is interrupted, generate synthetic results for remaining queued tools
- Prevents agent from acting on incomplete state

### 5.3 Sibling Failure Management
```javascript
// In parallel batch execution:
function handleSiblingFailure(failedTool, batch) {
  // Discard entire batch if critical failure
  if (failedTool.critical) {
    throw new Error(`Critical failure in ${failedTool.name}, discarding batch`);
  }
  // Otherwise, continue with remaining tools
}
```

### Files to Modify
- `src/core/synthetic_results.js` - NEW: Synthetic result generation
- `src/core/workflow.js` - Integrate synthetic results and sibling failure handling

---

## Module 6: High-Density Constraints for Bash

### Note
**Bash is already denied** (DENIED_OPERATIONS includes bash, shell, exec, etc.). This module documents the constraints that would apply if Bash were ever considered.

### 6.1 Git Safety Rules
If Bash were enabled for git operations:
```javascript
const BASH_CONSTRAINTS = {
  gitPush: {
    allowed: false,
    override: false,  // Only allow if task explicitly requests git push
    message: "Git push is not permitted. Use git manager for commits."
  },
  gitNoVerify: {
    allowed: false,
    message: "Git hooks cannot be bypassed with --no-verify"
  },
  interactiveFlags: {
    denied: ["-y", "-i", "--interactive", "-Y"],
    message: "Interactive flags are not permitted"
  }
};
```

### 6.2 Semantic Bash Wrapper
If Bash were ever added, wrap via `bashPermissions.ts`:
- Apply safety environment variables (PATH restrictions, HOME=/tmp)
- Subcommand limits (only allow git status, git diff, etc.)
- Prevent pipe chains that could bypass safety checks

### Status
**Not implemented** - Bash remains denied. These rules document what would be needed if the restriction were ever relaxed.

---

## Implementation Order

| Phase | Module | Priority | Dependencies | Status |
|-------|--------|----------|--------------|--------|
| 1 | Module 1: Tool Schema Enhancement | High | None | ✅ Implemented |
| 2 | Module 2: Hook System | Medium | Phase 1 | ✅ Implemented |
| 3 | Module 3: Risk Classifier | High | None | ✅ Implemented |
| 4 | Module 4: Context Buffering | Medium | Phase 2 | ✅ Implemented |
| 5 | Module 5: Synthetic Results | Medium | Phase 3 | ✅ Implemented |
| 6 | Module 6: Bash Constraints Doc | Low | Deferred | 📋 Documented |

### Files Created/Modified

| Module | File | Status |
|--------|------|--------|
| 1 | `src/core/adapter/schema.js` | ✅ Enhanced with metadata flags |
| 1 | `src/core/adapter/tool_factory.js` | ✅ New - fail-closed defaults |
| 2 | `src/core/adapter/hooks.js` | ✅ New - hook registry and execution |
| 2 | `src/core/adapter/parser.js` | ✅ Integrated hooks |
| 3 | `src/core/risk_classifier.js` | ✅ New - speculative classifiers |
| 4 | `src/core/workflow.js` | ✅ Added ContextModifierBuffer class |
| 5 | `src/core/synthetic_results.js` | ✅ New - interrupt recovery |

---

## Risk Assessment

| Change | Risk | Mitigation |
|--------|------|------------|
| Tool metadata flags | Low | Additive, no behavior change |
| Hook system | Medium | Feature flag to disable hooks |
| Risk classifier | Low | Runs in parallel, no blocking |
| Context buffering | Medium | Test thoroughly with parallel tasks |
| Synthetic results | Low | Only triggers on interrupt/failure |

---

## Testing Checklist

- [x] Tool schema with metadata flags parses correctly
- [x] Hooks execute before/after tool calls
- [x] Risk classifier runs in parallel with validation
- [x] Context modifiers replay in correct order (ContextModifierBuffer class implemented)
- [x] Synthetic results generated on interrupt
- [x] Sibling failure discards batch appropriately
- [x] All existing tests still pass (35/35 ✅)
- [ ] Integration test with parallel subtasks (infrastructure ready, parallel execution not yet implemented)
