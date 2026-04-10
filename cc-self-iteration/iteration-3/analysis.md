# 迭代 3 记录与分析

## Bug 发现

### BUG-001: 语义验证器导致无限 replan 循环

**发现场景**: 执行 phase-4-data-visualization-v4.0 任务时，语义验证反复失败

**错误日志**:
```
task phase-4-data-visualization-v4.0:r2_r1_s1 semantic_verify feedback: The diff shows the old `backend/server.js` was deleted and `index.js` now references `./lib/server`, but the contents of `backend/lib/server.js` are not included in the diff
task phase-4-data-visualization-v4.0:r2_r1_s1: max replans (5) exceeded, marking subtask as skipped
```

**根因分析**:
1. `semanticVerify` 只传递 git diff 给 reviewer，不传递实际文件内容
2. 当代码重构时（文件重命名/移动），git diff 显示文件被删除 + 新路径引用，但不包含新文件的实际内容
3. reviewer 误判为 "critical issue - missing file content"，将其 blocking
4. 误导性反馈传回生成器 → 生成器尝试修复不存在的问题 → 再次失败 → 无限循环

**修复**:
1. 修改 `semanticVerify` 增加 `changed_files` 参数
2. 从 workspace 读取实际文件内容，传递给 reviewer
3. 放松 blocking 条件：只阻止会直接崩溃的错误，"无法验证"不再是 blocking

## 修改内容

### 文件: src/core/verifier.js
- **修改**: semanticVerify 函数重写
  - 增加 `opts.changed_files` 参数
  - 读取 changed files 的实际内容并传递给 reviewer
  - 修改系统提示词，放松 blocking 标准

### 文件: src/core/workflow.js
- **修改**: 调用 semanticVerify 时传递 `{ changed_files: applyResult?.appliedFiles ?? [] }`
