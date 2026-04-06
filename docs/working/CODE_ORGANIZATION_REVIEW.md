# Code Organization Review: `src/`

**Date:** 2026-04-06
**Status:** All phases complete ✓

---

## Implementation Progress

| Phase | Description | Status |
|-------|-------------|--------|
| Phase 1 | Remove dead `tools/` directory | ✓ Complete |
| Phase 2 | Extract shared utilities (`shared/time.js`, `shared/path.js`) | ✓ Complete |
| Phase 3 | Break up `main.js` and `adapter.js` | ✓ Complete |
| Phase 4 | Polish: barrel files, comment language, orphaned fields | ✓ Complete |

**Last updated:** 2026-04-06 (after Phase 4)

---

## Current Structure (post-Phase 4)

```
src/
├── core/
│   ├── index.js              # Barrel — re-exports all public APIs [NEW in Phase 3]
│   ├── main.js               # Entry point — thin re-export + require.main check [Phase 3]
│   ├── main_index.js         # Main implementation — init, polling loop [Phase 3]
│   ├── polling.js            # pollLoop, parseArgs [Phase 3]
│   ├── workflow.js           # executeWorkflow, orchestrateTask [Phase 3]
│   ├── adapter/
│   │   ├── index.js          # Facade — wires validator + parser + schema + providers [Phase 3]
│   │   ├── validator.js     # detectOperationType, validateOperationSchema, validateChangeSet [Phase 3]
│   │   ├── parser.js         # parseResponse, parseSrBlock, parseOpBlock, parseToolCalls [Phase 3]
│   │   ├── schema.js         # TOOLS_SCHEMA [Phase 3]
│   │   └── providers/
│   │       ├── ollama.js     # Ollama API implementation [Phase 3]
│   │       ├── openai.js     # OpenAI Chat Completions implementation [Phase 3]
│   │       └── claude_cli.js # Claude CLI -p --output-format json [Phase 3]
│   ├── planner.js            # DAG planning — unchanged (no split needed)
│   ├── git_manager.js        # Git operations — unchanged
│   └── verifier.js           # Verification — unchanged
├── prompt/       # 7 files — modular prompt builders (unchanged)
├── shared/       # 2 files — nowIso + path utilities [Phase 2]
└── utils/        # 3 files — fs tools + simulation + snippet feedback
```

**Removed:** `tools/` directory (Phase 1 — `ast_parser.js` stub, `index.js` unused registry)

---

## File Inventory

