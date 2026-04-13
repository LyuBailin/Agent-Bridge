# 迭代 15 任务分解

## 迭代信息

| 字段 | 内容 |
|------|------|
| 迭代编号 | 15 |
| 创建时间 | 2026-04-13 |
| 任务 | 个人笔记管理系统 |

## 分解结果

### Phase 1: 项目初始化

| ID | 描述 | 依赖 | 状态 |
|----|------|------|------|
| 1.1 | 创建项目目录结构 | - | pending |
| 1.2 | 创建 backend/package.json | 1.1 | pending |
| 1.3 | 创建 frontend HTML 文件 | 1.1 | pending |
| 1.4 | 创建 CSS 基础样式 | 1.3 | pending |

### Phase 2: 后端核心

| ID | 描述 | 依赖 | 状态 |
|----|------|------|------|
| 2.1 | 实现 server.js 基础框架 | 1.1 | pending |
| 2.2 | 实现 auth.js 注册接口 | 2.1 | pending |
| 2.3 | 实现 auth.js 登录接口 | 2.2 | pending |
| 2.4 | 实现 notes.js CRUD 接口 | 2.3 | pending |
| 2.5 | 创建初始 store.json | 2.1 | pending |

### Phase 3: 前端核心

| ID | 描述 | 依赖 | 状态 |
|----|------|------|------|
| 3.1 | 实现 api.js | 1.3 | pending |
| 3.2 | 实现 register.js | 3.1 | pending |
| 3.3 | 实现 login.js | 3.1 | pending |
| 3.4 | 实现 app.js | 3.1 | pending |
| 3.5 | 实现笔记统计功能 | 3.4 | pending |

### Phase 4: 路由与交互

| ID | 描述 | 依赖 | 状态 |
|----|------|------|------|
| 4.1 | 实现路由保护 | 3.2, 3.3 | pending |
| 4.2 | 实现页面跳转逻辑 | 3.3, 3.4 | pending |
| 4.3 | 实现删除确认对话框 | 3.4 | pending |

### Phase 5: 完善与测试

| ID | 描述 | 依赖 | 状态 |
|----|------|------|------|
| 5.1 | 添加错误提示 | 3.3, 3.4 | pending |
| 5.2 | 验证前后端联调 | 4.2 | pending |
| 5.3 | 创建 README.md | 5.2 | pending |

## 执行状态

| 阶段ID | subtask完成情况 | 状态 |
|--------|-----------------|------|
| Phase 1 | 0/4 | pending |
| Phase 2 | 0/5 | blocked |
| Phase 3 | 0/5 | blocked |
| Phase 4 | 0/3 | blocked |
| Phase 5 | 0/3 | blocked |

## 当前阶段: Phase 1

## 执行顺序

Phase 1 (1.1 → 1.2 → 1.3 → 1.4) →
Phase 2 (2.1 → 2.2 → 2.3 → 2.4 → 2.5) →
Phase 3 (3.1 → 3.2, 3.3 → 3.4 → 3.5) →
Phase 4 (4.1, 4.2, 4.3) →
Phase 5 (5.1 → 5.2 → 5.3)

## 预设 Bug（验证用）

1. **Bug-1**: api.js 中使用 `fetch` 时未处理 401 响应
2. **Bug-2**: JWT 验证中间件未检查 token 过期
3. **Bug-3**: 注册时未验证用户名是否已存在
4. **Bug-4**: 前端删除笔记时用 GET 代替 DELETE