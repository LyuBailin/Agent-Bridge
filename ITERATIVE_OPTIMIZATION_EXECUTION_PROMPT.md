# Agent Bridge 自迭代优化任务执行 prompt

请读取并严格遵循 `/home/lyublin/LLM/Agent-Bridge/ITERATIVE_OPTIMIZATION_INSTRUCTIONS.md` 中的所有规则执行迭代优化任务。

## 执行流程

1. **读取指南**: 阅读 `ITERATIVE_OPTIMIZATION_INSTRUCTIONS.md` 全文，理解所有阶段（0 → 0.5 → 1 → 2 → 3 → 4 → 5）和关键原则

2. **检查当前状态**:
   - 检查 `cc-self-iteration/` 是否存在
   - 检查 `cc-self-iteration/current-state.md` 内容
   - 确定当前迭代编号（N）

3. **首次迭代初始化**（如需要）:
   - 创建 `cc-self-iteration/iteration-1/` 目录
   - 创建初始 `plan.md`

4. **按阶段执行**:
   - **阶段 0**: 读取 `DifficultTask.txt`，任务阶段分解，写入 `task-decomposition.md`，依次执行各子任务
   - **阶段 0.5**: 审查 workspace 生成代码，发现 bug 则触发阶段 1-5
   - **阶段 1-5**: 审查 Agent Bridge 自身、优化计划、执行、测试、记录
   - **循环**: 优化完成后清空 workspace，重新回到阶段 0

5. **遵循关键原则**:
   - 必须先有 plan 再执行
   - 只修复 Agent Bridge 自身代码，不修改生成代码
   - 所有记录写入 `cc-self-iteration/`
   - 每任务一检查点，失败可回滚

6. **更新追踪**: 每次状态变化时同步更新 `plan.md` 和 `current-state.md`

## 关键文件路径

- 项目根目录: `/home/lyublin/LLM/Agent-Bridge`
- 迭代记录: `cc-self-iteration/iteration-{N}/`
- 任务队列: `tasks/task.json`
- 工作空间: `workspace/`