| File | Lines | Exports | Status |
|------|-------|---------|--------|
| `core/main.js` | ~17 | Entry point re-export | Active — thin wrapper |
| `core/main_index.js` | ~233 | `initEnvironment`, `main`, `pollLoop` wiring | Active — implementation |
| `core/polling.js` | ~38 | `pollLoop`, `parseArgs` | Active — extracted in Phase 3 |
| `core/workflow.js` | ~620 | `executeWorkflow`, `orchestrateTask`, `orchestrateLongTask` | Active — extracted in Phase 3 |
| `core/index.js` | ~24 | Barrel — re-exports all public APIs | Active — added Phase 3 |
| `core/adapter/index.js` | ~100 | Facade — wires validator + parser + schema + providers | Active — Phase 3 |
| `core/adapter/validator.js` | ~150 | `detectOperationType`, `validateOperationSchema`, `validateChangeSet` | Active — Phase 3 |
| `core/adapter/parser.js` | ~200 | `parseResponse`, `parseSrBlock`, `parseOpBlock`, `parseToolCalls` | Active — Phase 3 |
| `core/adapter/schema.js` | ~100 | `TOOLS_SCHEMA` | Active — Phase 3 |
| `core/adapter/providers/ollama.js` | ~150 | Ollama API implementation | Active — Phase 3 |
| `core/adapter/providers/openai.js` | ~150 | OpenAI API implementation | Active — Phase 3 |
| `core/adapter/providers/claude_cli.js` | ~300 | Claude CLI -p --json | Active — Phase 3 |
| `core/planner.js` | ~850 | `decomposeTask`, `validatePlanTree`, `updatePlanState`, `getNextExecutableSubtask`, `replanFromFailure`, `analyzeDifficulty`, `evaluateComplexity`, `optimizeContext`, `enforceSequentialDependencies` | Active, DAG planning |
| `core/git_manager.js` | ~490 | `ensureRepo`, `safeApplyPatch`, `verifyAndCommit`, `commitCheckpoint`, `rollback`, `squashAndCommit`, `runGit` | Active, git operations |
| `core/verifier.js` | ~340 | `semanticVerify`, `verifyAll` | Active, post-apply checks |
| `shared/time.js` | 12 | `nowIso` | Active, shared utility [Phase 2] |
| `shared/path.js` | 38 | `toPosixPath`, `assertSafeRelPath` | Active, shared utility [Phase 2] |
| `prompt/index.js` | ~145 | `buildPrompt`, `buildCorrectionPrompt`, all sub-component builders | Active, aggregator |
| `prompt/plan.js` | ~140 | `buildPlanSystemPrompt`, `buildPlanUserPrompt`, `buildReplanSystemPrompt`, `buildReplanUserPrompt` | Active, planning prompts |
| `prompt/identity.js` | ~16 | `buildIdentityDefinition` | Active, trivial |
| `prompt/system_rules.js` | ~41 | `buildSystemRules` | Active |
| `prompt/operation_guidelines.js` | ~67 | `buildOperationGuidelines` | Active |
| `prompt/output_discipline.js` | ~71 | `buildOutputDiscipline` | Active |
| `prompt/feedback.js` | ~35 | `buildFeedbackModule` | Active |
| `utils/fs_tools.js` | ~290 | `resolveInWorkspace`, `collectContext`, `extractImportGraph`, `updateFile`, `expandRelatedFiles`, etc. | Active, foundational — imports from `shared/path` |
| `utils/snippet_feedback.js` | ~154 | `collectSnippetsForFile`, `formatSearchGot0Feedback`, `isSearchGot0Error` | Active, error formatting |
| `utils/simulation.js` | ~92 | `readMockTextFromEnv`, `readMockJsonFromEnv`, `SIMULATION_ENV` | Active, testing |

---

## Intra-Directory Dependencies

### `core/`
```
main.js (entry point)
  └── main_index.js

main_index.js
  ├── polling.js (pollLoop, parseArgs)
  ├── workflow.js (executeWorkflow, orchestrateTask, orchestrateLongTask)
  ├── git_manager.js
  ├── planner.js
  ├── adapter (./adapter/index.js)
  └── verifier.js

workflow.js
  ├── git_manager.js (./git_manager)
  ├── adapter (./adapter)
  ├── planner.js
  ├── verifier.js
  ├── shared/time.js (../../shared/time)
  ├── shared/path.js (../../shared/path)
  └── utils/snippet_feedback.js (../../utils/snippet_feedback)

adapter/index.js (facade)
  ├── adapter/validator.js
  ├── adapter/parser.js
  ├── adapter/schema.js
  └── adapter/providers/

adapter/validator.js — leaf
adapter/parser.js — leaf
adapter/schema.js — leaf (exports TOOLS_SCHEMA)

adapter/providers/
  ├── ollama.js → adapter/schema.js (imports TOOLS_SCHEMA)
  ├── openai.js → adapter/schema.js
  └── claude_cli.js → adapter/schema.js

planner.js
  ├── shared/path.js (assertSafeRelPath)
  ├── shared/time.js (nowIso)
  ├── prompt/plan.js
  └── utils/simulation.js

verifier.js — uses gitManager and fsTools passed as args
```

### `prompt/`
```
index.js (aggregator)
  ├── identity.js
  ├── system_rules.js
  ├── operation_guidelines.js
  ├── output_discipline.js
  └── feedback.js

plan.js, identity.js, system_rules.js, operation_guidelines.js, output_discipline.js, feedback.js
  — all leaves, no internal prompt/ deps
```

