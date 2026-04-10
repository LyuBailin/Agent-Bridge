# 迭代 1 审查报告

## 项目概览

- **总代码行数**: 6232 行 (不含 node_modules)
- **主要模块**: core (workflow, planner, git_manager, verifier, adapter), prompt, utils, shared
- **架构**: 混合模型编排系统，支持 Ollama + Claude CLI

## 发现的问题

### 高优先级

#### 1. `workflow.js` 函数过长 (圈复杂度高)
- **文件**: `src/core/workflow.js`
- **问题**: `orchestrateLongTask` 函数约 680 行，单一函数承担过多职责
  - 任务编排
  - 模型路由
  - 上下文收集
  - 解析/应用/重试循环
  - 错误处理
  - 检查点管理
- **建议**: 拆分为多个小函数：
  - `executeSubtaskLoop` - 主循环
  - `executeSingleAttempt` - 单次尝试逻辑
  - `handleSubtaskFailure` - 失败处理
  - `collectSubtaskContext` - 上下文收集

#### 2. `git_manager.js:safeApplyPatch` 函数过长
- **文件**: `src/core/git_manager.js:137-469`
- **问题**: 330+ 行处理多种 change 类型 (edit/mkdir/rm/mv/touch)
- **建议**: 使用策略模式重构，每种操作类型独立 handler

#### 3. 重复的"空搜索模式"常量数组
- **位置**:
  - `src/core/git_manager.js:114-119`
  - `src/core/adapter/parser.js:37-41`
  - `src/core/git_manager.js:214-219` (重复副本)
- **问题**: 完全相同的数组定义出现 3 次
- **建议**: 提取到 `src/shared/constants.js` 或 `src/core/adapter/schema.js`

### 中优先级

#### 4. `adapter/index.js:createProvider` 函数过长
- **文件**: `src/core/adapter/index.js:93-235`
- **问题**: 140+ 行处理 3 种 provider 创建
- **建议**: 每种 provider 创建逻辑提取为独立函数

#### 5. `planner.js` 深层嵌套
- **文件**: `src/core/planner.js:606-616` (decomposeTask 重试循环)
- **文件**: `src/core/planner.js:770-783` (replanFromFailure 重试循环)
- **问题**: 重试逻辑嵌套过深，可读性差
- **建议**: 提取 `withRetry` 辅助函数

#### 6. 重复的 `countOccurrences` 函数
- **文件**: `src/core/git_manager.js:80-91`
- **问题**: 只被内部使用，但可复用
- **建议**: 如未来需要可移到 shared 工具库

#### 7. `workflow.js` 日志函数混杂
- **文件**: `src/core/workflow.js:15-31`, `99-151`
- **问题**: `formatTimestamp`, `logOllamaAction`, `logClaudeWorkflow` 与业务逻辑混在一起
- **建议**: 考虑提取到独立 `src/core/logging.js`

### 低优先级

#### 8. `planner.js:625` 深拷贝效率
- **代码**: `JSON.parse(JSON.stringify(tree))`
- **问题**: 对大 planTree 深拷贝性能差
- **建议**: 使用 `structuredClone` 或自定义深拷贝函数

#### 9. `workflow.js:558-604` apply 失败处理过长
- **问题**: 处理 `safeApplyPatch` 失败的代码块 ~45 行
- **建议**: 提取为 `handleApplyFailure` 函数

#### 10. adapter/index.js 重复的 mock 检查
- **问题**: 每个 provider 的 `generateCode` 都有相同的 mock 检查逻辑
- **建议**: 提取 `readMockOrCall` 辅助函数

## 代码质量统计

| 文件 | 行数 | 评估 |
|------|------|------|
| workflow.js | 911 | ⚠️ 过大，需拆分 |
| planner.js | 856 | ✓ 可接受，但可优化嵌套 |
| query_loop.js | 968 | (未深度审查) |
| git_manager.js | 553 | ⚠️ safeApplyPatch 过大 |
| verifier.js | 347 | ✓ 结构清晰 |
| adapter/index.js | 329 | ⚠️ createProvider 过大 |
| fs_tools.js | 267 | ✓ 结构良好 |
| adapter/parser.js | 372 | ✓ 结构良好 |

## 总体评估

- **优点**: 模块化较好，prompt 架构设计清晰，错误处理完善
- **缺点**: 存在多个超大函数，需要重构提升可维护性
- **建议优先级**: 先处理高优先级问题（workflow.js 拆分 + 常量去重），再处理中优先级
