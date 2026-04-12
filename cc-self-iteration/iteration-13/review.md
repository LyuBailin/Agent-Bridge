# 迭代 13 审查报告

## 迭代信息

| 字段 | 内容 |
|------|------|
| 迭代编号 | 13 |
| 审查时间 | 2026-04-12T23:05:00+08:00 |

## 发现的问题

### 高优先级

| ID | 文件:行号 | 问题描述 | 建议修复 |
|----|-----------|----------|----------|
| BUG-001 | src/shared/path.js:11-39 | assertSafeRelPath 未检测并拒绝以 `workspace/` 开头的路径，导致模型生成的路径创建了嵌套 workspace 目录 | 在 assertSafeRelPath 中添加检测：如果 parts[0] === 'workspace' 则报错或自动剥离 |
| BUG-002 | task instruction | 任务指令 "在 workspace/ 下创建" 导致模型错误地在路径中包含 workspace/ 前缀 | 修改指令措辞，明确要求"使用相对于 workspace 的相对路径，不包含 workspace/ 前缀" |

### 中优先级

| ID | 文件:行号 | 问题描述 | 建议修复 |
|----|-----------|----------|----------|
| CONFIG-001 | tasks/task.json | 子任务 13.1 的指令包含歧义性描述 "在 workspace/ 下创建 project/" | 重写为更明确的路径说明 |

## 问题详解

### BUG-001: 嵌套 workspace/ 目录

**现象**: 模型生成的 sr 块包含 `FILE: workspace/project/backend/package.json`，导致文件实际创建在 `workspace/workspace/project/backend/package.json`

**根因分析**:
1. `assertSafeRelPath` 只检查路径安全性（无 `..`、非绝对路径等）
2. 未检测冗余的 `workspace/` 前缀
3. `resolveInWorkspace(workspaceDir, 'workspace/project/...')` 将其解析为 `workspaceDir/workspace/project/...`

**复现步骤**:
1. 任务指令: "在 workspace/ 下创建 project/ 目录结构"
2. 模型生成: `FILE: workspace/project/backend/package.json`
3. 系统应用路径: `/workspace/workspace/project/backend/package.json`

**修复方案**:
在 `assertSafeRelPath` 中添加检测:
```javascript
// 检测并拒绝/剥离 workspace/ 前缀（冗余）
if (parts[0] === 'workspace') {
  throw new Error(`Invalid FILE path: do not include 'workspace/' prefix - paths are relative to the workspace root`);
}
```

或在 `resolveInWorkspace` 中自动剥离:
```javascript
// 自动剥离 workspace/ 前缀
let safeRel = relPath;
if (parts[0] === 'workspace') {
  safeRel = parts.slice(1).join('/');
}
```

## 总体评估

- 问题总数: 3 个
- 高优先级: 2 个
- 可并行处理: 2 个（BUG-001 和 BUG-002 可同时修复）

## 测试建议

1. 验证 `assertSafeRelPath('workspace/project/test.js')` 被正确拒绝
2. 验证模型在修复后的指令下生成 `project/backend/package.json` 而非 `workspace/project/backend/package.json`
3. 验证任务 13.1 重新执行后文件创建在正确位置
