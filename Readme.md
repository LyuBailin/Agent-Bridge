# Agent Bridge

## 1. 项目概述

### 项目定位

Agent Bridge 是一个混合式 AI 代码生成系统（Hybrid AI Code Generation System）。它将自然语言指令自动转换为可工作的代码变更，通过混合模型编排（本地 Ollama + Claude Code CLI）和有向无环图（DAG）任务分解实现自动化代码开发。

### 核心目标

- **自然语言驱动的代码生成**：通过自然语言指令触发完整的代码变更流程
- **混合模型智能路由**：根据任务难度自动选择本地轻量模型（Ollama）或远程大模型（Claude CLI）
- **安全可靠的代码应用**：通过 Git 检查点机制确保每一步操作可回滚
- **自动化任务规划与执行**：复杂任务自动分解为依赖拓扑排序的子任务 DAG

### 适用场景

- 将代码修改需求通过 `tasks/task.json` 描述，由系统自动完成代码编写与提交
- 批量代码重构与迁移（通过子任务 DAG 实现增量执行与回滚）
- 需要语法检查 + 语义校验双重验证的代码变更流程
- CI/CD 环境中的自动化代码生成（支持完整的模拟/录制回放能力）

### 整体价值

相比单一模型调用方案，Agent Bridge 通过 DAG 规划层将复杂任务拆解为可管理的子任务，通过检查点机制保证执行安全性，通过多层验证（语法 + 语义）保证代码质量，通过模拟环境支持离线 CI 测试。

---

## 2. 系统架构

### 整体架构图（文字描述）

```
┌─────────────────────────────────────────────────────────────────┐
│                         任务输入层                               │
│                   tasks/task.json (status: "queued")             │
└─────────────────────────────┬───────────────────────────────────┘
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                        核心编排层                                 │
│  ┌──────────────┐  ┌───────────────┐  ┌───────────────────────┐  │
│  │  polling.js  │→│ workflow.js   │→│  planner.js           │  │
│  │  任务轮询     │  │ 执行管线      │  │  DAG 规划/重规划       │  │
│  └──────────────┘  └───────┬───────┘  └───────────────────────┘  │
│                           │                                      │
│  ┌────────────────────────▼──────────────────────────────────┐   │
│  │              适配器层 adapter/                             │   │
│  │  ┌────────────┐ ┌─────────────┐ ┌──────────────────────┐  │   │
│  │  │ validator  │ │   parser    │ │  schema / hooks      │  │   │
│  │  │ 操作验证   │ │  响应解析   │ │  工具定义/钩子系统    │  │   │
│  │  └────────────┘ └─────────────┘ └──────────────────────┘  │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────┬───────────────────────────────────┘
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                        模型供给层                                 │
│  ┌────────────────┐  ┌────────────────┐  ┌──────────────────┐    │
│  │  ollama.js     │  │  claude_cli.js │  │  openai.js       │    │
│  │  qwen2.5-coder │  │  MiniMax-M2.7   │  │  (stub)          │    │
│  │  本地快速生成  │  │  规划/校验     │  │                  │    │
│  └────────────────┘  └────────────────┘  └──────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                       验证与 Git 层                              │
│  ┌──────────────────────┐  ┌────────────────────────────────┐   │
│  │   verifier.js         │  │   git_manager.js               │   │
│  │ 语法/语义校验         │  │ 检查点/回滚/压缩提交            │   │
│  └──────────────────────┘  └────────────────────────────────┘   │
└─────────────────────────────┬───────────────────────────────────┘
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                        工作区层                                   │
│                     workspace/ (git 工作目录)                     │
└─────────────────────────────────────────────────────────────────┘
```

### 模块划分

