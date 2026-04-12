# 迭代 11 审查报告

## 迭代信息

| 字段 | 内容 |
|------|------|
| 迭代编号 | 11 |
| 审查时间 | 2026-04-12 |

## 发现的问题

### 高优先级

| ID | 文件:行号 | 问题描述 | 建议修复 |
|----|-----------|----------|----------|
| ISSUE-001 | src/core/adapter/parser.js:159-210 | `parseStructuredTextToToolCalls` 只使用正则解析 sr/op 块，不支持 JSON 格式输入 | 添加 JSON Schema 验证支持 |

### 中优先级

| ID | 文件:行号 | 问题描述 | 建议修复 |
|----|-----------|----------|----------|
| ENH-001 | src/core/adapter/parser.js | 解析失败时缺少详细的验证错误信息 | 添加 JSON Schema 验证错误处理 |

## 当前流程分析

### Ollama 调用流程

```
callOllama(prompt, useFunctionCalling=true)
    ↓
Ollama 返回文本（因为不支持真正的 function calling）
    ↓
parseStructuredTextToToolCalls(textContent)  ← 使用正则解析 sr/op 块
    ↓
返回 tool_calls
```

### 问题

1. **Ollama 不支持 function calling**：即使传入 `tools: TOOLS_SCHEMA`，Ollama 也只返回文本
2. **正则解析脆弱**：之前的 `>>>` 解析问题证明了正则的脆弱性
3. **缺少 JSON Schema 验证**：当前没有用 TOOLS_SCHEMA 验证模型输出

## 改进方案

### 方案：添加 JSON Schema 验证路径

在 `parseStructuredTextToToolCalls` 中添加 JSON 解析优先路径：

```javascript
function parseStructuredTextToToolCalls(text) {
  // 1. 首先尝试 JSON.parse
  try {
    const json = JSON.parse(text);
    // 2. 用 JSON Schema (TOOLS_SCHEMA) 验证
    if (validateJsonWithSchema(json)) {
      // 3. 转换为 tool_calls 格式
      return jsonToToolCalls(json);
    }
  } catch (e) {
    // JSON 解析或验证失败，fallback 到正则解析
  }

  // 4. Fallback: 正则解析 sr/op 块
  return parseSrAndOpBlocks(text);
}
```

### TOOLS_SCHEMA 已存在

`src/core/adapter/schema.js` 中的 `TOOLS_SCHEMA` 已经是有效的 JSON Schema，可以直接用于验证。

## 总体评估

- 问题总数: 2 个
- 高优先级: 1 个
- 可并行处理: 0 个
