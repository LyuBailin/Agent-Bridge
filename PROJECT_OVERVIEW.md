# Agent Bridge 项目技术文档

## 项目概述

Agent Bridge 是一个高度集成的智能代码生成与应用系统，采用混合模型编排架构，能够根据用户指令自动生成、验证和应用代码变更，并通过 Git 版本控制系统进行管理。该系统实现了从自然语言指令到代码实现的完整闭环，具有智能重试、语义审查、上下文优化和长时规划等高级功能。

## 核心功能

- **多模型混合编排**：基于任务复杂度自动选择和组合 Ollama 与 Claude Code CLI 模型
- **智能上下文管理**：根据模型能力自动裁剪和优化上下文信息
- **代码验证与语义审查**：结合语法检查和 AI 语义分析确保代码质量
- **安全变更应用**：通过 Git 操作确保变更的可追踪性和可回滚性
- **智能重试机制**：当生成的代码存在问题时，自动反馈并重新生成
- **任务难度评估**：基于指令内容和上下文自动评估任务复杂度
- **CI/离线环境支持**：提供完整的模拟功能，支持持续集成和离线测试
- **长时规划与多步骤执行**：基于 DAG 的任务分解和状态管理
- **Checkpoint 机制**：为每个子任务创建检查点，支持失败回滚和重新规划
- **导入图上下文扩展**：基于文件导入关系自动扩展相关文件上下文
- **工具注册表**：模块化的工具管理架构，支持 AST 分析等高级功能

## 系统架构

```
agent_bridge/
├── bridge/              # 核心功能模块
│   ├── adapter.js       # 模型适配器（Ollama + Claude）
│   ├── fs_tools.js      # 文件系统工具（含导入图分析）
│   ├── git_manager.js   # Git 操作管理器（含 checkpoint/squash）
│   ├── main.js          # 主控制器（混合编排与长时规划）
│   ├── memory.json      # 任务记忆存储
│   ├── planner.js       # 任务分析与规划器（DAG 规划）
│   ├── verifier.js      # 代码验证器（含语义审查）
│   └── tools/           # 工具注册表
│       ├── index.js     # 工具注册管理
│       └── ast_parser.js # AST 分析工具
├── tasks/               # 任务相关
│   ├── task.json        # 任务配置
│   └── result.json      # 任务执行结果
├── test/                # 测试文件
│   ├── adapter.test.js  # 适配器测试
│   ├── e2e.test.js      # 端到端测试（含长时规划测试）
│   ├── git_manager.test.js # Git 管理器测试
│   ├── planner.test.js  # 规划器测试
│   └── verifier.test.js # 验证器测试
├── config.json          # 系统配置
└── package.json         # 项目信息
```

## 技术实现

### 1. 混合编排系统

Agent Bridge 采用基于任务复杂度的混合编排策略，根据任务难度自动选择最优模型组合：

- **低复杂度任务**：仅使用 Ollama (deepseek-coder:6.7b) 模型
- **中等复杂度任务**：使用 Ollama 生成代码，Claude 进行语义审查
- **高复杂度任务**：使用 Claude 生成代码并进行语义审查

这种混合策略充分利用了本地模型的响应速度和云端模型的语义理解能力，在性能和质量之间取得平衡。

### 2. 长时规划与多步骤执行

系统实现了基于 DAG (有向无环图) 的长时规划和多步骤执行机制：

- **任务分解**：将复杂任务分解为多个子任务，形成 DAG 结构
- **状态管理**：跟踪每个子任务的执行状态和依赖关系
- **Checkpoint 机制**：为每个子任务创建 Git 检查点，支持失败回滚
- **智能重试**：支持每个子任务的独立重试，失败时自动回滚并重新规划
- **最终合并**：所有子任务完成后，通过 `squashAndCommit` 合并为单个提交

### 3. 任务分析与规划

`planner.js` 模块实现了任务难度评估、DAG 规划和状态管理：

- **复杂度评估**：基于指令关键词和文件路径分析，将任务分为低、中、高三级复杂度
- **任务分解**：`decomposeTask` 函数将复杂任务分解为子任务 DAG
- **执行规划**：`getNextExecutableSubtask` 函数根据依赖关系选择下一个可执行子任务
- **状态更新**：`updatePlanState` 函数更新子任务执行状态
- **失败处理**：`replanFromFailure` 函数在失败时重新规划
- **计划验证**：`validatePlanTree` 函数验证 DAG 结构的有效性
- **模拟支持**：通过 `AGENT_BRIDGE_PLAN_RESPONSE_FILE(S)` 支持 CI/离线环境

### 4. 模型适配器

`adapter.js` 模块实现了多模型支持：

- **Ollama 集成**：支持本地运行的 deepseek-coder 模型，提供快速响应
- **Claude 集成**：通过 Claude Code CLI 提供高级语义理解和审查能力
- **失败反馈**：实现了失败信息的结构化拼接，支持智能重试
- **模拟功能**：提供完整的响应模拟机制，支持 CI/离线测试

### 5. 代码验证与语义审查

