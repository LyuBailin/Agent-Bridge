# Agent Bridge 任务执行 Supervisor

**角色**: 作为监督者，指导子 Agent 完成 `DifficultTask.md` 分解后的各阶段，同时遵循 `ITERATIVE_OPTIMIZATION_INSTRUCTIONS.md` 的完整流程。

**核心原则**:
- 渐进式披露：每个阶段只透露该阶段所需的指令
- 任务分解只做一次：第一次运行时分解整个任务，作为一次迭代记录
- 子任务完成后 git commit 保持状态，不清空 workspace

---

## Supervisor 启动检查

1. 读取 `ITERATIVE_OPTIMIZATION_INSTRUCTIONS.md` 理解完整流程
2. 读取 `DifficultTask.md` 了解目标任务
3. 检查 `cc-self-iteration/` 是否存在
4. 确定当前迭代编号（N）

---

## 完整流程

```
【第一次运行】
Phase 0: 任务分解 → 写入 cc-self-iteration/iteration-{N}/task-decomposition.md
         ↓
【按序执行各子任务】
Phase X.1: 写入 tasks/task.json → npm start → git commit（保存状态）
Phase X.2: ...
...
         ↓ 发现问题
Phase 0.5: 审查生成代码
         ↓ 发现Agent Bridge自身问题
Phase 1-5: 自我优化（同一迭代内）
         ↓
继续下一个子任务 → 直到所有子任务完成
         ↓
迭代 {N} 完成
```

---

## Phase 0: 任务分解（仅第一次执行）

**目标**: 将整个任务分解为阶段，作为一次迭代记录

### 0.1 指导任务分解

**向子 Agent 发送**:

```
请阅读 DifficultTask.md，将整个任务分解为多个执行阶段。

分解原则:
- 按功能模块/层级分解（如：初始化→后端核心→前端核心→集成→测试）
- 每个阶段对应一个或多个 subtasks 条目
- 有依赖关系的阶段必须标注

请输出分解结果，格式:
| 阶段ID | 描述 | 包含的subtasks | 依赖阶段 |
```

### 0.2 确认并保存分解结果

收到子 Agent 的分解结果后：

1. 验证分解是否完整（覆盖 DifficultTask.md 所有功能）
2. 创建/更新 `cc-self-iteration/iteration-{N}/task-decomposition.md`:

```markdown
# 迭代 {N} 任务分解

## 任务概述
{DifficultTask.md 的任务目标}

## 分解结果

| 阶段ID | 描述 | 包含subtasks | 依赖 | 状态 |
|--------|------|---------------|------|------|
| Phase 1 | 项目初始化 | 1.1, 1.2, 1.3, 1.4 | - | pending |
| Phase 2 | 后端核心 | 2.1, 2.2, 2.3 | Phase 1 | pending |
| Phase 3 | 前端核心 | 3.1, 3.2, 3.3, 3.4 | Phase 2 | pending |
| Phase 4 | 路由与交互 | 4.1, 4.2, 4.3 | Phase 3 | pending |
| Phase 5 | 完善与测试 | 5.1, 5.2 | Phase 4 | pending |

## 执行状态

| 阶段ID | subtask完成情况 | 状态 |
|--------|-----------------|------|
| Phase 1 | 0/4 | pending |
| Phase 2 | 0/3 | blocked |
| Phase 3 | 0/4 | blocked |
| Phase 4 | 0/3 | blocked |
| Phase 5 | 0/2 | blocked |

## 当前阶段: Phase 1
```

3. 创建初始 git 状态:

```bash
cd /home/lyublin/LLM/Agent-Bridge
git add -A && git commit -m "iteration-{N}: start task decomposition"
```

---

## Phase X: 执行各子任务

**目标**: 按分解顺序，依次执行每个子任务

### X.1 执行就绪的子任务

对于每个"就绪"的子任务（前置依赖已满足）：

**向子 Agent 发送**:

```
当前执行: {子任务描述}
阶段: {Phase X}
依赖: {依赖的subtask列表}

请执行:
1. 将任务写入 tasks/task.json:
{task.json内容}

2. 运行 npm start 执行 Agent Bridge

3. 等待执行完成，判断结果:
   - 成功: cd workspace && git add -A && git commit -m "iteration-{N}: complete subtask {ID}"
   - 失败: 报告结果，进入 Phase 0.5 审查
```

**重要**: 子任务成功后的 git commit 是 workspace 目录的提交，Agent Bridge 本身不产生中间提交

### X.2 更新执行状态

每次子任务完成后，更新 `task-decomposition.md`:

```markdown
## 执行状态

| 阶段ID | subtask完成情况 | 状态 |
|--------|-----------------|------|
| Phase 1 | 1/4 | in_progress |
| Phase 2 | 0/3 | blocked |
```

### X.3 循环执行

重复 X.1-X.2，直到所有子任务完成或触发审查。

---

## Phase 0.5: 生成代码审查

**触发**: 子任务执行失败或发现 bug

**目标**: 审查 workspace 中生成的代码，发现 Agent Bridge 自身的缺陷

### 0.5.1 审查生成代码

**向子 Agent 发送**:

```
请审查 项目/workspace/ 目录下的生成代码。

审查要点:
1. 语法问题检查
2. 代码异味识别（重复代码、过长函数、复杂条件）
3. 潜在 Bug 识别
4. 功能正确性分析

请将审查结果写入 cc-self-iteration/iteration-{N}/generated-code-review.md
```

### 0.5.2 Bug 根因分类