| 模块 | 职责 | 关键文件 |
|---|---|---|
| **任务轮询** | 监控 `tasks/task.json`，检测 `queued` 状态触发执行 | `polling.js` |
| **工作流编排** | 驱动 generate → parse → apply → verify → commit 全流程 | `workflow.js` |
| **任务规划** | 难度评估、DAG 分解、重规划、拓扑排序 | `planner.js` |
| **适配器** | 提供统一的模型调用接口 + 响应解析 + 操作验证 | `adapter/index.js` |
| **验证器** | 语法检查（`node --check`）、路径安全、语义审查 | `verifier.js` |
| **Git 管理** | 检查点提交、回滚、最终压缩提交 | `git_manager.js` |
| **工具钩子** | 工具级预验证/后置日志/风险评估 | `adapter/hooks.js` |
| **风险分类** | 并行评估工具调用的风险等级（LOW/MEDIUM/HIGH/CRITICAL） | `risk_classifier.js` |
| **查询循环** | 状态机驱动的 Agent 会话管理（用于 agentic 场景） | `query_loop.js` |
| **提示构建** | 模块化提示词工程（身份/规则/操作指南/角色） | `prompt/` |
| **工具集** | SEARCH/REPLACE、MKDIR、MV、RM、TOUCH 五种操作 | `adapter/schema.js` |

### 核心流程

**单子任务执行管线**：
1. **Generate**：根据难度路由到 Ollama（低/中）或 Claude CLI（高），生成代码变更
2. **Parse**：解析原始输出（支持 `tool_calls` JSON 格式或 `sr`/`op` 文本块格式）
3. **Pre-validate**：应用前验证（SEARCH 存在性、路径安全、重复操作检测）
4. **Apply**：通过 Git patch 机制应用变更（`handleEdit`/`handleMkdir`/`handleRm`/`handleMv`/`handleTouch`）
5. **Verify**：语法检查（JS 文件 `node --check`、JSON 文件 `JSON.parse`）
6. **Semantic Verify**（可选）：Claude CLI 语义审查
7. **Commit Checkpoint**：为该子任务创建 Git 检查点提交

**长任务 DAG 执行**：
- 通过 `planner.js` 分解为带依赖的子任务 DAG
- 按拓扑顺序执行每个 `ready` 状态的子任务
- 失败后触发重规划（replan），保留已完成子任务，重写失败及下游节点
- 全部完成后将所有检查点压缩为一次最终提交

### 技术栈

- **运行时**：Node.js（原生测试框架 `node --test`）
- **本地模型**：Ollama（qwen2.5-coder:14b）
- **远程模型**：Claude CLI（MiniMax-M2.7）
- **版本控制**：Git（Node.js `simple-git` 库或原生 git 命令）
- **配置格式**：JSON（`config.json`）
- **入口命令**：`npm start` → `node src/core/main.js`

---

## 3. 目录结构说明

