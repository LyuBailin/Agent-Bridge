# 主流程模块 (main.js) 技术文档

## 模块概述

主流程模块是 Agent Bridge 系统的核心协调器，负责整个系统的初始化、任务轮询和工作流执行。它协调各个子模块完成从任务接收到执行完成的整个生命周期。

## 核心功能

### 1. 环境初始化

**功能说明**：初始化系统运行环境，包括配置加载、目录结构创建和 Git 仓库初始化。

**实现细节**：
- 加载 `.env` 文件中的环境变量
- 读取和合并 `config.json` 配置文件
- 创建必要的目录结构（tasks 目录、workspace 目录等）
- 初始化 Git 仓库并配置用户信息
- 检查并创建任务文件和记忆文件

**关键函数**：
- `loadDotEnv()`：加载环境变量
- `initEnvironment()`：初始化环境
- `safeReadJson()`：安全读取 JSON 文件
- `safeWriteJson()`：安全写入 JSON 文件

### 2. 任务轮询

**功能说明**：定期检查任务状态，发现队列中的任务并执行。

**实现细节**：
- 采用无限循环模式，定期检查 `tasks/task.json` 文件
- 识别状态为 "queued" 的任务
- 调用工作流执行函数处理任务
- 支持一次性执行模式（--once 参数）

**关键函数**：
- `pollLoop()`：任务轮询主循环
- `isQueuedTask()`：判断任务是否处于队列状态

### 3. 工作流执行

**功能说明**：协调各模块完成任务的整个生命周期，包括任务评估、分解、执行和验证。

**实现细节**：
- 调用 `orchestrateTask()` 协调任务执行
- 支持长任务的 DAG 执行模式
- 处理任务执行过程中的错误
- 记录任务执行结果和状态

**关键函数**：
- `executeWorkflow()`：执行工作流
- `orchestrateTask()`：任务协调
- `orchestrateLongTask()`：长任务协调

### 4. 长任务协调

**功能说明**：处理复杂任务的执行，包括任务分解、子任务执行、失败重规划等。

**实现细节**：
- 评估任务难度和复杂度
- 根据难度选择合适的模型
- 分解高复杂度任务为子任务 DAG
- 按依赖关系执行子任务
- 处理子任务失败和重规划
- 执行语义验证和最终提交

**关键函数**：
- `orchestrateLongTask()`：长任务协调
- `hasPendingSubtasks()`：检查是否有未完成的子任务
- `summarizeIssues()`：总结验证问题

### 5. 错误处理

**功能说明**：捕获和处理执行过程中的错误，提供详细的错误信息和日志。

**实现细节**：
- 捕获各阶段的错误并记录
- 提供详细的错误上下文信息
- 支持任务回滚和失败处理
- 记录错误到日志文件

**关键函数**：
- `handleFailure()`：处理执行失败
- `appendLog()`：追加日志记录

### 6. 结果处理

**功能说明**：处理任务执行结果，包括写入结果文件、记录记忆和更新任务状态。

**实现细节**：
- 写入任务执行结果到 `tasks/result.json`
- 记录任务执行信息到 `bridge/memory.json`
- 更新任务状态为 "done" 或 "failed"
- 记录执行过程到日志文件

**关键函数**：
- `writeResult()`：写入执行结果
- `recordMemory()`：记录任务记忆
- `markTask()`：更新任务状态

## 技术亮点

1. **模块化设计**：清晰的职责划分，易于维护和扩展
2. **错误处理机制**：完善的错误捕获和处理，提高系统稳定性
3. **状态管理**：详细的任务状态跟踪和记录
4. **Git 集成**：完整的版本控制支持，确保变更可追溯
5. **多模型支持**：根据任务难度自动选择合适的模型
6. **上下文优化**：根据任务难度动态调整上下文内容

## 执行流程

1. **启动系统**：运行 `npm start` 启动任务轮询
2. **环境初始化**：加载配置、创建目录结构、初始化 Git 仓库
3. **任务检测**：定期检查任务文件，发现队列中的任务
4. **任务评估**：评估任务难度和复杂度
5. **任务分解**：分解高复杂度任务为子任务 DAG
6. **子任务执行**：按依赖关系执行子任务
7. **验证**：执行语法和语义验证
8. **结果处理**：记录执行结果和状态
9. **反馈**：生成任务执行结果和反馈

## 配置依赖

