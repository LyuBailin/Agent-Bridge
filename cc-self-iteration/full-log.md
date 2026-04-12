# Agent Bridge 迭代优化完整日志

## 迭代 1 (2026-04-10)

### 审查发现
- 问题数量: 10 个 (3 高优先级, 4 中优先级, 3 低优先级)
- 主要问题: workflow.js 过大, safeApplyPatch 过长, 常量重复

### 执行任务
- Task 1: 提取共享常量 ✓
- Task 2: 提取 handleApplyFailure ✓
- Task 3: 重构 safeApplyPatch 策略模式 ✓
- Task 4: 提取 buildSubtaskContext ✓
- Task 5: 重构 createProvider ✓

### 测试结果
- npm test: 401 tests passed, 0 failed
- 语法检查: 全部通过

### 修改文件
- `src/shared/constants.js` (新增)
- `src/core/git_manager.js` (重构)
- `src/core/adapter/parser.js` (修改引用)
- `src/core/workflow.js` (提取函数)
- `src/core/adapter/index.js` (重构)

### 提交
- `b27f1a6`: checkpoint iteration-1: extract constants, refactor safeApplyPatch, extract handleApplyFailure
- Iteration 1 completed: all 5 tasks done

## 迭代 2 (2026-04-10)

### 审查发现
- 问题数量: 5 个 (2 高优先级, 2 中优先级, 1 低优先级)
- 主要问题: planner.js JSON.parse(JSON.stringify()) 效率问题, adapter/index.js mock 调用重复

### 执行任务
- Task 1: 替换 JSON.parse(JSON.stringify()) 为 structuredClone ✓
- Task 2: 提取 mock fallback helper ✓
- Task 3: 提取 executeSubtaskAttempt (延后，高风险)

### 测试结果
- npm test: 401 tests passed, 0 failed
- 语法检查: 全部通过

### 修改文件
- `src/core/planner.js` (6 处 structuredClone 替换)
- `src/core/adapter/index.js` (添加 withMockTextFallback, withMockJsonFallback helper)

### 提交
- `30e91df`: checkpoint iteration-2: task1-2 complete (structuredClone, mock helper)

## 迭代 3 (2026-04-10)

### 审查发现
- Bug发现: 执行 phase-4-data-visualization-v4.0 时，语义验证器导致无限 replan 循环
- 根因: semanticVerify 只传 git diff，不传实际文件内容；"strict code reviewer" 将"无法验证"误判为 blocking

### 执行任务
- Task 1: verifier 传递文件内容到 semanticVerify ✓
- Task 2: 放松 blocking 条件 ✓
- Task 3: 验证修复 ✓

### 测试结果
- npm test: 401 tests passed, 0 failed
- 语法检查: 全部通过

### 修改文件
- `src/core/verifier.js` (传递实际文件内容，放松 blocking 条件)
- `src/core/workflow.js` (调用 semanticVerify 时传递 changed_files)

### 提交
- `42adc72`: checkpoint iteration-3: fix semantic verifier infinite replan bug (pass file contents, relax blocking)

## 迭代 4 (2026-04-10)

### 审查发现
- BUG-002: Phase 5 在 semantic_verify 阶段失败
- 根因: Claude CLI 返回 `{"type":"ok":true,...}` 而非预期的 `{"ok":true,...}`
- MiniMax-M2.7 模型通过 Claude CLI 返回了结构错误的 JSON（将 "ok" 放在了 "type" 字段中）

### 执行任务
- Task 1: ensureReviewShape 改进，增加错误诊断 ✓
- Task 2: prompt 增强，明确 JSON 格式要求（禁止将 ok 放在 type 字段中）✓
- Task 3: 手动完成 Phase 5 (测试和文档) ✓

### 测试结果
- npm test: 401 tests passed, 0 failed
- 语法检查: 全部通过

### 修改文件
- `src/core/verifier.js` (ensureReviewShape 函数增强 + prompt 格式明确化)
- `config.json` (anthropic.model 设为 MiniMax-M2.7)

### Phase 5 完成内容
- Backend: jest, supertest, swagger-ui-express, swagger-jsdoc 安装
- Backend tests: auth.test.js, api.test.js, error.test.js
- Swagger: swagger.json (完整 OpenAPI 3.0 规范)
- Server.js: 集成 swagger-ui-express
- Frontend: cypress.config.js, cypress/support/e2e.js, cypress/e2e/app.cy.js

