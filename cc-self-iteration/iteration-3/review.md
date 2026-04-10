# 迭代 3 审查报告

## Bug 发现

### 任务执行失败原因
- **任务**: phase-4-data-visualization-v4.0
- **症状**: 语义验证失败导致无限 replan 循环
- **错误信息**:
  - "The diff shows the old `backend/server.js` was deleted and `index.js` now references `./lib/server`, but the contents of `backend/lib/server.js` are not included in the diff"
  - "The change from `require('express')` to `require('./lib/express')` is a critical issue"

## 根本原因分析

### 问题定位

**文件**: `src/core/verifier.js`
**函数**: `semanticVerify` (lines 78-147)

### 根因

1. **git diff 不足以进行语义验证**
   - verifier 只接收 git diff 文本，不接收实际文件内容
   - 当代码重构时（文件重命名/移动），git diff 不包含新文件的完整内容
   - verifier 看到 "文件被删除 + 新引用路径"，误判为 "critical issue"

2. **"strict code reviewer" 系统提示词过于严格**
   - verifier.js:111-124 - 系统提示要求严格审查，将许多情况视为 blocking
   - 但判断依据（diff）不完整，导致误判

3. **错误反馈导致无限重试循环**
   - workflow.js:685-692 - 语义验证失败后，误导性的错误信息被传回生成器
   - 生成器尝试"修复"不存在的问题，导致再次失败，无限循环

### 问题代码行

| 文件 | 行号 | 问题 |
|------|------|------|
| src/core/verifier.js | 111-124 | "strict code reviewer" 系统提示过于严格 |
| src/core/verifier.js | 126-133 | 只传 git diff，没有实际文件内容 |
| src/core/workflow.js | 685-692 | 误导性反馈传入重试循环 |

## 修复方向

1. **传递实际文件内容**: 在 semanticVerify 中传递 apply 后工作区的实际文件内容，而不仅仅是 git diff
2. **放松 blocking 条件**: 区分 "会崩溃" vs "我无法验证"，只阻止前者
3. **检测 rename 场景**: 当 git diff 显示文件删除+新路径引用时，识别为 rename 并提供上下文

## 建议优先级

| 优先级 | 修复方案 | 难度 |
|--------|----------|------|
| 高 | 传递实际文件内容到 verifier | 40 |
| 高 | 放松 blocking 条件（"无法验证"不应该是 blocking） | 25 |
| 中 | 添加 rename 检测上下文 | 35 |