`verifier.js` 模块实现了多层次代码验证：

- **语法检查**：使用 `node --check` 验证 JavaScript 文件
- **格式验证**：验证 JSON 文件的格式正确性
- **安全校验**：检查路径安全和变更安全性
- **语义审查**：使用 Claude 进行代码语义分析，识别逻辑问题和最佳实践

### 6. Git 操作管理

`git_manager.js` 模块实现了安全的 Git 操作，包括 checkpoint 和 squash 机制：

- **仓库初始化**：自动初始化 Git 仓库并配置用户信息
- **快照管理**：创建基线快照，支持自动回滚
- **Checkpoint 提交**：`commitCheckpoint` 函数为子任务创建检查点
- **回滚操作**：`rollbackToSha` 函数支持回滚到指定检查点
- **最终合并**：`squashAndCommit` 函数将多个子任务提交合并为单个提交
- **安全应用**：实现基于 SEARCH/REPLACE 模式的安全代码应用

### 7. 文件系统工具

`fs_tools.js` 模块实现了文件系统操作和导入图分析：

- **上下文收集**：收集工作区文件结构和内容
- **导入图分析**：`extractImportGraph` 函数分析文件间的导入关系
- **上下文扩展**：`expandRelatedFiles` 函数基于导入关系扩展相关文件上下文
- **路径安全**：严格验证文件路径，防止越权访问

### 8. 工具注册表

`tools` 目录实现了模块化的工具管理架构：

- **工具注册**：`index.js` 实现工具的注册和管理
- **AST 分析**：`ast_parser.js` 提供 AST 分析功能，为代码理解提供支持

## 工作流程

1. **任务触发**：监控 `tasks/task.json` 中的任务状态变更
2. **环境初始化**：加载配置，初始化 Git 仓库
3. **任务分析**：评估任务复杂度，分解为子任务 DAG
4. **模型选择**：根据复杂度选择最优模型组合
5. **执行规划**：确定子任务执行顺序，创建初始检查点
6. **子任务执行**：
   - 选择下一个可执行子任务
   - 收集上下文（包括导入图扩展）
   - 调用 AI 模型生成代码
   - 解析并应用代码变更
   - 验证代码正确性
   - 创建子任务检查点
7. **失败处理**：如有错误，回滚到检查点并重新规划
8. **最终合并**：所有子任务完成后，合并为单个提交
9. **结果记录**：记录执行结果、执行轨迹和计划树

## 配置系统

系统采用分层配置架构，支持灵活的环境适配：

```json
{
  "paths": { "workspace": "workspace", "tasks": "tasks", "log": "bridge.log" },
  "poll_interval_ms": 1000,
  "openai": {
    "provider": "openai",
    "model": "qwen3.5-flash",
    "base_url": "https://api.openai-proxy.org/v1",
    "openai_api_key": "sk-2TM8euNlKv1K0UNdwEM4Nw4YS7L5UIQuphO2ZQ9lwGoAszZe"
  },
  "useOllama": false,
  "ollama": {
    "base_url": "http://localhost:11434",
    "model": "deepseek-coder:6.7b"
  },
  "anthropic": {
    "model": ""
  },
  "routing": {},
  "context_limits": {
    "max_file_bytes": 32768,
    "max_files": 60,
    "include_exts": ["js", "ts", "json", "md", "txt", "yml", "yaml", "toml"]
  },
  "git": { "default_branch": "main", "user_name": "agent_bridge", "user_email": "agent@local" }
}
```

## 结果记录系统

系统实现了详细的结果记录机制，包括：

### 任务执行结果 (`tasks/result.json`)

- `task_id`：任务唯一标识符
- `ok`：任务执行状态
- `changed`：是否产生代码变更
- `commit`：Git 提交哈希
- `final_commit`：最终合并后的提交哈希
- `summary`：执行摘要
- `error`：错误信息
- `raw_output_path`：原始模型输出路径
- `attempts`：尝试次数（向后兼容）
- `execution_trace`：执行轨迹，记录每个子任务的执行情况
- `plan_tree`：任务分解的 DAG 结构
- `errors`：详细错误信息列表
- `last_error_stage`：最后错误发生的阶段
- `difficulty`：任务难度评估
- `score`：复杂度评分
- `provider`：使用的模型提供商
- `started_at`：开始时间
- `finished_at`：结束时间

### 任务记忆 (`bridge/memory.json`)

- `status`：任务状态
- `final_status`：最终执行状态
- `attempts`：尝试次数
- `commit`：Git 提交哈希
- `final_commit`：最终合并后的提交哈希
- `error_summary`：错误摘要
- `diff_stat`：代码变更统计
- `difficulty`：任务难度
- `score`：复杂度评分
- `provider`：使用的模型提供商
- `execution_trace`：执行轨迹
- `plan_tree`：任务分解的 DAG 结构
- `finished_at`：结束时间

## 模拟系统

为支持 CI/离线环境，系统提供了完整的模拟功能：

### 生成模拟

