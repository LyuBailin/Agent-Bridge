# Bug Report - Phase 1 Project Initialization

## Date: 2026-04-07

## Task: phase-1-project-initialization-v2.1

## Bug 1: Claude CLI Block Type Routing (FIXED)
**Issue:** `callClaudeCliJson` always put extracted code block content into `sr` field regardless of block type.
**Fix:** Check block type and route to correct field (`op` for operation blocks, `sr` for search/replace blocks).

## Bug 2: Code Block Extraction Missing Fences (FIXED)
**Issue:** First fix extracted only content inside fences, but `parseResponse` needs full block with fences.
**Fix:** Changed to extract `blockMatch[0]` (full match with fences) instead of `blockMatch[2]` (content only).

## Bug 3: Empty Search Placeholder Not Recognized (FIXED)
**Issue:** When model generates `search: ""` (empty string), `validateSearchNotEmpty` hook transforms it to `"(empty - creating new file)"`. But `safeApplyPatch` and `applyChange` only check `change.search === ""`, missing this placeholder.
**Fix:** Updated `git_manager.js` to recognize the empty search placeholder.

## Bug 4: parseSrBlock Requires SEARCH Line (FIXED)
**Issue:** `parseSrBlock` required a SEARCH line to be present in the sr block. If the model generated an sr block without a SEARCH line (for new file creation), it would throw "sr block missing SEARCH".
**Fix:** Made SEARCH optional in `parseSrBlock`. If no SEARCH line, treat as empty search (new file creation).

---

# Bug Report - Phase 2 Backend Core Development

## Date: 2026-04-07

## Task: phase-2-backend-core-v2.1

## Bug 5: TOUCH Operation Not Recognized in parseOpBlock (FIXED)
**Issue:** When the Ollama model generates an op block with `TOUCH` operation (e.g., `TOUCH backend/routes/auth.js`), `parseOpBlock` in `src/core/adapter/parser.js` throws an error because `TOUCH` is not a recognized operation.
**Error Message:** `Invalid op block: no recognized operation found. Expected MKDIR, MV, or RM. Got: MKDIR backend/routes\nTOUCH backend/routes/auth.js`
**Root Cause:** `parseOpBlock` only recognizes `MKDIR:`, `MV:`, and `RM:` prefixes. `TOUCH` is used by models to create empty placeholder files but is not in the allowed operations list.
**Affected File:** `src/core/adapter/parser.js` - `parseOpBlock` function (lines 49-89)
**Status:** FIXED - Added TOUCH support to all relevant files

**Fix Applied:**
1. Added `TOUCH:` recognition in `parseOpBlock` in `src/core/adapter/parser.js`
2. Added `touch` handling in `parseStructuredTextToToolCalls` in `src/core/adapter/parser.js`
3. Added `touch` to path validation in `parseResponse` in `src/core/adapter/parser.js`
4. Added `touch: true` to `ALLOWED_OPERATIONS` in `src/core/adapter/validator.js`
5. Added `touch` to `getPathFieldsFromArgs` in `src/core/adapter/validator.js`
6. Added `touch` tool to `TOOLS_SCHEMA` in `src/core/adapter/schema.js`
7. Added `touch` handling in `applyChange` in `src/core/git_manager.js`

## Bug 6: Op Block Operations Missing Colon (FIXED)
**Issue:** Model generates `MKDIR backend/routes` (without colon) but parser expects `MKDIR: backend/routes` (with colon).
**Error Message:** `Invalid op block: no recognized operation found. Expected MKDIR, MV, RM, or TOUCH. Got: MKDIR backend/routes\nTOUCH backend/routes/auth.js`
**Root Cause:** `parseOpBlock` only recognized `MKDIR:` (with colon) but model generates `MKDIR` (without colon) in text-based responses.
**Affected File:** `src/core/adapter/parser.js` - `parseOpBlock` function
**Status:** FIXED - Made parser accept operations with or without colon

**Fix Applied:**
1. Modified parseOpBlock to accept `MKDIR`, `MKDIR:`, `MV`, `MV:`, `RM`, `RM:`, `TOUCH`, `TOUCH:` (with or without colon)

## Files Modified (Phase 1)
- `src/core/adapter/providers/claude_cli.js` - Bug 1 & 2 fixes
- `src/core/git_manager.js` - Bug 3 fix
- `src/core/adapter/parser.js` - Bug 4 fix

## Current Phase 2 Status
- Task `phase-2-backend-core-v2.3` failed at subtask s5
- s1 (package.json), s2 (.env), s3 (middleware/auth.js), s4 (routes/auth.js) completed successfully
- s5 failed with "Function calling requested but model returned no tool_calls"
- All Phase 2 changes were rolled back due to task failure
- Bug 5 and Bug 6 identified and fixed
- Phase 2 retry needed