- **config.json**：系统配置文件，包括模型配置、路径配置等
- **tasks/task.json**：任务定义文件
- **bridge/memory.json**：任务记忆文件
- **bridge.log**：系统日志文件

## 与其他模块的交互

- **adapter.js**：使用模型适配器生成代码
- **planner.js**：使用任务规划器分解任务
- **verifier.js**：使用验证器验证代码变更
- **git_manager.js**：使用 Git 管理器处理版本控制
- **fs_tools.js**：使用文件系统工具处理文件操作

## 代码结构

```javascript
// 核心函数流程
async function main() {
  const args = parseArgs(process.argv.slice(2));
  await loadDotEnv(args.root);
  const env = await initEnvironment(args.root);
  await pollLoop(env, { once: args.once });
}

// 任务执行流程
async function orchestrateLongTask(env, task) {
  // 1. 任务评估
  // 2. 模型选择
  // 3. 任务分解
  // 4. 子任务执行
  // 5. 验证
  // 6. 结果处理
}
```

## 性能优化

1. **上下文优化**：根据任务难度动态调整上下文内容，减少 token 使用
2. **并行执行**：支持子任务的并行执行，提高执行效率
3. **错误处理**：快速捕获和处理错误，减少不必要的执行
4. **内存管理**：合理管理任务记忆，避免内存泄漏

## 故障排除

1. **任务执行失败**：检查日志文件 `bridge.log` 中的错误信息
2. **模型连接问题**：检查模型配置和网络连接
3. **Git 操作失败**：检查 Git 仓库状态和权限
4. **文件系统错误**：检查文件路径和权限

## 未来改进

1. **监控系统**：添加更详细的监控和统计功能
2. **并行处理**：增强子任务的并行处理能力
3. **自动重试**：实现智能的错误重试机制
4. **用户界面**：开发 Web 界面，提高用户体验

## 输入输出示例

### 输入：任务定义文件

```json
{
  "schema_version": 1,
  "task_id": "task-001",
  "instruction": "在 src 目录下创建一个新的工具函数文件 utils.js，包含一个计算斐波那契数列的函数",
  "status": "queued"
}
```

### 输出：执行结果文件

```json
{
  "task_id": "task-001",
  "ok": true,
  "changed": true,
  "commit": "abc123def456",
  "final_commit": "abc123def456",
  "difficulty": "low",
  "complexity_score": 15,
  "generator_provider": "ollama",
  "review_provider": null,
  "plan_tree": {
    "schema_version": 1,
    "task_id": "task-001",
    "created_at": "2026-04-03T12:00:00Z",
    "updated_at": "2026-04-03T12:01:00Z",
    "replans": 0,
    "order": ["s1"],
    "nodes": {
      "s1": {
        "id": "s1",
        "description": "在 src 目录下创建一个新的工具函数文件 utils.js，包含一个计算斐波那契数列的函数",
        "target_files": ["src/utils.js"],
        "dependencies": [],
        "status": "done",
        "attempts": 1,
        "generator_provider": "ollama",
        "review_provider": null,
        "started_at": "2026-04-03T12:00:00Z",
        "finished_at": "2026-04-03T12:01:00Z",
        "checkpoint_before_sha": "def456abc123",
        "checkpoint_commit_sha": "ghi789jkl012",
        "raw_outputs": ["tasks/raw/task-001.s1.attempt1.txt"],
        "errors": []
      }
    },
    "limits": { "max_subtasks": 12, "max_replans": 2 }
  },
  "execution_trace": [
    {
      "subtask_id": "s1",
      "status": "done",
      "attempts": 1,
      "generator_provider": "ollama",
      "review_provider": null,
      "started_at": "2026-04-03T12:00:00Z",
      "finished_at": "2026-04-03T12:01:00Z",
      "checkpoint_before_sha": "def456abc123",
      "checkpoint_commit_sha": "ghi789jkl012",
      "raw_output_paths": ["tasks/raw/task-001.s1.attempt1.txt"],
      "error_summary": null
    }
  ],
  "summary": "applied subtasks and squashed final commit",
  "error": null,
  "raw_output_path": "tasks/raw/task-001.s1.attempt1.txt",
  "attempts": 1,
  "errors": [],
  "last_error_stage": null,
  "started_at": "2026-04-03T12:00:00Z",
  "finished_at": "2026-04-03T12:01:00Z"
}
```