```
agent-bridge/
├── config.json                 # 系统配置（模型路由、阈值、上下文限制、Git 配置）
├── package.json                 # 项目元数据与脚本
├── bridge.log                   # 系统运行日志
├── claude.log                   # Claude CLI 原始输出日志
├── ollama.log                   # Ollama 调用日志
│
├── tasks/
│   ├── task.json                # 输入任务（status: "queued" 触发执行）
│   ├── result.json              # 输出结果（执行 trace、plan tree、最终状态）
│   └── raw/                     # 原始模型输出（每个子任务每次尝试的原始文本）
│
├── workspace/                   # Git 工作目录，代码变更应用到此处
│
├── src/
│   ├── core/                    # 核心编排与执行引擎
│   │   ├── main.js              # 入口文件（直接运行或 require）
│   │   ├── main_index.js        # 环境初始化、主循环、任务状态管理
│   │   ├── polling.js           # 任务轮询循环 + 命令行参数解析（--once, --root）
│   │   ├── workflow.js          # 执行管线（generate→parse→apply→verify→commit）
│   │   ├── planner.js           # DAG 规划（分解、依赖、拓扑序、重规划）
│   │   ├── verifier.js          # 语法/路径/语义多层验证
│   │   ├── git_manager.js       # Git 操作（检查点、回滚、压缩提交）
│   │   ├── query_loop.js        # 状态机（GENERATING/TOOL_EXECUTION/COMPACTING/...）
│   │   ├── risk_classifier.js   # 工具风险评估
│   │   ├── synthetic_results.js # 中断恢复（生成缺失的工具结果）
│   │   └── adapter/             # 适配器层
│   │       ├── index.js         # createProvider 工厂 + buildPrompt
│   │       ├── parser.js        # sr/op 块解析 + JSON tool_calls 解析
│   │       ├── validator.js     # 操作类型检测 + changeset 验证
│   │       ├── schema.js        # TOOLS_SCHEMA（search_replace/mkdir/mv/rm/touch）
│   │       ├── hooks.js         # 工具钩子系统（pre/post + 保护路径）
│   │       ├── tool_factory.js  # 工具实例工厂
│   │       └── providers/
│   │           ├── ollama.js     # Ollama API 客户端（/api/chat 或 /api/generate）
│   │           ├── openai.js    # OpenAI Chat Completions 客户端（stub）
│   │           └── claude_cli.js # Claude CLI JSON 模式包装器
│   │
│   ├── prompt/                  # 模块化提示词工程
│   │   ├── index.js             # buildPrompt / buildCorrectionPrompt 入口
│   │   ├── plan.js              # 规划和重规划提示词构建
│   │   ├── cache_strategy.js    # 静态/动态分段（缓存优化）
│   │   ├── identity.js           # 模型身份定义
│   │   ├── system_rules.js      # 安全约束与执行边界
│   │   ├── operation_guidelines.js # SEARCH/REPLACE vs MKDIR/MV/RM 规范
│   │   ├── output_discipline.js  # 输出格式与验证标准
│   │   ├── feedback.js          # 反馈历史模块
│   │   ├── skill_injector.js    # 技能注入
│   │   ├── registry.js          # 提示词注册表
│   │   ├── role_factory.js      # 多角色提示词工厂
│   │   ├── roles/
│   │   │   ├── implementation.js # 默认实现角色
│   │   │   ├── planning.js       # 规划角色
│   │   │   ├── verification.js  # 验证角色
│   │   │   └── readonly_explore.js # 只读探索角色
│   │   └── sections/            # 动态提示片段
│   │       ├── action_sequence.js     # 先读后写强制
│   │       ├── engineering_donts.js   # 反过度工程化规则
│   │       ├── verification_skepticism.js # 对抗性验证立场
│   │       ├── coordinator_synthesis.js # 协调综合要求
│   │       ├── readonly_boundaries.js  # 只读边界限制
│   │       ├── memory_indexing.js      # 记忆系统规范
│   │       ├── resume_recovery.js      # Token 限制恢复协议
│   │       └── bash_constraints.js    # Bash 参与规则
│   │
│   ├── shared/                   # 跨模块共享工具
│   │   ├── path.js              # assertSafeRelPath / toPosixPath
│   │   ├── time.js              # nowIso（北京时区）
│   │   └── constants.js         # EMPTY_SEARCH_PATTERNS
│   │
│   └── utils/                    # 通用工具
│       ├── fs_tools.js          # 上下文收集 / 导入图分析
│       ├── simulation.js        # 模拟响应系统（环境变量驱动）
│       └── snippet_feedback.js  # SEARCH/REPLACE 失败时的代码片段反馈
│
├── test/
│   ├── unit/                    # 单元测试（node --test）
│   │   ├── adapter/             # 适配器单元测试（parser/validator/schema/providers）
│   │   ├── core/               # 核心模块测试（workflow/planner/verifier/git_manager/...）
│   │   ├── prompt/             # 提示词模块测试
│   │   ├── shared/             # 共享工具测试
│   │   └── utils/              # 工具模块测试
│   ├── e2e/
│   │   └── e2e.test.js         # 端到端集成测试
│   ├── helpers/
│   │   ├── mock_provider.js   # Mock provider 工厂（支持轮询）
│   │   └── mock_fs.js         # 内存文件系统 mock
│   └── scripts/
│       ├── debug_correction.js  # 自修正调试脚本
│       └── test_claude_connectivity.js # Claude CLI 连通性测试
│
├── docs/                        # 模块级文档
│   ├── main-module.md
│   ├── workflow-module.md
│   ├── planner-module.md
│   ├── verifier-module.md
│   ├── git-manager-module.md
│   ├── fs-tools-module.md
│   ├── adapter-module.md
│   ├── prompt-module.md
│   └── RUNNING_FLOW_OVERVIEW.md
│
└── cc-self-iteration/          # 自我迭代记录（开发历史）
    └── iteration-N/
```

