# 任务规划器模块 (src/core/planner.js) 技术文档

## 模块概述

任务规划器模块是 Agent Bridge 系统的核心组件之一，负责任务难度评估、任务分解和计划执行。该模块能够将复杂任务分解为可管理的子任务，并构建子任务之间的依赖关系，形成有向无环图（DAG），确保任务的有序执行。

## 核心功能

### 1. 难度评估

**功能说明**：评估任务的难度和复杂度，为模型选择和任务分解提供依据。

**实现细节**：
- 分析任务指令中的关键词
- 提取可能涉及的文件路径
- 评估文件复杂度（如代码行数）
- 计算综合复杂度得分
- 确定任务难度级别（低、中、高）

**关键函数**：
- `analyzeDifficulty()`：分析任务难度
- `evaluateComplexity()`：评估任务复杂度
- `extractLikelyPaths()`：提取可能的文件路径

### 2. 任务分解

**功能说明**：将复杂任务分解为可管理的子任务，构建子任务之间的依赖关系。

**实现细节**：
- 对于高复杂度任务，使用 Claude 模型进行智能分解
- 构建子任务的有向无环图（DAG）
- 定义子任务之间的依赖关系
- 确保子任务的原子性和可执行性

**关键函数**：
- `decomposeTask()`：分解任务为子任务
- `buildSingleNodePlanTree()`：构建单节点计划树
- `normalizePlanArrayToTree()`：将计划数组转换为计划树

### 3. 计划执行

**功能说明**：按依赖关系执行子任务，确保任务的有序完成。

**实现细节**：
- 识别可执行的子任务（依赖已满足）
- 按顺序执行子任务
- 更新子任务执行状态
- 处理子任务执行结果

**关键函数**：
- `getNextExecutableSubtask()`：获取下一个可执行的子任务
- `updatePlanState()`：更新计划状态

### 4. 失败重规划

**功能说明**：当子任务执行失败时，重新规划剩余工作。

**实现细节**：
- 分析失败原因和上下文
- 重新规划失败子任务及其下游任务
- 保留已完成的子任务结果
- 构建新的子任务计划

**关键函数**：
- `replanFromFailure()`：从失败中重新规划
- `computeDownstream()`：计算下游任务
- `mergeReplannedTree()`：合并重新规划的计划树

### 5. 上下文优化

**功能说明**：根据任务难度和相关文件动态调整上下文内容，优化模型输入。

**实现细节**：
- 分析任务相关的文件
- 优先包含可能相关的文件
- 限制上下文大小，避免 token 超限
- 确保关键信息的完整性

**关键函数**：
- `optimizeContext()`：优化上下文内容
- `splitContextWithGit()`：分离上下文和 Git 摘要
- `parseFileBlocks()`：解析文件块

### 6. 计划验证

**功能说明**：验证计划树的正确性和完整性。

**实现细节**：
- 验证计划树的结构
- 检查子任务依赖关系
- 确保无循环依赖
- 验证子任务目标文件的安全性

**关键函数**：
- `validatePlanTree()`：验证计划树
- `enforceSequentialDependencies()`：强制顺序依赖

## 技术亮点

1. **智能任务分解**：使用 Claude 模型进行智能任务分解，提高复杂任务的执行成功率
2. **难度评估**：基于多种因素的综合难度评估，为模型选择提供依据
3. **上下文优化**：动态调整上下文内容，优化模型输入
4. **依赖管理**：构建和管理子任务之间的依赖关系，确保有序执行
5. **失败重规划**：智能处理子任务失败，提高系统鲁棒性
6. **计划验证**：确保计划树的正确性和完整性
7. **风险评估**：集成风险分类器，评估任务风险级别
8. **模块化设计**：清晰的模块化架构，易于扩展和维护
9. **并行执行**：支持子任务的并行执行，提高执行效率
10. **智能依赖分析**：智能分析子任务之间的依赖关系，优化执行顺序

## 执行流程

1. **任务评估**：评估任务难度和复杂度
2. **计划构建**：根据难度构建计划树
3. **子任务执行**：按依赖关系执行子任务
4. **状态更新**：更新子任务执行状态
5. **失败处理**：处理子任务失败并重新规划
6. **计划完成**：完成所有子任务执行

## 配置依赖

- **config.json**：包含任务规划相关的配置，如难度阈值和上下文限制

## 与其他模块的交互

