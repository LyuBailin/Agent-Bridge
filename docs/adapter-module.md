# 模型适配器模块 (adapter.js) 技术文档

## 模块概述

模型适配器模块是 Agent Bridge 系统的核心组件之一，负责与各种大语言模型（LLM）进行交互，提供统一的接口来生成代码和处理模型响应。该模块支持多种模型提供商，包括 Ollama、OpenAI 和 Claude，并实现了操作类型检测和响应解析等功能。

## 核心功能

### 1. 多模型支持

**功能说明**：支持多种大语言模型，包括 Ollama、OpenAI 和 Claude，提供统一的接口。

**实现细节**：
- 为每种模型实现独立的调用函数
- 统一模型输入和输出格式
- 支持模型配置参数的灵活设置
- 提供模型选择和路由机制

**关键函数**：
- `createProvider()`：创建模型提供商实例
- `callOllama()`：调用 Ollama 模型
- `callOpenAI()`：调用 OpenAI 模型
- `callClaudeCliJson()`：调用 Claude CLI 模型

### 2. 操作类型检测

**功能说明**：自动检测任务所需的操作类型，分为内容编辑和文件操作。

**实现细节**：
- 分析任务指令中的关键词
- 识别文件操作相关的关键词（如 mv、mkdir、rm 等）
- 识别内容编辑相关的关键词（如 update、change、modify 等）
- 确定操作类型（content-only、fileops-only 或 mixed）

**关键函数**：
- `detectOperationType()`：检测操作类型
- `validateOperationSchema()`：验证操作模式
- `buildOperationConstraint()`：构建操作约束

### 3. 提示构建

**功能说明**：构建适合模型输入的提示，包括系统提示和用户提示。

**实现细节**：
- 构建系统提示，定义模型的角色和行为
- 构建用户提示，包含任务指令和上下文
- 添加操作类型约束
- 包含历史反馈信息

**关键函数**：
- `buildPrompt()`：构建提示
- `formatErrorPrompt()`：格式化错误提示

### 4. 响应解析

**功能说明**：解析模型输出的代码块，转换为可执行的操作。

**实现细节**：
- 识别并解析 ```sr``` 代码块（内容编辑）
- 识别并解析 ```op``` 代码块（文件操作）
- 验证代码块格式的正确性
- 转换为标准化的操作对象

**关键函数**：
- `parseResponse()`：解析模型响应
- `parseSrBlock()`：解析内容编辑块
- `parseOpBlock()`：解析文件操作块

### 5. 模式验证

**功能说明**：验证模型输出是否符合指定的操作模式。

**实现细节**：
- 验证输出中是否包含正确类型的代码块
- 确保内容编辑任务只包含 ```sr``` 块
- 确保文件操作任务只包含 ```op``` 块
- 提供详细的验证错误信息

**关键函数**：
- `validateOperationSchema()`：验证操作模式

### 6. JSON 模式生成

**功能说明**：为 Claude 模型生成 JSON 模式，确保输出符合预期格式。

**实现细节**：
- 为内容编辑生成 JSON 模式
- 为语义验证生成 JSON 模式
- 确保模型输出符合 JSON Schema 规范

**关键函数**：
- `buildJsonSchemaForSr()`：构建内容编辑的 JSON 模式
- `buildJsonSchemaForReview()`：构建语义验证的 JSON 模式

## 技术亮点

1. **多模型集成**：统一接口支持多种模型提供商
2. **操作类型检测**：智能识别任务所需的操作类型
3. **结构化输出**：使用标准化的代码块格式
4. **模式验证**：确保模型输出符合预期格式
5. **错误处理**：完善的错误捕获和处理机制
6. **灵活性**：支持模型配置的灵活设置

## 执行流程

1. **模型选择**：根据任务难度和配置选择合适的模型
2. **提示构建**：构建包含任务指令和上下文的提示
3. **模型调用**：调用选定的模型生成代码
4. **响应解析**：解析模型输出的代码块
5. **模式验证**：验证输出是否符合操作模式
6. **操作转换**：将代码块转换为可执行的操作

## 配置依赖

- **config.json**：模型配置信息，包括模型参数和 API 密钥
- **claude.log**：Claude 模型的日志文件

## 与其他模块的交互

- **main.js**：主流程模块使用适配器生成代码
- **planner.js**：任务规划器使用适配器进行任务分解
- **verifier.js**：验证器使用适配器进行语义验证

## 代码结构

```javascript
// 模型提供商创建
function createProvider(type, config = {}) {
  if (type === "ollama") {
    return {
      type: "ollama",
      async generateCode(prompt) {
        // 调用 Ollama 模型
      }
    };
  }
  
  if (type === "openai") {
    return {
      type: "openai",
      async generateCode(prompt) {
        // 调用 OpenAI 模型
      }
    };
  }
  
  if (type === "claude_cli") {
    return {
      type: "claude_cli",
      jsonSchemas: {
        sr: buildJsonSchemaForSr(),
        review: buildJsonSchemaForReview()
      },
      async generateCode(prompt) {
        // 调用 Claude 模型
      },
      async generateJson({ system, user, schema, timeout_ms }) {
        // 调用 Claude 模型生成 JSON
      }
    };
  }
}

// 响应解析
function parseResponse(rawText, fsTools, workspaceDir) {
  // 解析模型输出的代码块
  // 转换为可执行的操作
}
```

## 性能优化

1. **模型选择**：根据任务难度自动选择合适的模型，提高生成质量和效率
2. **提示优化**：根据操作类型构建针对性的提示，提高模型输出的准确性
3. **错误处理**：快速捕获和处理模型调用错误，减少不必要的重试
4. **缓存机制**：支持响应文件的缓存，便于测试和调试

## 故障排除

1. **模型调用失败**：检查模型配置和网络连接
2. **响应解析错误**：检查模型输出格式是否正确
3. **操作验证失败**：检查操作类型是否与任务指令匹配
4. **Claude CLI 错误**：检查 Claude CLI 安装和配置

## 未来改进

1. **模型扩展**：支持更多的模型提供商和模型类型
2. **提示优化**：进一步优化提示模板，提高生成质量
3. **响应解析**：增强响应解析的鲁棒性，处理更多边缘情况
4. **性能监控**：添加模型调用性能的监控和分析

## 输入输出示例

### 输入：构建提示

```javascript
const prompt = adapter.buildPrompt(
  { task_id: "task-001", instruction: "在 src 目录下创建 utils.js 文件" },
  "Project Tree (1 files)\n- src/index.js\n\nFILE: src/index.js\n1: const express = require('express');\n2: const app = express();\n3: app.listen(3000, () => console.log('Server running'));",
  [],
  "fileops-only"
);
```

### 输出：模型响应

```
```op
MKDIR: src
```

```sr
FILE: src/utils.js
SEARCH:
<<<
>>>
REPLACE:
<<<
// 工具函数

// 计算斐波那契数列
function fibonacci(n) {
  if (n <= 1) return n;
  return fibonacci(n - 1) + fibonacci(n - 2);
}

module.exports = {
  fibonacci
};
>>>
```
```

### 解析结果：

```javascript
[
  {
    "type": "mkdir",
    "path": "src"
  },
  {
    "type": "edit",
    "file": "src/utils.js",
    "search": "",
    "replace": "// 工具函数\n\n// 计算斐波那契数列\nfunction fibonacci(n) {\n  if (n <= 1) return n;\n  return fibonacci(n - 1) + fibonacci(n - 2);\n}\n\nmodule.exports = {\n  fibonacci\n};"
  }
]
```