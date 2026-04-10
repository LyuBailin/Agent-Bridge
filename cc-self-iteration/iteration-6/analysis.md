# 迭代 6 分析：核心 Bug 修复

## 问题 1：Pre-Hooks 旁路问题（High）

### 当前实现

`parseToolCalls` 函数（`src/core/adapter/parser.js:224-335`）处理模型输出的 tool calls：

```js
function parseToolCalls(toolCalls, fsTools, workspaceDir, options = {}) {
  const riskAssessment = classifyBatchRisk(toolCalls);

  if (riskAssessment.blockingIssues.length > 0) {
    throw new Error(`Blocking risk detected...`);
  }

  for (const toolCall of toolCalls) {
    validateOperation(name);  // Line 256
    // ... path checks
  }

  return { changes, riskAssessment };
}
```

### 问题分析

Pre-hooks（如 `validateSearchNotEmpty`）定义在 `hooks.js` 中，用于在操作执行前修改参数：

```js
// hooks.js - 存在但从未被调用
const HOOK_REGISTRY = {
  search: [validateSearchNotEmpty],
  // ...
};

function executePreHooksBatch(changes) {
  for (const change of changes) {
    const hooks = HOOK_REGISTRY[change.type] || [];
    for (const hook of hooks) {
      hook(change);
    }
  }
}
```

**问题**：`parseToolCalls` 路径中完全没有调用 `executePreHooksBatch`。这导致：
- SEARCH 操作中 `search` 为空时，补偿逻辑 `"(empty - creating new file)"` 永远不会被设置
- 其他 pre-hooks 也全部失效

### 修复方案

在 `parseToolCalls` 返回前调用 pre-hooks：

```js
function parseToolCalls(toolCalls, fsTools, workspaceDir, options = {}) {
  // ... existing logic ...

  // 执行 pre-hooks
  executePreHooksBatch(changes);

  return { changes, riskAssessment };
}
```

---

## 问题 2：并发任务处理竞争条件（High）

### 当前实现

`src/core/workflow.js:335-367` 中的重复任务检查：

```js
const alreadyProcessed = await env._safeReadJson(env.memoryPath, { processed: {} }).then(
  (m) => Boolean(m?.processed && m.processed[task.task_id])
);

// ... 后续处理 ...

await env._recordMemory(env.memoryPath, (m) => {
  m.processed = m.processed || {};
  m.processed[task.task_id] = { ts: nowIso(), status: "completed" };
  return m;
});
```

### 问题分析

经典的 check-then-act 竞争条件：
1. Instance A 读取 `alreadyProcessed = false`
2. Instance B 读取 `alreadyProcessed = false`
3. Instance A 处理任务
4. Instance B 也处理任务

### 修复方案

使用文件锁或原子操作。推荐方案：使用 `git` 机制的变体（task.json 文件本身受 git 管理）

```js
// 在写入 task.json 前先检查并原子更新
const taskContent = await env._safeReadJson(env.taskPath, {});
if (taskContent.status === "processing") {
  // 已被其他实例抢占
  return;
}
// 原子更新状态
await env._safeWriteJson(env.taskPath, { ...taskContent, status: "processing" });
```

---

## 问题 3：AppliedChanges 日志永远为空（Medium）

### 当前实现

`src/core/workflow.js:708,779`：

```js
appliedChanges: applyResult?.changes?.map((c) => ({ type: c.type, ...c })) || [],
```

### 问题分析

`safeApplyPatch`（`git_manager.js:314-321`）返回结构：

```js
return { ok: false, appliedFiles, error: result.error };
// 没有 changes 字段！
```

`appliedFiles` 只包含文件名数组，不是完整的 change 对象。

### 修复方案

修改 `safeApplyPatch` 返回结构，增加 `changes` 字段：

```js
return {
  ok: false,
  appliedFiles,
  changes: appliedFiles.map(f => ({ type: 'unknown', path: f })),
  error: result.error
};
```

