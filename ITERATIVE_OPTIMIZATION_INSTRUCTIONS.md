# Agent Bridge 自迭代优化任务 - Claude 操作指南

**重要**: 本任务是让 Claude 对 Agent Bridge 项目本身进行优化，而非作为工具优化其他项目。

## 基础路径

- **项目根目录**: `/home/lyublin/LLM/Agent-Bridge`
- **迭代记录目录**: `cc-self-iteration/`

## 正确的执行顺序（重要！）

```
阶段 0: 执行任务 (Task Execution)
   ↓
   如果任务失败或发现 Bug
   ↓
阶段 1: 项目审查 (Review)
   ↓
阶段 2: 制定优化计划 (Plan)
   ↓
阶段 3: 执行计划 (Execute)
   ↓
阶段 4: 测试修改 (Test)
   ↓
阶段 5: 记录与分析 (Document & Analyze)
```

**关键原则**: 必须先运行任务，只有在发现 bug 或任务失败时才触发代码优化流程。

## 阶段 0: 执行任务 (Task Execution)

**目标**: 执行 Agent Bridge 本身的任务流水线，验证功能正常

**操作步骤**:

1. **读取任务**: 读取 `DifficultTask.txt` 了解当前目标任务

2. **更新任务队列**: 将任务写入 `tasks/task.json`
   ```json
   {
     "schema_version": 1,
     "task_id": "phase-N-xxx",
     "instruction": "任务描述",
     "status": "queued",
     "difficulty": "medium",
     "complexity_score": 50
   }
   ```

3. **运行 Agent Bridge**: 执行 `npm start` 运行任务
   ```
   npm start
   ```

4. **判断结果**:
   - **任务成功** → 完成，更新 task.json 状态
   - **任务失败/Bug 发现** → 触发 阶段1（审查）
   - **无进展但未失败** → 评估是否需要优化

5. **更新 `cc-self-iteration/current-state.md`**:
   - 记录当前任务执行状态
   - 记录 workspace 进度

---

## 迭代记录结构

```
cc-self-iteration/
├── iteration-{N}/
│   ├── review.md          # 阶段1的审查报告
│   ├── plan.md            # 阶段2的优化计划
│   ├── changes/           # 本次修改的文件副本
│   │   └── {filename}.modified
│   ├── test-results.md   # 阶段4的测试结果
│   ├── analysis.md        # 阶段5的记录与分析
│   └── context.json       # 本迭代上下文（供下次迭代用）
├── current-state.md       # 项目当前状态（每次迭代后更新）
├── pending-issues.md      # 待处理问题队列
└── full-log.md           # 完整迭代日志
```

---

## 阶段 1: 项目审查 (Review)

**前提**: 任务执行失败或发现了 bug，需要优化 Agent Bridge 本身

**目标**: 分析 Agent Bridge 项目本身，找出可优化点

**操作步骤**:

1. **扫描项目结构**
   ```
   扫描 src/core/, src/prompt/, src/utils/, src/shared/
   识别：模块划分、依赖关系、代码规模
   ```

2. **代码质量分析** (并行执行)
   - 语法问题检查
   - 代码异味识别（重复代码、过长函数、复杂条件）
   - 性能问题定位
   - 潜在 Bug 识别

3. **输出审查报告到 `cc-self-iteration/iteration-{N}/review.md`**
   ```markdown
   # 迭代 {N} 审查报告

   ## 发现的问题

   ### 高优先级
   - 文件: `src/core/planner.js:45`
     问题: 函数过长，圈复杂度 23
     建议: 拆分为多个小函数

   ### 中优先级
   - ...

   ## 总体评估
   ```
   - 按严重程度排序
   - 识别可并行处理的独立问题

---

## 阶段 2: 制定优化计划 (Plan)

**目标**: 基于审查结果，制定可执行的优化 DAG

**操作步骤**:

1. **读取上次迭代上下文** (如果存在)
   ```
   读取 cc-self-iteration/iteration-{N-1}/context.json
   ```

2. **构建 DAG**
   - 每个优化点作为一个节点
   - 分析依赖关系（修改 A 才能修改 B）
   - 设置执行顺序

3. **输出计划到 `cc-self-iteration/iteration-{N}/plan.md`**
   ```markdown
   # 迭代 {N} 优化计划

   ## DAG 结构

   ```
   [task-1: 重构parser] --> [task-3: 更新调用]
   [task-2: 优化helper]  --> [task-3]
   ```

   ## 任务列表

   | ID | 描述 | 目标文件 | 依赖 | 难度 |
   |----|------|----------|------|------|
   | 1 | 重构parseResponse | adapter/parser.js | - | 45 |
   | 2 | 优化helper函数 | utils/fs_tools.js | - | 30 |
   | 3 | 更新调用处 | adapter/index.js | 1,2 | 25 |
   ```

---

## 阶段 3: 执行计划 (Execute)

