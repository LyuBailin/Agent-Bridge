# 项目当前状态

## 迭代进度

| 迭代 | 状态 | 完成任务 |
|------|------|----------|
| 1 | 完成 | Task 1-5 全部完成 |
| 2 | 完成 | Task 1-2 完成, Task 3 延后 |
| 3 | 完成 | Task 1-3 全部完成 (Bug修复) |
| 4 | 完成 | BUG-002修复 + Phase 5 手动完成 |
| 5 | 完成 | Task 1-7 全部完成 (双向import扩展 + 解析增强 + 存在性校验) |
| 6 | 完成 | 分析完成：11 个 bug 识别（Pre-Hooks旁路、并发竞争、日志空、验证绕过、正则不完整等） |
| 7 | 完成 | Task 1,3,4,5,6 完成 (Pre-Hooks修复 + AppliedChanges修复 + 语义验证修复 + Import正则补充)；Task-2 跳过 |
| 8 | 完成 | Task 1-2 完成 (并发竞争条件修复：双重检查锁定策略) |
| 9 | 完成 | 正则表达式修复 + 操作指南更新 |
| 10 | 完成 | 正则表达式最终修复：使用 \n>>>(?=\n\|$) 前瞻断言 |
| 11 | 完成 | JSON Schema 验证支持：parseJsonToolCalls + JSON-first 解析策略 |

## 已完成的优化

### 迭代 1
1. **常量去重**: `EMPTY_SEARCH_PATTERNS` 提取到 `src/shared/constants.js`
2. **safeApplyPatch 重构**: 使用策略模式，代码从 330 行减少到 45 行
3. **handleApplyFailure 提取**: 从 workflow.js 提取 45 行处理逻辑
4. **buildSubtaskContext 提取**: 从 workflow.js 提取 50 行上下文构建逻辑
5. **createProvider 重构**: 拆分为 3 个独立 provider 创建函数 + 调度器

### 迭代 2
1. **structuredClone 替换**: planner.js 中 6 处 `JSON.parse(JSON.stringify())` → `structuredClone()`
2. **mock helper 提取**: adapter/index.js 中提取 `withMockTextFallback` 和 `withMockJsonFallback`

### 迭代 3
1. **semanticVerify 修复**: 传递实际文件内容 + 放松 blocking 条件，修复无限 replan 循环 bug

### 迭代 4
1. **BUG-002 修复**: ensureReviewShape 函数增强 + prompt 格式明确化，处理 Claude CLI 返回的畸形 JSON（`{"type":"ok":...}` 而非 `{"ok":...}`）
2. **config.json**: anthropic.model 设为 MiniMax-M2.7

### 迭代 5
1. **问题识别**: 难度评估存在 5 个隐患（关键词可绕过、路径不验证存在性、import graph 解析脆弱、replan 时未动态校准）
2. **问题识别**: 上下文管理机械（单向 import 扩展、深度限制、greedy token 填充无语义排序）
3. **改进方案**: 双向 import 图扩展 + import graph 解析改进（推荐先行，低成本高收益）

### 迭代 6
1. **问题识别**: Pre-Hooks 在 parseToolCalls 路径中完全旁路（validateSearchNotEmpty 等 hook 从未被调用）
2. **问题识别**: 并发任务处理存在 check-then-act 竞争（memoryPath 读取和写入不是原子操作）
3. **问题识别**: AppliedChanges 记录永远为空（safeApplyPatch 返回结构无 changes 字段）
4. **问题识别**: 语义验证 shape salvage 逻辑有问题（issues 非空时仍设 ok=true）
5. **问题识别**: Import 正则遗漏三种常见语法（import "file"、import * as name、export default from）

### 迭代 7
1. **Pre-Hooks 修复**: parseToolCalls 改为 async，执行 pre-hooks 循环
2. **AppliedChanges 修复**: 使用 appliedFiles 构造 appliedChanges
3. **语义验证绕过修复**: salvage 时检查 issues 非空设置 ok=false
4. **Import 正则补充**: 增加 sideEffectImportRe, namespaceImportRe, exportDefaultFromRe
5. **测试适配**: parser.test.js async 测试更新

### 迭代 8
1. **并发竞争条件修复**: orchestrateLongTask 中使用双重检查锁定策略（task.json status 作为主锁）

## 待处理问题

### 迭代 8 完成后：高优先级问题已全部修复

所有高优先级问题（Pre-Hooks 旁路、并发竞争、AppliedChanges 日志、语义验证绕过、Import 正则）已修复。

### 剩余低优先级问题（后续迭代）
- Squash 失败后 staged changes 清理
- Rollback SHA 验证
- Timeout 竞争处理
- Replan 计数器修正
- 隐藏文件支持

### 迭代 6 待办（已取消）
- ~~Pre-Hooks 修复~~ → 已在迭代 7 完成
- ~~AppliedChanges 修复~~ → 已在迭代 7 完成
- ~~语义验证绕过修复~~ → 已在迭代 7 完成
- ~~并发竞争条件~~ → 已在迭代 8 完成

### 迭代 5 待办（已完成）
- ~~双向 import 图扩展~~ → 已在迭代 5 完成
- ~~import graph 解析改进~~ → 已在迭代 5 完成
- ~~likelyPaths 文件存在性校验~~ → 已在迭代 5 完成

### 迭代 5 待办（高优先级）
- **双向 import 图扩展**: `expandRelatedFiles` 同时使用 `edges` 和 `reverseEdges`，解决子模块遗漏问题
- **import graph 解析改进**: 支持动态 import、export from、TS 类型导入语法
- **likelyPaths 文件存在性校验**: 难度评分时验证路径真实存在后再计入分数

### 迭代 4 延后项
- `orchestrateLongTask` 仍然较大（~600行），但已提取部分辅助函数；完整提取（task-3）因风险较高已延后
- `adapter/index.js` 中 Claude CLI generateCode 仍有重复模式，但因 post-processing 复杂暂未处理

## 代码统计

- 总文件数: ~50 个 JS 文件
- 总代码行数: ~6200 行 (不含 node_modules)
- 测试覆盖: 401 tests passing

## Workspace 状态 (Full-Stack 任务)

### Phase 1 (项目初始化): ✓ 完成
- workspace/ 目录已创建
- Git 已初始化

### Phase 2 (后端核心): ✓ 完成
- backend/index.js, server.js
- backend/routes/auth.js, data.js, users.js
- backend/middleware/auth.js
- backend/config/db.js
- backend/schema.sql

### Phase 3 (前端核心): ✓ 完成
- frontend/src/main.js, App.js
- frontend/src/components/Login.js, Register.js, UserProfile.js, Logout.js
- frontend/src/api/index.js
- frontend/vite.config.js, package.json

### Phase 4 (高级特性): ✓ 完成
- ActivityChart 组件 + Chart.js 安装
- Refresh Token 端点 (/api/auth/refresh)
- CORS 配置
- 输入验证 (express-validator)

### Phase 5 (测试文档): ✓ 完成
- jest + supertest 安装
- Backend 测试: auth.test.js, api.test.js, error.test.js
- swagger-ui-express + swagger-jsdoc
- swagger.json OpenAPI 规范
- Cypress e2e 测试框架

### Phase 6 (部署): 待开始
