# 迭代 2 优化计划

## DAG 结构

```
[task-1: structuredClone替换] --> [task-4: 更新调用]
[task-2: mock helper提取]     --> [task-4]
[task-3: attempt循环提取]      (独立，可并行)
```

## 任务列表

| ID | 描述 | 目标文件 | 依赖 | 难度 |
|----|------|----------|------|------|
| 1 | 替换 JSON.parse(JSON.stringify()) 为 structuredClone | planner.js | - | 15 |
| 2 | 提取 mock fallback helper | adapter/index.js | - | 30 |
| 3 | 提取 executeSubtaskAttempt 函数 | workflow.js | - | 55 |
| 4 | 验证修改正确性 | - | 1,2 | 10 |

## 任务详情

### Task 1: structuredClone 替换

**文件**: `src/core/planner.js`

**操作**: 替换以下 6 处：
- 行 625: `const next = JSON.parse(JSON.stringify(tree));`
- 行 709: `const next = JSON.parse(JSON.stringify(tree));`
- 行 717: `const next = JSON.parse(JSON.stringify(tree));`
- 行 755: `const next = JSON.parse(JSON.stringify(tree));`
- 行 785: `const next = JSON.parse(JSON.stringify(tree));`
- 行 800: `const next = JSON.parse(JSON.stringify(oldTree));`

→ `structuredClone(tree)` / `structuredClone(oldTree)`

**注意**: structuredClone 不支持函数、Symbol、undefined 值的序列化。如果 tree 中包含这些值，可能需要额外处理。但根据上下文，这些 tree 对象是 planTree 状态对象，应该只包含可序列化的 JSON 数据。

### Task 2: mock fallback helper 提取

**文件**: `src/core/adapter/index.js`

**操作**: 创建 `withMockFallback` helper：

```javascript
async function withMockFallback(mockConfig, actualFn) {
  const mock = await readMockTextFromEnv(mockConfig);
  if (mock !== null) return mock;
  return actualFn();
}
```

然后在每个 provider 的 `generateCode` 中使用：

```javascript
// Before
async generateCode(prompt) {
  const mock = await readMockTextFromEnv({...});
  if (mock !== null) return mock;
  return callOllama(prompt, {...});
}

// After
async generateCode(prompt) {
  return withMockFallback(
    { singleVar: SIMULATION_ENV.RESPONSE_FILE, listVar: SIMULATION_ENV.RESPONSE_FILES, listIdxVar: SIMULATION_ENV.RESPONSE_FILES_IDX },
    () => callOllama(prompt, {...})
  );
}
```

### Task 3: executeSubtaskAttempt 提取

**文件**: `src/core/workflow.js`

**操作**: 将 for attempt 循环 (行 495-742) 提取为独立函数。这是最复杂的任务，需要仔细处理状态传递。

**注意**: 此任务难度较高(55)，建议在 Task 1 和 Task 2 完成后作为最后一个任务处理。

### Task 4: 验证

- `node --check` 验证 planner.js 和 adapter/index.js 语法
- 运行 `npm test` 回归测试