### 根因分析
- MiniMax-M2.7 通过 Claude CLI 返回 JSON 时，错误地将布尔值放在 "type" 字段中
- 原因：schema 中的 `"ok": { "type": "boolean" }` 被模型误读为"返回一个 type 字段"
- 修复方案：
  1. **预防**：prompt 中增加明确的格式要求，禁止将 ok 放在 type 字段中
  2. **补救**：ensureReviewShape 函数增强，尝试 salvage 畸形响应
- ensureReviewShape 补救逻辑仍保留，作为最后防线

## 迭代 5 (2026-04-10)

### 审查发现
- 问题数量: 6 个 (3 高优先级, 3 中优先级)
- 主要问题: 难度评估关键词可绕过、上下文扩展单向（只用 reverseEdges）、import graph 解析脆弱
- 审查方式: 人工代码审查，非任务失败触发

### 执行任务
- Task 1: 双向 import 图扩展 ✓
- Task 2: import graph 解析增强 (动态 import + export from) ✓
- Task 3: likelyPaths 文件存在性校验 ✓
- Task 4: 更新 expandRelatedFiles 调用 (传入 edges + direction) ✓
- Task 5: 校准 evaluateComplexity (集成存在性校验) ✓
- Task 6: 更新 workflow.js 上下文收集 ✓
- Task 7: 测试验证 ✓

### 测试结果
- npm test: **401 tests passed, 0 failed** ✓

### 修改文件
- `src/utils/fs_tools.js` (expandRelatedFiles 双向扩展 + import graph 解析增强)
- `src/core/planner.js` (extractLikelyPaths 增加 workspaceDir 存在性校验)
- `src/core/workflow.js` (expandRelatedFiles 调用传入 edges + direction)

### 根因分析
1. **难度评估**: 基于硬编码关键词，无语义理解；likelyPathCount 不验证文件存在性；replan 时未动态校准
2. **上下文管理**: expandRelatedFiles 只用 reverseEdges 单向扩展，遗漏子模块；import graph 解析对动态 import/export from/TS 无效；optimizeContext greedy fill 无语义排序

### 优先级建议
- ★★★★★ 双向 import 图扩展 (task-1, task-4)
- ★★★★★ import graph 解析改进 (task-2, task-4)
- ★★★★ likelyPaths 文件存在性校验 (task-3, task-5)
- ★★★★ LLM 难度校准 (规划中，未排入 task)
- ★★★ 向量嵌入 (workspace 30+ 文件，规模不足，暂缓)

## 迭代 9 (2026-04-12)

### 审查发现
- 问题数量: 4 个 (2 高优先级, 2 中优先级)
- 主要问题: 正则表达式无法处理内容中包含 `>>>` 的情况；模型生成的 sr 块缺少 `>>>` 结束标记

### 执行任务
- Task 1: 修复正则表达式 ✓
- Task 2: 改进错误信息 ✓
- Task 3: 更新操作指南 ✓

### 测试结果
- npm test: 401 tests passed, 0 failed ✓

### 修改文件
- `src/core/adapter/parser.js` (正则改为 `\n>>>` 要求独占一行；错误信息增加 block preview)
- `src/prompt/operation_guidelines.js` (添加 `>>> prohibition` 规则)

### 提交
- `a7b2ad0`: checkpoint iteration-9: fix sr block regex to use \n>>> marker
- `3a19de0`: checkpoint iteration-9: add >>> prohibition in sr block content

## 迭代 10 (2026-04-12)

### 问题发现
- 迭代 9 的正则修复 `\n>>>` 有缺陷：它会错误匹配 `>>> text` 中前面有换行的 `>>>`
- 例如：`>>> This is another line.` 中的 `>>>` 前面有 `\n`，会被误识别为结束标记

### 根因分析
- `\n>>>` 只要求前面有 `\n`，不验证后面
- 正确的结束标记应该是 `>>>` 独占一行（前面是 `\n`，后面是 `\n` 或文件结束）

### 修复方案
- 正则改为 `\n>>>(?=\n|$)`：使用前瞻断言验证后面是 `\n` 或文件结束
- 这确保只有独占一行的 `>>>` 才是结束标记

### 测试验证
- npm test: 401 tests passed, 0 failed ✓

### 修改文件
- `src/core/adapter/parser.js` (正则改为 `\n>>>(?=\n|$)`)

### 提交
- `72d05ee`: iteration-10: fix regex to use \n>>>(?=\n|$) for proper end marker detection