或在 `workflow.js` 中直接记录 `appliedFiles`：

```js
appliedChanges: (applyResult?.appliedFiles || []).map(f => ({ type: 'applied', path: f })),
```

---

## 问题 4：语义验证绕过风险（Medium）

### 当前实现

`src/core/verifier.js:71-88`：

```js
if (typeof json.ok !== "boolean") {
  if (json.type === "ok" || json.type === "true" || json.type === true) {
    if (typeof json.ok === "boolean") {
      // ok exists as boolean but under wrong key path
    } else if (typeof json.issues !== "undefined" || typeof json.feedback_for_generator !== "undefined") {
      // Try to salvage
      const issues = Array.isArray(json.issues) ? json.issues : [];
      const feedback = typeof json.feedback_for_generator === "string" ? json.feedback_for_generator : "";
      json = { ok: true, issues, feedback_for_generator: feedback };  // 假设 ok=true!
    }
  }
}
```

### 问题分析

当模型返回 schema 结构（如 `{"type": "ok", "issues": [...]}`）而非实际数据时，salvage 逻辑假设 `ok=true`，可能掩盖真正的验证失败。

### 修复方案

增加显式检查：当 `issues` 非空时，应视为需要关注的问题：

```js
if (issues.length > 0) {
  json = { ok: false, issues, feedback_for_generator: feedback };
} else {
  json = { ok: true, issues: [], feedback_for_generator: feedback };
}
```

---

## 问题 5：Import 正则不完整（Medium）

### 当前实现

`src/utils/fs_tools.js:168-171`：

```js
const importRe = /\bimport\s+(?:(?:type\s+)?\{[^}]+\}\s+from\s+|default\s+from\s+)?["']([^"']+)["']/g;
const dynamicImportRe = /import\s*\(\s*["']([^"']+)["']\s*\)/g;
const requireRe = /\brequire\s*\(\s*["']([^"']+)["']\s*\)/g;
const exportFromRe = /\bexport\s+\{[^}]+\}\s+from\s+["']([^"']+)["']/g;
```

### 问题分析

遗漏的语法：
- `import "file"` — side-effect import（无 `from`）
- `import * as name from "file"` — namespace import
- `export default from "file"` — default export without braces

### 修复方案

补充正则：

```js
const sideEffectImportRe = /\bimport\s+["']([^"']+)["']/g;  // import "file"
const namespaceImportRe = /\bimport\s+\*\s+as\s+\w+\s+from\s+["']([^"']+)["']/g;
const exportDefaultFromRe = /\bexport\s+default\s+from\s+["']([^"']+)["']/g;
```

---

## 问题 6：Squash 失败后 staged changes 未清理（Medium）

### 当前实现

`src/core/git_manager.js:367-390`：

```js
async function squashAndCommit(workspaceDir, { taskId, baseSha, finalMessage } = {}) {
  await runGit(workspaceDir, ["reset", "--soft", baseSha]);  // Stages all changes
  const msg = typeof finalMessage === "string" && finalMessage.trim() ? ... : ...;
  await runGit(workspaceDir, ["commit", "-m", msg]);  // 如果这里失败...
  // ... 没有 catch
}
```

### 问题分析

如果 `git commit` 失败（空消息、rebase conflicts 等），`reset --soft` 已经 staged 的变更会保留在 index 中。

### 修复方案

增加 try-catch 并清理：

```js
async function squashAndCommit(...) {
  await runGit(workspaceDir, ["reset", "--soft", baseSha]);
  try {
    await runGit(workspaceDir, ["commit", "-m", msg]);
  } catch (err) {
    // 恢复到原始状态
    await runGit(workspaceDir, ["reset", "--mixed", "HEAD"]);
    throw err;
  }
}
```

---

## 问题 7：Rollback 前未验证 SHA 有效性（Low）

### 当前实现

`src/core/git_manager.js:353-357`：

