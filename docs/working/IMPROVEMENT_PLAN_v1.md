# Agent Bridge Improvement Plan

> Created: 2026-04-05
> Status: Planning

## Context

Systematic analysis of `bridge.log` and task execution results reveals consistent failure patterns.
Root cause: **free-text generation with manual parsing** instead of structured function calling.

---

## Priority 1: Fix Existing Bugs

### P1.1 Fix `subtaskDifficulty is not defined` Bug

**Location:** `bridge/main.js:460` (approximately)

**Problem:** Variable `subtaskDifficulty` is used before being assigned in the semantic verify feedback path.

**Fix:** Ensure `subtaskDifficulty` is always defined before line 460.

---

### P1.2 Improve Path Validation Error Messages

**Location:** `bridge/fs_tools.js:8-27`

**Problem:** Model sometimes outputs `.` or `.git` as paths. Path validation rejects these but the error message doesn't help the model correct itself.

**Fix:** Add pre-validation step that maps common patterns (`.` → workspace root) before rejection.

---

## Priority 2: Implement Function Calling

### P2.1 Add Ollama Function Calling Support ✅ DONE

**Why:** Current text-parsing approach is brittle. Function calling provides structured output guaranteed by the API.

**Implementation (completed):**

1. Modified `bridge/adapter.js` to use Ollama's `/api/chat` endpoint with function calling
2. Defined tools schema (`TOOLS_SCHEMA`):
   ```javascript
   const tools = [
     {
       type: "function",
       function: {
         name: "search_replace",
         description: "Edit a file using search/replace",
         parameters: {
           type: "object",
           properties: {
             file: { type: "string" },
             search: { type: "string" },
             replace: { type: "string" }
           }
         }
       }
     },
     {
       type: "function",
       function: {
         name: "mkdir",
         description: "Create a directory",
         parameters: {
           type: "object",
           properties: { path: { type: "string" } }
         }
       }
     },
     // ... mv, rm
   ];
   ```
3. Added `parseToolCalls()` to convert tool call responses to internal change format
4. Added `supportsFunctionCalling()` helper
5. Updated `createProvider()` to accept `useFunctionCalling` option
6. Updated `main.js` to handle both text and tool call responses
7. Fallback: if no tool calls returned, falls back to text parsing

**Files modified:**
- `bridge/adapter.js` - Core function calling implementation
- `bridge/main.js` - Integration with generate/parse flow
- `config.json` - Added `useFunctionCalling: true` option

---

### P2.2 Add Claude Code Function Calling - NOT NEEDED

**Location:** `bridge/adapter.js:412` (`callClaudeCliJson`)

**Status:** Per user request, Claude Code function calling is not needed.

---

## Priority 3: Strengthen Validation

> **Note (2026-04-05):** With function calling (P2.1) now implemented, P3 focus shifts from text-parsing improvements to **validating function call outputs**. Function calling guarantees structure but not content validity — P3 ensures the outputs are safe and semantically correct.

### P3.1 Validate Function Call Arguments

**Problem:** Function calling guarantees structure but not content validity. Malformed arguments can still cause failures.

**Fix:** After `parseToolCalls()`, validate:
- All FILE paths pass `assertSafeRelPath()`
- REPLACE content is non-empty (for search_replace calls)
- Required arguments are present

### P3.2 Add Pre-Flight Validation Before Patch Application

**Location:** Before `safeApplyPatch()` is called

**Problem:** Even with valid function call outputs, semantic errors (e.g., SEARCH pattern doesn't exist, duplicate operations on same file) can cause failures.

**Fix:** Add pre-flight validation layer:
- Verify SEARCH patterns exist in target files
- Check for duplicate operations on same file
- Validate directory operations (mkdir target exists as directory or can be created)

### P3.3 Improve Error Feedback Format

**Location:** `bridge/snippet_feedback.js`

**Problem:** Current feedback for failures is complex and inconsistent between text-parsing and function calling paths.

**Fix:** Simplify feedback format for consistency:
```
FILE: {path}
ERROR: {error description}
HINT: {helpful context or suggestion}
```

---

## Priority 4: Reduce Retry Dependency

### P4.1 Add Self-Correction Loop

**Problem:** System relies on 3 retries per subtask, but if the MODEL keeps making the same mistake, retries don't help.

**Fix:** After parse failure, add a "correction" pass:
1. Feed parse error back to model with current file snippets
2. Ask model to output corrected blocks
3. Only count as retry if correction also fails

---

### P4.2 Limit Replans More Gracefully

**Location:** `bridge/main.js:776-779`

**Problem:** `Exceeded max replans` is abrupt. Dependent subtasks remain pending.

**Fix:** When max replans reached:
1. Check if any subtasks are independent (no failed dependencies)
2. If yes, mark failed subtask as "blocked" and continue with independent ones
3. Report partial success

---

## Priority 5: Context & Prompt Improvements

### P5.1 Add Examples to Prompts

**Location:** `bridge/prompt/output_discipline.js`

**Problem:** Model sometimes outputs wrong block format.

**Fix:** Add 2-3 concrete examples of correct `sr` and `op` blocks in the system prompt.

---

### P5.2 Optimize Context Collection

**Location:** `bridge/fs_tools.js:95` (`collectContext`)

**Problem:** For simple tasks (e.g., create .gitignore), full project context is wasteful.

**Fix:** Add a `minContext` option:
- `minContext: true` - only include likely target files
- `minContext: false` - full project tree (current behavior)

---

## Task Checklist

- [x] P1.1: Fix `subtaskDifficulty is not defined` bug (fixed: variable properly defined at main.js:455 before use)
- [x] P1.2: Improve path validation error messages (added pre-validation for `.` and `.git` with helpful guidance)
- [x] P2.1: Add Ollama function calling support (added TOOLS_SCHEMA, parseToolCalls, updated callOpenAI/callOllama for function calling)
- [ ] P2.2: Add Claude Code native tool support (if available)
- [x] P3.1: Validate function call arguments (added non-empty REPLACE check in parseToolCalls)
- [x] P3.2: Add pre-flight validation before patch application (added validateChangeSet function)
- [x] P3.3: Simplify error feedback format (updated formatSearchGot0Feedback)
- [x] P4.1: Add self-correction loop after parse failures (implemented, disabled by default — enable via `config.selfCorrection.enabled: true`)
- [x] P4.2: Handle max replans more gracefully (marks failed subtask as skipped to unblock dependents, continues with independent subtasks)
- [x] P5.1: Add concrete examples to prompts
- [x] P5.2: Optimize context collection with minContext option

---

## Notes

- P1 (Bug fixes) - COMPLETED: both P1.1 and P1.2 are done
- P2 (Function Calling) - COMPLETED: P2.1 (Ollama/OpenAI function calling) done, P2.2 (Claude Code) not needed
- P3 (Validation) - COMPLETED: P3.1 (REPLACE validation), P3.2 (validateChangeSet for duplicates/conflicts), P3.3 (simplified error format) all done
- P4 (Reduce Retry) - COMPLETED: P4.1 (self-correction loop, disabled by default) and P4.2 (graceful max replans handling) both done
- P5 (Context/Prompts) - COMPLETED: P5.1 (examples in output_discipline.js) and P5.2 (minContext option in collectContext) both done
- Text-parsing fallback is kept as emergency fallback when function calling fails or returns unexpected format
- Consider adding integration tests that simulate parse failures to verify retry/correction logic