---

## 4. 核心功能

### 4.1 任务轮询与触发

- **文件**：`src/core/polling.js`
- **功能**：以 `poll_interval_ms`（默认 1000ms）轮询 `tasks/task.json`，检测 `status: "queued"` 的任务并触发执行
- **入口**：`npm start` → `pollLoop(env, deps)`
- **命令行参数**：`--once`（单次执行后退出）、`--root`（指定根目录）

### 4.2 难度评估与模型路由

- **文件**：`src/core/planner.js`
- **功能**：
  - `analyzeDifficulty(instruction)` — 关键词匹配判定低/中/高
  - `evaluateComplexity(instruction, contextStat, thresholds)` — 0-100 复杂度评分
  - 复杂度阈值（`config.json`）：medium ≥ 35，high ≥ 70
- **路由规则**：
  - 低难度（`< 35`）：仅 Ollama 生成
  - 中难度（35-70）：Ollama 生成 + 可选 Claude 语义审查
  - 高难度（`≥ 70`）：Claude CLI 生成 + Claude CLI 审查
- **配置项**：`routing.thresholds` / `routing.semantic_verify`

### 4.3 DAG 任务规划与分解

- **文件**：`src/core/planner.js`
- **功能**：
  - `decomposeTask()` — 调用 Claude 将复杂任务分解为带依赖的子任务 DAG
  - `validatePlanTree()` — Kahn 算法检测环，验证依赖链
  - `enforceSequentialDependencies()` — 强制同文件操作的顺序依赖
  - `getNextExecutableSubtask()` — 返回所有依赖已满足的下一个子任务
  - `replanFromFailure()` — 失败时保留已完成节点，重写失败及下游节点
- **Plan Tree Schema**：`schema_version: 1`，含 `nodes{}`（子任务详情）、`order[]`（执行序列）、`limits`（子任务数上限、重规划次数上限）

### 4.4 多模型适配器与响应解析

- **文件**：`src/core/adapter/`
- **适配器工厂**：`createProvider("ollama"|"openai"|"claude_cli")`
- **响应格式支持**：
  - JSON `tool_calls` 格式：`{tool_calls: [{function: {name, arguments}}]}`
  - 文本 sr 块：`` ```sr `` + `FILE:` / `SEARCH:<<<` / `>>>` / `REPLACE:<<<` / `>>>`
  - 文本 op 块：`` ```op `` + `MKDIR:` / `MV:` / `RM:` / `TOUCH:`
- **解析入口**：`parseResponse(rawText, fsTools, workspaceDir)` → `changes[]`
- **预验证**：`validateOperationSchema()` 检测操作类型（content-only / fileops-only / mixed）

### 4.5 工具执行与安全治理

- **文件**：`src/core/adapter/hooks.js` / `src/core/risk_classifier.js`
- **保护路径**：`.git`、`node_modules`、`config.json`、`package.json`、`package-lock.json` 禁止修改
- **风险级别**：LOW / MEDIUM / HIGH / CRITICAL
- **关键模式拦截**：
  - `rm -rf`、`$(...)`、`eval|exec` → CRITICAL/HIGH
  - 空路径删除、遍历路径 `node_modules` / `.git` → HIGH
