# 提示模块 (src/prompt/) 技术文档

## 模块概述

提示模块是 Agent Bridge 系统的核心组件之一，负责构建和管理模型提示。该模块提供了完整的提示构建系统，包括系统提示、用户提示、角色提示等，确保模型输出符合预期格式和要求。

## 目录结构

```
src/prompt/
├── roles/              # 角色定义
│   ├── implementation.js  # 实现角色
│   ├── planning.js        # 规划角色
│   ├── readonly_explore.js # 只读探索角色
│   └── verification.js     # 验证角色
├── sections/           # 提示部分
│   ├── action_sequence.js       # 行动序列
│   ├── bash_constraints.js      # Bash 约束
│   ├── coordinator_synthesis.js # 协调器综合
│   ├── engineering_donts.js     # 工程禁忌
│   ├── memory_indexing.js       # 记忆索引
│   ├── readonly_boundaries.js   # 只读边界
│   ├── resume_recovery.js       # 恢复恢复
│   └── verification_skepticism.js # 验证怀疑
├── cache_strategy.js   # 缓存策略
├── feedback.js         # 反馈模块
├── identity.js         # 身份定义
├── index.js            # 主入口
├── operation_guidelines.js # 操作指南
├── output_discipline.js    # 输出规范
├── plan.js             # 计划提示
├── registry.js         # 注册表
├── role_factory.js     # 角色工厂
├── skill_injector.js   # 技能注入器
└── system_rules.js     # 系统规则
```

## 核心功能

### 1. 提示构建

**功能说明**：构建完整的模型提示，包括系统提示和用户提示。

**实现细节**：
- 构建系统提示，定义模型的角色和行为
- 构建用户提示，包含任务指令和上下文
- 添加操作类型约束
- 包含历史反馈信息

**关键函数**：
- `buildPrompt()`：构建完整提示
- `buildSystemPrompt()`：构建系统提示
- `buildUserPrompt()`：构建用户提示

### 2. 角色系统

**功能说明**：为不同的任务类型提供专门的角色提示。

**实现细节**：
- 定义多种角色，如实现、规划、验证等
- 为每个角色提供专门的提示模板
- 支持角色特定的工具和行为

**关键文件**：
- `roles/` 目录：包含各种角色定义
- `role_factory.js`：角色工厂，用于创建角色提示

**关键函数**：
- `buildRolePrompt()`：构建角色提示
- `getAvailableRoles()`：获取可用角色列表
- `getRoleTools()`：获取角色工具

### 3. 操作约束

**功能说明**：根据操作类型添加相应的约束。

**实现细节**：
- 为文件操作任务添加文件操作约束
- 为内容编辑任务添加内容编辑约束
- 提供详细的示例和错误提示

**关键函数**：
- `buildOperationConstraint()`：构建操作约束

### 4. 缓存策略

**功能说明**：优化提示构建过程，提高性能。

**实现细节**：
- 缓存提示部分，避免重复构建
- 识别稳定和动态部分，只更新必要的部分
- 优化提示大小，减少 token 使用

**关键文件**：
- `cache_strategy.js`：缓存策略实现

**关键函数**：
- `buildOptimizedPrompt()`：构建优化的提示
- `getSectionsForRole()`：获取角色相关的提示部分
- `isCacheStable()`：检查缓存是否稳定

### 5. 错误修正

**功能说明**：为解析失败的情况构建修正提示。

**实现细节**：
- 包含错误信息和详细说明
- 提供文件片段和上下文
- 指导模型修正输出格式

**关键函数**：
- `buildCorrectionPrompt()`：构建修正提示

### 6. 反馈模块

**功能说明**：构建反馈信息，帮助模型改进输出。

**实现细节**：
- 包含历史反馈信息
- 提供具体的错误和改进建议
- 指导模型避免重复错误

**关键文件**：
- `feedback.js`：反馈模块实现

**关键函数**：
- `buildFeedbackModule()`：构建反馈模块

### 7. 系统规则

**功能说明**：定义系统的基本规则和行为。

**实现细节**：
- 定义模型的角色和职责
- 规定输出格式和要求
- 提供行为指南和约束

