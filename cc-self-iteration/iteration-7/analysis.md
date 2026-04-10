# 迭代 7 分析：核心 Bug 修复执行

## 执行摘要

本次迭代修复了 Iteration-6 识别的 5 个核心问题。所有修复已通过语法检查和回归测试（401 tests passed）。

## 修复详情

### task-1: Pre-Hooks 旁路修复 ✅

**文件**: `src/core/adapter/parser.js`

**问题**: `parseToolCalls` 函数从未调用 `executePreHooks`，导致 `validateSearchNotEmpty` 等 hook 永远不会执行。

**修复**:
1. 将 `parseToolCalls` 改为 `async` 函数
2. 在返回前执行 pre-hooks 循环，对每个 change 应用 hook 转换

**代码变更**:
```js
// Before
function parseToolCalls(toolCalls, fsTools, workspaceDir, options = {}) {
  // ... validation only ...
  return { changes, riskAssessment };
}

// After
async function parseToolCalls(toolCalls, fsTools, workspaceDir, options = {}) {
  // ... validation only ...
  // Execute pre-hooks to apply transformations
  for (const change of changes) {
    const toolName = change.type === "edit" ? "search_replace" : change.type;
    const args = change.type === "edit"
      ? { file: change.file, search: change.search, replace: change.replace }
      : change;
    const hookResult = await executePreHooks(toolName, args, metadata);
    if (!hookResult.allowed) {
      throw new Error(`Hook denied ${toolName}: ${hookResult.denyReason}`);
    }
    if (hookResult.modifiedArgs) {
      if (hookResult.modifiedArgs.search !== undefined) {
        change.search = hookResult.modifiedArgs.search;
      }
    }
  }
  return { changes, riskAssessment };
}
```

**影响**: `validateSearchNotEmpty` hook 现在能正确将空 search 字符串转换为 `"(empty - creating new file)"`。

---

### task-2: 并发竞争条件 ⚠️ 未修复

**问题**: 识别但未纳入本次迭代，将在后续迭代处理。

**说明**: task.json 状态原子更新涉及较复杂的状态管理改动，待 Task-3 (AppliedChanges) 和 Task-4 (语义验证) 修复验证后再处理。

---

### task-3: AppliedChanges 日志修复 ✅

**文件**: `src/core/workflow.js`

**问题**: `applyResult?.changes` 始终为 `undefined`（`safeApplyPatch` 返回 `{ok, appliedFiles, error}` 无 `changes` 字段），导致日志中 `appliedChanges` 永远为空数组。

**修复**:
```js
// Before (line 708, 779)
appliedChanges: applyResult?.changes?.map((c) => ({ type: c.type, ...c })) || [],

// After
appliedChanges: (applyResult?.appliedFiles || []).map((f) => ({ type: 'applied', path: f })),
```

**影响**: result.json 中现在能看到实际修改的文件列表。

---

### task-4: 语义验证绕过修复 ✅

**文件**: `src/core/verifier.js`

**问题**: `ensureReviewShape` 的 salvage 逻辑在处理 schema echo 时假设 `ok=true`，即使 `issues` 非空。

**修复**:
```js
// Before
json = { ok: true, issues, feedback_for_generator: feedback };

// After
json = { ok: issues.length === 0, issues, feedback_for_generator: feedback };
```

**影响**: 模型返回 schema echo 时，issues 非空会正确标记为验证失败。

---

### task-5: Import 正则补充 ✅

**文件**: `src/utils/fs_tools.js`

**问题**: 正则表达式遗漏三种常见语法：
- `import "file"` (side-effect import)
- `import * as name from "file"` (namespace import)
- `export default from "file"` (default export without braces)

**修复**:
```js
// 新增三个正则
const sideEffectImportRe = /\bimport\s+["']([^"']+)["']/g;
const namespaceImportRe = /\bimport\s+\*\s+as\s+\w+\s+from\s+["']([^"']+)["']/g;
const exportDefaultFromRe = /\bexport\s+default\s+from\s+["']([^"']+)["']/g;

// 更新处理数组
for (const re of [importRe, dynamicImportRe, exportFromRe, requireRe, sideEffectImportRe, namespaceImportRe, exportDefaultFromRe]) {
```

**影响**: 依赖图解析覆盖率提升，能正确识别更多现代 JS/TS 语法。

---

## 测试结果

| 测试类型 | 结果 |
|----------|------|
| 语法检查 (parser.js) | ✓ |
| 语法检查 (workflow.js) | ✓ |
| 语法检查 (verifier.js) | ✓ |
| 语法检查 (fs_tools.js) | ✓ |
| 回归测试 (npm test) | ✓ 401 tests passed, 0 failed |

---

## 未纳入本次迭代的问题

| 问题 | 严重度 | 原因 |
|------|--------|------|
| 并发竞争条件 | High | 涉及状态管理改动较大 |
| Squash 失败未清理 | Medium | 待独立迭代 |
| Rollback SHA 未验证 | Low | 低优先级 |
| Timeout 竞争 | Medium | 低优先级 |
| Replan 计数器超限 | Low | 低优先级 |
| 隐藏文件支持 | Low | 低优先级 |

---

## 教训与总结

1. **Async 函数签名变更的影响**: 将 `parseToolCalls` 改为 async 后，现有的同步 `assert.throws()` 测试需要改为 `assert.rejects()`。这提醒我们在修改函数签名时需要同步更新所有调用点和测试。

2. **Pre-hooks 集成位置**: 正确的做法是在 `parseToolCalls` 返回前对每个 change 应用 hooks，而不是在外部单独调用。这确保了所有通过 `parseToolCalls` 路径的 change 都会经过 hook 处理。

3. **Salvage 逻辑的假设**: 当 salvage 一条非标准响应时，不应该假设 `ok=true`。更安全的做法是保守地设置 `ok=false`，让上层处理验证失败。
