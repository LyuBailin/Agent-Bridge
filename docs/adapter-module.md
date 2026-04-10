# 模型适配器模块 (src/core/adapter/) 技术文档

## 模块概述

模型适配器模块是 Agent Bridge 系统的核心组件之一，负责与各种大语言模型（LLM）进行交互，提供统一的接口来生成代码和处理模型响应。该模块支持多种模型提供商，包括 Ollama、OpenAI 和 Claude，并实现了操作类型检测、响应解析和模式验证等功能。

## 目录结构

```
src/core/adapter/
├── providers/        # 模型提供商实现
│   ├── claude_cli.js # Claude CLI 提供商
│   ├── ollama.js     # Ollama 提供商
│   └── openai.js     # OpenAI 提供商
├── hooks.js          # 适配器钩子
├── index.js          # 适配器主入口
├── parser.js         # 响应解析器
├── schema.js         # JSON 模式定义
├── tool_factory.js   # 工具工厂
└── validator.js      # 响应验证器
```

## 核心功能

### 1. 多模型支持

**功能说明**：支持多种大语言模型，包括 Ollama、OpenAI 和 Claude，提供统一的接口。

**实现细节**：
- 为每种模型实现独立的提供商模块（位于 providers/ 目录）
- 统一模型输入和输出格式
- 支持模型配置参数的灵活设置
- 提供模型选择和路由机制

**关键文件**：
- `providers/ollama.js`：Ollama 模型实现
- `providers/openai.js`：OpenAI 模型实现
- `providers/claude_cli.js`：Claude CLI 模型实现

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

**关键文件**：
- `parser.js`：响应解析器，负责解析模型输出

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

**关键文件**：
- `validator.js`：响应验证器，负责验证模型输出

**关键函数**：
- `validateOperationSchema()`：验证操作模式

### 6. JSON 模式生成

**功能说明**：为 Claude 模型生成 JSON 模式，确保输出符合预期格式。

**实现细节**：
- 为内容编辑生成 JSON 模式
- 为语义验证生成 JSON 模式
- 确保模型输出符合 JSON Schema 规范

**关键文件**：
- `schema.js`：JSON 模式定义

**关键函数**：
- `buildJsonSchemaForSr()`：构建内容编辑的 JSON 模式
- `buildJsonSchemaForReview()`：构建语义验证的 JSON 模式

### 7. 工具工厂

**功能说明**：动态生成工具调用，增强模型的能力。

**实现细节**：
- 根据任务需求生成相应的工具调用
- 支持文件操作、代码分析等工具
- 提供工具调用的标准化接口

**关键文件**：
- `tool_factory.js`：工具工厂，负责生成工具调用

### 8. 适配器钩子

**功能说明**：提供适配器的扩展点，支持自定义行为。

**实现细节**：
- 定义钩子接口
- 支持在模型调用前后执行自定义逻辑
- 提供错误处理和日志记录的扩展点

**关键文件**：
- `hooks.js`：适配器钩子定义

## 技术亮点

1. **多模型集成**：统一接口支持多种模型提供商，包括 Ollama、OpenAI 和 Claude
2. **模块化设计**：清晰的模块划分，便于扩展和维护
3. **操作类型检测**：智能识别任务所需的操作类型
4. **结构化输出**：使用标准化的代码块格式
5. **模式验证**：确保模型输出符合预期格式
6. **错误处理**：完善的错误捕获和处理机制
7. **灵活性**：支持模型配置的灵活设置
8. **工具工厂**：动态生成工具调用，增强模型能力
9. **适配器钩子**：提供扩展点，支持自定义行为
10. **JSON 模式生成**：为 Claude 模型生成精确的 JSON 模式

## 执行流程

1. **模型选择**：根据任务难度和配置选择合适的模型
2. **提示构建**：构建包含任务指令和上下文的提示
3. **工具准备**：通过工具工厂生成必要的工具调用
4. **模型调用**：调用选定的模型生成代码
5. **响应解析**：通过解析器解析模型输出的代码块
6. **模式验证**：通过验证器验证输出是否符合操作模式
7. **操作转换**：将代码块转换为可执行的操作
8. **钩子执行**：执行适配器钩子，处理自定义逻辑

## 配置依赖

- **config.json**：模型配置信息，包括模型参数和 API 密钥
- **.env**：环境变量文件，存储 API 密钥等敏感信息
- **claude.log**：Claude 模型的日志文件
- **ollama.log**：Ollama 模型的日志文件

## 与其他模块的交互

