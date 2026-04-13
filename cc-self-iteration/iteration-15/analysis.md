# 迭代 15 记录与分析

## 修改内容

| 文件 | 修改描述 | 原因 |
|------|----------|------|
| src/core/git_manager.js | MKDIR 后创建 .gitkeep | 空目录不被 git 跟踪 |
| src/core/git_manager.js | handleEdit 支持文件不存在时创建 | SEARCH/REPLACE 操作不存在的文件失败 |
| src/core/workflow.js | 添加 checkWorkspaceDirty 检查 | 任务与 workspace 状态可能冲突 |
| src/core/adapter/validator.js | 增加 JSON function calling 格式检测 | JSON 格式输出不被识别 |

## Bug 分析

### 5.1 失败原因（非 Agent Bridge 问题）

| 字段 | 内容 |
|------|------|
| 文件 | task 5.1 - 添加错误提示 |
| 根因 | 任务 instruction 中的 SEARCH 字符串与实际文件内容不匹配 |
| 具体问题 | instruction 要求搜索 `.catch(error => { console.error('登录失败:', error); });` 但实际文件是 `.catch(error => { alert('Login failed: ' + error.message); });` |
| 教训 | 任务 instruction 中的 SEARCH 字符串应该更通用，或直接要求替换整个 catch 块 |
| 处理 | 记录但不触发优化 |

## 测试验证

- npm test: 408 tests passed
- git commit: 2 commits for Agent Bridge fixes

## 预设 Bug（生成代码中应该存在）

| Bug ID | 描述 | 预期位置 | 状态 |
|--------|------|----------|------|
| Bug-1 | api.js 中 fetch 未处理 401 | frontend/js/api.js | 待验证 |
| Bug-2 | JWT 验证未检查 token 过期 | backend/routes/notes.js | 待验证 |
| Bug-3 | 注册未验证用户名重复 | backend/routes/auth.js | 已修复（task 2.2 实现了正确版本）|
| Bug-4 | 删除用 GET 代替 DELETE | frontend/js/api.js | 待验证 |

## Task 5.1 完成记录

| 字段 | 内容 |
|------|------|
| 任务 | 添加错误提示 |
| 初始状态 | failed - SEARCH 字符串与实际文件内容不匹配 |
| 处理方式 | 手动实现（用户明确要求）|
| 实现内容 | 更新 login.js 和 register.js，使用 error div 替代 alert() |
| 原因分析 | 任务 instruction 中的 SEARCH 字符串基于错误假设（文件使用 console.error），但实际生成代码使用 alert()。这是任务设计问题，但用户要求手动完成以验证功能正确性。|
