# Agent Bridge 自迭代优化系统 - 用户指南

## 概述

本系统实现 **Claude 对 Agent Bridge 项目本身的持续迭代优化**。Claude 作为优化主体，对自身所在的项目进行审查、计划、执行、测试和自我改进，形成闭环迭代。

## 核心概念

| 概念 | 说明 |
|------|------|
| **自迭代** | Claude 优化 Agent Bridge 项目自身，而非作为工具去优化别的项目 |
| **独立记录** | 所有迭代过程记录保存在 `cc-self-iteration/` 目录 |
| **闭环反馈** | 每次迭代的发现驱动下一次迭代的计划 |

## 迭代工作流

```
┌─────────────────────────────────────────────────────────────┐
│              Agent Bridge 项目自迭代循环 (最多 N 次)            │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌────────┐ │
│  │ 1. 审查  │ -> │ 2. 计划  │ -> │ 3. 执行  │ -> │ 4. 测试 │ │
│  │ Review   │    │   Plan   │    │ Execute  │    │  Test  │ │
│  └──────────┘    └──────────┘    └──────────┘    └────────┘ │
│       ^                                             │       │
│       │              ┌──────────┐                   │       │
│       └───────────── │ 5. 记录  │ <─────────────────┘       │
│                      │Document&│                           │
│                      │ Analyze │                           │
│                      └──────────┘                           │
│                             │                               │
│                             v                               │
│                      ┌──────────┐                          │
│                      │ 循环迭代  │                          │
│                      │ Iterate  │                          │
│                      └──────────┘                          │
└─────────────────────────────────────────────────────────────┘
```

### 各阶段说明

#### 1. 审查 (Review)
- Claude 扫描 Agent Bridge 项目结构
- 识别代码质量问题、性能瓶颈、潜在 Bug
- 重点审查：`src/core/`、`src/prompt/`、`src/utils/`

#### 2. 计划 (Plan)
- 基于审查结果制定优化方案
- 分解为可执行的子任务 DAG
- 评估任务难度以确定使用模型

#### 3. 执行 (Execute)
- 根据 DAG 并行执行优化任务
- 使用 SEARCH/REPLACE 精准修改
- 每任务创建 Git 检查点

#### 4. 测试 (Test)
- 语法检查 (JS/JSON)
- 路径安全验证
- 语义审查 (Claude 驱动)

#### 5. 记录与分析 (Document & Analyze)
- 所有记录写入 `cc-self-iteration/`
- 分析 Bug 根因
- 为下次迭代提供反馈

## 迭代记录存储

```
cc-self-iteration/
├── iteration-1/
│   ├── review.md          # 审查报告
│   ├── plan.md            # 优化计划
│   ├── changes/           # 本次修改的文件
│   ├── test-results.md    # 测试结果
│   └── analysis.md        # 记录与分析
├── iteration-2/
│   └── ...
├── current-state.md       # 当前项目状态摘要
└── full-log.md           # 完整迭代日志
```

## 配置项

在 `tasks/task.json` 中设置：

```json
{
  "id": "self-iteration-001",
  "type": "self_iteration",
  "target_path": "/home/lyublin/LLM/Agent-Bridge",
  "max_iterations": 3,
  "focus_areas": ["performance", "readability", "bugs", "architecture"],
  "status": "queued"
}
```

## 迭代控制

- **最大迭代次数**: 默认 3 次
- **停止条件**:
  - 达到最大迭代次数
  - 所有子任务完成且测试通过
  - 连续两次迭代无有效修改

## 查看结果

- `cc-self-iteration/` - 完整迭代记录（面向 Claude）
- `tasks/result.json` - 执行结果摘要（面向用户）
- `bridge.log` - 系统事件日志
- `claude.log` - Claude CLI 输出

## 参与模块

Claude 对以下模块进行审查和优化：

| 模块 | 路径 | 优化方向 |
|------|------|----------|
| Core | `src/core/` | 架构优化、逻辑简化 |
| Adapter | `src/core/adapter/` | 多模型适配、解析增强 |
| Planner | `src/core/planner.js` | DAG 规划算法 |
| Verifier | `src/core/verifier.js` | 验证覆盖度 |
| Git Manager | `src/core/git_manager.js` | 检查点策略 |
| Prompts | `src/prompt/` | Prompt 工程优化 |
| Utils | `src/utils/` | 工具函数质量 |
