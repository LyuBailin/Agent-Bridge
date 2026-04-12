# 迭代 11 记录与分析

## 修改内容

| 文件 | 修改描述 | 原因 |
|------|----------|------|
| src/core/adapter/parser.js | 新增 `parseJsonToolCalls` 函数 | 提供 JSON Schema 验证支持 |
| src/core/adapter/parser.js | 修改 `parseStructuredTextToToolCalls` 优先尝试 JSON 解析 | 实现 JSON-first 解析策略 |
| test/unit/adapter/parser.test.js | 新增 7 个测试用例 | 验证 JSON 解析功能 |

## 新增功能

### parseJsonToolCalls 函数

验证并解析 JSON 格式的 tool_calls：

```javascript
// 输入格式
{
  tool_calls: [
    {
      function: {
        name: "search_replace",
        arguments: { file: "test.js", search: "old", replace: "new" }
      }
    }
  ]
}

// 支持 arguments 为对象或字符串
```

**验证规则**：
1. JSON 对象包含 `tool_calls` 数组，或直接是 tool_call 对象
2. 每个 tool_call 有有效的 `function.name`
3. `function.name` 必须在允许列表中
4. `function.arguments` 可以是对象或 JSON 字符串

### parseStructuredTextToToolCalls 改进

**新策略**：JSON-first
1. 首先尝试 JSON.parse
2. 如果成功且包含有效 tool_calls，返回
3. 如果失败，fallback 到正则解析 sr/op 块

**优势**：
- JSON 解析可靠，不会出现正则歧义问题
- 包含 `>>>` 的内容在 JSON 中能正确处理
- 向后兼容，sr/op 块仍能正常工作

## 测试验证

| 测试 | 结果 |
|------|------|
| 新增 7 个测试 | 全部通过 |
| 回归测试 (401 tests) | 全部通过 |
| 总测试数 | 408 tests passed |

## 根因分析

**之前的问题**：
- 正则表达式 `\n>>>` 对 `>>>` 位置有严格要求
- 模型输出格式可能不标准导致解析失败

**解决方案**：
- JSON 解析使用标准 `JSON.parse`，100% 可靠
- JSON Schema 验证确保结构正确
- 即使 JSON 解析失败，fallback 到正则保证向后兼容
