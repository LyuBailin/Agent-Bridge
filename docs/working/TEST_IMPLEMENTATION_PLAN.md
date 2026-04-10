# Test Implementation Plan

**Date:** 2026-04-07
**Status:** Phase 2 P2/P3 largely complete (verifier expanded, parser expanded, workflow collectGitSummary added); Phase 3 not started

---

## Current State

### Existing Test Structure (flat, `test/`)

| File | Subject | Lines | Approach |
|------|---------|-------|----------|
| `adapter.test.js` | `adapter/` | ~220 | Unit — parseResponse, parseToolCalls |
| `git_manager.test.js` | `git_manager.js` | ~110 | Unit — applySearchReplaceChanges, snapshots |
| `planner.test.js` | `planner.js` | ~165 | Unit — evaluateComplexity, getNextExecutableSubtask |
| `verifier.test.js` | `verifier.js` | ~75 | Unit — syntax check, semanticVerify (mocked) |
| `snippet_feedback.test.js` | `snippet_feedback.js` | ~70 | Unit — isSearchGot0Error, collectSnippetsForFile |
| `e2e.test.js` | Full workflow | ~635 | Integration — spawns `main.js --once` with mock files |
| `test_openai_connectivity.js` | Ad-hoc connectivity check | ~45 | Manual — not part of `npm test` |

**Gaps:**
- `src/core/query_loop.js` — no tests
- `src/core/risk_classifier.js` — no tests
- `src/core/synthetic_results.js` — no tests
- `src/core/workflow.js` — no unit tests (covered only in e2e)
- `src/core/polling.js` — no unit tests
- `src/core/main_index.js` — no unit tests
- `src/prompt/` — no tests (7 modules)
- `src/prompt/cache_strategy.js` — no tests
- `src/prompt/registry.js` — no tests
- `src/prompt/role_factory.js` — no tests
- `src/prompt/skill_injector.js` — no tests
- `src/core/adapter/providers/` — no isolated provider tests
- `src/core/adapter/validator.js` — only indirectly tested
- `src/core/adapter/parser.js` — partial coverage
- `src/utils/fs_tools.js` — no tests
- `src/utils/simulation.js` — no tests (but used extensively in e2e)
- `src/shared/path.js` — no tests
- `src/shared/time.js` — no tests
- Adapter providers (ollama/openai/claude_cli) — no isolated tests

---

## Proposed Structure

```
test/
├── unit/
│   ├── adapter/
│   │   ├── parser.test.js        # parseResponse, parseSrBlock, parseOpBlock
│   │   ├── validator.test.js     # validateOperationSchema, validateChangeSet
│   │   ├── schema.test.js        # TOOLS_SCHEMA structure
│   │   └── providers/
│   │       ├── ollama.test.js     # Ollama API, function calling fallback
│   │       ├── openai.test.js    # OpenAI API, function calling
│   │       └── claude_cli.test.js # Claude CLI JSON output parsing
│   ├── core/
│   │   ├── planner.test.js       # (rename from existing)
│   │   ├── git_manager.test.js   # (rename from existing)
│   │   ├── verifier.test.js      # (rename from existing)
│   │   ├── workflow.test.js      # orchestrateTask, executeWorkflow logic
│   │   ├── polling.test.js       # pollLoop, parseArgs
│   │   ├── query_loop.test.js    # query loop logic
│   │   ├── risk_classifier.test.js
│   │   └── synthetic_results.test.js
│   ├── prompt/
│   │   ├── index.test.js         # buildPrompt assembly
│   │   ├── plan.test.js          # buildPlanSystemPrompt, buildReplanSystemPrompt
│   │   ├── operation_guidelines.test.js
│   │   ├── output_discipline.test.js
│   │   ├── feedback.test.js
│   │   ├── cache_strategy.test.js
│   │   ├── registry.test.js
│   │   ├── role_factory.test.js
│   │   └── skill_injector.test.js
│   ├── utils/
│   │   ├── fs_tools.test.js
│   │   ├── snippet_feedback.test.js  # (rename from existing)
│   │   └── simulation.test.js
│   └── shared/
│       ├── time.test.js
│       └── path.test.js
├── e2e/
│   └── e2e.test.js               # (existing, move here)
└── helpers/
    ├── mock_git_manager.js        # git manager mock for unit tests
    ├── mock_fs.js                 # in-memory fs mock
    └── mock_provider.js           # generic provider mock
```

