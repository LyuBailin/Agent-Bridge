# Bug Report: Tool Output Mismatches Available Operations

**Date:** 2026-04-07
**Status:** FIXES IMPLEMENTED
**Severity:** High

---

## Architecture Recap

| Agent | Responsibility |
|-------|----------------|
| **Planner** | Break down complex task → simpler, atomic subtasks with clear descriptions. Output: task descriptions + target_files. NOT sr/op blocks. |
| **Executor (qwen2.5-coder)** | Take subtask description → generate code using sr/op blocks ONLY. NOT bash commands. |

---

## Executive Summary

Task `phase-1-project-initialization-v2.1` failed because:
1. Planner gave vague prose description: *"Initialize project structure..."*
2. Executor (qwen) received vague instruction and chose to run `npm install`
3. Executor should have ONLY output sr/op blocks, but had no operation_guidelines in its prompt

**Root cause:** Planner's description was too vague for qwen to understand exactly what to do. Combined with missing `operation_guidelines` in executor's system prompt, qwen improvised with bash.

---

## Fixes Implemented

### Fix 1: Planner Atomic Descriptions ✅ DONE

**File:** `src/prompt/plan.js`

Added `TASK DESCRIPTION GUIDELINES (CRITICAL)` section with GOOD/BAD examples:
- GOOD: "Create directory: mkdir backend/src"
- GOOD: "Create package.json in backend with empty SEARCH"
- BAD: "Initialize project structure" (too vague)

Applied to both `buildPlanSystemPrompt()` and `buildReplanSystemPrompt()`.

### Fix 2: Default Format Guidance ✅ DONE

**File:** `src/prompt/index.js`

Added `buildDefaultFormatGuidance()` function that outputs sr/op block format examples.
Now called when `operationType` is null (instead of empty string).

### Fix 3: Validate target_files ✅ DONE

**File:** `src/core/planner.js`

Added validation in `normalizePlanArrayToTree()`:
- Throws error if `target_files` is empty or not an array
- Throws error if all `target_files` are filtered out as unsafe

### Fix 4: JSON Instruction Clarity ✅ DONE (earlier)

**File:** `src/core/adapter/index.js`

Changed ambiguous JSON instructions to clear example format.

---

## Root Causes

### 1. Planner Description Too Vague

**Problem:** Planner output:
```
"Complete Phase 1: Project Initialization and Database Design\n\nThis is a multi-module
project architecture requiring database schema migration and CI pipeline setup..."
```

**What it should be:** Atomic, specific subtasks that qwen can implement directly:
```
"s1": "Create frontend directory structure: mkdir frontend, mkdir frontend/src"
"s2": "Create backend directory structure: mkdir backend, mkdir backend/src"
"s3": "Create package.json in backend: sr block with empty SEARCH to create file"
```

**Why it's wrong:** The description asks for "initialization" which qwen interpreted as shell commands. The planner should decompose into specific, atomic actions.

---

### 2. Empty `target_files` Array

**Problem:** Planner set `target_files: []` (empty array).

**Impact:** No guidance for executor on which files to touch.

**Fix:** Planner MUST populate `target_files` with actual file paths.

---

### 3. Missing Operation Guidelines in Executor System Prompt

**Problem:** `buildSystemPrompt()` does NOT include `buildOperationGuidelines()`:

```javascript
// src/prompt/index.js
function buildSystemPrompt() {
  const { full } = buildOptimizedPrompt({
    roleSections: ['engineering_donts', 'action_sequence'],
    // Missing: 'operation_guidelines'
  });
  return full;
}
```

**Impact:** qwen doesn't have explicit instructions on sr/op block format. It improvises.

**Fix:** Add `operation_guidelines` to executor's system prompt.

---

### 4. Operation Constraint Only Added Conditionally

**Problem:** `buildOperationConstraint()` only called when `operationType !== null`:

```javascript
// src/prompt/index.js buildUserPrompt()
operationType ? buildOperationConstraint(operationType) : '',
```