**目标**: 按 DAG 顺序执行每个优化任务

**操作步骤**:

对于每个就绪任务（依赖已满足）:

1. **收集上下文**
   - 读取目标文件
   - 分析相关导入文件
   - 构建修改提示

2. **生成修改**
   - 使用 SEARCH/REPLACE 格式
   - 保持代码风格一致

3. **应用并验证**
   - 语法检查
   - 路径安全检查
   - 必要时回滚重试

4. **保存修改副本**
   ```
   复制修改后的文件到 cc-self-iteration/iteration-{N}/changes/{filename}.modified
   ```

5. **创建检查点**
   ```
   git add . && git commit -m "checkpoint iteration-{N}: task-description"
   ```

---

## 阶段 4: 测试修改 (Test)

**目标**: 确保修改正确且无副作用

**操作步骤**:

1. **语法验证**
   - JavaScript: `node --check <file>`
   - JSON: 解析验证

2. **语义审查**
   - 调用 Claude 审查修改后的代码
   - 检查逻辑正确性

3. **回归检查**
   - 运行 `npm test`
   - 检查相关模块是否受影响

4. **保存测试结果到 `cc-self-iteration/iteration-{N}/test-results.md`**
   ```markdown
   # 迭代 {N} 测试结果

   ## 语法检查
   - src/core/adapter/parser.js: ✓
   - src/utils/fs_tools.js: ✓

   ## 语义审查
   - parser.js 重构: ✓ 通过
   - helper 优化: ✓ 通过

   ## 回归测试
   - npm test: 全部通过
   ```

---

## 阶段 5: 记录与分析 (Document & Analyze)

**目标**: 记录所有变更，分析 Bug 根因

**操作步骤**:

1. **记录变更到 `cc-self-iteration/iteration-{N}/analysis.md`**
   ```markdown
   # 迭代 {N} 记录与分析

   ## 修改内容
   - 文件: src/core/adapter/parser.js
     修改: 重构parseResponse函数，拆分为3个子函数
     原因: 降低圈复杂度从23到8

   - 文件: src/utils/fs_tools.js
     修改: 优化getContext函数，减少循环次数
     原因: 提高性能
   ```

2. **Bug 分析** (如适用)
   ```markdown
   ## Bug 分析

   ### BUG-001
   - 文件: src/core/verifier.js:78
   - 根因: 未处理空数组边界情况
   - 修复: 添加 if (arr.length === 0) return defaultValue
   - 教训: 解析函数需要防御性编程
   ```

3. **更新上下文文件 `cc-self-iteration/iteration-{N}/context.json`**
   ```json
   {
     "iteration": {N},
     "completed_tasks": ["task-1", "task-2"],
     "pending_tasks": ["task-4"],
     "findings_this_iteration": [...],
     "recommendations_for_next": [...]
   }
   ```

4. **更新 `cc-self-iteration/current-state.md`**
   - 汇总当前项目状态
   - 更新待处理问题列表

---

## 迭代控制

### 迭代循环规则

```
for iteration in 1..max_iterations:
    创建 cc-self-iteration/iteration-{iteration}/
    执行 阶段0（任务执行）
    if 任务失败或发现bug:
        执行 阶段1-5
    if 达到停止条件:
        break
```

### 停止条件检查

在每次迭代结束后检查:

1. **全部完成**: 所有计划任务已完成且通过测试
2. **无进展**: 本次迭代无有效修改
3. **错误过多**: 错误率超过 50% 则终止
4. **达到上限**: 达到 max_iterations

### 难度评估与模型选择

| 难度分数 | 模型选择 | 验证方式 |
|----------|----------|----------|
| < 35 | Ollama only | 基础语法检查 |
| 35-70 | Ollama + Claude review | 语法 + 语义 |
| > 70 | Claude 直接执行 | 深度语义审查 |

---

## 关键约束

1. **始终使用 SEARCH/REPLACE** 进行内容修改
2. **MKDIR/MV/RM** 用于文件操作
3. **每任务一检查点**，失败可回滚
4. **不跳过测试阶段**
5. **所有记录写入 `cc-self-iteration/`**，不得写入其他位置
6. **每次迭代后更新 `full-log.md`**

---

## 错误处理

- **单任务失败**: 回滚到上一个检查点，重试（最多3次）
- **连续失败**: 标记任务为 blocked，尝试后续独立任务
- **系统性失败**: 终止迭代，记录错误到 `cc-self-iteration/full-log.md`

---

## 输出格式

完成所有阶段后，更新 `cc-self-iteration/full-log.md`:
```markdown
# Agent Bridge 迭代优化完整日志

## 迭代 1 ({date})
- 任务执行: phase-1-xxx (成功/失败)
- 审查发现: X 个问题
- 执行任务: Y 个
- 测试结果: 通过
- 修改文件: [...]

## 迭代 2 ({date})
- ...
```