```js
async function rollback(workspaceDir, snapshotSha) {
  if (!snapshotSha) throw new Error("rollback requires snapshotSha");
  await runGit(workspaceDir, ["reset", "--hard", snapshotSha]);
  await runGit(workspaceDir, ["clean", "-fd"]);
}
```

### 问题分析

如果 `snapshotSha` 无效或已被 GC（`git reflog` 过期），`git reset --hard` 可能失败或 reset 到无关 commit。

### 修复方案

验证 SHA 存在：

```js
async function rollback(workspaceDir, snapshotSha) {
  if (!snapshotSha) throw new Error("rollback requires snapshotSha");
  // 验证 SHA 存在
  try {
    await runGit(workspaceDir, ["cat-file", "-e", `${snapshotSha}^{commit}`]);
  } catch {
    throw new Error(`Invalid or expired snapshot SHA: ${snapshotSha}`);
  }
  await runGit(workspaceDir, ["reset", "--hard", snapshotSha]);
  await runGit(workspaceDir, ["clean", "-fd"]);
}
```

---

## 问题 8：Timeout 处理竞争（Medium）

### 当前实现

`src/core/adapter/providers/claude_cli.js:226-243`：

```js
const timeout = setTimeout(() => {
  timeoutFired = true;
  killedByUs = true;
  child.kill("SIGTERM");
  reject(new Error(`Claude CLI timeout after ${timeoutMs}ms`));
}, timeoutMs);

child.on("close", () => {
  clearTimeout(timeout);
  if (timeoutFired && !killedByUs) {
    // race warning
  }
});
```

### 问题分析

SIGTERM 发送后，`close` 事件仍会触发。`clearTimeout(timeout)` 在 close handler 中执行，但 `timeoutFired` 标志已被设置，可能导致重复 reject。

### 修复方案

增加 `closed` 标志防止重复处理：

```js
let closed = false;
child.on("close", () => {
  if (closed) return;
  closed = true;
  clearTimeout(timeout);
  // ...
});
```

---

## 问题 9：Replan 计数器超限后仍递增（Low）

### 当前实现

`src/core/planner.js:715-721`：

```js
if ((tree.replans ?? 0) >= maxReplans) {
  const next = structuredClone(tree);
  next.replans = (next.replans ?? 0) + 1;  // 已达上限但仍递增
  next.updated_at = nowIso();
  return next;
}
```

### 修复方案

```js
if ((tree.replans ?? 0) >= maxReplans) {
  const next = structuredClone(tree);
  // 不再递增
  next.updated_at = nowIso();
  return next;
}
```

---

## 问题 10：隐藏文件导入被忽略（Low）

### 当前实现

`src/utils/fs_tools.js:138-146`：

```js
function normalizeImportTarget(fromFile, target) {
  if (!t.startsWith("./") && !t.startsWith("../")) return null;
  // .hidden/file.js 不匹配 ./ 规则
}
```

### 修复方案

增加 `.` 检查：

```js
if (!t.startsWith("./") && !t.startsWith("../") && !t.startsWith(".")) return null;
```

---

## 优先级建议

| 问题 | 严重度 | 成本 | 收益 | 推荐度 |
|------|--------|------|------|--------|
| Pre-Hooks 旁路 | High | 低 | 高 | ★★★★★ |
| 并发竞争条件 | High | 中 | 高 | ★★★★★ |
| AppliedChanges 日志 | Medium | 低 | 中 | ★★★★ |
| 语义验证绕过 | Medium | 低 | 高 | ★★★★ |
| Import 正则不完整 | Medium | 低 | 高 | ★★★★ |
| Squash 失败处理 | Medium | 低 | 中 | ★★★★ |
| SHA 验证 | Low | 低 | 低 | ★★★ |
| Timeout 竞争 | Medium | 低 | 中 | ★★★ |
| Replan 计数器 | Low | 低 | 低 | ★★ |
| 隐藏文件支持 | Low | 低 | 低 | ★★ |