---

## Implementation Phases

### Phase 1: Re-organize existing tests ✅ DONE

1. ✅ Create `test/unit/`, `test/e2e/`, `test/helpers/` directories
2. ✅ Move `e2e.test.js` → `test/e2e/e2e.test.js`
3. ✅ Move unit tests into `test/unit/core/` (planner, git_manager, verifier) and `test/unit/utils/` (snippet_feedback)
4. ✅ Move `test/adapter.test.js` → `test/unit/adapter/parser.test.js`
5. ✅ Delete `test_openai_connectivity.js` (ad-hoc, not automated)
6. ✅ Fix `package.json` `test` script to target `test/unit/ test/e2e/` explicitly (avoids picking up `test/scripts/` debug files)
7. ✅ Update all `require()` paths and `runOnce` path in e2e test to match new depths

**Note:** `test/scripts/` directory contains debug/connectivity scripts (`debug_correction.js`, `test_claude_connectivity.js`) — not part of the test suite. `package.json` `test` script now explicitly targets only `test/unit/` and `test/e2e/`.

**Risk:** Very low — mechanical file moves, path updates in `require()`.

---

### Phase 2: Fill critical gaps (modules with no tests)

#### ✅ Completed

| Priority | File | Test Type | Coverage |
|----------|------|-----------|----------|
| P1 | `polling.js` | Unit | `parseArgs` — all flag combinations |
| P1 | `adapter/validator.js` | Unit | `detectOperationType`, `validateOperationSchema`, `validateOperation`, `getPathFieldsFromArgs`, `validateChangeSet` — full coverage |
| P1 | `adapter/schema.js` | Unit | `TOOLS_SCHEMA` structure, `TOOL_METADATA`, `getToolMetadata` |
| P1 | `adapter/providers/ollama.js` | Unit | `callOllama` — generate, function-calling, error handling, base_url normalization, temperature |
| P1 | `adapter/providers/openai.js` | Unit | `callOpenAI` — api key check, generate, function-calling, headers, error handling |
| P1 | `workflow.js` | Unit | `hasPendingSubtasks`, `summarizeIssues`, `handleFailure`, `ContextModifierBuffer` |
| P1 | `shared/path.js` | Unit | `toPosixPath`, `assertSafeRelPath` — all edge cases |
| P1 | `shared/time.js` | Unit | `nowIso` — format, type, distinctness |
| P2 | `utils/fs_tools.js` | Unit | `resolveInWorkspace`, `isWithinWorkspace` |
| P2 | `utils/simulation.js` | Unit | `readMockTextFromEnv`, `readMockJsonFromEnv`, `SIMULATION_ENV` |

#### Remaining

| Priority | File | Test Type | Notes |
|----------|------|-----------|-------|
| P1 | `workflow.js` | Unit | Retry loop, state machine — blocked by need for heavy mocking of git_manager, planner, adapter |
| P2 | `planner.js` | Expand | ✅ Done — analyzeDifficulty, extractLikelyPaths, buildSingleNodePlanTree, updatePlanState, getNextExecutableSubtask, optimizeContext, validatePlanTree structural (36 total) |
| P2 | `verifier.js` | Expand | ✅ Done — path safety (.git), JS/JSON/YAML syntax, deletion policy, suspicious truncation, semanticVerify (no gitManager, no claudeProvider, empty diff, truncation) |
| P2 | `git_manager.js` | Expand | ✅ Done — rollback, rollbackToSha, autoRollback, squashAndCommit edge cases, safeApplyPatch (mkdir/rm/mv/unknown types), verifyAndCommit, ensureRepo, runGit (28 total) |
| P3 | `prompt/*.js` (9 modules) | Unit | ✅ Done — index (8), plan (10), operation_guidelines (5), output_discipline (4), feedback (10), cache_strategy (15), registry (13), role_factory (9), skill_injector (17) = 101 total |
| P3 | `query_loop.js` | Unit | ✅ Done — State, TransitionReason, CIRCUIT_BREAKER, QueryEngine (17 methods), StreamingToolExecutor (11 methods) = 28 total |
| P3 | `risk_classifier.js` | Unit | ✅ Done — classifyToolRisk (16), classifyBatchRisk (8) = 20 total |
| P3 | `adapter/parser.js` | Expand | ✅ Done — parseSrBlock (missing FILE/SEARCH/REPLACE, --- stripping, empty search normalization), parseOpBlock (empty, MKDIR, RM, MV ->/to, mixed, --- stripping), extractResponseText (output_text, output array, nested content, edge types), parseToolCalls risk blocking |
| P3 | `workflow.js` | Expand | ✅ Done — collectGitSummary (recent commits, empty repo) |