- **预钩子**：执行前验证（SEARCH 非空、文件存在、路径安全、受保护路径检查）
- **后钩子**：执行后日志记录

### 4.6 代码验证

- **文件**：`src/core/verifier.js`
- **语法验证**：
  - `.js` / `.cjs` / `.mjs` → `node --check` 语法检查
  - `.json` → `JSON.parse` 有效性
  - `.yml` / `.yaml` → 文件存在且非空
- **路径安全**：防止目录遍历攻击
- **语义审查**：调用 Claude CLI 生成结构化 JSON 审查意见（`{ok, issues[], feedback_for_generator}`）
- **可疑截断检测**：大文件变为小文件且无明确删除意图 → 报错

### 4.7 Git 检查点与回滚

- **文件**：`src/core/git_manager.js`
- **检查点流程**：
  1. 子任务开始前 `createCheckpointMarker()` 记录当前 HEAD SHA
  2. `safeApplyPatch()` 应用变更；失败则 `rollbackToSha()` 恢复
  3. 子任务成功后 `commitCheckpoint()` 创建独立提交
  4. 全部完成后 `squashAndCommit()` 将所有检查点压缩为一次提交
- **PATCH 应用策略**：`handleEdit`（精确 SEARCH/REPLACE）、`handleMkdir`（含 .gitkeep）、`handleRm`、`handleMv`、`handleTouch`
- **SEARCH 安全**：必须精确匹配一次；不匹配或多匹配均报错并提供上下文片段

### 4.8 自修正循环

- **文件**：`src/core/workflow.js`
- **触发条件**：解析失败或应用失败
- **修正流程**：构建 `buildCorrectionPrompt()`（含错误信息 + 文件片段反馈），重新调用生成模型
- **最大重试次数**：3 次（`config.selfCorrection.enabled` 开关）

### 4.9 上下文优化与导入图扩展

- **文件**：`src/utils/fs_tools.js`
- **功能**：
  - `collectContext()` — 按 `include_exts` 收集工作区相关文件
  - `extractImportGraph()` — 分析 import/require 依赖图，优先扩展相关文件
  - `optimizeContext()` — token 预算感知裁剪，优先 likely_paths
- **配置项**：`context_limits.max_file_bytes`（默认 32KB）、`context_limits.max_files`（默认 60）

### 4.10 模拟环境与 CI 支持

- **文件**：`src/utils/simulation.js`
- **环境变量**：
  - `AGENT_BRIDGE_RESPONSE_FILE` — 单个模拟响应文件
  - `AGENT_BRIDGE_RESPONSE_FILES` — 逗号分隔的顺序响应文件列表
  - `AGENT_BRIDGE_REVIEW_RESPONSE_FILE(S)` — 审查响应模拟
  - `AGENT_BRIDGE_PLAN_RESPONSE_FILE(S)` — 规划响应模拟
  - `AGENT_BRIDGE_REPLAN_RESPONSE_FILE(S)` — 重规划响应模拟
- **用途**：无需真实 API 调用即可完成端到端测试

---

## 5. 核心设计原则

### 编码规范

- Node.js 原生模块（`node:fs/promises`、`node:path`）
- 使用 `node --test` 原生测试框架
- 异步优先（async/await 模式）
- 安全的 JSON 文件读写（`safeReadJson`/`safeWriteJson` 含 ENOENT 忽略）

### 架构思想

- **适配器模式**：通过 `createProvider` 工厂统一封装 Ollama / OpenAI / Claude CLI，调用方透明切换
- **策略模式**：Git 操作通过 `handleEdit`/`handleMkdir` 等策略函数分发
- **状态机模式**：`query_loop.js` 中的 `QueryEngine` 以状态机管理 Agent 会话
- **预/后钩子链**：工具执行前后的验证、日志、风险评估链式执行

### 扩展性设计

