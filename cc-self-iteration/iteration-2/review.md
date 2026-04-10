# 迭代 2 审查报告

## 发现的问题

### 高优先级

#### 1. planner.js: JSON.parse(JSON.stringify()) 深拷贝 — 6处
- **文件**: `src/core/planner.js`
- **问题**: 使用 `JSON.parse(JSON.stringify())` 进行深拷贝，效率低且无法处理 `undefined`、函数、`Symbol` 等
- **出现位置**: 行 625, 709, 717, 755, 785, 800
- **建议**: 替换为 `structuredClone()`（Node.js 17+，原生支持）
- **工作量**: 低（仅替换 6 处）

#### 2. adapter/index.js: readMockTextFromEnv 重复调用模式 — 5处
- **文件**: `src/core/adapter/index.js`
- **问题**: 每个 provider 的 `generateCode` 方法都重复相同的 mock 检查模式
- **出现位置**: 行 109-113 (ollama), 138-142 (openai), 169-173 (claude_cli), 221-225 (generateJson), 243-247 (callCodex)
- **建议**: 提取 `withMockFallback(readMockTextFromEnv, actualCall)` 模式到独立 helper
- **工作量**: 中等（需理解闭包和异步模式）

### 中优先级

#### 3. workflow.js: orchestrateLongTask 内部循环仍过大
- **文件**: `src/core/workflow.js:495-742`
- **问题**: `for (let attempt = 1; attempt <= MAX_RETRY; attempt += 1)` 循环约 250 行，包含生成、解析、应用、验证的所有逻辑
- **建议**: 提取为 `executeSubtaskAttempt(env, ...)` 函数
- **工作量**: 高（需要仔细处理状态传递）

#### 4. workflow.js: hasPendingSubtasks 重复计算
- **文件**: `src/core/workflow.js`
- **问题**: `hasPendingSubtasks` 在循环开始时调用，但 planTree 状态在循环内不断更新
- **建议**: 确认逻辑是否正确，或考虑在循环条件中直接更新

### 低优先级

#### 5. adapter/index.js: createProvider 工厂函数可进一步简化
- **文件**: `src/core/adapter/index.js:93-98`
- **问题**: 工厂函数本身很简洁，但三个 provider 创建函数有重复模式
- **建议**: 如考虑 mock helper 一起处理

## 总体评估

| 指标 | 数值 |
|------|------|
| 总文件数 | ~50 JS 文件 |
| 总代码行数 | ~6200 行 |
| 本次发现高优先级问题 | 2 个 |
| 本次发现中优先级问题 | 2 个 |
| 本次发现低优先级问题 | 1 个 |

**建议优先处理**: 问题 1 (JSON.parse(JSON.stringify())) 和问题 2 (readMockTextFromEnv 重复模式)

## 可并行处理的任务

- Task 1: 替换 planner.js 中的 JSON.parse(JSON.stringify()) → structuredClone（无依赖）
- Task 2: 提取 adapter/index.js 中的 mock helper（无依赖）
- Task 3: 提取 workflow.js 中的 attempt 执行逻辑（无依赖，但复杂度高）
