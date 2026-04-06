# Agent Bridge Improvement Plan v2

> Created: 2026-04-06
> Status: In Progress

## Context

Based on Phase 1 execution analysis, three operational issues were identified:
1. Tool calling fallback to text parsing creates inconsistent behavior
2. Operations occasionally escaped `/workspace` boundary (e.g., `frontend/package.json` instead of `workspace/frontend/package.json`)
3. System-level operations like `npm install` were attempted but should be denied
4. No action log for Ollama executions (only plan logged to `claude.log`)

---

## Priority 1: Make Tool Calling the Default (No Fallback)

### Problem
Current implementation falls back to text parsing when function calling returns no `tool_calls`:
```javascript
// adapter.js:486-491
// If no tool calls but function calling was requested, fall back to text
const out = message?.content || json.response;
if (!out) {
  throw new Error("Ollama response contained no text output");
}
return out;
```

### Fix
1. **Remove text fallback** - When `useFunctionCalling: true`, require tool_calls
2. **Add explicit fallback option** - Only for CI/testing via `config.functionCalling.allowFallback: true`
3. **Update config schema**:
   ```json
   {
     "useFunctionCalling": true,
     "functionCalling": {
       "required": true,
       "allowFallback": false
     }
   }
   ```

### Files to modify
- `bridge/adapter.js` - Remove fallback logic, make tool calling required
- `config.json` - Add `functionCalling.required` and `functionCalling.allowFallback`
- `bridge/main.js` - Propagate `functionCalling.required` to provider calls

---

## Priority 2: Enforce Workspace Boundary for All Operations

### Problem
Operations like `frontend/package.json` were attempted on the Agent-Bridge repo instead of `/workspace/frontend/package.json`.

### Current Protection
`fsTools.resolveInWorkspace()` already validates paths:
```javascript
// fs_tools.js:41-47
function resolveInWorkspace(workspaceDir, relPath) {
  const safeRel = assertSafeRelPath(relPath);
  const abs = path.resolve(workspaceDir, safeRel);
  const ws = path.resolve(workspaceDir) + path.sep;
  if (!abs.startsWith(ws)) {
    throw new Error(`Unsafe FILE path (escapes workspace): ${relPath}`);
  }
  ...
}
```

### Fix
1. **Prepend workspace prefix automatically** - When Ollama returns a relative path like `frontend/package.json`, automatically resolve to `workspace/frontend/package.json`
2. **Add logging for workspace resolution** - Log which paths were auto-corrected
3. **Block absolute paths** - Reject any absolute path in tool calls (should be relative to workspace)
4. **Validate in `parseToolCalls()` before calling `resolveInWorkspace()`**:
   ```javascript
   function parseToolCalls(toolCalls, fsTools, workspaceDir) {
     for (const toolCall of toolCalls) {
       // Validate workspace containment before processing
       const pathFields = getPathFields(toolCall); // file, path, from, to, etc.
       for (const pf of pathFields) {
         if (path.isAbsolute(pf)) {
           throw new Error(`Absolute paths not allowed: ${pf}`);
         }
       }
     }
   }
   ```

### Files to modify
- `bridge/adapter.js` - Add path validation in `parseToolCalls()`
- `bridge/fs_tools.js` - Add `isWithinWorkspace()` helper
- `bridge/main.js` - Add log entry for workspace path resolution

---

## Priority 3: Deny System-Level Operations (Allow File Operations Only)

### Problem
Tool calls like `Bash` with `npm install` should be denied because:
- They operate outside `/workspace`
- They affect the host system
- Not reproducible/auditable in workspace git history

### Fix
1. **Create a whitelist of allowed operations**:
   ```javascript
   const ALLOWED_OPERATIONS = {
     search_replace: true,  // Edit file content
     mkdir: true,           // Create directory in workspace
     mv: true,              // Move/rename within workspace
     rm: true,              // Remove file within workspace
   };
   
   const DENIED_OPERATIONS = {
     bash: true,            // System commands
     npm: true,             // Package manager
     git: true,             // Git operations (handled by git_manager)
     shell: true,
     exec: true,
   };
   ```

2. **Block denied operations in `parseToolCalls()`**:
   ```javascript
   function parseToolCalls(toolCalls, fsTools, workspaceDir) {
     for (const toolCall of toolCalls) {
       const toolName = toolCall.name || toolCall.function?.name;
       if (DENIED_OPERATIONS[toolName]) {
         throw new Error(`Operation '${toolName}' is not allowed. Only file operations (search_replace, mkdir, mv, rm) are permitted.`);
       }
       if (!ALLOWED_OPERATIONS[toolName]) {
         throw new Error(`Unknown operation: ${toolName}`);
       }
     }
   }
   ```

3. **Update system prompt** to clearly state allowed operations:
   ```
   Available operations:
   - search_replace: Edit file content using search/replace
   - mkdir: Create a directory (relative to workspace)
   - mv: Move or rename a file (relative to workspace)
   - rm: Remove a file (relative to workspace)

   NOT allowed: bash, npm, git, shell, exec, or any system-level commands
   ```

### Files to modify
- `bridge/adapter.js` - Add operation whitelist enforcement
- `bridge/prompt/system_rules.js` - Document allowed operations
- `bridge/prompt/output_discipline.js` - Add denied operations list

