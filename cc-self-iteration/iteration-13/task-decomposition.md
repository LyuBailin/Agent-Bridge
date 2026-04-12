# 迭代 13 任务分解

## 任务概述
构建个人笔记 Web 应用（用户认证 + 笔记 CRUD + 数据统计）

## 分解结果

| ID | 描述 | 依赖 | 状态 | 难度 |
|----|------|------|------|------|
| 13.1 | Phase 1: 项目初始化 - 目录结构 + package.json + HTML骨架 | - | bug_found (路径错误) | 30 |
| 13.2 | Phase 2: 后端核心 - server.js + auth.js 注册/登录 | 13.1 | pending | 80 |
| 13.3 | Phase 2: 后端核心 - notes.js CRUD + JWT中间件 | 13.2 | pending | 60 |
| 13.4 | Phase 3: 前端核心 - api.js + register.js + login.js | 13.1 | pending | 50 |
| 13.5 | Phase 3: 前端核心 - app.js 笔记列表 + 增删改查 | 13.4 | pending | 50 |
| 13.6 | Phase 4: 路由与交互 - 路由保护 + 页面跳转 + 删除确认 | 13.3, 13.5 | pending | 35 |
| 13.7 | Phase 5: 完善与测试 - 错误提示 + 前后端联调 + README | 13.6 | pending | 50 |

## 执行顺序
13.1 → 13.2 → 13.3 → 13.4 → 13.5 → 13.6 → 13.7

## 阶段 0.1 任务分解说明

根据 DifficultTask.md 任务结构，按以下阶段执行：

1. **Phase 1 (13.1)**: 项目初始化
   - 创建 project/ 目录结构
   - backend/package.json
   - frontend/index.html, login.html, register.html
   - frontend/css/style.css

2. **Phase 2 (13.2-13.3)**: 后端核心
   - 13.2: server.js + auth.js (注册/登录)
   - 13.3: notes.js (CRUD) + JWT中间件

3. **Phase 3 (13.4-13.5)**: 前端核心
   - 13.4: api.js + register.js + login.js
   - 13.5: app.js (笔记列表 + 增删改查 UI)

4. **Phase 4 (13.6)**: 路由与交互
   - 路由保护 + 页面跳转 + 删除确认对话框

5. **Phase 5 (13.7)**: 完善与测试
   - 错误提示 + README

## 当前任务
Task 1 已完成（assertSafeRelPath 修复）。等待 Task 2 更新指令措辞。

## 指令措辞修正

**原措辞（有问题）**:
- "在 workspace/ 下创建 project/ 目录结构"

**新措辞（已修复）**:
- "在 workspace 根目录下创建，使用相对于 workspace 的路径，如 project/backend/package.json"

注意：修复后路径不应包含 `workspace/` 前缀。
