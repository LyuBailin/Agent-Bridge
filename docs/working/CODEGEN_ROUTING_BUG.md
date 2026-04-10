# Additional Bug Report: Code Generation Routing

**Date:** 2026-04-07
**Status:** FIXED (Bug 2)
**Severity:** Critical

---

## Bug 1: Wrong Provider Used for Code Generation

**Status:** NOT A BUG - Architecture is correct

The routing logic `phase3Enabled && subtaskDifficulty === "high" ? "claude_cli" : providerType` is **correct**.

| Agent | Provider | When |
|-------|----------|------|
| Planner | claude_cli | Always |
| Generator | claude_cli | High difficulty |
| Generator | ollama/openai | Low/Medium difficulty |
| Verifier | claude_cli | Medium/High difficulty |

---

## Bug 2: JSON Constraint Ignores operationType

**Status:** FIXED ✅

**Location:** `src/core/adapter/index.js`

**Problem:** The `generateCode` for claude_cli always asked for `sr` blocks regardless of `operationType`.

**Evidence from log (before fix):**
```
OPERATION TYPE: FILE OPERATIONS ONLY
YOU MUST OUTPUT ONLY ```op BLOCKS.
```

But JSON instruction said:
```
Output a JSON object with a single field 'sr' containing your ```sr code blocks
```

**Fix Applied:**

1. Added `buildJsonSchemaForOp()` in `claude_cli.js`:
```javascript
function buildJsonSchemaForOp() {
  return JSON.stringify({
    type: "object",
    additionalProperties: false,
    required: ["op"],
    properties: { op: { type: "string" } }
  });
}
```

2. Updated `generateCode` in `adapter/index.js` to check `operationType`:
```javascript
const operationType = prompt?.operationType;
const isFileOpsOnly = operationType === 'fileops-only';

const schema = isFileOpsOnly ? buildJsonSchemaForOp() : buildJsonSchemaForSr();
const jsonInstruction = isFileOpsOnly
  ? "Output a JSON object with a single field 'op' containing your ```op code blocks..."
  : "Output a JSON object with a single field 'sr' containing your ```sr code blocks...";
```

3. Updated response parsing to handle both `sr` and `op` fields.

---

## Summary

| # | File | Issue | Status |
|---|------|-------|--------|
| 1 | workflow.js:374 | Routing to claude_cli for high difficulty | NOT A BUG - Correct |
| 2 | adapter/index.js | generateCode ignored operationType | FIXED ✅ |