### `utils/`
All leaves — `snippet_feedback.js`, `fs_tools.js`, `simulation.js` — use only `node:fs` / `node:path`.

### `shared/`
```
time.js (leaf — no internal deps)
path.js (leaf — uses only node:path)
```

---

## Cross-Directory Dependencies

| File | Imports From | Usage |
|------|-------------|-------|
| `core/main_index.js` | `shared/time` | `nowIso` for timestamps |
| `core/main_index.js` | `utils/fs_tools` | Path resolution, context collection, import graph |
| `core/main_index.js` | `utils/snippet_feedback` | Error formatting with file snippets |
| `core/adapter/ollama.js` | `adapter/schema` | `TOOLS_SCHEMA` |
| `core/adapter/openai.js` | `adapter/schema` | `TOOLS_SCHEMA` |
| `core/adapter/claude_cli.js` | `adapter/schema` | `TOOLS_SCHEMA` |
| `core/planner.js` | `shared/path` | `assertSafeRelPath` validation |
| `core/planner.js` | `shared/time` | `nowIso` for timestamps |
| `core/planner.js` | `prompt/plan.js` | Planning prompt builders |
| `core/planner.js` | `utils/simulation` | Mock JSON reading for planning |
| `core/workflow.js` | `shared/time` | `nowIso` |
| `core/workflow.js` | `utils/snippet_feedback` | Error formatting |
| `utils/fs_tools.js` | `shared/path` | Imports `toPosixPath`, `assertSafeRelPath` |

**Circular dependencies: NONE** — The dependency graph is acyclic.

---

## Issues Identified

### 1. `tools/` is dead code — ✓ Fixed (Phase 1)
- `ast_parser.js` — `parseSymbols()` always returns `{ok: false, reason: "not_implemented"}`. Never imported or used anywhere.
- `tools/index.js` — `createToolRegistry({fsTools, gitManager})` is called in `main.js` but the returned registry object is **never stored or used**. The tools (`tool.fs.collectContext`, etc.) appear designed for a function-calling agent interface that was never wired up.
- **Resolution:** `src/tools/` directory deleted entirely in Phase 1.

### 2. Fat core files — `main.js` (1056L) and `adapter.js` (1005L) — ✓ Fixed (Phase 3)
- **Resolution:** Both files split in Phase 3. `main.js` → `main.js` + `main_index.js` + `polling.js` + `workflow.js`. `adapter.js` → `adapter/index.js` + `validator.js` + `parser.js` + `schema.js` + `providers/*`.

### 3. Duplicate `nowIso()` function — ✓ Fixed (Phase 2)
- **Resolution:** Extracted to `shared/time.js` in Phase 2. `main_index.js` and `planner.js` both import from there.

### 4. Heavy import for a single utility — ✓ Fixed (Phase 2)
- `planner.js` required `const fsTools = require("../utils/fs_tools")` purely to call `fsTools.assertSafeRelPath()` during plan validation.
- **Resolution:** `assertSafeRelPath` extracted to `shared/path.js`. `planner.js` now imports from `shared/path` directly.

### 5. `review_provider` field is orphaned — ✓ Fixed (Phase 4)
- `reviewProviderType` was set but `semanticVerify` always called `claudeProvider` regardless.
- **Resolution:** `review_provider` now always set to `semanticVerifyEnabled ? "claude_cli" : null` throughout `workflow.js`.

### 6. `validateChangeSet` is duplicated — ✓ Fixed (Phase 3)
- `adapter.js` had `validateChangeSet()` and `git_manager.js` had its own validation inside `safeApplyPatch`.
- **Resolution:** Validation consolidated into `adapter/validator.js` in Phase 3.

### 7. No barrel files in `core/` — ✓ Fixed (Phase 3)
- **Resolution:** `core/index.js` created as a barrel re-exporting all public APIs.

### 8. Language mixing in comments — ✓ Fixed (Phase 4)
- Chinese comments in `src/prompt/*.js` files.
- **Resolution:** All Chinese module-level comments translated to English in Phase 4.

