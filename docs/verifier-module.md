# 验证器模块 (verifier.js) 技术文档

## 模块概述

验证器模块是 Agent Bridge 系统的核心组件之一，负责验证代码变更的正确性和安全性。该模块包括语法验证和语义验证两个主要功能，确保生成的代码符合语法规范并满足任务要求。

## 核心功能

### 1. 语法验证

**功能说明**：验证代码的语法正确性，确保代码能够正常执行。

**实现细节**：
- 使用 `node --check` 验证 JavaScript 文件的语法
- 验证 JSON 文件的格式正确性
- 检查 YAML 文件的可读性和非空性
- 捕获和报告语法错误

**关键函数**：
- `verifyAll()`：执行全面的验证
- `nodeCheckFile()`：使用 Node.js 检查文件语法
- `readFileSafe()`：安全读取文件内容

### 2. 语义验证

**功能说明**：使用 Claude 模型进行深度语义审查，确保代码符合任务要求。

**实现细节**：
- 收集 Git 差异作为验证上下文
- 构建语义验证提示
- 调用 Claude 模型进行语义审查
- 分析验证结果并生成反馈

**关键函数**：
- `semanticVerify()`：执行语义验证
- `buildReviewSchema()`：构建语义验证的 JSON 模式
- `ensureReviewShape()`：确保验证结果的格式正确

### 3. 变更安全验证

**功能说明**：验证代码变更的安全性，防止不安全的操作。

**实现细节**：
- 检查文件路径的安全性，防止访问 .git 目录
- 验证文件删除操作的合法性
- 检测可疑的文件截断操作
- 确保所有操作都在工作区范围内

**关键函数**：
- `verifyAll()`：执行全面的验证
- `looksLikeClearDeleteInstruction()`：检测是否为删除指令

### 4. 错误处理

**功能说明**：捕获和处理验证过程中的错误，提供详细的错误信息。

**实现细节**：
- 捕获文件读取和语法检查中的错误
- 提供详细的错误上下文信息
- 分类错误类型，便于问题定位
- 生成结构化的错误报告

**关键函数**：
- `verifyAll()`：执行全面的验证并处理错误

## 技术亮点

1. **多层验证**：结合语法验证和语义验证，确保代码的正确性和质量
2. **安全保障**：严格的安全检查，防止不安全的操作
3. **智能语义审查**：使用 Claude 模型进行深度语义分析
4. **详细的错误报告**：提供结构化的错误信息，便于问题定位
5. **灵活性**：支持不同类型文件的验证

## 执行流程

1. **变更收集**：收集代码变更信息
2. **语法验证**：验证代码的语法正确性
3. **安全验证**：验证变更的安全性
4. **语义验证**：使用 Claude 模型进行语义审查
5. **结果分析**：分析验证结果并生成报告

## 配置依赖

- **config.json**：包含验证相关的配置，如最大差异大小
- **claude.log**：Claude 模型的日志文件

## 与其他模块的交互

- **main.js**：主流程模块使用验证器验证代码变更
- **adapter.js**：验证器使用适配器调用 Claude 模型进行语义验证
- **git_manager.js**：验证器使用 Git 管理器收集变更信息

## 代码结构

```javascript
// 语义验证
async function semanticVerify(task, workspaceDir, gitManager, claudeProvider, opts = {}) {
  // 收集 Git 差异
  // 构建验证提示
  // 调用 Claude 模型
  // 分析验证结果
}

// 全面验证
async function verifyAll(task, workspaceDir, applyResult, gitManager, fsTools) {
  // 初始化问题列表
  // 收集变更文件
  // 执行语法验证
  // 执行安全验证
  // 返回验证结果
}
```

## 性能优化

1. **选择性验证**：只验证变更的文件，提高验证效率
2. **差异限制**：限制 Git 差异的大小，避免 token 超限
3. **错误处理**：快速捕获和处理错误，减少不必要的验证
4. **并行验证**：支持多个文件的并行验证

## 故障排除

1. **语法验证失败**：检查代码语法是否正确
2. **语义验证失败**：检查代码是否符合任务要求
3. **安全验证失败**：检查是否存在不安全的操作
4. **Claude 验证失败**：检查 Claude 模型配置和连接

## 未来改进

1. **静态分析**：集成更多静态分析工具，提高代码质量
2. **测试集成**：自动运行测试，验证代码功能
3. **安全扫描**：集成安全扫描工具，检测安全漏洞
4. **性能分析**：分析代码性能，提供优化建议

## 输入输出示例

### 输入：验证请求

```javascript
const verifyResult = await verifier.verifyAll(
  { task_id: "task-001", instruction: "创建 utils.js 文件" },
  workspaceDir,
  { appliedFiles: ["src/utils.js"] },
  gitManager,
  fsTools
);
```

### 输出：验证结果

```javascript
{
  "ok": true,
  "issues": []
}
```

### 输入：语义验证请求

```javascript
const semanticResult = await verifier.semanticVerify(
  { task_id: "task-001", instruction: "创建 utils.js 文件" },
  workspaceDir,
  gitManager,
  claudeProvider
);
```

### 输出：语义验证结果

```javascript
{
  "ok": true,
  "issues": [],
  "feedback_for_generator": "代码实现正确，符合任务要求。函数命名规范，代码结构清晰。"
}
```