---

### Phase 3: Improve e2e test robustness (not started)

1. **Parameterize e2e tests** — instead of 7 large inline tests, extract common setup into `test/helpers/`
2. **Add mock sequential file mode** — `e2e.test.js` already uses `AGENT_BRIDGE_RESPONSE_FILES_IDX` for sequential responses; make this pattern reusable
3. **Add negative e2e tests:**
   - Task with invalid schema in task.json
   - Config with missing required fields
   - Workspace permission errors
4. **Add DAG-specific e2e tests:**
   - Parallel subtasks (two subtasks with no dependency)
   - Replan mid-execution
   - Partial failure with independent subtasks continuing

---

### Phase 4: Test infrastructure (mostly done)

1. **`test/helpers/mock_provider.js`** — ✅ Done — unified mock with `createMockProvider` and `roundRobinProviders` for sequential multi-call tests.
2. **`test/helpers/mock_fs.js`** — ✅ Done — in-memory filesystem mock with mkdir, writeFile, readFile, stat, access, unlink, rm, rename, snapshot/restore.
3. **Coverage target** — aim for 80% line coverage on `core/` and `adapter/` within 3 months.
4. **CI** — add `npm test` to CI pipeline. e2e tests are slow (~5s each); consider marking slow tests with `test.skip` conditionally.

---

## Key Principles

1. **Unit tests first** — fast, isolated, no external dependencies
2. **e2e tests for paths unit tests can't cover** — full process spawn, git repo lifecycle, mock file sequencing
3. **Simulation env vars are the primary mocking mechanism** — `AGENT_BRIDGE_RESPONSE_FILE(S)` for text, `AGENT_BRIDGE_REVIEW_RESPONSE_FILE(S)` for Claude review. Keep using these instead of internal mocks where possible.
4. **No test-only re-exports** — if something is hard to test, fix the module's interface, not the test
5. **Tests fail on behavior changes, not implementation details** — test public APIs (the barrel `core/index.js` re-exports are the contract)

---

## Immediate Next Steps (Week 1)

✅ Done:
1. ✅ Re-organize test directory (Phase 1)
2. ✅ Add `polling.test.js` — `parseArgs` fully tested
3. ✅ Add `adapter/validator.test.js` — `validateOperationSchema`, `validateChangeSet`, `detectOperationType` fully tested
4. ✅ Add `adapter/schema.test.js` — `TOOLS_SCHEMA`, `TOOL_METADATA`
5. ✅ Add provider tests for ollama and openai
6. ✅ Add `workflow.test.js` — exported utilities + collectGitSummary
7. ✅ Add `shared/path.test.js`, `shared/time.test.js`
8. ✅ Add `utils/fs_tools.test.js`, `utils/simulation.test.js`
9. ✅ Expand `planner.test.js` — analyzeDifficulty, extractLikelyPaths, buildSingleNodePlanTree, updatePlanState, getNextExecutableSubtask, validatePlanTree structural, optimizeContext (36 total)
10. ✅ Expand `git_manager.test.js` — rollback, rollbackToSha, autoRollback, squashAndCommit edge cases, safeApplyPatch mkdir/rm/mv, verifyAndCommit, ensureRepo, runGit (28 total)
11. ✅ Create `test/helpers/mock_provider.js`, `test/helpers/mock_fs.js`
12. ✅ Prompt module tests — 9 modules, 101 tests total
13. ✅ `query_loop.test.js` — 28 tests
14. ✅ `risk_classifier.test.js` — 20 tests
15. ✅ Expand `verifier.test.js` — path safety (.git), JS/JSON/YAML syntax, deletion policy, suspicious truncation, semanticVerify (9 new tests)
16. ✅ Expand `adapter/parser.test.js` — parseSrBlock (6), parseOpBlock (7), extractResponseText (6), parseToolCalls risk blocking (1) = 20 new tests
17. ✅ Current test count: **401 tests passing**

Next:
1. Add `workflow.test.js` (retry loop, error handling) — needs deep mocking of git_manager/adapter/planner
2. Phase 3 e2e improvements — parameterize, add negative/dag-specific tests