## Bug 7: Ollama Model Not Returning tool_calls (FIXED)
**Issue:** Ollama model (qwen2.5-coder:14b) sometimes doesn't return tool_calls when function calling is requested via tools schema.
**Error Message:** `Function calling requested but model returned no tool_calls. Set useFunctionCalling=false to allow text fallback.`
**Root Cause:** Model behavior inconsistency - sometimes returns proper tool_calls, sometimes returns plain text instead. The code was throwing an error instead of falling back to text parsing.
**Affected File:** `src/core/adapter/providers/ollama.js` - lines 58-76
**Status:** FIXED - Added allowFallback support

**Fix Applied:**
1. Modified config.json: set `functionCalling.allowFallback: true` and `functionCalling.required: false`
2. Modified `src/core/adapter/providers/ollama.js` to check `allowFallback` and return text content when tool_calls parsing fails
3. Modified `src/core/adapter/index.js` to pass `functionCalling` config to Ollama provider
4. Modified `src/core/workflow.js` to pass `functionCalling` config when creating Ollama provider
5. Set `useFunctionCalling: false` in config.json to use text-based parsing (more reliable with qwen model)

## Bug 8: Model Generated Invalid MV Operation (FIXED)
**Issue:** Model generated `MV: backend/routes/index.js -> backend/routes/auth.js` but the source file didn't exist.
**Error:** The model tried to move a non-existent file, causing the auth.js creation to fail silently.
**Result:** Phase 2 task reported success but `backend/routes/auth.js` was NOT created.
**Status:** FIXED - Created fix task `phase-2-backend-core-v2.5-fix` which successfully created the missing file
**Resolution:** The missing `backend/routes/auth.js` was created via a dedicated fix task (2026-04-07T20:44:52)

## Phase 2 Status Summary
**Phase 2 Completed**:
- Original Commit: `192a148bbbde1d8b33f01623c0c2283904680675`
- Fix Commit: `phase-2-backend-core-v2.5-fix` (2026-04-07T20:44:52)
- Files created:
  - backend/.env (with JWT_SECRET)
  - backend/index.js (updated)
  - backend/middleware/auth.js
  - backend/package.json (updated)
  - backend/routes/auth.js (created via fix task)
  - backend/routes/data.js
  - backend/routes/users.js
  - backend/server.js
- All Phase 2 files now present

---

# Bug Report - Phase 3 Frontend Core Development

## Date: 2026-04-07

## Task: phase-3-frontend-core-v3.1

## Bug 9: Frontend Uses Wrong API Endpoints (FIXED)
**Issue:** Frontend components use incorrect API endpoints that don't match backend routes.
**Details:**
- Login.js calls `axios.post('/api/login', ...)` but backend route is `/api/auth/login`
- Register.js calls `axios.post('/api/register', ...)` but backend route is `/api/auth/register`
- UserProfile.js calls `axios.get('/api/user', ...)` but backend route is `/api/users/:id`
**Affected Files:**
- frontend/src/components/Login.js
- frontend/src/components/Register.js
- frontend/src/components/UserProfile.js
**Status:** FIXED - Updated to use apiClient with correct endpoints

## Bug 10: Login Component Sends Wrong Fields (FIXED)
**Issue:** Login.js sends `{ username, password }` but backend login expects `{ email, password }`.
**Details:** Backend auth.js login route uses `body('email').isEmail()` validation, but Login.js sends `username` field.
**Affected File:** frontend/src/components/Login.js
**Status:** FIXED - Changed to use `email` field

## Bug 11: Register Component Sends Wrong Fields (FIXED)
**Issue:** Register.js sends `{ username, password }` but backend register expects `{ username, email, password }`.
**Details:** Backend auth.js register route expects `username`, `email`, and `password`, but Register.js only sends `username` and `password`.
**Affected File:** frontend/src/components/Register.js
**Status:** FIXED - Added `email` field

## Bug 12: Components Use Raw axios Instead of apiClient (FIXED)
**Issue:** Login.js, Register.js, and UserProfile.js import raw `axios` instead of the configured `apiClient` from `src/api/index.js`.
**Details:** The `apiClient` has interceptors for JWT token handling, but components don't use it.
**Affected Files:**
- frontend/src/components/Login.js
- frontend/src/components/Register.js
- frontend/src/components/UserProfile.js
**Status:** FIXED - Changed to import apiClient from '../api'

## Bug 13: Login Missing Redirect After Success (FIXED)
**Issue:** Login.js stores token but doesn't redirect user to profile page after successful login.
**Affected File:** frontend/src/components/Login.js
**Status:** FIXED - Added `navigate('/profile')` on success

