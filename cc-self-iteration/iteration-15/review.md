# 迭代 15 审查报告

## 迭代信息

| 字段 | 内容 |
|------|------|
| 迭代编号 | 15 |
| 审查时间 | 2026-04-13T12:00:00+08:00 |

## 发现的 Agent Bridge 问题

### Bug AB-1: 空目录不被 git 跟踪

| 字段 | 内容 |
|------|------|
| 文件 | src/core/git_manager.js:156 |
| 问题描述 | MKDIR 操作创建目录后，目录是空的，不被 git 跟踪 |
| 影响 | 当任务仅创建目录（如 task 1.1），后续 checkpoint/squash 后目录消失 |
| 根因 | handleMkdir 函数创建目录后直接返回，未考虑 git 不跟踪空目录的特性 |
| 修复方案 | 在创建目录后，同时创建 .gitkeep 文件 |
| 修复状态 | ✅ 已修复并验证 |

### Bug AB-2: 文件不存在时 SEARCH/REPLACE 失败

| 字段 | 内容 |
|------|------|
| 文件 | src/core/git_manager.js:105-154 |
| 问题描述 | 当使用 SEARCH/REPLACE 操作一个不存在的文件时，模型无法正确创建文件 |
| 影响 | task 2.4 多次失败，模型尝试用空字符串 SEARCH 但无法匹配 |
| 根因 | handleEdit 只处理文件存在的情况，当文件不存在且 SEARCH 非空时返回错误 |
| 修复方案 | 当文件不存在且 SEARCH 为空时，直接用 replace 内容创建文件 |
| 修复状态 | ✅ 已修复并验证 |

### Bug AB-3: 任务执行前未检查 workspace 状态

| 字段 | 内容 |
|------|------|
| 文件 | src/core/workflow.js:357-365 |
| 问题描述 | 创建子任务前未检查 workspace 是否有未提交的更改，可能与任务实际状态冲突 |
| 影响 | Supervisor 创建任务时可能与 workspace 实际状态不同步 |
| 根因 | executeWorkflow 开始时未检查 workspace git 状态 |
| 修复方案 | 在 executeWorkflow 开始时添加 workspace 脏状态检查 |
| 修复状态 | ✅ 已修复并验证 |

### Bug AB-4: JSON function calling 格式不被识别

| 字段 | 内容 |
|------|------|
| 文件 | src/core/adapter/validator.js:56-91 |
| 问题描述 | 模型输出 JSON function calling 格式时，validateOperationSchema 只检查 sr/op 文本块 |
| 影响 | task 2.4 被错误拒绝："Invalid op block: no recognized operation found" |
| 根因 | validateOperationSchema 依赖正则匹配 ```sr 和 ```op，但 JSON 格式不包含这些标记 |
| 修复方案 | 增加 JSON 格式检测逻辑，当检测到 JSON tool_calls 时跳过文本块验证 |
| 修复状态 | ✅ 已修复并验证 |

## 总体评估

- 问题总数: 4 个
- 高优先级: 4 个（全部为阻塞性问题）
- 可并行处理: 0 个（修复有依赖关系）
- 已修复: 4 个
- 已验证: 4 个

## 测试结果

```
npm test
# tests 408
# pass 408
# fail 0
```

## 提交记录

| Commit | 描述 |
|--------|------|
| 5aeda4c | fix: Agent Bridge bug fixes (AB-1, AB-2, AB-3) |
| 3aceaad | fix: handle JSON function calling format (AB-4) |
