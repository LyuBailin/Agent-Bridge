# 主流程模块 (src/core/main.js) 技术文档

## 模块概述

主流程模块是 Agent Bridge 系统的核心协调器，负责整个系统的初始化、任务轮询和工作流执行。它协调各个子模块完成从任务接收到执行完成的整个生命周期。

## 目录结构

```
src/core/
├── main.js              # 主入口文件
├── main_debug.js        # 调试模式主入口
├── main_index.js        # 索引模式主入口
├── main_index_debug.js  # 索引模式调试入口
├── polling.js           # 任务轮询模块
├── query_loop.js        # 查询循环模块
├── workflow.js          # 工作流管理模块
└── ...                  # 其他核心模块
```

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

**关键文件**：
- `polling.js`：任务轮询模块

**关键函数**：
- `pollLoop()`：任务轮询主循环
- `isQueuedTask()`：判断任务是否处于队列状态

### 3. 工作流执行

**功能说明**：协调各模块完成任务的整个生命周期，包括任务评估、分解、执行和验证。

**实现细节**：
- 调用工作流管理模块执行任务
- 支持长任务的 DAG 执行模式
- 处理任务执行过程中的错误
- 记录任务执行结果和状态

**关键文件**：
- `workflow.js`：工作流管理模块

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

### 5. 查询循环

**功能说明**：处理复杂的多轮查询任务，逐步完善解决方案。

**实现细节**：
- 支持多轮查询和反馈
- 逐步完善代码和解决方案
- 处理查询过程中的错误和重试
- 记录查询历史和结果

**关键文件**：
- `query_loop.js`：查询循环模块

**关键函数**：
- `runQueryLoop()`：运行查询循环
- `processQueryResponse()`：处理查询响应

### 6. 错误处理

**功能说明**：捕获和处理执行过程中的错误，提供详细的错误信息和日志。

**实现细节**：
- 捕获各阶段的错误并记录
- 提供详细的错误上下文信息
- 支持任务回滚和失败处理
- 记录错误到日志文件

**关键函数**：
- `handleFailure()`：处理执行失败
- `appendLog()`：追加日志记录

### 7. 结果处理

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
5. **多模型支持**：根据任务难度和风险级别自动选择合适的模型
6. **上下文优化**：根据任务难度动态调整上下文内容
7. **工作流管理**：完整的工作流管理，支持复杂任务的执行
8. **查询循环**：多轮查询机制，逐步完善复杂任务的解决方案
9. **风险评估**：内置风险分类器，评估任务风险级别
10. **并行执行**：支持子任务的并行执行，提高执行效率

## 执行流程

1. **启动系统**：运行 `npm start` 启动任务轮询，或 `npm run debug` 启动调试模式
2. **环境初始化**：加载配置、创建目录结构、初始化 Git 仓库
3. **任务检测**：定期检查任务文件，发现队列中的任务
4. **任务评估**：评估任务难度和风险级别
5. **模型选择**：根据任务难度和风险级别选择合适的模型
6. **任务分解**：分解高复杂度任务为子任务 DAG
7. **子任务执行**：按依赖关系执行子任务
8. **查询循环**：对于复杂任务，进入多轮查询循环
9. **验证**：执行语法和语义验证
10. **结果处理**：记录执行结果和状态
11. **反馈**：生成任务执行结果和详细反馈

## 配置依赖

- **config.json**：系统配置文件，包括模型配置、路径配置等
- **tasks/task.json**：任务定义文件
- **bridge/memory.json**：任务记忆文件
- **bridge.log**：系统日志文件

## 与其他模块的交互

- **src/core/adapter/**：使用模型适配器生成代码
- **src/core/planner.js**：使用任务规划器分解任务
- **src/core/verifier.js**：使用验证器验证代码变更
- **src/core/git_manager.js**：使用 Git 管理器处理版本控制
- **src/utils/fs_tools.js**：使用文件系统工具处理文件操作
- **src/core/polling.js**：使用任务轮询模块检查任务状态
- **src/core/query_loop.js**：使用查询循环模块处理多轮查询
- **src/core/workflow.js**：使用工作流管理模块执行任务

## 代码结构

### 主入口文件 (main.js)

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

module.exports = {
  main,
  loadDotEnv,
  initEnvironment,
  pollLoop,
  orchestrateLongTask
};
```

### 任务轮询模块 (polling.js)

```javascript
// 任务轮询主循环
async function pollLoop(env, opts = {}) {
  // 定期检查任务文件
  // 执行队列中的任务
  // 处理任务结果
}

// 判断任务是否处于队列状态
function isQueuedTask(task) {
  // 检查任务状态
  // 返回是否为队列状态
}

module.exports = {
  pollLoop,
  isQueuedTask
};
```

### 工作流管理模块 (workflow.js)

```javascript
// 执行工作流
async function executeWorkflow(env, task) {
  // 执行任务工作流
  // 处理任务结果
}

// 任务协调
async function orchestrateTask(env, task) {
  // 协调任务执行
  // 处理任务结果
}

module.exports = {
  executeWorkflow,
  orchestrateTask
};
```

### 查询循环模块 (query_loop.js)

```javascript
// 运行查询循环
async function runQueryLoop(env, task) {
  // 执行多轮查询
  // 处理查询响应
  // 完善解决方案
}

// 处理查询响应
function processQueryResponse(response) {
  // 解析查询响应
  // 提取关键信息
  // 返回处理结果
}

module.exports = {
  runQueryLoop,
  processQueryResponse
};
```

## 性能优化

1. **上下文优化**：根据任务难度和风险级别动态调整上下文内容，减少 token 使用
2. **并行执行**：支持子任务的并行执行，提高执行效率
3. **错误处理**：快速捕获和处理错误，减少不必要的执行
4. **内存管理**：合理管理任务记忆，避免内存泄漏
5. **轮询优化**：优化任务轮询间隔，减少系统资源消耗
6. **缓存机制**：缓存常用数据，避免重复计算
7. **模型选择**：根据任务难度自动选择合适的模型，提高生成效率
8. **资源分配**：合理分配系统资源，避免资源竞争

## 故障排除

1. **任务执行失败**：检查日志文件 `bridge.log`、`claude.log` 和 `ollama.log` 中的错误信息
2. **模型连接问题**：检查模型配置、网络连接和 API 密钥
3. **Git 操作失败**：检查 Git 仓库状态、权限和用户配置
4. **文件系统错误**：检查文件路径、权限和目录存在性
5. **环境变量错误**：检查 `.env` 文件中的环境变量设置
6. **配置文件错误**：检查 `config.json` 文件中的配置项
7. **端口占用**：检查模型服务端口是否被占用
8. **内存不足**：检查系统内存使用情况，避免内存泄漏

## 未来改进

1. **监控系统**：添加更详细的监控和统计功能，包括执行时间、成功率等指标
2. **并行处理**：增强子任务的并行处理能力，提高执行效率
3. **自动重试**：实现智能的错误重试机制，提高任务成功率
4. **用户界面**：开发 Web 界面，提高用户体验，支持可视化任务管理
5. **多任务支持**：支持同时执行多个任务，提高系统吞吐量
6. **任务优先级**：实现任务优先级机制，优先执行重要任务
7. **自动扩展性**：根据系统负载自动调整资源分配
8. **插件系统**：支持自定义插件，扩展系统功能
9. **多语言支持**：扩展支持更多编程语言的代码生成
10. **知识库集成**：集成企业知识库，提高代码生成的准确性

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