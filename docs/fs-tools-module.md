# 文件系统工具模块 (fs_tools.js) 技术文档

## 模块概述

文件系统工具模块是 Agent Bridge 系统的核心组件之一，负责文件系统操作和上下文收集。该模块提供了安全的文件路径处理、项目树遍历、文件内容读取和导入图提取等功能，为系统的其他模块提供文件操作支持。

## 核心功能

### 1. 路径安全

**功能说明**：确保所有文件操作都在工作区范围内，防止路径遍历攻击。

**实现细节**：
- 验证文件路径是否为相对路径
- 检查路径中是否包含 ".." 等不安全的路径组件
- 确保路径不指向 .git 目录
- 验证路径是否在工作区范围内

**关键函数**：
- `assertSafeRelPath()`：验证相对路径的安全性
- `resolveInWorkspace()`：在工作区中解析路径

### 2. 项目树遍历

**功能说明**：遍历项目目录结构，收集项目文件信息。

**实现细节**：
- 递归遍历项目目录
- 跳过 .git 目录
- 收集所有文件的相对路径
- 排序文件路径，确保一致性

**关键函数**：
- `listProjectTree()`：列出项目树结构

### 3. 上下文收集

**功能说明**：收集项目文件内容作为模型输入的上下文。

**实现细节**：
- 读取项目文件内容
- 限制文件大小，避免内容过长
- 为文件添加行号和头部信息
- 组合文件内容和项目树信息

**关键函数**：
- `collectContext()`：收集项目上下文
- `getFileContext()`：获取单个文件的上下文

### 4. 文件操作

**功能说明**：执行安全的文件操作，如更新文件内容。

**实现细节**：
- 确保文件路径的安全性
- 创建必要的目录结构
- 写入文件内容
- 处理文件操作中的错误

**关键函数**：
- `updateFile()`：更新文件内容

### 5. 导入图提取

**功能说明**：分析文件间的依赖关系，提取导入图。

**实现细节**：
- 解析文件中的 import 和 require 语句
- 构建文件间的依赖关系图
- 支持正向和反向依赖查询
- 处理模块解析规则

**关键函数**：
- `extractImportGraph()`：提取导入图
- `normalizeImportTarget()`：规范化导入目标

### 6. 相关文件扩展

**功能说明**：基于依赖关系扩展相关文件集，提供更完整的上下文。

**实现细节**：
- 根据导入图扩展相关文件
- 控制扩展深度和文件数量
- 确保扩展文件的安全性
- 优化扩展策略，提高效率

**关键函数**：
- `expandRelatedFiles()`：扩展相关文件

## 技术亮点

1. **安全性**：严格的路径验证，防止路径遍历攻击
2. **可靠性**：完善的错误处理和边界情况处理
3. **效率**：优化的文件操作和上下文收集
4. **灵活性**：支持多种文件类型和操作
5. **可扩展性**：模块化设计，易于扩展和维护

## 执行流程

1. **路径验证**：验证文件路径的安全性
2. **文件操作**：执行安全的文件操作
3. **上下文收集**：收集项目文件内容作为上下文
4. **依赖分析**：分析文件间的依赖关系
5. **相关文件扩展**：基于依赖关系扩展相关文件

## 配置依赖

- **config.json**：包含文件系统相关的配置，如文件大小限制和包含的文件扩展名

## 与其他模块的交互

- **main.js**：主流程模块使用文件系统工具收集上下文
- **adapter.js**：模型适配器使用文件系统工具解析路径
- **planner.js**：任务规划器使用文件系统工具扩展相关文件
- **git_manager.js**：Git 管理器使用文件系统工具执行文件操作

## 代码结构

```javascript
// 路径安全
function assertSafeRelPath(relPath) {
  // 验证路径安全性
  // 检查路径组件
  // 确保路径不指向 .git 目录
}

function resolveInWorkspace(workspaceDir, relPath) {
  // 验证路径安全性
  // 解析绝对路径
  // 确保路径在工作区范围内
}

// 上下文收集
async function collectContext(workspaceDir, limits) {
  // 列出项目树
  // 选择要包含的文件
  // 收集文件内容
  // 组合上下文
}

// 导入图提取
async function extractImportGraph(workspaceDir, opts = {}) {
  // 列出候选文件
  // 解析导入语句
  // 构建依赖图
  // 返回导入图
}
```

## 性能优化

1. **文件过滤**：只处理指定扩展名的文件，减少处理量
2. **大小限制**：限制文件大小，避免处理过大的文件
3. **缓存机制**：缓存项目树和导入图，避免重复计算
4. **并行处理**：支持并行的文件操作，提高执行效率

## 故障排除

1. **路径验证失败**：检查文件路径是否符合安全要求
2. **文件读取失败**：检查文件权限和存在性
3. **导入图提取失败**：检查文件语法和导入语句格式
4. **上下文收集失败**：检查文件大小和数量限制

## 未来改进

1. **文件监控**：添加文件变化监控，实时更新上下文
2. **智能过滤**：基于任务类型智能过滤相关文件
3. **缓存优化**：改进缓存机制，提高性能
4. **文件分析**：添加更深入的文件分析功能

## 输入输出示例

### 输入：收集上下文

```javascript
const context = await fsTools.collectContext(workspaceDir, {
  max_file_bytes: 32768,
  max_files: 60,
  include_exts: ["js", "json", "md"]
});
```

### 输出：上下文内容

```
Project Tree (3 files)
- src/index.js
- src/utils.js
- package.json

FILE: src/index.js
1: const express = require('express');
2: const app = express();
3: const { fibonacci } = require('./utils');
4: 
5: app.get('/fib/:n', (req, res) => {
6:   const n = parseInt(req.params.n);
7:   res.json({ result: fibonacci(n) });
8: });
9: 
10: app.listen(3000, () => console.log('Server running'));

FILE: src/utils.js
1: // 工具函数
2: 
3: function fibonacci(n) {
4:   if (n <= 1) return n;
5:   return fibonacci(n - 1) + fibonacci(n - 2);
6: }
7: 
8: module.exports = { fibonacci };

FILE: package.json
1: {
2:   "name": "example",
3:   "version": "1.0.0",
4:   "main": "src/index.js",
5:   "dependencies": {
6:     "express": "^4.17.1"
7:   }
8: }
```

### 输入：提取导入图

```javascript
const importGraph = await fsTools.extractImportGraph(workspaceDir);
```

### 输出：导入图

```javascript
{
  "edges": {
    "src/index.js": ["src/utils.js"]
  },
  "reverseEdges": {
    "src/utils.js": ["src/index.js"]
  }
}
```