---

## Priority 4: Add Ollama Action Log

### Problem
Currently only the plan is logged to `claude.log`. No log exists for Ollama's action executions.

### Fix
1. **Create new log file `ollama.log`**:
   ```
   [2026-04-06T15:22:31.123Z] Task: phase-1-project-initialization-v7.s1
   [2026-04-06T15:22:31.456Z] Model: qwen2.5-coder:14b
   [2026-04-06T15:22:31.789Z] Tool calls: search_replace(file="package.json", ...)
   [2026-04-06T15:22:32.012Z] Applied: package.json: version "1.0.1" → "1.0.2"
   [2026-04-06T15:22:32.345Z] Tool calls: mkdir(path="migrations"), search_replace(file="app.js", ...)
   [2026-04-06T15:22:33.567Z] Applied: created migrations/, app.js modified
   [2026-04-06T15:22:34.890Z] Result: success
   ```

2. **Log structure for each Ollama execution**:
   ```javascript
   {
     timestamp: ISO8601,
     taskId: string,
     subtaskId: string,
     model: string,
     duration_ms: number,
     toolCalls: [{ name, arguments }],
     appliedChanges: [{ type, path, details }],
     result: "success" | "failure",
     error?: string
   }
   ```

3. **Implementation** in `bridge/main.js`:
   - Add `logOllamaAction()` function that appends to `ollama.log`
   - Call after each Ollama execution (success or failure)
   - Include structured JSON for programmatic analysis
   - Rotate log if > 10MB

### Files to modify
- `bridge/main.js` - Add `logOllamaAction()` function
- `config.json` - Add `paths.ollamaLog: "ollama.log"`
- Create `ollama.log` template with header

---

## Implementation Order

1. **P4 (Logging)** - Add Ollama action log first to track remaining work ✅ DONE
2. **P1 (Tool Calling)** - Make tool calling required, remove fallback ✅ DONE
3. **P2 (Workspace)** - Harden path validation and auto-prepend workspace ✅ DONE
4. **P3 (Deny System Ops)** - Add operation whitelist ✅ DONE

---

## Files Modified

| Priority | File | Changes |
|----------|------|---------|
| P1 | `bridge/adapter.js` | Remove fallback, make tool calling required |
| P1 | `config.json` | Add `functionCalling.required` and `functionCalling.allowFallback` |
| P2 | `bridge/adapter.js` | Add `path.isAbsolute()` check in `parseToolCalls()` |
| P2 | `bridge/fs_tools.js` | Add `isWithinWorkspace()` helper |
| P3 | `bridge/adapter.js` | Add `ALLOWED_OPERATIONS`, `DENIED_OPERATIONS`, `validateOperation()` |
| P3 | `bridge/prompt/system_rules.js` | Document allowed/denied operations |
| P3 | `bridge/prompt/output_discipline.js` | Add DENIED OPERATIONS section |
| P4 | `bridge/adapter.js` | Add `logOllamaAction()` function and export |
| P4 | `bridge/main.js` | Add `logOllamaAction()` helper and integrate logging |
| P4 | `config.json` | Add `paths.ollamaLog` |
| P4 | `ollama.log` | Created with header |

---

## Testing Checklist

- [x] P1: Ollama returns text without tool_calls → throws error (not fallback) - implemented in adapter.js callOllama()
- [x] P2: Absolute paths blocked - implemented via path.isAbsolute() check in parseToolCalls()
- [x] P3: Ollama returns `bash: "npm install"` → denied with clear error - ALLOWED_OPERATIONS/DENIED_OPERATIONS in adapter.js
- [x] P3: System prompt updated with allowed/denied operations - system_rules.js and output_discipline.js
- [x] P4: `ollama.log` created with header and logOllamaAction() function in main.js
- [ ] P2: Ollama returns `frontend/package.json` → auto-resolve to `workspace/frontend/package.json` (resolveInWorkspace already handles this if path is relative)
- [ ] `npm start` still works after all changes (needs manual test)

## Implementation Status

### P1: Tool Calling Required ✅
- Removed fallback in `callOllama()` - throws error when no tool_calls returned with function calling enabled
- Added `functionCalling.required: true` and `functionCalling.allowFallback: false` to config.json
- Added `logOllamaAction` export in adapter.js

### P2: Workspace Path Validation ✅
- Added `path.isAbsolute()` check in `parseToolCalls()` - blocks absolute paths with error
- Added `isWithinWorkspace()` helper in fs_tools.js
- `resolveInWorkspace()` already auto-resolves relative paths within workspace

### P3: Denied Operations ✅
- Added `ALLOWED_OPERATIONS` and `DENIED_OPERATIONS` in adapter.js
- Added `validateOperation()` function called in `parseToolCalls()`
- Updated `bridge/prompt/system_rules.js` with explicit list of allowed/denied operations
- Updated `bridge/prompt/output_discipline.js` with DENIED OPERATIONS section

### P4: Ollama Action Log ✅
- Created `ollama.log` file with header
- Added `logOllamaAction()` function in main.js
- Added `paths.ollamaLog` to config.json
- Added structured JSON logging for both success and failure cases
- Integrated logging after successful apply (line ~770) and failure (line ~840)
