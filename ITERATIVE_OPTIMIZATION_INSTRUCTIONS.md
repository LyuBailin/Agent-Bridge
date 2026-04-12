# Agent Bridge 自迭代优化任务 - Claude 操作指南

**重要**: 本任务是让 Claude 对 Agent Bridge 项目本身进行优化，而非作为工具优化其他项目。

---

## 术语定义

| 术语 | 定义 |
|------|------|
| `iteration-{N}` | 迭代编号，从 1 开始，每次完整迭代循环后 +1 |
| `phase-N-{subtask-id}` | 任务ID格式，N=迭代编号，subtask-id=子任务序号（如 1.1, 1.2） |
| `complexity_score` | 复杂度分数 0-100，Ollama 使用；`difficulty` 是语义标签（low/medium/high），Claude 使用 |
| `plan` | 优化计划，保存在 `cc-self-iteration/iteration-{N}/plan.md` |

---

## 流程总览

```
                    ┌─────────────────────────────────────┐
                    │  首次迭代初始化（无 plan 时）         │
                    │  创建 cc-self-iteration/iteration-1/  │
                    │  创建初始 plan.md（空计划）            │
                    └─────────────────┬───────────────────┘
                                      │
                    ┌─────────────────▼───────────────────┐
                    │  阶段 0: 执行任务                     │
                    │  读取 tasks/task.json，运行 npm start │
                    └─────────────────┬───────────────────┘
                                      │
                         ┌────────────┴────────────┐
                         │ 任务结果判定             │
                         ├─────────────────────────┤
                         │ 成功 → 记录结果，结束   │
                         │ 失败/Bug → 触发阶段 1   │
                         │ 无进展 → 评估是否优化   │
                         └────────────┬────────────┘
                                      │
                         ┌────────────▼────────────┐
                         │  阶段 1: 项目审查        │
                         │  分析 Agent Bridge 代码   │
                         └────────────┬────────────┘
                                      │
                         ┌────────────▼────────────┐
                         │  阶段 2: 制定优化计划    │
                         │  基于审查结果构建 DAG     │
                         └────────────┬────────────┘
                                      │
                         ┌────────────▼────────────┐
                         │  阶段 3: 执行计划        │
                         │  按 DAG 顺序执行修改     │
                         └────────────┬────────────┘
                                      │
                         ┌────────────▼────────────┐
                         │  阶段 4: 测试修改        │
                         │  npm test + 语法检查     │
                         └────────────┬────────────┘
                                      │
                         ┌────────────▼────────────┐
                         │  阶段 5: 记录与分析      │
                         │  更新 current-state.md   │
                         └────────────┬────────────┘
                                      │
                         └─────────────┬─────────────┘
                                       │
                         ┌─────────────▼─────────────┐
                         │  停止条件检查              │
                         │  未满足 → 进入下一次迭代   │
                         │  满足 → 结束              │
                         └───────────────────────────┘
```

---

## 关键原则（执行前必读）

1. **先有 plan 再执行优化**：只有阶段 1 发现 bug 时才触发阶段 2-5
2. **只修复 Agent Bridge 自身代码**：不修改 workspace 内容、不修改外部依赖
3. **使用 SEARCH/REPLACE 修改**：不得直接覆盖文件
4. **每任务一检查点**：失败可回滚
5. **不跳过测试阶段**：所有修改必须通过测试
6. **记录不得写入 workspace**：`cc-self-iteration/` 是唯一记录位置

---

## 阶段 0: 执行任务

**触发条件**: 每次迭代开始时执行

**目标**: 验证 Agent Bridge 功能正常

### 0.1 读取任务

```bash
cat /home/lyublin/LLM/Agent-Bridge/DifficultTask.txt
```

### 0.2 更新任务队列

写入 `tasks/task.json`:

```json
{
  "schema_version": 1,
  "task_id": "iteration-{N}-{subtask-id}",
  "instruction": "<从 DifficultTask.txt 读取的内容>",
  "status": "queued",
  "difficulty": "<low|medium|high>",
  "complexity_score": <0-100>
}
```

### 0.3 运行 Agent Bridge

```bash
cd /home/lyublin/LLM/Agent-Bridge
npm start
```

### 0.4 判断结果