- `AGENT_BRIDGE_RESPONSE_FILE`：指定单个响应文件
- `AGENT_BRIDGE_RESPONSE_FILES`：指定多个响应文件，逗号分隔
- `AGENT_BRIDGE_RESPONSE_FILES_IDX`：指定当前使用的响应文件索引

### 审查模拟

- `AGENT_BRIDGE_REVIEW_RESPONSE_FILE`：指定单个审查响应文件
- `AGENT_BRIDGE_REVIEW_RESPONSE_FILES`：指定多个审查响应文件，逗号分隔
- `AGENT_BRIDGE_REVIEW_RESPONSE_FILES_IDX`：指定当前使用的审查响应文件索引

### 规划模拟

- `AGENT_BRIDGE_PLAN_RESPONSE_FILE`：指定单个规划响应文件
- `AGENT_BRIDGE_PLAN_RESPONSE_FILES`：指定多个规划响应文件，逗号分隔
- `AGENT_BRIDGE_REPLAN_RESPONSE_FILE`：指定单个重新规划响应文件
- `AGENT_BRIDGE_REPLAN_RESPONSE_FILES`：指定多个重新规划响应文件，逗号分隔

## 安全机制

- **路径安全**：严格验证文件路径，禁止越权访问和 `.git` 目录修改
- **变更安全**：禁止文件删除操作，防止意外数据丢失
- **错误处理**：完善的错误捕获和回滚机制，确保系统稳定性
- **任务去重**：基于任务 ID 的去重机制，避免重复执行
- **语义审查**：通过 AI 语义分析识别潜在的安全问题
- **Checkpoint 机制**：支持失败回滚，确保系统在出错时能够恢复到稳定状态

## 性能优化

- **上下文裁剪**：根据模型能力自动裁剪上下文，提高生成效率
- **模型选择**：根据任务复杂度选择合适的模型，平衡速度和质量
- **并行处理**：优化文件操作和 Git 命令执行，提高系统响应速度
- **缓存机制**：缓存上下文信息和模型响应，减少重复计算
- **导入图分析**：基于文件依赖关系智能扩展上下文，提高生成质量
- **子任务并行**：支持无依赖子任务的并行执行，提高整体效率

## 扩展性设计

- **模型适配器**：模块化的模型适配架构，支持轻松集成新模型
- **验证插件**：可扩展的验证机制，支持添加自定义验证规则
- **配置系统**：分层配置架构，支持环境特定配置
- **任务系统**：灵活的任务定义格式，支持复杂任务描述
- **工具注册表**：模块化的工具管理架构，支持添加新工具
- **DAG 规划**：可扩展的任务分解和规划机制，支持复杂任务处理

## 应用场景

- **快速原型开发**：根据自然语言描述快速生成代码原型
- **代码维护与重构**：自动识别和修复代码问题
- **学习与教育**：生成示例代码和解释
- **CI/CD 集成**：自动化代码生成和验证流程
- **智能开发辅助**：作为开发工具链的智能助手
- **复杂任务处理**：通过长时规划和多步骤执行处理复杂开发任务
- **代码库理解**：通过导入图分析和上下文扩展理解大型代码库

## 技术栈

- **核心语言**：Node.js
- **版本控制**：Git
- **AI 模型**：Ollama (deepseek-coder:6.7b)、Claude Code CLI
- **文件系统**：Node.js fs/promises API
- **网络通信**：Fetch API
- **测试框架**：Node.js 内置测试模块
- **代码分析**：AST 解析（计划中）

## 部署与运行

1. **环境准备**：
   - Node.js 18+
   - Git
   - Ollama（运行 deepseek-coder:6.7b 模型）
   - Claude Code CLI（可选，用于语义审查）

2. **配置**：
   - 编辑 `config.json` 设置模型参数
   - 配置环境变量（如需要）

3. **运行**：
   ```bash
   npm start
   ```

4. **任务提交**：
   - 编辑 `tasks/task.json` 创建任务
   - 设置 `status` 为 "queued" 触发执行

## 监控与日志

- **日志文件**：`bridge.log` 记录系统运行状态
- **执行结果**：`tasks/result.json` 记录详细执行结果，包括执行轨迹和计划树
- **任务记忆**：`bridge/memory.json` 记录历史执行情况

## 总结

Agent Bridge 是一个高度智能的代码生成与应用系统，通过混合模型编排、智能上下文管理、长时规划和多层次验证机制，实现了从自然语言指令到高质量代码的自动转换。系统设计注重安全性、可靠性和扩展性，为开发人员提供了一个强大的智能辅助工具。

特别是在 Phase 4 中，Agent Bridge 引入了长时规划、DAG 任务分解、Checkpoint 机制和导入图分析等高级功能，大大提高了系统处理复杂任务的能力。它能够将复杂任务分解为可管理的子任务，通过状态管理和失败回滚确保执行可靠性，最终将所有变更合并为一个干净的提交。

随着 AI 模型能力的不断提升和系统功能的持续扩展，Agent Bridge 有望成为软件开发流程中的核心智能组件，为开发人员提供更强大的辅助能力，加速代码开发和维护过程。