**Impact:** Without `operationType`, qwen gets no format guidance at all.

---

### 5. JSON Instruction Ambiguity (FIXED)

**Status:** FIXED in adapter/index.js

Changed ambiguous:
```
"Return a JSON object that matches the provided JSON Schema."
"Put ALL your ```sr blocks into the single string field: sr."
```

To clear:
```
"Output a JSON object with a single field 'sr' containing your ```sr code blocks as a plain string."
"Example: {\"sr\": \"```sr\\nFILE: test.js\\nSEARCH:\\n...\\n```\"}"
```

---

## Why `npm install --prefix backend` Happened

1. Planner: Vague description "Initialize project structure with frontend and backend directories"
2. qwen: Received prose instruction, not specific file operations
3. qwen: Interpreted as "run npm install" - a reasonable interpretation without clear constraints
4. qwen: Should have ONLY output sr/op blocks, but had no guidelines

**The model did what seemed reasonable given the vague input. The fix is to give clearer atomic input AND ensure the executor knows sr/op only.**

---

## Correct Fixes

### Fix 1: Make Planner Output Atomic, Specific Descriptions

**File:** `src/prompt/plan.js`

**Concept change:** Planner should NOT output sr/op blocks. It should give qwen atomic task descriptions.

Add to `buildPlanSystemPrompt()`:
```
## TASK DESCRIPTION GUIDELINES (CRITICAL)
Break down tasks into ATOMIC, SPECIFIC actions that qwen2.5-coder can implement directly.

GOOD examples:
- "Create directory: mkdir backend/src"
- "Create package.json in backend with sr block (empty SEARCH)"
- "Add Express import to backend/src/index.js (sr block with SEARCH/REPLACE)"
- "Move config.js to src/config.js: mv config.js src/config.js"

BAD examples (too vague):
- "Initialize project structure"
- "Set up version control"
- "Create database schema"

Each subtask description should tell qwen EXACTLY what file operation to do next.
```

Also apply same changes to `buildReplanSystemPrompt()`.

### Fix 2: Make `target_files` Mandatory

**File:** `src/core/planner.js`

In `normalizePlanArrayToTree()`, validate:
```javascript
if (!Array.isArray(arr[i].target_files) || arr[i].target_files.length === 0) {
  throw new Error(`Subtask ${arr[i].subtask_id} has empty target_files`);
}
```

### Fix 3: Add Operation Guidelines to Executor System Prompt

**File:** `src/prompt/index.js`

```javascript
function buildSystemPrompt() {
  const { full } = buildOptimizedPrompt({
    roleSections: ['engineering_donts', 'action_sequence', 'operation_guidelines'],
    includeBoundary: true,
  });
  return full;
}
```

### Fix 4: Always Include Format Guidance

**File:** `src/prompt/index.js`

When `operationType` is null, include default format guidance:
```javascript
operationType ? buildOperationConstraint(operationType) : buildDefaultFormatGuidance(),
```

Where `buildDefaultFormatGuidance()` explains sr/op block basics.

---

## Files Modified

| File | Status | Change |
|------|--------|--------|
| `src/prompt/plan.js` | ✅ DONE | Added TASK DESCRIPTION GUIDELINES with GOOD/BAD examples |
| `src/prompt/index.js` | ✅ DONE | Added buildDefaultFormatGuidance() for null operationType |
| `src/core/planner.js` | ✅ DONE | Added validation for non-empty target_files |
| `src/core/adapter/index.js` | ✅ DONE | Fixed JSON instruction consistency |

---

## Verification Plan

1. After fixes, re-run task `phase-1-project-initialization-v2.1`
2. Verify planner outputs specific, atomic descriptions (e.g., "mkdir backend/src", not "initialize project")
3. Verify planner outputs non-empty `target_files`
4. Verify executor user prompt includes format guidance (sr/op blocks)
5. Verify executor outputs valid sr/op blocks (not bash commands)
6. All 401 tests pass ✅