| 结果 | 操作 |
|------|------|
| 任务成功 | 更新 `current-state.md` 状态，记录完成 |
| 任务失败/Bug 发现 | 触发阶段 1 |
| 无进展但未失败 | 评估复杂度分数，≥50 触发阶段 1，<50 记录并结束 |

---

## 首次迭代初始化

**当 `cc-self-iteration/` 不存在或无 `iteration-1/` 时执行**:

```bash
mkdir -p cc-self-iteration/iteration-1
```

创建初始 `plan.md`:

```markdown
# 迭代 1 优化计划

## 迭代信息

| 字段 | 内容 |
|------|------|
| 迭代编号 | 1 |
| 创建时间 | {ISO 日期时间} |
| 当前阶段 | 初始化完成 |

## 阶段状态

| Phase | 任务数 | 完成 | 状态 |
|-------|--------|------|------|
| Phase 0 | - | - | 待执行 |
```

创建初始 `current-state.md`:

```markdown
# 项目当前状态

## 迭代记录

| 迭代 | 状态 | 主要成果 |
|------|------|----------|
```

---

## 阶段 1: 项目审查

**前提**: 阶段 0 发现 bug 或任务失败

**目标**: 分析 Agent Bridge 代码，找出可优化点

### 1.1 扫描项目结构

```bash
ls -la /home/lyublin/LLM/Agent-Bridge/src/
```

扫描范围: `src/core/`, `src/prompt/`, `src/utils/`, `src/shared/`

### 1.2 代码质量分析（并行执行）

- 语法问题: `node --check <file>`
- 代码异味: 重复代码、过长函数（>100行）、复杂条件（>3层嵌套）
- 性能问题: 循环内调用、低效数据结构
- 潜在 Bug: 未处理边界情况、类型错误

### 1.3 输出审查报告

保存到 `cc-self-iteration/iteration-{N}/review.md`:

```markdown
# 迭代 {N} 审查报告

## 迭代信息

| 字段 | 内容 |
|------|------|
| 迭代编号 | {N} |
| 审查时间 | {ISO 日期时间} |

## 发现的问题

### 高优先级

| ID | 文件:行号 | 问题描述 | 建议修复 |
|----|-----------|----------|----------|
| BUG-001 | src/core/xxx.js:45 | 函数过长，圈复杂度 23 | 拆分为多个小函数 |

### 中优先级
...

### 低优先级
...

## 总体评估

- 问题总数: X 个
- 高优先级: X 个
- 可并行处理: X 个
```

---

## 阶段 2: 制定优化计划

**目标**: 基于审查结果，制定可执行的优化 DAG

### 2.1 读取上次迭代上下文

```bash
cat cc-self-iteration/iteration-{N-1}/context.json
```

### 2.2 构建 DAG

规则:
- 每个优化点作为一个节点
- 分析依赖关系（修改 A 才能修改 B）
- 可并行任务放同一层级
- 高优先级优先

### 2.3 输出计划

保存到 `cc-self-iteration/iteration-{N}/plan.md`:

```markdown
# 迭代 {N} 优化计划

## 迭代信息

| 字段 | 内容 |
|------|------|
| 迭代编号 | {N} |
| 创建时间 | {ISO 日期时间} |
| 当前阶段 | Phase 2 完成 |
| 总体进度 | X/Y 任务完成 |

## DAG 结构

```
[task-1: 重构parser] --> [task-3: 更新调用]
[task-2: 优化helper]  --> [task-3]
```

## 任务列表

| ID | 描述 | 目标文件 | 依赖 | 难度 | 状态 |
|----|------|----------|------|------|------|
| 1 | 重构parseResponse | adapter/parser.js | - | 45 | pending |
| 2 | 优化helper函数 | utils/fs_tools.js | - | 30 | pending |
| 3 | 更新调用处 | adapter/index.js | 1,2 | 25 | pending |

## 总体追踪

| Phase | 任务数 | 完成 | 状态 |
|-------|--------|------|------|
| Phase 1 | X | X | 完成 |
| Phase 2 | X | X | 完成 |
| Phase 3 | X | X | 待执行 |
| Phase 4 | X | X | 待执行 |
| Phase 5 | X | X | 待执行 |
```

---

## 阶段 3: 执行计划

**目标**: 按 DAG 顺序执行每个优化任务

### 3.1 执行规则

