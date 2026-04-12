# 迭代 13 优化计划

## 迭代信息

| 字段 | 内容 |
|------|------|
| 迭代编号 | 13 |
| 创建时间 | 2026-04-12T23:10:00+08:00 |
| 当前阶段 | Phase 2 完成 |
| 总体进度 | 0/2 任务完成 |

## 问题摘要

- BUG-001: assertSafeRelPath 未检测冗余的 `workspace/` 前缀
- BUG-002: 任务指令措辞导致模型错误地包含 workspace/ 路径

## DAG 结构

```
[task-1: 修复 assertSafeRelPath] --> [task-2: 更新任务指令]
```

## 任务列表

| ID | 描述 | 目标文件 | 依赖 | 优先级 | 状态 |
|----|------|----------|------|--------|------|
| 1 | 修复 assertSafeRelPath 添加 workspace/ 前缀检测 | src/shared/path.js | - | high | pending |
| 2 | 更新任务指令措辞 | tasks/task.json | 1 | medium | pending |

## 阶段状态

| Phase | 任务数 | 完成 | 状态 |
|-------|--------|------|------|
| Phase 1 | 1 | 1 | 完成 |
| Phase 2 | 2 | 0 | 完成 |
| Phase 3 | 2 | 0 | 待执行 |
| Phase 4 | 1 | 0 | 待执行 |
| Phase 5 | 1 | 0 | 待执行 |

## 修复详情

### Task 1: 修复 assertSafeRelPath

**目标**: 在路径验证时检测并拒绝以 `workspace/` 开头的路径

**修改文件**: `src/shared/path.js`

**修改内容**:
在 `assertSafeRelPath` 函数中添加检测，拒绝以 `workspace/` 开头的相对路径

```javascript
// 在 parts 分割后添加检测
if (parts[0] === 'workspace') {
  throw new Error(`Invalid FILE path: do not include 'workspace/' prefix - paths are relative to the workspace root`);
}
```

### Task 2: 更新任务指令措辞

**目标**: 防止未来再次出现同样的问题

**修改文件**: `tasks/task.json` 和 `cc-self-iteration/iteration-13/task-decomposition.md`

**修改内容**:
将 "在 workspace/ 下创建" 改为 "在 workspace 根目录下创建，使用相对于 workspace 的路径，如 project/backend/package.json"
