# 工作流管理模块 (src/core/workflow.js) 技术文档

## 模块概述

工作流管理模块是 Agent Bridge 系统的核心组件之一，负责任务生命周期管理和状态跟踪。该模块协调各子模块完成任务的整个执行过程，包括任务初始化、执行、验证和结果处理。

## 核心功能

### 1. 任务生命周期管理

**功能说明**：处理任务从创建到完成的整个过程，确保任务的有序执行。

**实现细节**：
- 初始化任务状态
- 协调任务执行过程
- 处理任务完成和失败
- 生成任务执行结果

**关键函数**：
- `executeWorkflow()`：执行工作流
- `orchestrateTask()`：任务协调

### 2. 状态管理

**功能说明**：跟踪任务执行状态和进度，确保任务的正确执行。

**实现细节**：
- 维护任务执行状态
- 跟踪子任务执行情况
- 记录任务执行进度
- 处理状态更新和转换

**关键函数**：
- `updateTaskStatus()`：更新任务状态
- `trackExecution()`：跟踪执行过程

### 3. 异常处理

**功能说明**：处理执行过程中的异常情况，确保系统的稳定性。

**实现细节**：
- 捕获和处理执行过程中的错误
- 提供详细的错误信息
- 支持任务回滚和失败处理
- 记录错误到日志文件

**关键函数**：
- `handleException()`：处理异常
- `rollbackTask()`：回滚任务

### 4. 结果生成

**功能说明**：生成任务执行结果和报告，提供详细的执行信息。

**实现细节**：
- 收集执行过程中的信息
- 生成结构化的执行结果
- 记录任务执行的详细信息
- 提供执行结果的分析和总结

**关键函数**：
- `generateResult()`：生成执行结果
- `summarizeExecution()`：总结执行过程

## 技术亮点

1. **完整的生命周期管理**：处理任务从创建到完成的整个过程
2. **状态跟踪**：详细跟踪任务执行状态和进度
3. **异常处理**：完善的异常捕获和处理机制
4. **结果生成**：生成详细的执行结果和报告
5. **模块化设计**：清晰的模块化架构，易于扩展和维护
6. **与其他模块的紧密集成**：与其他核心模块紧密协作，提供完整的工作流解决方案
7. **灵活性**：支持不同类型任务的执行
8. **可追溯性**：详细记录任务执行过程，确保可追溯性
9. **性能优化**：优化执行流程，提高执行效率
10. **错误处理**：完善的错误处理机制，提高系统稳定性

## 执行流程

1. **任务初始化**：初始化任务状态和执行环境
2. **任务评估**：评估任务难度和复杂度
3. **任务执行**：协调各子模块执行任务
4. **状态更新**：跟踪和更新任务执行状态
5. **异常处理**：处理执行过程中的异常情况
6. **结果生成**：生成任务执行结果和报告

## 配置依赖

- **config.json**：包含工作流相关的配置，如执行超时设置

## 与其他模块的交互

- **src/core/main.js**：主流程模块使用工作流管理模块执行任务
- **src/core/planner.js**：任务规划器使用工作流管理模块协调子任务执行
- **src/core/adapter/**：模型适配器使用工作流管理模块处理模型调用
- **src/core/verifier.js**：验证器使用工作流管理模块验证任务执行结果
- **src/core/git_manager.js**：Git 管理器使用工作流管理模块处理版本控制操作

## 代码结构

```javascript
// 执行工作流
async function executeWorkflow(env, task) {
  // 初始化任务状态
  // 评估任务难度
  // 执行任务
  // 处理执行结果
}

// 任务协调
async function orchestrateTask(env, task) {
  // 协调任务执行
  // 处理子任务
  // 生成执行结果
}

// 异常处理
function handleException(error, task) {
  // 捕获和处理错误
  // 记录错误信息
  // 处理任务回滚
}

// 结果生成
function generateResult(task, executionInfo) {
  // 收集执行信息
  // 生成执行结果
  // 返回结构化结果
}

module.exports = {
  executeWorkflow,
  orchestrateTask,
  handleException,
  generateResult
};
```

## 性能优化

1. **执行流程优化**：优化任务执行流程，减少不必要的步骤
2. **并行执行**：支持子任务的并行执行，提高执行效率
3. **错误处理**：快速捕获和处理错误，减少不必要的执行
4. **内存管理**：合理管理任务执行过程中的内存使用
5. **状态更新**：优化状态更新机制，减少系统开销

## 故障排除

1. **任务执行失败**：检查任务指令和上下文是否正确
2. **状态更新失败**：检查状态管理机制是否正常
3. **异常处理失败**：检查异常处理代码是否正确
4. **结果生成失败**：检查结果生成代码是否正确

## 未来改进

1. **可视化**：添加任务执行过程的可视化功能
2. **监控**：添加任务执行监控和统计功能
3. **自动化**：增强自动化程度，减少人工干预
4. **扩展性**：提高系统的扩展性，支持更多类型的任务
5. **多任务支持**：支持同时执行多个任务
6. **任务优先级**：实现任务优先级机制
7. **用户界面**：开发 Web 界面，提高用户体验
8. **集成测试**：增强集成测试，提高系统稳定性

## 输入输出示例

### 输入：任务定义

```json
{
  "schema_version": 1,
  "task_id": "task-001",
  "instruction": "在 src 目录下创建一个新的工具函数文件 utils.js，包含一个计算斐波那契数列的函数",
  "status": "queued"
}
```

### 输出：执行结果

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