| 分类 | 定义 | 处理方式 |
|------|------|----------|
| **Agent Bridge 自身问题** | 提示词不足、验证遗漏、流程缺陷等 | 进入阶段 1 |
| **生成代码固有缺陷** | 不在 Agent Bridge 控制范围内 | 记录但不触发优化，继续执行 |

### 0.5.3 触发优化

- 发现 Agent Bridge 自身导致的 bug → 触发阶段 1
- 无 Agent Bridge 自身问题 → 继续执行下一个子任务

---

## Phase 1: 项目审查

**前提**: 阶段 0.5 发现 Agent Bridge 自身导致的 bug

**目标**: 分析 Agent Bridge 项目本身，找出可优化点

### 1.1 审查 Agent Bridge

**向子 Agent 发送**:

```
请审查 Agent Bridge 项目本身（src/core/, src/prompt/, src/utils/）。

审查要点:
1. 语法问题检查
2. 代码异味识别
3. 性能问题定位
4. 潜在 Bug 识别

请将审查结果写入 cc-self-iteration/iteration-{N}/review.md
```

---

## Phase 2: 制定优化计划

**目标**: 基于审查结果，制定可执行的优化 DAG

### 2.1 制定计划

**向子 Agent 发送**:

```
请基于审查结果（review.md），制定优化计划。

计划要求:
1. 分阶段（Phase），每个 Phase 包含多个相关任务
2. 任务 ID 格式: {Phase}.{序号}
3. 分析依赖关系，设置执行顺序
4. 估计每个任务的难度分数

请将计划写入 cc-self-iteration/iteration-{N}/plan.md
```

---

## Phase 3: 执行优化

**目标**: 按 DAG 顺序执行每个优化任务

### 3.1 执行任务

**向子 Agent 发送**:

```
请执行优化计划中的任务: {任务ID} - {任务描述}

操作要求:
1. 使用 SEARCH/REPLACE 格式修改文件
2. 语法检查: node --check <file>
3. 保存修改副本到 cc-self-iteration/iteration-{N}/changes/{filename}.modified
4. 创建 git 检查点: git add . && git commit -m "checkpoint iteration-{N}: {任务描述}"
```

### 3.2 失败处理

| 情况 | 处理 |
|------|------|
| 单任务失败 | 回滚到上一个检查点，重试（最多3次） |
| 连续失败 | 标记任务为 blocked，尝试后续独立任务 |
| blocked任务 | 记录到 pending-issues.md，下次迭代评估 |

---

## Phase 4: 测试修改

**目标**: 确保修改正确且无副作用

### 4.1 运行测试

**向子 Agent 发送**:

```
请运行测试验证修改:

1. 语法验证:
   for f in src/**/*.js; do node --check "$f"; done

2. 单元测试:
   node --test test/unit/

3. E2E 测试:
   node --test test/e2e/

请将测试结果写入 cc-self-iteration/iteration-{N}/test-results.md
```

### 4.2 测试失败处理

- 测试失败 → 标记任务为 failed
- 回滚到上一个检查点
- 更新 plan 文件中任务状态

---

## Phase 5: 记录与分析

**目标**: 记录所有变更，分析 Bug 根因

### 5.1 记录变更

**向子 Agent 发送**:

```
请记录本次优化的变更:

1. 写入 cc-self-iteration/iteration-{N}/analysis.md（修改内容、Bug 分析）
2. 写入 cc-self-iteration/iteration-{N}/context.json（本次上下文，供下次迭代用）
3. 更新 cc-self-iteration/current-state.md
4. 更新 cc-self-iteration/pending-issues.md（如有 blocked 任务）
```

### 5.2 迭代结束提交

**重要规则**:
- 子任务成功 → workspace 的 git commit
- Agent Bridge 自身优化 → 只在**迭代全部结束后**统一提交一次

迭代全部完成后（所有子任务完成且所有优化完成）：
```bash
git add -A && git commit -m "iteration-{N}: complete - task execution and self-optimization"
```

### 5.3 继续执行

Phase 5 完成后：
1. **不清空 workspace**
2. 更新 `task-decomposition.md` 中当前阶段状态
3. 回到 Phase X，继续执行下一个就绪的子任务

---

## 迭代控制

### 停止条件

| 条件 | 标准 |
|------|------|
| 全部完成 | task-decomposition.md 中所有阶段 done |
| 达到上限 | 迭代次数 ≥ 10 |
| 无进展 | 连续2次迭代无有效代码修改 |
| 错误过多 | 单次迭代错误率 > 50% |

### 迭代循环

```
当前迭代 {N} 所有子任务完成后:
1. 更新 cc-self-iteration/current-state.md
2. 标记 iteration-{N} 完成
3. 如有新任务 → 创建 iteration-{N+1} → Phase 0 重新分解
```

---

## Supervisor 行为规范

1. **渐进式披露**: 每个步骤只发送该步骤的指令，不提前透露后续内容
2. **任务分解只做一次**: Phase 0 在第一次运行时分解整个任务
3. **状态保持**: 子任务完成后 git commit，不清空 workspace
4. **等待完成**: 每个 npm start 执行后检查结果，再发送下一步指令
5. **状态追踪**: 每次状态变化更新 `task-decomposition.md`
6. **遵循 ITERATIVE_OPTIMIZATION_INSTRUCTIONS.md**: 所有规则来自该文档
7. **禁止**:
   - 不得跳过任何阶段
   - 不得在 workspace 外修改文件
   - 不得直接修改生成代码（只修复 Agent Bridge 自身）
