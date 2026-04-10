# 迭代 6 审查报告

## 审查背景

本次迭代由代码审查驱动，系统性扫描识别出 15 个关键技术问题。重点关注执行路径上的高优先级 bug。

## 发现的问题

### 高优先级

#### 问题 1：Pre-Hooks 在 parseToolCalls 路径中完全旁路
- 文件：`src/core/adapter/parser.js:224-335`
- 函数：`parseToolCalls`
- 问题：`executePreHooksBatch` 存在但从未被调用。`validateSearchNotEmpty` 等补偿逻辑完全失效
- 影响：SEARCH 操作中空 search 字符串不会被转换为 `"(empty - creating new file)"`
- 根因：parser.js 和 hooks.js 是独立模块，集成时遗漏了 hook 调用

#### 问题 2：并发任务处理存在 check-then-act 竞争
- 文件：`src/core/workflow.js:335-367`
- 函数：`executeWorkflow`
- 问题：两个实例同时读取 `alreadyProcessed = false` 后都进入处理流程
- 影响：同一任务可能被处理两次，产生冲突的 git commit
- 根因：memoryPath 读取和写入不是原子操作

### 中优先级

#### 问题 3：AppliedChanges 记录永远为空数组
- 文件：`src/core/workflow.js:708,779`
- 问题：`safeApplyPatch` 返回 `{ok, appliedFiles, error}` 无 `changes` 字段
- 影响：result.json 中 `appliedChanges` 始终为空，日志失去意义

#### 问题 4：语义验证 shape salvage 逻辑可能掩盖失败
- 文件：`src/core/verifier.js:71-88`
- 函数：`ensureReviewShape`
- 问题：当 `issues` 非空时仍假设 `ok=true`
- 影响：模型返回 schema echo 时，issues 信息被忽略

#### 问题 5：Import 正则遗漏三种常见语法
- 文件：`src/utils/fs_tools.js:168-171`
- 遗漏：`import "file"`、`import * as name`、`export default from`
- 影响：依赖图不完整，上下文扩展遗漏相关文件

#### 问题 6：Squash 失败后 staged changes 未回滚
- 文件：`src/core/git_manager.js:367-390`
- 函数：`squashAndCommit`
- 问题：`git commit` 失败时 `reset --soft` 已 staging 的变更残留
- 影响：下次 commit 可能包含意外文件

#### 问题 7：Timeout close handler 竞争条件
- 文件：`src/core/adapter/providers/claude_cli.js:226-243`
- 问题：SIGTERM 发送后 `close` 事件触发 `clearTimeout`，可能导致重复 reject
- 影响：资源清理不完整或异常状态

### 低优先级

#### 问题 8：Rollback 前未验证 SHA 有效性
- 文件：`src/core/git_manager.js:353-357`
- 问题：无效 SHA 会导致 `reset --hard` 失败或reset 到错误 commit

#### 问题 9：Replan 计数器超限后仍递增
- 文件：`src/core/planner.js:715-721`
- 问题：已达 `maxReplans` 但计数仍为 `maxReplans + 1`

#### 问题 10：隐藏文件路径被 normalizeImportTarget 跳过
- 文件：`src/utils/fs_tools.js:138-146`
- 问题：`.hidden/file.js` 类路径返回 null，依赖图断裂

#### 问题 11：createCheckpointMarker 未记录 taskId/subtaskId
- 文件：`src/core/git_manager.js:73-79`
- 问题：`void taskId; void subtaskId;` 为占位符，未来无法追溯

## 总体评估

| 维度 | 状态 |
|------|------|
| 正确性 | 高（2 个 High 影响执行正确性） |
| 完整性 | 中（Import 正则遗漏影响依赖图） |
| 健壮性 | 中（竞争条件和异常处理有隐患） |
| 可维护性 | 好（问题定位清晰，修复范围明确） |

## 本次迭代范围

修复 5 个核心问题（task-1 到 task-5），其余 10 个问题标记为低优先级后续迭代。

## 建议优先级

1. **立即修复**：问题 1（Pre-Hooks 旁路）、问题 2（竞争条件）
2. **短期修复**：问题 3-7
3. **后续迭代**：问题 8-11