- 只执行状态为 `pending` 且依赖已满足的任务
- 每次执行一个任务
- 失败重试最多 3 次
- 每次修改后创建检查点

### 3.2 任务执行流程

对于每个就绪任务:

**1. 收集上下文**
```bash
# 读取目标文件
cat /home/lyublin/LLM/Agent-Bridge/src/core/xxx.js

# 分析相关导入
grep -r "require\|import" /home/lyublin/LLM/Agent-Bridge/src/core/xxx.js
```

**2. 生成修改**

使用 SEARCH/REPLACE 格式:

```sr
<file_path:src/core/example.js>
<search>
const oldCode = this.isVeryLongFunctionThatNeedsRefactoring(
  param1,
  param2,
  param3
);
</search>
<replace>
const refactoredCode = this.splitIntoSmallerFunctions(
  param1,
  param2
);
const remainingParams = this.processThirdParam(param3);
</replace>
</sr>
```

**3. 验证修改**

```bash
# 语法检查
node --check /home/lyublin/LLM/Agent-Bridge/src/core/example.js

# JSON 验证（如适用）
node -e "JSON.parse(require('fs').readFileSync('config.json'))"
```

**4. 回滚（如验证失败）**

```bash
# 查找上一个检查点
git log --oneline -5

# 回滚到指定检查点
git reset --hard <checkpoint-commit-hash>

# 重新执行任务
```

**5. 保存修改副本**

```bash
cp /home/lyublin/LLM/Agent-Bridge/src/core/xxx.js \
   /home/lyublin/LLM/Agent-Bridge/cc-self-iteration/iteration-{N}/changes/xxx.modified
```

**6. 创建检查点**

```bash
git add -u
git commit -m "checkpoint iteration-{N}: task-{id} description"
```

---

## 阶段 4: 测试修改

**目标**: 确保修改正确且无副作用

### 4.1 语法验证

```bash
# 批量检查 src/core 目录
for f in src/core/**/*.js; do node --check "$f" || echo "FAIL: $f"; done

# 检查 src 目录
node --check src/core/main.js
node --check src/core/workflow.js
node --check src/core/planner.js
```

### 4.2 单元测试

```bash
# 运行所有测试
npm test

# 仅运行单元测试
node --test test/unit/

# 仅运行 e2e 测试
node --test test/e2e/

# 运行特定测试文件
node --test test/unit/adapter.test.js
```

### 4.3 回归检查

验证相关模块未受影响:

```bash
# 检查修改文件的导入依赖
grep -r "require.*verifier\|require.*parser" src/core/
```

### 4.4 输出测试结果

保存到 `cc-self-iteration/iteration-{N}/test-results.md`:

```markdown
# 迭代 {N} 测试结果

## 语法检查

| 文件 | 结果 |
|------|------|
| src/core/parser.js | ✓ 通过 |
| src/core/verifier.js | ✓ 通过 |

## 单元测试

```
npm test
> 401 tests passed, 0 failed
```

## 回归检查

- adapter/index.js: ✓
- workflow.js: ✓

## 结论

✅ 所有测试通过，修改有效
```

---

## 阶段 5: 记录与分析

**目标**: 记录所有变更，分析 Bug 根因

### 5.1 记录变更

保存到 `cc-self-iteration/iteration-{N}/analysis.md`:

```markdown
# 迭代 {N} 记录与分析

## 修改内容

| 文件 | 修改描述 | 原因 |
|------|----------|------|
| src/core/parser.js | 重构parseResponse函数，拆分为3个子函数 | 降低圈复杂度从23到8 |

## Bug 分析（如有）

### BUG-001

| 字段 | 内容 |
|------|------|
| 文件 | src/core/verifier.js:78 |
| 根因 | 未处理空数组边界情况 |
| 修复 | 添加 `if (arr.length === 0) return defaultValue` |
| 教训 | 解析函数需要防御性编程 |

## 测试验证

- 语法检查: ✓
- npm test: ✓
```

### 5.2 更新上下文文件

保存到 `cc-self-iteration/iteration-{N}/context.json`:

```json
{
  "iteration": {N},
  "completed_tasks": ["task-1", "task-2"],
  "pending_tasks": ["task-3"],
  "findings_this_iteration": [
    "函数圈复杂度过高",
    "缺少错误处理"
  ],
  "recommendations_for_next": [
    "继续拆分剩余高复杂度函数",
    "添加防御性编程检查"
  ]
}
```