**关键文件**：
- `system_rules.js`：系统规则定义
- `identity.js`：身份定义
- `operation_guidelines.js`：操作指南
- `output_discipline.js`：输出规范

**关键函数**：
- `buildSystemRules()`：构建系统规则
- `buildIdentityDefinition()`：构建身份定义
- `buildOperationGuidelines()`：构建操作指南
- `buildOutputDiscipline()`：构建输出规范

## 技术亮点

1. **模块化设计**：清晰的模块化架构，便于扩展和维护
2. **角色系统**：为不同任务类型提供专门的角色提示
3. **缓存策略**：优化提示构建过程，提高性能
4. **操作约束**：根据操作类型添加相应的约束，确保输出符合要求
5. **错误修正**：为解析失败的情况提供详细的修正指导
6. **反馈机制**：包含历史反馈信息，帮助模型改进输出
7. **系统规则**：定义清晰的系统规则和行为指南
8. **灵活性**：支持多种提示类型和配置选项
9. **性能优化**：优化提示大小，减少 token 使用
10. **可扩展性**：易于添加新的角色和提示部分

## 执行流程

1. **提示构建**：根据任务类型和操作类型构建相应的提示
2. **角色选择**：根据任务需求选择合适的角色
3. **缓存检查**：检查是否有缓存的提示部分
4. **优化提示**：构建优化的提示，减少重复内容
5. **模型调用**：使用构建的提示调用模型
6. **错误处理**：处理解析失败的情况，构建修正提示
7. **反馈集成**：集成历史反馈信息，改进模型输出

## 配置依赖

- **config.json**：包含提示相关的配置，如缓存策略和角色设置

## 与其他模块的交互