- **src/core/main.js**：主流程模块使用适配器生成代码
- **src/core/planner.js**：任务规划器使用适配器进行任务分解
- **src/core/verifier.js**：验证器使用适配器进行语义验证
- **src/core/query_loop.js**：查询循环模块使用适配器处理多轮查询
- **src/core/workflow.js**：工作流管理模块使用适配器执行任务

## 代码结构

### 主入口文件 (index.js)

```javascript
// 适配器主入口
const { parseResponse } = require('./parser');
const { validateOperationSchema } = require('./validator');
const { buildJsonSchemaForSr, buildJsonSchemaForReview } = require('./schema');
const { createTool } = require('./tool_factory');
const { executeHooks } = require('./hooks');

// 模型提供商
const ollamaProvider = require('./providers/ollama');
const openaiProvider = require('./providers/openai');
const claudeCliProvider = require('./providers/claude_cli');

// 创建模型提供商实例
function createProvider(type, config = {}) {
  switch (type) {
    case 'ollama':
      return ollamaProvider.create(config);
    case 'openai':
      return openaiProvider.create(config);
    case 'claude_cli':
      return claudeCliProvider.create(config);
    default:
      throw new Error(`Unknown provider type: ${type}`);
  }
}

// 构建提示
function buildPrompt(task, context, feedback, operationType) {
  // 构建提示逻辑
}

// 主适配器函数
async function generateCode(task, context, config, operationType) {
  // 模型选择
  // 提示构建
  // 模型调用
  // 响应解析
  // 模式验证
  // 操作转换
  // 钩子执行
}

module.exports = {
  createProvider,
  buildPrompt,
  generateCode,
  parseResponse,
  validateOperationSchema,
  buildJsonSchemaForSr,
  buildJsonSchemaForReview,
  createTool,
  executeHooks
};
```

### 解析器 (parser.js)

```javascript
// 响应解析器
function parseResponse(rawText, fsTools, workspaceDir) {
  // 解析模型输出的代码块
  // 转换为可执行的操作
}

function parseSrBlock(blockContent) {
  // 解析内容编辑块
}

function parseOpBlock(blockContent) {
  // 解析文件操作块
}

module.exports = {
  parseResponse,
  parseSrBlock,
  parseOpBlock
};
```

### 验证器 (validator.js)

```javascript
// 响应验证器
function validateOperationSchema(operations, operationType) {
  // 验证操作模式
}

module.exports = {
  validateOperationSchema
};
```

## 性能优化

1. **模型选择**：根据任务难度和风险级别自动选择合适的模型，提高生成质量和效率
2. **提示优化**：根据操作类型构建针对性的提示，提高模型输出的准确性
3. **错误处理**：快速捕获和处理模型调用错误，减少不必要的重试
4. **缓存机制**：支持响应文件的缓存，便于测试和调试
5. **并行处理**：支持多个模型提供商的并行调用，提高响应速度
6. **资源管理**：合理管理模型资源，避免资源浪费
7. **日志优化**：优化日志记录，减少不必要的日志输出

## 故障排除

1. **模型调用失败**：检查模型配置、网络连接和 API 密钥
2. **响应解析错误**：检查模型输出格式是否正确，确保使用了正确的代码块格式
3. **操作验证失败**：检查操作类型是否与任务指令匹配，确保只使用了允许的操作类型
4. **Claude CLI 错误**：检查 Claude CLI 安装和配置，确保 CLI 工具可用
5. **Ollama 连接错误**：检查 Ollama 服务是否运行，确保端口配置正确
6. **OpenAI API 错误**：检查 API 密钥是否有效，确保账户有足够的配额
7. **环境变量错误**：检查 .env 文件中的环境变量是否正确设置
8. **日志分析**：查看相关日志文件（claude.log、ollama.log）获取详细错误信息

## 未来改进

1. **模型扩展**：支持更多的模型提供商和模型类型，如 Anthropic Claude 3、Google Gemini 等
2. **提示优化**：进一步优化提示模板，提高生成质量和一致性
3. **响应解析**：增强响应解析的鲁棒性，处理更多边缘情况
4. **性能监控**：添加模型调用性能的监控和分析
5. **工具扩展**：扩展工具工厂，支持更多类型的工具调用
6. **钩子系统**：完善钩子系统，提供更多的扩展点
7. **多语言支持**：扩展支持更多编程语言的代码生成
8. **自适应提示**：根据任务历史和反馈自动调整提示策略
9. **模型微调**：支持模型的微调，提高特定领域的生成质量
10. **安全性增强**：加强模型输出的安全性检查，防止恶意代码

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