- **新模型接入**：在 `providers/` 新增文件，实现 `generateCode(prompt)` 接口
- **新工具添加**：在 `adapter/schema.js` 的 `TOOLS_SCHEMA` 添加定义即可
- **提示词模块化**：`prompt/` 下的各 section 可独立启用/禁用，支持角色化扩展
- **重规划策略**：`replanFromFailure` 支持自定义重规划策略

### 安全性/健壮性考虑

- **路径遍历防护**：`assertSafeRelPath` 确保所有路径为相对路径且不含 `..`
- **受保护路径拦截**：`.git`、`node_modules` 等关键路径禁止工具直接操作
- **原子性回滚**：子任务失败时自动回滚到上一个检查点，工作区不残留中间状态
- **SEARCH 精确匹配**：避免误匹配，变更前验证 SEARCH 块在文件中仅出现一次
- **批量操作风险控制**：`rm`/`mv` 失败时丢弃整批操作，避免状态不一致

---

## 6. 执行流程

### 启动流程

```
npm start
  └─ node src/core/main.js
       └─ require.main === module → main()
            ├─ loadDotEnv()           # 加载 .env 文件到 process.env
            ├─ initEnvironment()      # 初始化 workspace/git、读取配置、建立内存
            └─ pollLoop()             # 进入任务轮询
```

### 单次任务执行流程

```
polling.js: 检测 tasks/task.json 的 status === "queued"
       │
       ▼
main_index.js: executeWorkflow(task)
       │
       ├─ planner.js: analyzeDifficulty() → 难度/复杂度评分
       │
       ├─ planner.js: decomposeTask() → 构建 Plan Tree (DAG)
       │    （如为简单任务则 buildSingleNodePlanTree 直接生成单节点树）
       │
       ├─ workflow.js: orchestrateLongTask(env, task)
       │    │
       │    ├─ 获取下一个可执行的子任务 (getNextExecutableSubtask)
       │    │
       │    ├─ buildSubtaskContext() → 收集上下文（文件内容 + 导入依赖）
       │    │
       │    ├─ 调用适配器 generateCode() → 原始模型输出
       │    │    · 低难度 → ollama.js (qwen2.5-coder:14b)
       │    │    · 高难度 → claude_cli.js (MiniMax-M2.7)
       │    │
       │    ├─ adapter/parser.js: parseResponse() → 变更集合 changes[]
       │    │
       │    ├─ adapter/hooks.js: executePreHooks() → 预验证
       │    │
       │    ├─ git_manager.js: safeApplyPatch() → 应用变更
       │    │    · handleEdit (SEARCH/REPLACE)
       │    │    · handleMkdir / handleRm / handleMv / handleTouch
       │    │
       │    ├─ verifier.js: verifyAll() → 语法/路径检查
       │    │
       │    ├─ (可选) verifier.js: semanticVerify() → Claude 语义审查
       │    │
       │    ├─ git_manager.js: commitCheckpoint() → 创建检查点
       │    │
       │    └─ 如失败 → handleApplyFailure → 自修正循环 (最多3次)
       │         └─ 仍失败 → rollback + replan
       │
       ├─ git_manager.js: squashAndCommit() → 压缩所有检查点为最终提交
       │
       └─ main_index.js: writeResult() → 写入 tasks/result.json
```

### DAG 执行顺序保证

- `planner.js: validatePlanTree()` 使用 **Kahn 算法**检测循环
- `enforceSequentialDependencies()` 将同一文件的 `search_replace` 操作强制串行化（防止并发写冲突）
- `getNextExecutableSubtask()` 每次返回依赖全部满足的子任务

---

## 7. 关键技术点与亮点

### 7.1 混合模型智能路由

根据复杂度评分动态选择模型：低难度任务使用本地 Ollama（延迟低、无网络依赖），高难度任务使用 Claude CLI（强推理能力）。路由阈值完全可配置。

### 7.2 DAG 任务规划与拓扑执行