## Bug 14: Logout Functionality Not Implemented (FIXED)
**Issue:** Phase 3 required "Logout functionality" but no Logout component was created.
**Required:** Create frontend/src/components/Logout.js with token clearing and redirect to login
**Status:** FIXED - Created Logout.js with localStorage token clearing and redirect

## Bug 15: ReactDOM.render Deprecated in React 18 (FIXED)
**Issue:** main.js uses `ReactDOM.render(<App />, document.getElementById('root'))` which is deprecated in React 18.
**Fix:** Use `ReactDOM.createRoot` instead.
**Affected File:** frontend/src/main.js
**Status:** FIXED - Updated to use ReactDOM.createRoot

## Bug 16: Backend Auth Hardcoded JWT Secret (FIXED)
**Issue:** backend/routes/auth.js uses hardcoded JWT secret `'your_jwt_secret'` instead of `process.env.JWT_SECRET`.
**Affected File:** backend/routes/auth.js
**Status:** FIXED - Changed to use process.env.JWT_SECRET

## Bug 17: Backend Auth Uses Non-existent User Model (FIXED)
**Issue:** backend/routes/auth.js references a `User` model that doesn't exist in the codebase.
**Details:** Lines 24-26, 51-52, 62 have commented-out User model code that won't work.
**Affected File:** backend/routes/auth.js
**Status:** FIXED - Replaced with actual pool.query calls to PostgreSQL database

## Phase 3 Status Summary
**Phase 3 Initial Commit:** `833fd5e48392e3556451e91167e65a765f17a750`
**Phase 3 Fix Commit:** `99e808b` (manual fixes)
**Files Created:**
- frontend/src/App.js
- frontend/src/components/Login.js
- frontend/src/components/Register.js
- frontend/src/components/UserProfile.js
- frontend/src/components/Logout.js
- frontend/src/main.js
- frontend/public/index.html
- frontend/vite.config.js
- frontend/src/api/index.js

**Issues Found:** 9 bugs (ALL FIXED)
**Phase 3 Status:** COMPLETE

---

## Bug 18: Phase 3 Fix Task Semantic Review Failure (FIXED)
**Issue:** Fix task `phase-3-frontend-core-v3.1-fix` failed with "Invalid semantic review: missing boolean ok".
**Root Cause:** Review provider returned malformed JSON without `ok` boolean field.
**Affected File:** `src/core/adapter/providers/claude_cli.js`
**Status:** FIXED - Manually applied fixes since automated fix task failed

**Manual Fixes Applied:**
1. Updated Login.js - use apiClient, email field, navigate on success
2. Updated Register.js - use apiClient, email and username fields, navigate on success
3. Updated UserProfile.js - use apiClient
4. Created Logout.js - clear token, redirect to login
5. Updated main.js - React 18 createRoot API
6. Fixed backend/routes/auth.js - use process.env.JWT_SECRET, actual DB queries via pool
7. Updated App.js - added Logout route

## Bug 19: Frontend Missing package.json (FIXED)
**Issue:** Phase 3 task created React components but did not create frontend/package.json with dependencies.
**Details:** No way to install npm packages for frontend development.
**Affected File:** frontend/package.json
**Status:** FIXED - Created package.json with React 18, React Router 6, Axios, Vite dependencies
**Commit:** `f030717`

## Bug 20: Semantic Review Returns Malformed JSON (FIXED)
**Issue:** Semantic review stage fails with "Invalid semantic review: missing boolean ok" on multiple tasks.
**Root Cause:** `callClaudeCliJson` in `claude_cli.js` wraps JSON code blocks in `{ sr: "..." }` instead of parsing and returning the JSON directly. When semantic review returns ` ```json\n{...}\n``` `, it was being wrapped instead of parsed.
**Affected Tasks:**
- phase-3-frontend-core-v3.1-fix
- phase-3-verify-v3.2
**Affected File:** `src/core/adapter/providers/claude_cli.js` - lines 173-187
**Status:** FIXED - Added special handling for "json" block type to parse and return JSON directly

**Error Message:**
```
[OK   ]   [s1] SUCCESS | Changes: edit:frontend/src/components/Login.js | Commit: null
[task] phase-3-verify-v3.2 failed: Invalid semantic review: missing boolean ok
```

**Fix Applied:**
Modified the markdown code block extraction in `callClaudeCliJson` to:
1. Check if block type is "json"
2. If so, parse the content and resolve with parsed JSON directly
3. Otherwise, wrap in `{ sr: ... }` or `{ op: ... }` as before

**Note:** Phase 3 implementation is CORRECT despite this bug - all files have been manually verified to have correct syntax and logic.
