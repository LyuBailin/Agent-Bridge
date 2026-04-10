# 迭代 3 优化计划

## DAG 结构

```
[task-1: verifier传递文件内容] --> [task-3: 验证修复]
[task-2: 放松blocking条件]    --> [task-3]
```

## 任务列表

| ID | 描述 | 目标文件 | 依赖 | 难度 |
|----|------|----------|------|------|
| 1 | 传递实际文件内容到 semanticVerify | verifier.js | - | 40 |
| 2 | 放松 blocking 条件 | verifier.js | - | 25 |
| 3 | 验证修复 | - | 1,2 | 10 |

## 任务详情

### Task 1: 传递实际文件内容到 semanticVerify

**文件**: `src/core/verifier.js`

**问题**: semanticVerify 函数只接收 git diff，不接收 apply 后工作区的实际文件内容。当代码重构时，verifier 无法看到新创建的/重命名的文件的实际内容。

**修复方案**:
1. 修改 semanticVerify 函数签名，增加 `fileContents` 参数
2. 在调用 semanticVerify 的地方 (workflow.js) 传递 `applyResult.changes` 中涉及的文件在 apply 后的实际内容
3. 在 verifier 的 prompt 中，除了 git diff，还传递关键文件的实际内容

**具体修改**:
- verifier.js: 修改 semanticVerify({ task, workspaceDir, gitManager, claudeProvider, fileContents })
- workflow.js: 在调用 semanticVerify 时，从 applyResult 获取已修改文件的实际内容

### Task 2: 放松 blocking 条件

**文件**: `src/core/verifier.js`

**问题**: 系统提示词中的 "strict code reviewer" 将 "missing file content" 视为 blocking。

**修复方案**:
1. 修改系统提示词，将 "Treat ... as blockers" 改为更精确的描述
2. 只将 "会直接导致崩溃" 的情况视为 blocking（如使用了不存在的函数、明显的类型错误）
3. 将 "无法验证/缺少上下文" 的情况降级为 non-blocking 警告

### Task 3: 验证修复

- 运行 `npm test` 回归测试
- 语法检查
- 语义验证测试