- **src/core/main.js**：主流程模块使用任务规划器分解和执行任务
- **src/core/adapter/**：任务规划器使用适配器调用 Claude 模型进行任务分解
- **src/core/git_manager.js**：任务规划器使用 Git 管理器创建检查点
- **src/core/workflow.js**：工作流管理模块使用任务规划器执行任务

## 代码结构

```javascript
// 任务分解
async function decomposeTask({ instruction, globalContext, claudeProvider, limits, task_id }) {
  // 评估任务难度
  // 使用 Claude 模型分解任务
  // 构建计划树
}

// 计划执行
function getNextExecutableSubtask(planTree) {
  // 验证计划树
  // 查找可执行的子任务
  // 返回下一个可执行的子任务
}

// 失败重规划
async function replanFromFailure({ instruction, globalContext, planTree, failedSubtask, failureContext, claudeProvider, limits }) {
  // 分析失败原因
  // 重新规划任务
  // 合并新的计划树
}
```

## 性能优化

1. **上下文优化**：根据任务难度动态调整上下文大小，减少 token 使用
2. **计划树验证**：提前验证计划树的正确性，避免执行过程中的错误
3. **依赖管理**：优化依赖关系的处理，提高执行效率
4. **失败处理**：智能处理子任务失败，减少不必要的重试

## 故障排除

1. **计划树验证失败**：检查子任务依赖关系是否正确
2. **任务分解失败**：检查 Claude 模型配置和连接
3. **子任务执行失败**：检查子任务指令和上下文是否完整
4. **重规划失败**：检查失败上下文和全局上下文是否充分

## 未来改进

1. **智能依赖分析**：更智能地分析子任务之间的依赖关系，优化执行顺序
2. **并行执行**：支持更多子任务的并行执行，提高执行效率
3. **计划优化**：优化子任务的执行顺序，减少执行时间
4. **用户干预**：支持用户对计划的手动调整，提高灵活性
5. **自适应计划**：根据执行情况自动调整计划，提高成功率
6. **多模型协同**：利用多个模型的优势进行任务分解
7. **知识图谱**：构建任务领域的知识图谱，提高任务分解的准确性
8. **历史学习**：从历史任务中学习，提高任务分解的效率和质量
9. **跨项目规划**：支持跨多个项目的任务规划
10. **可视化工具**：提供计划树的可视化工具，方便用户理解和调整

## 输入输出示例

### 输入：任务指令

```
在项目中添加一个新的用户认证功能，包括：
1. 创建用户模型
2. 实现登录接口
3. 实现注册接口
4. 添加认证中间件
```

### 输出：计划树

```javascript
{
  "schema_version": 1,
  "task_id": "task-001",
  "created_at": "2026-04-03T12:00:00Z",
  "updated_at": "2026-04-03T12:00:00Z",
  "replans": 0,
  "order": ["s1", "s2", "s3", "s4"],
  "nodes": {
    "s1": {
      "id": "s1",
      "description": "创建用户模型文件 models/user.js",
      "target_files": ["models/user.js"],
      "dependencies": [],
      "status": "pending",
      "attempts": 0,
      "generator_provider": null,
      "review_provider": null,
      "started_at": null,
      "finished_at": null,
      "checkpoint_before_sha": null,
      "checkpoint_commit_sha": null,
      "raw_outputs": [],
      "errors": []
    },
    "s2": {
      "id": "s2",
      "description": "实现登录接口 routes/auth.js",
      "target_files": ["routes/auth.js"],
      "dependencies": ["s1"],
      "status": "pending",
      "attempts": 0,
      "generator_provider": null,
      "review_provider": null,
      "started_at": null,
      "finished_at": null,
      "checkpoint_before_sha": null,
      "checkpoint_commit_sha": null,
      "raw_outputs": [],
      "errors": []
    },
    "s3": {
      "id": "s3",
      "description": "实现注册接口 routes/auth.js",
      "target_files": ["routes/auth.js"],
      "dependencies": ["s2"],
      "status": "pending",
      "attempts": 0,
      "generator_provider": null,
      "review_provider": null,
      "started_at": null,
      "finished_at": null,
      "checkpoint_before_sha": null,
      "checkpoint_commit_sha": null,
      "raw_outputs": [],
      "errors": []
    },
    "s4": {
      "id": "s4",
      "description": "添加认证中间件 middleware/auth.js",
      "target_files": ["middleware/auth.js"],
      "dependencies": ["s1"],
      "status": "pending",
      "attempts": 0,
      "generator_provider": null,
      "review_provider": null,
      "started_at": null,
      "finished_at": null,
      "checkpoint_before_sha": null,
      "checkpoint_commit_sha": null,
      "raw_outputs": [],
      "errors": []
    }
  },
  "limits": { "max_subtasks": 12, "max_replans": 2 }
}
```