### 5.3 更新 current-state.md

```markdown
# 项目当前状态

## 迭代 {N} 完成摘要

**日期**: {ISO 日期}
**目标**: {一句话描述优化目标}

### 修复的问题

| Bug | 文件 | 修改 | 状态 |
|-----|------|------|------|
| BUG-001 | src/core/xxx.js | 重构函数 | done |

### 测试结果

- npm test: X/X 通过

## 迭代记录

| 迭代 | 状态 | 主要成果 |
|------|------|----------|
| 1 | 完成 | 函数重构 |
| {N} | 完成 | {描述} |
```

### 5.4 更新 full-log.md

追加到 `cc-self-iteration/full-log.md`:

```markdown
## 迭代 {N} ({date})

### 审查发现
- 问题数量: X 个
- 主要问题: {描述}

### 执行任务
- Task 1: {描述} ✓
- Task 2: {描述} ✓

### 测试结果
- npm test: {结果}
- 修改文件: [...]

### 提交
- `{commit-hash}`: {简短描述}
```

---

## 迭代控制

### 迭代编号规则

- 初始值: 1
- 递增规则: 每次完整执行阶段 0-5 后 +1
- 即使阶段 0 成功无 bug，也进入下一次迭代

### 停止条件

| 条件 | 量化标准 | 操作 |
|------|----------|------|
| 全部完成 | `pending_tasks` 为空 | 结束 |
| 无进展 | 本次迭代无有效修改 | 连续 2 次 → 结束 |
| 错误过多 | `failed_tasks / total_tasks > 0.5` | 立即结束 |
| 达到上限 | `iteration >= max_iterations` (默认 10) | 结束 |

### 难度评估与模型选择

| 复杂度分数 | 难度标签 | 模型选择 | 验证方式 |
|------------|----------|----------|----------|
| 0-34 | low | Ollama only | 基础语法检查 |
| 35-69 | medium | Ollama + Claude review | 语法 + 语义 |
| 70-100 | high | Claude 直接执行 | 深度语义审查 |

---

## 异常处理

### 单任务失败

1. 回滚到上一个检查点: `git reset --hard <checkpoint-hash>`
2. 重试最多 3 次
3. 3 次后标记为 `blocked`

### 连续失败

- 标记任务为 `blocked`
- 跳过该任务，尝试后续独立任务
- 记录到 `context.json`

### 依赖失败

| 依赖任务状态 | 当前任务操作 |
|--------------|--------------|
| 依赖 done | 正常执行 |
| 依赖 failed | 标记为 `skipped` |
| 依赖 blocked | 等待，阻塞 |

### 系统性失败

- 立即终止迭代
- 记录错误到 `full-log.md`
- 标记需要人工介入

---

## 迭代目录结构

```
cc-self-iteration/
├── iteration-{N}/
│   ├── review.md          # 阶段 1 审查报告
│   ├── plan.md           # 阶段 2 优化计划
│   ├── changes/          # 修改文件副本
│   │   └── {filename}.modified
│   ├── test-results.md   # 阶段 4 测试结果
│   ├── analysis.md       # 阶段 5 记录与分析
│   └── context.json      # 上下文（供下次迭代用）
├── current-state.md      # 项目当前状态
├── pending-issues.md     # 待处理问题队列
└── full-log.md          # 完整迭代日志
```

### 文件命名规则

| 文件 | 命名格式 | 示例 |
|------|----------|------|
| 迭代目录 | `iteration-{N}` | `iteration-1/` |
| 修改副本 | `{原文件名}.modified` | `parser.js.modified` |
| 检查点提交 | `checkpoint iteration-{N}: {task-id} {描述}` | `checkpoint iteration-1: task-1 refactor` |

---

## 错误处理命令参考

| 操作 | 命令 |
|------|------|
| 回滚到检查点 | `git reset --hard <commit-hash>` |
| 查看检查点 | `git log --oneline -10` |
| 查找文件检查点 | `git log --all --full-history -- <file>` |
| 查看修改内容 | `git diff <commit-hash>^..<commit-hash>` |
| 创建检查点 | `git add -u && git commit -m "checkpoint iteration-{N}: description"` |
| 放弃所有修改 | `git checkout -- .` |
