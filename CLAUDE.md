# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

### Build/Run
- `npm start` - Start the Agent Bridge main controller (polls for tasks in `tasks/task.json`)

### Test
- `npm test` - Run all tests using Node.js built-in test runner
- `node --test test/<name>.test.js` - Run a single test file

### Lint
No formal linting configured. Use standard JavaScript style conventions.

## Code Architecture

Agent Bridge is a hybrid AI code generation system that automatically converts natural language instructions into working code changes. It uses mixed model orchestration (local Ollama + Claude Code CLI) and supports long-range planning with DAG task decomposition.

### Core Modules

- **bridge/main.js** - Main controller. Implements the main event loop, task polling, orchestrates the end-to-end workflow: initialization → planning → model execution → verification → git checkpointing → final squash commit.

- **bridge/planner.js** - Task analysis and DAG planning. Key responsibilities:
  - Task difficulty assessment (scores 0-100)
  - Decomposes complex tasks into subtasks with dependency DAG
  - State management and replanning from failures
  - Validation of plan tree structure

- **bridge/adapter.js** - Multi-model adapter. Supports:
  - Ollama (local deepseek-coder) for fast code generation
  - Claude Code CLI for high-complexity tasks and semantic review
  - Response simulation via environment variables for CI/offline testing

- **bridge/verifier.js** - Multi-layer code verification:
  - Syntax checking (`node --check` for JS, JSON validation)
  - Path safety validation (prevents directory traversal)
  - Semantic review (Claude-powered code quality analysis)

- **bridge/git_manager.js** - Git operations with safety mechanisms:
  - Automatic repository initialization
  - Checkpoint commits per subtask (supports rollback on failure)
  - Squash and merge all checkpoints into a single final commit
  - SEARCH/REPLACE based patch application

- **bridge/fs_tools.js** - File system utilities:
  - Context collection from workspace
  - Import graph analysis (dependency-based context expansion)
  - Path safety validation

- **bridge/tools/** - Modular tool registry:
  - `index.js` - Tool registration and management
  - `ast_parser.js` - AST analysis (placeholder for future expansion)

### Key Design Patterns

1. **Hybrid Model Routing**: Based on task difficulty score:
   - Low (<35): Ollama only
   - Medium (35-70): Ollama generate + Claude review
   - High (>70): Claude generate + review

2. **DAG-based Long Planning**: Complex tasks are decomposed into subtasks with dependencies. Checkpoints after each subtask enable safe rollback and retry.

3. **Import Graph Context Expansion**: Automatically includes related files based on import dependencies to provide richer context to the AI model.

4. **Simulation-First CI Support**: All external model calls can be simulated via environment variables pointing to response files, enabling full E2E testing without live API calls.

### Environment Variables for Simulation

- `AGENT_BRIDGE_RESPONSE_FILE(S)` - Model response simulation
- `AGENT_BRIDGE_REVIEW_RESPONSE_FILE(S)` - Review response simulation
- `AGENT_BRIDGE_PLAN_RESPONSE_FILE(S)` - Planning response simulation
- `AGENT_BRIDGE_REPLAN_RESPONSE_FILE(S)` - Re-planning response simulation

### File Locations

- `config.json` - System configuration (model endpoints, thresholds, context limits)
- `tasks/task.json` - Input task queue (set status: "queued" to trigger)
- `tasks/result.json` - Output task result with execution trace and plan tree
- `bridge/memory.json` - Persistent task memory
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

### Recent Improvements (Apr 3, 2026)

#### Claude CLI JSON Output Robustness Fix:
- **Added fallback parsing for Claude CLI output**: When the model ignores JSON schema requirements and outputs ```sr blocks directly instead of wrapping in the `sr` JSON field, the system now automatically falls back to extracting ```sr blocks directly from the raw output. This resolves the common failure mode "Claude JSON missing non-empty sr string" that occurred when the model didn't follow JSON schema instructions.
- **Improved resliency**: Large language models often ignore JSON schema formatting requirements. This fix makes the system much more robust - if the model outputs valid ```sr blocks in any format, it will be accepted and parsed correctly.

### Recent Improvements (Mar 31, 2026)

#### Beijing Time Timestamps:
- All timestamps in logs (`bridge.log`, `claude.log`) and task metadata now use Beijing time (UTC+8) instead of UTC

#### Token Usage Reduction:
- **Planning stage context optimization**: Global context for high-difficulty planning is now optimized to ~4000 tokens, reducing Claude token usage by 60-80% in planning
- **Dynamic context expansion**: Adjust max expanded related files based on difficulty:
  - low difficulty: max 8 files
  - medium difficulty: max 15 files
  - high difficulty: max 20 files (unchanged)
- **Default max_files reduced**: from 60 to 30 by default, further reducing unnecessary context

#### Native File Operation Support (New):
- Added dedicated file system operations in addition to SEARCH/REPLACE content editing:
- ````op
  MKDIR: directory/path
  ```` - Creates a directory natively
- ````op
  MV: source/file -> target/file
  ```` - Moves/renames a file natively
- ````op
  RM: path/to/file
  ```` - Removes a file natively
- This eliminates the core problem where models would create a file named `lib` instead of directory `lib/`
- File operations are handled by native Node.js fs operations, which is faster and more reliable
- SEARCH/REPLACE is still used for content editing, which is what it's good at

#### Usability Fixes:
- **Added directory creation guidance to prompt**: Explicit instruction: *"IMPORTANT: You do NOT need to explicitly create directories. When creating a file like `src/utils.js`, the system automatically creates the `src` directory for you. DO NOT create a file named `src` or `src/` - just create `src/utils.js` directly and the directory will be created automatically."* Model no longer tries to create a file named `src` that conflicts with the directory.
- **Added file deletion guidance to prompt**: Clear instruction on how to delete files using SEARCH/REPLACE: *"To delete an existing file: you MUST set SEARCH to the **exact actual content** of the existing file, and set REPLACE to an completely empty string (no content at all)."*
- **Improved feedback logging**: Semantic review feedback is now logged to `bridge.log` for easier debugging
- **Guaranteed feedback delivery**: Semantic review feedback is correctly passed to next generation attempt

### Execution Trace Documentation:
- See `EXECUTION_TRACE_GUIDE.md` - step-by-step guide on how to view full execution information
