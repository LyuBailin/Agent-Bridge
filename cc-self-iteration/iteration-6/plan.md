# 迭代 6 修复计划

## DAG 结构

```
[task-1: 修复 Pre-Hooks 旁路] --> [task-6: 测试验证]
[task-2: 修复并发竞争条件] --> [task-6]
[task-3: 修复 AppliedChanges 日志] --> [task-6]
[task-4: 修复语义验证绕过] --> [task-6]
[task-5: 补充 Import 正则] --> [task-6]
```

## 任务列表

| ID | 描述 | 目标文件 | 依赖 | 难度 |
|----|------|----------|------|------|
| 1 | Pre-Hooks 旁路修复：parseToolCalls 中调用 executePreHooksBatch | `src/core/adapter/parser.js` | - | 20 |
| 2 | 并发竞争条件修复：task.json 状态原子更新 | `src/core/workflow.js` | - | 35 |
| 3 | AppliedChanges 日志修复：返回结构增加 changes 字段 | `src/core/workflow.js` + `src/core/git_manager.js` | - | 15 |
| 4 | 语义验证绕过修复：issues 非空时设置 ok=false | `src/core/verifier.js` | - | 20 |
| 5 | Import 正则补充：增加 side-effect/namespace/export default 正则 | `src/utils/fs_tools.js` | - | 25 |
| 6 | 语法检查 + npm test 验证 | - | 1, 2, 3, 4, 5 | 15 |

## 任务详情

### task-1：修复 Pre-Hooks 旁路

**文件**: `src/core/adapter/parser.js`

**修改**:
在 `parseToolCalls` 函数返回前添加 pre-hooks 调用：

```js
// parseToolCalls 函数末尾
// 执行 pre-hooks
executePreHooksBatch(changes);

return { changes, riskAssessment };
```

**验收标准**: `validateSearchNotEmpty` hook 能正确设置 `search = "(empty - creating new file)"`

### task-2：修复并发竞争条件

**文件**: `src/core/workflow.js`

**修改**:
在 `executeWorkflow` 或 `orchestrateTask` 中，任务状态更新使用原子操作：

```js
// 读取当前状态
const taskContent = await env._safeReadJson(env.taskPath, {});
// 检查是否已被抢占
if (taskContent.status === "processing" || taskContent.status === "completed") {
  return;  // 跳过已处理的任务
}
// 原子更新为 processing
await env._safeWriteJson(env.taskPath, { ...taskContent, status: "processing" });
```

**验收标准**: 两个并发实例不会同时处理同一 task_id

### task-3：修复 AppliedChanges 日志

**文件**: `src/core/workflow.js` + `src/core/git_manager.js`

**修改**:

方案 A（推荐）：在 workflow.js 中直接用 appliedFiles 构造 appliedChanges：

```js
appliedChanges: (applyResult?.appliedFiles || []).map(f => ({ type: 'applied', path: f })),
```

**验收标准**: result.json 中能看到实际修改的文件列表

### task-4：修复语义验证绕过

**文件**: `src/core/verifier.js`

**修改**:
`ensureReviewShape` 函数中，salvage 逻辑增加 issues 检查：

```js
} else if (typeof json.issues !== "undefined" || typeof json.feedback_for_generator !== "undefined") {
  const issues = Array.isArray(json.issues) ? json.issues : [];
  const feedback = typeof json.feedback_for_generator === "string" ? json.feedback_for_generator : "";
  // issues 非空时设为 ok=false
  json = { ok: issues.length === 0, issues, feedback_for_generator: feedback };
}
```

**验收标准**: 模型返回 schema echo 时，issues 非空会正确标记为验证失败

### task-5：补充 Import 正则

**文件**: `src/utils/fs_tools.js`

**修改**:
增加三个新正则并更新 `extractImportGraph`：

```js
const sideEffectImportRe = /\bimport\s+["']([^"']+)["']/g;
const namespaceImportRe = /\bimport\s+\*\s+as\s+\w+\s+from\s+["']([^"']+)["']/g;
const exportDefaultFromRe = /\bexport\s+default\s+from\s+["']([^"']+)["']/g;
```

**验收标准**: `import "file"`、`import * as name`、`export default from` 能被正确解析

### task-6：测试验证

**操作**:
```bash
node --check src/core/adapter/parser.js
node --check src/core/workflow.js
node --check src/core/verifier.js
node --check src/utils/fs_tools.js
npm test
```

## 依赖关系说明

- task-1 到 task-5 相互独立，可并行
- task-6 依赖所有其他任务

## 风险评估

| 任务 | 风险 | 说明 |
|------|------|------|
| task-1 | 低 | 仅添加函数调用 |
| task-2 | 中 | 涉及状态管理，需确保回滚逻辑正确 |
| task-3 | 低 | 仅修改变量映射 |
| task-4 | 低 | 仅调整条件逻辑 |
| task-5 | 低 | 正则补充不影响现有匹配 |
| task-6 | 低 | 纯验证 |

## 未纳入本次迭代的任务（低优先级）

- Squash 失败后 staged changes 清理（task-7）
- Rollback SHA 验证（task-8）
- Timeout 竞争处理（task-9）
- Replan 计数器修正（task-10）
- 隐藏文件支持（task-11）