复杂任务自动分解为有向无环图，每个节点为独立子任务，支持依赖声明与并行执行检测。Kahn 算法保证无环，失败后仅重规划受影响节点而非全量重做。

### 7.3 检查点 + 压缩提交的双重安全保障

每个子任务执行前后均有 Git 状态记录：失败自动回滚到上一个稳定检查点；全部成功后通过 `git reset --soft` 将所有检查点合并为一次语义完整的提交。

### 7.4 多层验证体系

- **语法层**：`node --check`（JS）、`JSON.parse`（JSON）
- **结构层**：`validateChangeSet` 检测重复编辑/冲突操作
- **语义层**：Claude CLI 驱动的代码质量审查
- **路径层**：遍历攻击防护、受保护路径拦截

### 7.5 工具执行钩子系统

统一的 pre/post 钩子链：预验证（SEARCH 非空、路径安全、受保护路径）→ 执行 → 后置日志。钩子可注册、可清除，支持自定义扩展。

### 7.6 模拟驱动的 CI 测试

所有外部模型调用均支持通过环境变量注入模拟响应文件，实现无需真实 API 的端到端测试，支持顺序回放和索引控制。

### 7.7 模块化提示词工程

提示词按职责拆分为独立文件（identity / system_rules / operation_guidelines / output_discipline 等），支持静态/动态分段优化 API 缓存，支持角色化（implementation / planning / verification / readonly_explore）。

### 7.8 导入图感知的上下文扩展

`fs_tools.js` 通过分析 import/require 依赖图自动扩展相关文件上下文，而非机械地包含所有文件，提升上下文质量并控制 token 消耗。

---

## 8. 适用人群与使用方式

### 适用人群

- **DevOps / 平台工程师**：构建自动化代码变更流水线
- **AI 工程化研究者**：研究混合模型路由、DAG 规划、自修正机制
- **测试工程师**：利用模拟系统进行离线自动化代码验证
- **中大型代码库维护者**：通过自然语言指令批量处理代码重构

### 使用方式

#### 快速开始

```bash
# 安装依赖
npm install

# 配置 .env（Ollama API、Claude CLI 等）
cp .env.example .env

# 启动任务轮询
npm start

# 或单次执行（不驻留）
node src/core/main.js --once
```

#### 提交任务

在 `tasks/task.json` 中写入：

```json
{
  "schema_version": 1,
  "task_id": "my-task-001",
  "instruction": "在 src/utils/auth.js 中添加 JWT 过期验证逻辑",
  "status": "queued"
}
```

系统自动检测 `queued` 状态，启动执行管线。

#### 运行测试

```bash
npm test                  # 单元 + e2e 全部测试
node --test test/unit/    # 仅单元测试
node --test test/e2e/     # 仅端到端测试
```

#### 模拟 API 响应（CI）

```bash
AGENT_BRIDGE_RESPONSE_FILE=./test/fixtures/mock-response.txt npm start
```

---

## 配置参考

`config.json` 核心配置项：

| 配置项 | 说明 | 默认值 |
|---|---|---|
| `poll_interval_ms` | 任务轮询间隔 | 1000ms |
| `openai.model` | OpenAI 兼容模型 | qwen3.5-flash |
| `ollama.model` | Ollama 本地模型 | qwen2.5-coder:14b |
| `ollama.base_url` | Ollama API 地址 | http://localhost:11434 |
| `anthropic.enabled` | 启用 Claude CLI | true |
| `anthropic.timeout_ms` | Claude CLI 超时 | 300000ms |
| `routing.thresholds.medium` | 中难度阈值 | 35 |
| `routing.thresholds.high` | 高难度阈值 | 70 |
| `routing.semantic_verify` | 启用语义审查 | true |
| `context_limits.max_file_bytes` | 单文件最大上下文 | 32768 bytes |
| `context_limits.max_files` | 最大文件数 | 60 |
| `git.default_branch` | 默认分支 | main |
| `selfCorrection.enabled` | 启用自修正 | true |
