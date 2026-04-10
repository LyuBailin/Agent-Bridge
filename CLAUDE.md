# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

### Build/Run
- `npm start` - Start the Agent Bridge main controller (polls for tasks in `tasks/task.json`)

### Test
- `npm test` - Run all tests (`test/unit/` and `test/e2e/`) using Node.js built-in test runner
- `node --test test/unit/` - Run unit tests only
- `node --test test/e2e/` - Run e2e tests only
- `node --test <path>` - Run a specific test file

### Lint
No formal linting configured. Use standard JavaScript style conventions.

## Code Architecture

Agent Bridge is a hybrid AI code generation system that automatically converts natural language instructions into working code changes. It uses mixed model orchestration (local Ollama + Claude Code CLI) and supports long-range planning with DAG task decomposition.

### Core Modules

- **src/core/main.js** - Entry point. Thin re-export that calls `main()` if run directly (`require.main === module`). Delegates to `main_index.js`.

- **src/core/main_index.js** - Main controller implementation. Handles environment init, dotenv loading, task polling loop wiring, and exports `executeWorkflow`, `orchestrateTask`, `orchestrateLongTask`.

- **src/core/polling.js** - Task polling loop. `pollLoop(env, deps)` polls `tasks/task.json` and calls `executeWorkflow` when a task is queued. `parseArgs(argv)` handles `--once` and `--root` flags.

- **src/core/workflow.js** - Orchestration logic. `executeWorkflow` drives the full pipeline: planning → model execution → verification → git checkpointing → final squash commit. `orchestrateTask` / `orchestrateLongTask` handle single and DAG-based subtask execution. Exports helper functions: `handleApplyFailure`, `buildSubtaskContext`, `handleFailure`, `collectGitSummary`, `logOllamaAction`, `logClaudeWorkflow`.

- **src/core/planner.js** - Task analysis and DAG planning. Key responsibilities:
  - Task difficulty assessment (scores 0-100)
  - Decomposes complex tasks into subtasks with dependency DAG
  - State management and replanning from failures
  - Validation of plan tree structure

- **src/core/adapter/index.js** - Multi-model adapter facade. Wires together validator, parser, schema, and providers. Exports `createProvider` (factory dispatcher), `createOllamaProvider`, `createOpenAIProvider`, `createClaudeCliProvider`, `callCodex` (legacy OpenAI Responses API), `buildPrompt`, `buildCorrectionPrompt`, and re-exports validators/parsers.

- **src/core/adapter/validator.js** - Operation validation:
  - `detectOperationType` — distinguishes sr-only vs fileops vs mixed
  - `validateOperationSchema` — enforces required fields per operation type
  - `validateChangeSet` — full changeset validation with structured errors
  - `ALLOWED_OPERATIONS` / `DENIED_OPERATIONS` lists

- **src/core/adapter/parser.js** - Response parsing:
  - `parseResponse` — top-level entry (validates then delegates to block parsers)
  - `parseSrBlock` / `parseOpBlock` — extract individual blocks
  - `parseToolCalls` / `extractResponseText` — handle raw model output

- **src/core/adapter/schema.js** - `TOOLS_SCHEMA` — function-calling tool definitions shared by all providers.

- **src/core/adapter/providers/ollama.js** - Ollama (local deepseek-coder) API implementation.

- **src/core/adapter/providers/openai.js** - OpenAI Chat Completions API implementation.

- **src/core/adapter/providers/claude_cli.js** - Claude CLI `-p --output-format json` implementation for generation and semantic review.

- **src/core/verifier.js** - Multi-layer code verification:
  - Syntax checking (`node --check` for JS, JSON validation)
  - Path safety validation (prevents directory traversal)
  - Semantic review (Claude-powered code quality analysis)

- **src/core/git_manager.js** - Git operations with safety mechanisms:
  - Automatic repository initialization
  - Checkpoint commits per subtask (supports rollback on failure)
  - Squash and merge all checkpoints into a single final commit
  - SEARCH/REPLACE based patch application via strategy pattern (`handleEdit`, `handleMkdir`, `handleRm`, `handleMv`, `handleTouch`)

- **src/core/index.js** - Barrel re-exporting all public core APIs: `main`, `adapter`, `planner`, `gitManager`, `verifier`, `fsTools`, `snippetFeedback`, `polling`, `workflow`, `adapterProviders`. Also re-exports `ALLOWED_OPERATIONS` and `DENIED_OPERATIONS` from validator.

- **src/shared/time.js** - `nowIso()` — returns current Beijing time in ISO format.

