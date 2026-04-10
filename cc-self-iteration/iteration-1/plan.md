# 迭代 1 优化计划

## DAG 结构

```
[task-1: 提取共享常量] --> [task-3: 精简 safeApplyPatch]
[task-2: 提取 apply 失败处理] --> [task-3]
                                    |
                                    v
                            [task-4: 拆分 workflow.js]
                                    |
                                    v
                            [task-5: 重构 createProvider]
```

## 任务列表

| ID | 描述 | 目标文件 | 依赖 | 难度 | 优先级 |
|----|------|----------|------|------|--------|
| 1 | 提取共享常量 EMPTY_SEARCH_PATTERNS | src/shared/constants.js | - | 15 | 高 |
| 2 | 提取 apply 失败处理函数 | src/core/workflow.js | - | 20 | 中 |
| 3 | 精简 safeApplyPatch (策略模式) | src/core/git_manager.js | 1 | 45 | 高 |
| 4 | 拆分 orchestrateLongTask | src/core/workflow.js | 2,3 | 60 | 高 |
| 5 | 重构 createProvider | src/core/adapter/index.js | - | 40 | 中 |

## 任务详情

### Task 1: 提取共享常量
**文件**: `src/core/git_manager.js`, `src/core/adapter/parser.js`
**操作**:
1. 创建 `src/shared/constants.js`
2. 导出 `EMPTY_SEARCH_PATTERNS` 数组
3. 在 `git_manager.js` 和 `parser.js` 中引用共享常量
4. 删除重复定义

### Task 2: 提取 apply 失败处理
**文件**: `src/core/workflow.js:558-604`
**操作**:
1. 创建 `handleApplyFailure(env, subtaskTask, applyResult, changes, ...)` 函数
2. 将相关逻辑移入新函数
3. 保留原位置调用新函数

### Task 3: 精简 safeApplyPatch
**文件**: `src/core/git_manager.js:137-469`
**操作**:
1. 创建 `createChangeHandler(type)` 工厂函数
2. 每种操作类型 (edit/mkdir/rm/mv/touch) 提取为独立 handler 函数
3. 主函数 `safeApplyPatch` 只做路由和错误汇总
4. 应用 Task 1 的共享常量

### Task 4: 拆分 orchestrateLongTask
**文件**: `src/core/workflow.js`
**操作**:
1. 提取 `collectSubtaskContext(env, subtask, difficulty)` 函数
2. 提取 `executeSingleAttempt(env, subtask, ...)` 函数
3. 提取 `handleSubtaskFailure(env, ...)` 函数
4. 简化主循环 `orchestrateLongTask` 的主体

### Task 5: 重构 createProvider
**文件**: `src/core/adapter/index.js`
**操作**:
1. 提取 `createOllamaProvider(config)` 函数
2. 提取 `createOpenAIProvider(config)` 函数
3. 提取 `createClaudeCliProvider(config)` 函数
4. `createProvider` 主函数简化为工厂调度

## 执行顺序

1. **Task 1** (无依赖) → 创建共享常量
2. **Task 2** (无依赖) → 提取失败处理
3. **Task 3** (依赖 1) → 精简 safeApplyPatch
4. **Task 4** (依赖 2,3) → 拆分 workflow (在 2,3 完成后执行)
5. **Task 5** (无依赖) → 可与 Task 4 并行执行

## 预期收益

- 代码可读性显著提升
- 每个函数 < 200 行
- 共享常量消除 3 处重复

## 执行状态

| Task | 状态 | 完成时间 |
|------|------|----------|
| 1 | ✓ 完成 | Iteration 1 |
| 2 | ✓ 完成 | Iteration 1 |
| 3 | ✓ 完成 | Iteration 1 |
| 4 | ✓ 完成 (提取 buildSubtaskContext) | Iteration 1 |
| 5 | ✓ 完成 | Iteration 1 |
- 新增约 200 行辅助函数，减少主函数复杂度
