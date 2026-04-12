# 迭代 14 记录与分析

## 修改内容

| 文件 | 修改描述 | 原因 |
|------|----------|------|
| src/core/workflow.js | 修改 memory 检查逻辑，只有 final_status === "done" 时才跳过任务 | 允许重新运行失败/跳过的任务 |
| src/core/git_manager.js | 在 squashAndCommit 后添加检查，确保工作目录与 git 同步 | 防止 squash 后工作目录与 git 状态不一致 |

## Bug 分析

### BUG-001 & BUG-002: Task 重跑机制问题

| 字段 | 内容 |
|------|------|
| 文件 | src/core/workflow.js:357-360 |
| 根因 | memory.json 中记录的 task_id 会导致任务被永久跳过，无法重跑 |
| 修复 | 只有当 memory 中 final_status === "done" 时才跳过 |
| 教训 | 内存缓存设计应区分成功完成和其他状态 |

### BUG-004: Git 工作目录同步问题

| 字段 | 内容 |
|------|------|
| 文件 | src/core/git_manager.js:367-390 |
| 根因 | squashAndCommit 使用 git reset --soft 后，如果存在未提交更改可能导致工作目录与 git 不同步 |
| 修复 | 在 commit 后检查是否有未提交更改，如果有则 amend |
| 教训 | git 操作后应验证工作目录状态 |

## 测试验证

- 语法检查: ✓
- npm test: 408/408 ✓