- **src/core/adapter/**：模型适配器使用提示模块构建提示
- **src/core/main.js**：主流程模块使用提示模块构建任务提示
- **src/core/planner.js**：任务规划器使用提示模块构建规划提示
- **src/core/verifier.js**：验证器使用提示模块构建验证提示

## 代码结构

### 主入口文件 (index.js)

```javascript
const { buildIdentityDefinition } = require('./identity');
const { buildSystemRules } = require('./system_rules');
const { buildOperationGuidelines } = require('./operation_guidelines');
const { buildOutputDiscipline } = require('./output_discipline');
const { buildFeedbackModule } = require('./feedback');

// Cache strategy for prompt optimization
const {
  buildOptimizedPrompt,
  getSectionsForRole,
  isCacheStable,
} = require('./cache_strategy');

// Role factory for role-specific prompts
const {
  buildRolePrompt,
  getAvailableRoles,
  getRoleTools,
} = require('./role_factory');

// Dynamic boundary marker for cache optimization
const CACHE_BOUNDARY = "<!-- SYSTEM_PROMPT_DYNAMIC_BOUNDARY -->";

// Modular system-prompt components
function buildSystemPrompt() {
  const { full } = buildOptimizedPrompt({
    roleSections: ['engineering_donts', 'action_sequence'],
    includeBoundary: true,
  });
  return full;
}

// Role-specific system prompt builder
function buildRoleSystemPrompt(roleName, context = {}) {
  return buildRolePrompt(roleName, context);
}

// Modular user-prompt builder
function buildUserPrompt(task, feedbackHistory = [], operationType = null, contextText = "") {
  const userComponents = [
    "========================================",
    "CRITICAL: WORKSPACE BOUNDARY",
    "========================================",
    "Workspace root is: ./workspace/",
    "- ALL file paths are relative to ./workspace/",
    "- Example: \"src/index.js\" means ./workspace/src/index.js",
    "- Example: \"backend/db.js\" means ./workspace/backend/db.js",
    "- NEVER use paths outside ./workspace/",
    "========================================",
    "",
    `TASK_ID: ${task.task_id}`,
    operationType ? buildOperationConstraint(operationType) : '',
    "INSTRUCTION:",
    task.instruction,
    buildFeedbackModule(feedbackHistory),
    "WORKSPACE CONTEXT:",
    contextText
  ].filter(Boolean);

  return userComponents.join("\n");
}

// Operation-type constraint builder
function buildOperationConstraint(operationType) {
  if (operationType === 'fileops-only') {
    return `
========================================
⚠️  OPERATION TYPE: FILE OPERATIONS ONLY
========================================
YOU MUST OUTPUT ONLY \`\`\`op BLOCKS.
DO NOT OUTPUT \`\`\`sr BLOCKS.

Allowed operations:
- MKDIR: dirname (create directory)
- MV: source -> target (move/rename file)
- RM: filepath (delete file)

Examples of CORRECT output:
\`\`\`op
MV: old-path.js -> new-path.js
MKDIR: lib
RM: unused.js
\`\`\`

Examples of INCORRECT output (will be REJECTED):
- \`\`\`sr blocks - NOT ALLOWED for this task
- File content edits - NOT ALLOWED for this task
`;
  } else if (operationType === 'content-only') {
    return `
========================================
⚠️  OPERATION TYPE: CONTENT EDITING ONLY
========================================
YOU MUST OUTPUT ONLY \`\`\`sr BLOCKS.
DO NOT OUTPUT \`\`\`op BLOCKS.

Allowed operations:
- SEARCH/REPLACE: modify file contents
- Create new files with empty SEARCH

Examples of CORRECT output:
\`\`\`sr
FILE: app.js
SEARCH:
<<<
const old = require('./old');
>>>
REPLACE:
<<<
const old = require('./new');
>>>
\`\`\`

Examples of INCORRECT output (will be REJECTED):
- \`\`\`op blocks with MV, MKDIR, RM - NOT ALLOWED for this task
- File system operations - NOT ALLOWED for this task
`;
  }

  return ''; // For 'mixed', no additional constraint needed
}

// Full prompt builder
function buildPrompt(task, contextText, feedbackHistory = [], operationType = null) {
  const system = buildSystemPrompt();
  const user = buildUserPrompt(task, feedbackHistory, operationType, contextText);

  return { system, user, operationType };
}

// Self-correction prompt for parse failure recovery
function buildCorrectionPrompt(task, contextText, errorInfo, snippetFeedback, operationType = null) {
  const system = buildSystemPrompt();
  const errorMsg = errorInfo?.message ?? String(errorInfo ?? "unknown parse error");
  const errorDetails = errorInfo?.details ? JSON.stringify(errorInfo.details).slice(0, 500) : "";

  const correctionUserPrompt = [
    "========================================",
    "CRITICAL: WORKSPACE BOUNDARY",
    "========================================",
    "Workspace root is: ./workspace/",
    "- ALL file paths are relative to ./workspace/",
    "- Example: \"src/index.js\" means ./workspace/src/index.js",
    "- Example: \"backend/db.js\" means ./workspace/backend/db.js",
    "- NEVER use paths outside ./workspace/",
    "========================================",
    "",
    `TASK_ID: ${task.task_id}`,
    operationType ? buildOperationConstraint(operationType) : '',
    "INSTRUCTION:",
    task.instruction,
    "",
    "=== PARSE FAILURE - PLEASE CORRECT ===",
    `ERROR: ${errorMsg}`,
    errorDetails ? `DETAILS: ${errorDetails}` : "",
    "",
    "FILE SNIPPETS (current file state):",
    snippetFeedback && typeof snippetFeedback === 'string' ? snippetFeedback : "(no snippets available)",
    "",
    "Please output CORRECTED blocks that will parse successfully.",
    "Common issues to fix:",
    "- SEARCH patterns must exactly match existing content",
    "- All paths must be valid relative paths within ./workspace/",
    "- Block format must be exactly ```sr or ```op with proper indentation",
    "- REPLACE content must not be empty",
    "- Workspace boundary: paths like \"backend/\" are ALREADY inside workspace (./workspace/backend/)",
    "",
    "OUTPUT ONLY ```sr or ```op blocks (no prose)."
  ].filter(Boolean).join("\n");

  return { system, user: correctionUserPrompt, operationType };
}

module.exports = {
  buildPrompt,
  buildCorrectionPrompt,
  buildSystemPrompt,
  buildRoleSystemPrompt,
  buildUserPrompt,
  buildOperationConstraint,
  buildIdentityDefinition,
  buildSystemRules,
  buildOperationGuidelines,
  buildOutputDiscipline,
  buildFeedbackModule,
  // Export role factory utilities
  buildRolePrompt,
  getAvailableRoles,
  getRoleTools,
  // Export cache strategy utilities
  buildOptimizedPrompt,
  getSectionsForRole,
  isCacheStable,
  // Export boundary marker
  CACHE_BOUNDARY,
};
```

### 角色工厂 (role_factory.js)

```javascript
// Role factory for role-specific prompts
function buildRolePrompt(roleName, context = {}) {
  // 根据角色名称构建相应的提示
  // 加载角色定义
  // 构建角色特定的提示
}

function getAvailableRoles() {
  // 获取可用的角色列表
}

function getRoleTools(roleName) {
  // 获取角色特定的工具
}

module.exports = {
  buildRolePrompt,
  getAvailableRoles,
  getRoleTools
};
```

### 缓存策略 (cache_strategy.js)

```javascript
// Cache strategy for prompt optimization
function buildOptimizedPrompt({ roleSections = [], includeBoundary = false }) {
  // 构建优化的提示
  // 缓存稳定部分
  // 只更新动态部分
}

function getSectionsForRole(roleName) {
  // 获取角色相关的提示部分
}

function isCacheStable() {
  // 检查缓存是否稳定
}

module.exports = {
  buildOptimizedPrompt,
  getSectionsForRole,
  isCacheStable
};
```

## 性能优化

1. **缓存策略**：缓存提示的稳定部分，避免重复构建
2. **提示优化**：优化提示大小，减少 token 使用
3. **模块化设计**：按需加载提示部分，提高构建效率
4. **角色特定提示**：为不同任务类型提供专门的提示，提高生成质量
5. **边界标记**：使用边界标记识别动态部分，只更新必要的内容

## 故障排除

1. **提示构建失败**：检查角色名称和上下文是否正确
2. **缓存问题**：检查缓存策略是否正常工作，尝试清除缓存
3. **角色未找到**：检查角色名称是否存在于可用角色列表中
4. **提示大小超限**：优化提示内容，减少不必要的部分
5. **操作约束错误**：检查操作类型是否正确，确保约束与操作类型匹配

## 未来改进

1. **角色扩展**：添加更多专门的角色，如测试、文档等
2. **提示模板**：支持自定义提示模板，提高灵活性
3. **动态提示**：根据任务历史和反馈动态调整提示内容
4. **多语言支持**：扩展支持多语言提示
5. **提示评估**：添加提示效果评估机制，优化提示质量
6. **集成学习**：从历史任务中学习，改进提示策略
7. **用户自定义**：支持用户自定义提示部分和角色
8. **提示版本控制**：添加提示版本控制，便于回滚和比较
9. **性能监控**：添加提示构建性能监控，优化构建过程
10. **安全性增强**：加强提示的安全性，防止提示注入攻击

## 输入输出示例

### 输入：构建提示

```javascript
const task = {
  task_id: "task-001",
  instruction: "在 src 目录下创建一个新的工具函数文件 utils.js，包含一个计算斐波那契数列的函数"
};

const contextText = "Project Tree (1 files)\n- src/index.js\n\nFILE: src/index.js\n1: const express = require('express');\n2: const app = express();\n3: app.listen(3000, () => console.log('Server running'));";

const feedbackHistory = [];
const operationType = "content-only";

const prompt = promptModule.buildPrompt(task, contextText, feedbackHistory, operationType);
console.log(prompt);
```

### 输出：提示内容

```javascript
{
  "system": "<!-- SYSTEM_PROMPT_DYNAMIC_BOUNDARY -->\n# Engineering Guidelines\n... (系统提示内容) ...",
  "user": "========================================\nCRITICAL: WORKSPACE BOUNDARY\n========================================\nWorkspace root is: ./workspace/\n- ALL file paths are relative to ./workspace/\n- Example: \"src/index.js\" means ./workspace/src/index.js\n- Example: \"backend/db.js\" means ./workspace/backend/db.js\n- NEVER use paths outside ./workspace/\n========================================\n\nTASK_ID: task-001\n\n========================================\n⚠️  OPERATION TYPE: CONTENT EDITING ONLY\n========================================\nYOU MUST OUTPUT ONLY ```sr BLOCKS.\nDO NOT OUTPUT ```op BLOCKS.\n\nAllowed operations:\n- SEARCH/REPLACE: modify file contents\n- Create new files with empty SEARCH\n\nExamples of CORRECT output:\n```sr\nFILE: app.js\nSEARCH:\n<<<\nconst old = require('./old');\n>>>\nREPLACE:\n<<<\nconst old = require('./new');\n>>>\n```\n\nExamples of INCORRECT output (will be REJECTED):\n- ```op blocks with MV, MKDIR, RM - NOT ALLOWED for this task\n- File system operations - NOT ALLOWED for this task\n\nINSTRUCTION:\n在 src 目录下创建一个新的工具函数文件 utils.js，包含一个计算斐波那契数列的函数\n\nWORKSPACE CONTEXT:\nProject Tree (1 files)\n- src/index.js\n\nFILE: src/index.js\n1: const express = require('express');\n2: const app = express();\n3: app.listen(3000, () => console.log('Server running'));",
  "operationType": "content-only"
}
```

### 输入：构建修正提示

```javascript
const task = {
  task_id: "task-001",
  instruction: "在 src 目录下创建一个新的工具函数文件 utils.js，包含一个计算斐波那契数列的函数"
};

const contextText = "Project Tree (1 files)\n- src/index.js";
const errorInfo = {
  message: "Invalid block format",
  details: { line: 5, column: 10 }
};
const snippetFeedback = "FILE: src/utils.js\n(文件不存在)";
const operationType = "content-only";

const correctionPrompt = promptModule.buildCorrectionPrompt(task, contextText, errorInfo, snippetFeedback, operationType);
console.log(correctionPrompt);
```

### 输出：修正提示内容

```javascript
{
  "system": "<!-- SYSTEM_PROMPT_DYNAMIC_BOUNDARY -->\n# Engineering Guidelines\n... (系统提示内容) ...",
  "user": "========================================\nCRITICAL: WORKSPACE BOUNDARY\n========================================\nWorkspace root is: ./workspace/\n- ALL file paths are relative to ./workspace/\n- Example: \"src/index.js\" means ./workspace/src/index.js\n- Example: \"backend/db.js\" means ./workspace/backend/db.js\n- NEVER use paths outside ./workspace/\n========================================\n\nTASK_ID: task-001\n\n========================================\n⚠️  OPERATION TYPE: CONTENT EDITING ONLY\n========================================\nYOU MUST OUTPUT ONLY ```sr BLOCKS.\nDO NOT OUTPUT ```op BLOCKS.\n\nAllowed operations:\n- SEARCH/REPLACE: modify file contents\n- Create new files with empty SEARCH\n\nExamples of CORRECT output:\n```sr\nFILE: app.js\nSEARCH:\n<<<\nconst old = require('./old');\n>>>\nREPLACE:\n<<<\nconst old = require('./new');\n>>>\n```\n\nExamples of INCORRECT output (will be REJECTED):\n- ```op blocks with MV, MKDIR, RM - NOT ALLOWED for this task\n- File system operations - NOT ALLOWED for this task\n\nINSTRUCTION:\n在 src 目录下创建一个新的工具函数文件 utils.js，包含一个计算斐波那契数列的函数\n\n=== PARSE FAILURE - PLEASE CORRECT ===\nERROR: Invalid block format\nDETAILS: {\"line\":5,\"column\":10}\n\nFILE SNIPPETS (current file state):\nFILE: src/utils.js\n(文件不存在)\n\nPlease output CORRECTED blocks that will parse successfully.\nCommon issues to fix:\n- SEARCH patterns must exactly match existing content\n- All paths must be valid relative paths within ./workspace/\n- Block format must be exactly ```sr or ```op with proper indentation\n- REPLACE content must not be empty\n- Workspace boundary: paths like \"backend/\" are ALREADY inside workspace (./workspace/backend/)\n\nOUTPUT ONLY ```sr or ```op blocks (no prose).",
  "operationType": "content-only"
}
```