### 9. Simulation module partially integrated — Not addressed
- `simulation.js` provides `readMockJsonFromEnv` used by `planner.js` for plan/replan mocks, but review response simulation (`REVIEW_RESPONSE_FILE`) is referenced in `adapter.js` for `claude_cli.generateJson` yet not consistently applied across all provider methods (ollama and openai providers only check `RESPONSE_FILE`/`RESPONSE_FILES`).
- **Status:** Deferred — not critical to the refactoring goals.

### 10. `buildSingleNodePlanTree` fallback inconsistency — ✓ Already correct
- `buildSingleNodePlanTree` function exists and is called as fallback in `normalizePlanArrayToTree` and `createPlanTree`. No inconsistency found during Phase 4 review.

---

## Proposed Improvement Plan

### Phase 1: Remove dead code ✓

**Goal:** Eliminate code with no purpose.

- ~~Remove `tools/ast_parser.js`~~ (dead stub, never imported) — **Done**
- ~~Remove `tools/index.js`~~ (registry created but never used) — **Done**

**Note:** `createToolRegistry` was not actually called anywhere in `main.js` — it was already unused. The `tools/` directory was self-contained dead code.

**Affected files:** `src/tools/` directory deleted entirely
**Risk:** Very low — removes code with no active references.

---

### Phase 2: Extract shared utilities (reduce cross-cutting duplication) ✓

**Goal:** Eliminate duplicated code and reduce unnecessary module coupling.

- ~~Create `shared/time.js`~~ — extract `nowIso()` here, used by `main.js` and `planner.js` — **Done**
- ~~Create `shared/path.js`~~ — extract `assertSafeRelPath` from `fs_tools.js`, used by `planner.js` and `fs_tools.js` — **Done**

`planner.js` now imports `assertSafeRelPath` directly from `shared/path.js` instead of pulling in the entire `fs_tools` module. `fs_tools.js` re-exports `assertSafeRelPath` for backward compatibility.

**Affected files:** `main.js`, `planner.js`, `fs_tools.js`, new `shared/time.js`, new `shared/path.js`
**Risk:** Low — pure extraction with no behavior change.

---

### Phase 3: Break up the fat core files — ✓ Complete

**Goal:** Make `core/main.js` and `core/adapter.js` navigable.

**Actual outcome:**
- ~~`main.js`~~ → `main.js` (thin entry, ~17L) + `main_index.js` (~233L) + `polling.js` (~38L) + `workflow.js` (~620L)
- ~~`adapter.js`~~ → `adapter/index.js` (~100L) + `validator.js` (~150L) + `parser.js` (~200L) + `schema.js` (~100L) + `providers/ollama.js` + `providers/openai.js` + `providers/claude_cli.js`
- `core/index.js` barrel added

**Risk:** Medium — many internal import paths changed. Tests (28/28) passed after refactoring.

---

### Phase 4: Organization polish — ✓ Complete

- ~~Add `core/index.js` barrel file~~ — Done in Phase 3
- ~~Fix `review_provider` routing~~ — `semanticVerifyEnabled ? "claude_cli" : null` used consistently throughout workflow.js
- ~~Consolidate `validateChangeSet`~~ — Now in `adapter/validator.js`
- ~~Standardize comment language~~ — All Chinese module-level comments in `src/prompt/*.js` translated to English
- ~~Update `CLAUDE.md`~~ — Updated to reflect new structure
- ~~Fix `buildSingleNodePlanTree` fallback~~ — Verified it's already correctly calling the function

---

## Recommended Execution Order

```
Phase 1 (Dead code removal)  →  Phase 2 (Shared utilities)  →  Phase 3 (Break up fat files)  →  Phase 4 (Polish)
     ✓ Done                          ✓ Done                        ✓ Done                          ✓ Done
```

All phases complete. 28/28 tests passing.

---

## Out of Scope

- No changes to `prompt/` — structure is sound, files are small and single-purpose
- No changes to `utils/` beyond Phase 2 (it now imports from `shared/`)
- No behavioral changes — this is purely organizational refactoring
- No test changes assumed — tests passed after each completed phase
