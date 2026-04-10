# 迭代 8 分析：并发竞争条件修复

## 问题描述

**文件**: `src/core/workflow.js`
**函数**: `orchestrateLongTask`
**严重度**: High

### 问题根因

在 `orchestrateLongTask` 函数开头的重复任务检查存在经典的 **check-then-act** 竞争条件：

```js
// 原代码 (lines 335-369)
const alreadyProcessed = await env._safeReadJson(env.memoryPath, { processed: {} }).then(
  (m) => Boolean(m?.processed && m.processed[task.task_id])
);

if (alreadyProcessed) {
  // skip...
}

// ... later ...
await env._markTask(env.taskPath, { status: "running", started_at: startedAt });
```

**竞争窗口**:
1. Instance A 读取 `memoryPath` → `alreadyProcessed = false`
2. Instance B 读取 `memoryPath` → `alreadyProcessed = false`
3. Instance A 继续处理任务
4. Instance B 也继续处理任务
5. 同一任务被两个实例同时处理，产生冲突的 git commit

### 修复方案

采用 **task.json status 作为主锁**的策略：

```js
// 1. 首先检查 task.json 状态，如果不是 "queued" 说明已被抢占
const currentTask = await env._safeReadJson(env.taskPath, {});
if (currentTask?.status !== "queued") {
  await env._appendLog(env.logPath, `task ${task.task_id} skipped (status=${currentTask?.status})`);
  return { ok: true, skipped: true };
}

// 2. 原子性地声明任务为 "running"
await env._markTask(env.taskPath, { status: "running", started_at: startedAt });

// 3. 二次确认：检查 task.json 状态是否仍为我们设置的状态
// （另一个实例可能在第一步和第二步之间也尝试获取任务）
const recheckTask = await env._safeReadJson(env.taskPath, {});
if (recheckTask?.status !== "running" || recheckTask?.started_at !== startedAt) {
  await env._appendLog(env.logPath, `task ${task.task_id} skipped (lost race to another instance)`);
  return { ok: true, skipped: true };
}

// 4. 安全地检查 memoryPath（处理进程重启的情况）
const alreadyProcessed = await env._safeReadJson(env.memoryPath, { processed: {} }).then(
  (m) => Boolean(m?.processed && m.processed[task.task_id])
);
```

### 修复效果

- **Instance A** 读取 task.json (status="queued") → 设置为 "running" → 处理任务
- **Instance B** 读取 task.json (status="running") → 跳过

两个实例不会同时处理同一任务。

---

## 教训与总结

1. **双重检查锁定 (Double-Checked Locking)**: 先检查 task.json 状态，再尝试原子性地设置，最后二次确认。这确保了即使在高并发情况下也不会有两个实例处理同一任务。

2. **使用 `started_at` 作为标识**: 因为 `started_at` 是当前实例生成的时间戳，通过比较 `started_at` 可以确认 task.json 的 "running" 状态是否由当前实例设置。

3. **状态机思维**: task.json 的 status 字段作为任务的状态机：queued → running → done/failed。只有处于 "queued" 状态的任务可以被认领。