- **src/shared/path.js** - `toPosixPath`, `assertSafeRelPath` — shared path utilities (used to live in `fs_tools.js`).

- **src/shared/constants.js** - `EMPTY_SEARCH_PATTERNS` — shared constants for SEARCH/REPLACE empty search detection.

- **src/utils/snippet_feedback.js** - Code snippet feedback for SEARCH/REPLACE failures:
  - Extracts surrounding context when patch application fails
  - Provides relevant code snippets to model for correction

- **src/utils/fs_tools.js** - File system utilities:
  - Context collection from workspace
  - Import graph analysis (dependency-based context expansion)
  - Delegates `toPosixPath` / `assertSafeRelPath` to `src/shared/path.js`

- **src/utils/simulation.js** - Simulation mode for CI/testing:
  - `SIMULATION_ENV` — environment variable names for mock responses
  - `readMockTextFromEnv` / `readMockJsonFromEnv` — read mock responses from files
  - Supports single file and sequential list modes for replaying recorded API calls

- **src/prompt/** - Modular prompt builder (replaces inline prompt strings):
  - `index.js` - Main entry: `buildPrompt()`, `buildSystemPrompt()`, `buildUserPrompt()`, `buildCorrectionPrompt()`
  - `identity.js` - Model identity definition
  - `system_rules.js` - Security constraints, execution boundaries, failure behavior, engineering standards
  - `operation_guidelines.js` - SEARCH/REPLACE vs file operations (MKDIR/MV/RM) guidelines
  - `output_discipline.js` - Output format and validation standards
  - `feedback.js` - Feedback history module for retry guidance
  - `plan.js` - Planning and replanning prompts for task decomposition

### Key Design Patterns

1. **Hybrid Model Routing**: Based on task difficulty score:
   - Low (<35): Ollama only
   - Medium (35-70): Ollama generate + Claude review
   - High (>70): Claude generate + review

2. **DAG-based Long Planning**: Complex tasks are decomposed into subtasks with dependencies. Checkpoints after each subtask enable safe rollback and retry.

3. **Import Graph Context Expansion**: Automatically includes related files based on import dependencies to provide richer context to the AI model.

4. **Native File Operations**: File system operations (`MKDIR`, `MV`, `RM`) are handled natively, avoiding the common issue of models creating files instead of directories. SEARCH/REPLACE is used for content editing.

5. **Modular Prompt Architecture**: Prompts are built from composable modules in `src/prompt/` rather than inline strings, enabling better organization, reuse, and testing of prompt components.

6. **Simulation-First CI Support**: All external model calls can be simulated via environment variables pointing to response files, enabling full E2E testing without live API calls.

### Environment Variables for Simulation

- `AGENT_BRIDGE_RESPONSE_FILE(S)` - Model response simulation
- `AGENT_BRIDGE_REVIEW_RESPONSE_FILE(S)` - Review response simulation
- `AGENT_BRIDGE_PLAN_RESPONSE_FILE(S)` - Planning response simulation
- `AGENT_BRIDGE_REPLAN_RESPONSE_FILE(S)` - Re-planning response simulation

### File Locations

- `config.json` - System configuration (model endpoints, thresholds, context limits)
- `tasks/task.json` - Input task queue (set status: "queued" to trigger)
- `tasks/result.json` - Output task result with execution trace and plan tree
- `src/core/memory.json` - Persistent task memory
- `bridge.log` - System log
- `workspace/` - Target workspace where code changes are applied

### Workflow

1. Poll `tasks/task.json` for queued tasks
2. Load configuration, initialize git repository
3. Analyze task difficulty, create DAG plan
4. For each ready subtask:
   - Collect context (expand via import graph)
   - Call appropriate model to generate code changes
   - Apply changes to workspace
   - Verify syntax and semantics
   - Create git checkpoint
5. On failure: rollback to last good checkpoint and replan
6. After all subtasks complete: squash all checkpoints into single commit
7. Write result to `tasks/result.json`

### Configuration Key Sections

- `openai` - Ollama configuration (provider, model, base URL)
- `anthropic` - Claude CLI configuration (enabled, timeout)
- `routing.thresholds` - Difficulty thresholds for model routing
- `routing.semantic_verify` - Enable semantic review by Claude
- `context_limits` - Context size constraints (max files, max bytes)
- `git` - Git user configuration for commits

### Execution Trace

- See `EXECUTION_TRACE_GUIDE.md` for how to view full execution information
- Key files: `tasks/task.json` (input), `tasks/result.json` (output), `bridge.log` (system events), `claude.log` (Claude CLI output), `tasks/raw/` (raw model responses)
