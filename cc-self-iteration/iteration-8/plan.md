# 迭代 8 修复计划

## DAG 结构

```
[task-1: 并发竞争条件修复] --> [task-2: 测试验证]
```

## 任务列表

| ID | 描述 | 目标文件 | 状态 |
|----|------|----------|------|
| 1 | 并发竞争条件修复：task.json status 作为主锁 | `src/core/workflow.js` | ✅ 完成 |
| 2 | 语法检查 + npm test 验证 | - | ✅ 完成 |

## 任务详情

### task-1：并发竞争条件修复

**文件**: `src/core/workflow.js`

**修改**:
1. 首先检查 task.json status，如果不是 "queued" 则跳过
2. 尝试将 task.json status 设置为 "running"
3. 二次确认 task.json 状态是否仍为当前实例设置
4. 最后检查 memoryPath（处理进程重启情况）

**验收标准**: 两个并发实例不会同时处理同一 task_id

### task-2：测试验证

**操作**:
```bash
node --check src/core/workflow.js
npm test
```

**结果**: 401 tests passed, 0 failed
