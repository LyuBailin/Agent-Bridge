# Agent Bridge 执行流程信息查看指南

本文档指导你如何查看一次完整任务执行周期的所有信息。所有输出都会保存到文件中，可以按顺序查看。

## 执行前文件

| 文件 | 位置 | 说明 |
|------|------|------|
| 输入任务 | `tasks/task.json` | 任务定义，包含 `task_id`, `instruction`, `status: "queued"` 触发执行 |
| 配置 | `config.json` | 系统配置：模型路由阈值、token限制、git配置 |
| 初始记忆 | `bridge/memory.json` | 已完成任务记录，避免重复执行 |

## 执行过程日志

| 文件 | 位置 | 说明 |
|------|------|------|
| 系统日志 | `./bridge.log` | 主要系统事件：任务启动/完成、子任务进度、语义校验反馈 |
| Claude输出日志 | `./claude.log` | Claude CLI的原始JSON输出完整记录 |
| 原始模型输出 | `tasks/raw/<task_id>.<subtask_id>.attempt<N>.txt` | 每个子任务每次尝试的原始模型输出 |

## 执行后结果文件

| 文件 | 位置 | 说明 |
|------|------|------|
| 任务结果 | `tasks/result.json` | 完整执行结果：包含plan tree、执行trace、错误列表、最终状态 |
| 更新后的记忆 | `bridge/memory.json` | 任务结果记录到memory中 |
| 更新后的任务状态 | `tasks/task.json` | 任务状态更新为 `done` 或 `failed` |
| Git workspace | `workspace/` | 最终修改应用到workspace（成功时），失败时回滚到初始状态 |

## 新增功能说明

### 函数调用支持 (P2.1)

模型现在支持结构化函数调用，输出格式为：
```json
{
  "tool_calls": [
    { "name": "search_replace", "arguments": { "file": "path", "search": "...", "replace": "..." } },
    { "name": "mkdir", "arguments": { "path": "..." } }
  ]
}
```
回退机制：当函数调用失败时，自动回退到文本解析模式。

### 简化错误反馈格式 (P3.3)

SEARCH/REPLACE失败时的反馈格式已简化为：
```
FILE: {path}
ERROR: {error description}
HINT: {helpful context or suggestion}
```

### 自修正循环 (P4.1)

当解析失败时，系统会进行自修正尝试。可通过 `config.selfCorrection.enabled: true` 启用（默认关闭）。

### 优雅处理最大重规划 (P4.2)

当达到最大重规划次数时，系统会标记失败的子任务为"skipped"以解除依赖阻塞，继续执行独立的子任务。

### 预验证 (P3.2)

在应用补丁前进行预验证：
- 验证SEARCH模式在目标文件中存在
- 检查同一文件上的重复操作
- 验证目录操作的合法性

## 查看完整执行流程的顺序

1. **查看输入任务** → `cat tasks/task.json`
2. **查看系统执行日志** → `tail -100 bridge.log` 看最近一次执行
3. **查看Claude规划/校验输出** → `tail -100 claude.log`
4. **查看每个子任务尝试的原始输出** → `ls -la tasks/raw/<task_id>*`
5. **查看最终结果** → `cat tasks/result.json | jq`
6. **查看workspace最终修改** → `cd workspace && git log --oneline && git diff HEAD^ HEAD`

## 关键信息位置

- **Claude语义校验反馈** → 在 `bridge.log` 中搜索 `semantic_verify feedback`
- **Claude结构化JSON输出** → 在 `claude.log` 中搜索 `Parsed JSON`
- **函数调用输出** → 在 `claude.log` 中搜索 `tool_calls` 或 `Function called`
- **自修正尝试** → 在 `bridge.log` 中搜索 `self-correction` 或 `correction attempt`
- **子任务错误信息** → 在 `tasks/result.json` → `.plan_tree.nodes[<node_id>].errors`
- **SEARCH匹配失败的文件片段(snippets)** → 在 `tasks/result.json` → `.errors[].details.file_snippets`（或 `.errors[].details.snippet_feedback`）
- **执行轨迹** → 在 `tasks/result.json` → `.execution_trace`

## 示例：查看最近一次medium任务执行

```bash
# 1. 查看任务输入
cat tasks/task.json

# 2. 查看系统日志（包括反馈）
tail -30 bridge.log

# 3. 查看Claude所有输出（包含函数调用和文本解析）
tail -50 claude.log

# 4. 查看所有原始输出文件
ls -la tasks/raw/

# 5. 查看完整结果
cat tasks/result.json | python -m json.tool

# 6. 如果成功完成，查看git diff
cd workspace
git diff HEAD^ HEAD

# 7. 查看自修正循环（如已启用）
grep -i "self-correction\|correction" bridge.log
```
